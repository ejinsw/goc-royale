import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  FIGHTERS,
  IDS,
  clamp,
  distance,
  type FighterId,
  type Vec,
} from "../../shared/definitions";
import type { Lobby, Match, HostMessage } from "../../shared/types";
import { fighterArt } from "./art";
import { Network } from "./network";
import type { GameBridge } from "./game";
import { preferences, setMusic, unlockAudio } from "./audio";
import "@fontsource/barlow/latin-400.css";
import "@fontsource/barlow/latin-500.css";
import "@fontsource/barlow/latin-600.css";
import "@fontsource/barlow/latin-700.css";
import "@fontsource/barlow/latin-800.css";
import "@fontsource/barlow-condensed/latin-700.css";
import "@fontsource/barlow-condensed/latin-800.css";
import "@fontsource/barlow-condensed/latin-900.css";
import "./style.css";
const initialInput = () => ({
  move: { x: 0, y: 0 },
  aim: { x: 1, y: 0 },
  power: 0.35,
  attack: false,
  super: false,
});
function App() {
  const [lobby, setLobby] = useState<Lobby | null>(null),
    [match, setMatch] = useState<Match | null>(null),
    [status, setStatus] = useState("Ready when you are"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [name, setName] = useState(localStorage.getItem("goc.name") || ""),
    [code, setCode] = useState(
      new URLSearchParams(location.search).get("room") || "",
    ),
    [chosen, setChosen] = useState<FighterId>("brandon"),
    [menuMode, setMenuMode] = useState<"showdown" | "broomball">("showdown"),
    [gallery, setGallery] = useState(false),
    [settings, setSettings] = useState(false),
    [spectate, setSpectate] = useState<string | null>(null);
  const net = useRef<Network | null>(null),
    bridge = useRef<GameBridge>({
      match: null,
      id: "",
      input: initialInput(),
      spectate: null,
      send: (input) => net.current?.input(input),
      paused: false,
    });
  const [touchControls, setTouchControls] = useState(
    matchMedia("(pointer:coarse)").matches,
  );
  const [soundVolume, setSoundVolume] = useState(0.35),
    [musicVolume, setMusicVolume] = useState(0),
    [shake, setShake] = useState(true);
  useEffect(() => {
    try {
      const p = JSON.parse(localStorage.getItem("goc.preferences") || "null");
      if (p) {
        setSoundVolume(p.sound ?? 0.35);
        setMusicVolume(p.music ?? 0);
        setShake(p.shake ?? true);
      }
    } catch {}
    return () => {
      net.current?.close();
      setMusic(0);
    };
  }, []);
  useEffect(() => {
    preferences.sound = soundVolume;
    preferences.shake = shake;
    setMusic(musicVolume);
    localStorage.setItem(
      "goc.preferences",
      JSON.stringify({ sound: soundVolume, music: musicVolume, shake }),
    );
  }, [soundVolume, musicVolume, shake]);
  useEffect(() => {
    bridge.current.paused = settings;
    if (settings) {
      bridge.current.input.move = { x: 0, y: 0 };
      bridge.current.input.attack = false;
      bridge.current.input.super = false;
    }
  }, [settings]);
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if (e.code === "Escape") setSettings((s) => !s);
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);
  useEffect(() => {
    if (lobby) void import("./game");
  }, [!!lobby]);
  const receive = (m: HostMessage) => {
    if (m.type === "lobby") {
      setLobby(m.lobby);
      if (m.lobby.phase === "lobby") {
        setMatch(null);
        bridge.current.match = null;
        bridge.current.input = initialInput();
      }
    }
    if (m.type === "welcome") {
      bridge.current.id = m.id;
      setLobby(m.lobby);
      sessionStorage.setItem(
        "goc.session",
        JSON.stringify({ code: m.lobby.code, token: m.token, name }),
      );
    }
    if (m.type === "snapshot") {
      setMatch(m.match);
      bridge.current.match = m.match;
    }
    if (m.type === "error") setError(m.message);
  };
  async function enter(create: boolean) {
    if (!name.trim()) {
      setError("Pick a nickname first.");
      return;
    }
    unlockAudio();
    setBusy(true);
    setError("");
    setStatus(
      create
        ? "Opening your browser-hosted room…"
        : "Connecting to the room host…",
    );
    net.current?.close();
    const network = new Network(receive, setStatus);
    net.current = network;
    try {
      localStorage.setItem("goc.name", name.trim());
      if (create) {
        await network.create(name);
        network.command({ type: "select", fighter: chosen });
        network.command({ type: "mode", mode: menuMode });
      } else {
        let token: string | undefined;
        try {
          const saved = JSON.parse(
            sessionStorage.getItem("goc.session") || "null",
          );
          if (saved?.code === code.toUpperCase()) token = saved.token;
        } catch {}
        await network.join(code, name, token);
      }
      bridge.current.id = network.id;
      const url = new URL(location.href);
      url.searchParams.set("room", network.code);
      history.replaceState(null, "", url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not connect.");
      network.close();
      setLobby(null);
    } finally {
      setBusy(false);
    }
  }
  const command = (c: Parameters<Network["command"]>[0]) => {
    setError("");
    net.current?.command(c);
  };
  const me = lobby?.members.find((p) => p.id === net.current?.id),
    self = match?.players.find((p) => p.id === net.current?.id),
    host = lobby?.host === net.current?.id;
  const inGame =
    !!match && lobby?.phase !== "lobby" && match.phase !== "finished";
  const copyInvite = async () => {
    try {
      await navigator.clipboard.writeText(
        `${location.origin}${location.pathname}?room=${lobby!.code}`,
      );
      setStatus("Invite link copied");
    } catch {
      setError(`Share this room code: ${lobby?.code}`);
    }
  };
  const leave = () => {
    net.current?.close();
    net.current = null;
    setLobby(null);
    setMatch(null);
    bridge.current.match = null;
    bridge.current.input = initialInput();
    history.replaceState(null, "", location.pathname);
    setStatus("Ready when you are");
  };
  const reconnect = async () => {
    try {
      setError("");
      await net.current?.reconnect(name);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Reconnect failed.");
    }
  };
  return (
    <div
      className={
        inGame ? `app playing ${touchControls ? "touch-enabled" : ""}` : "app game-shell"
      }
    >
      {!inGame && (
        <header className="header">
          <a className="brand" href="#" onClick={(e) => e.preventDefault()}>
            <span className="brand-mark">G</span> GOC <b>ROYALE</b>
            <span className="pilot">PRIVATE PLAY</span>
          </a>
          <button
            className="quiet"
            onClick={() => {
              unlockAudio();
              setSettings(true);
            }}
          >
            Settings
          </button>
        </header>
      )}
      {error && (
        <div className="toast error" role="alert">
          {error}
          <button aria-label="Dismiss error" onClick={() => setError("")}>
            ×
          </button>
        </div>
      )}
      {!lobby && (
        <main className="game-menu">
          <section className="fighter-showcase" style={{ "--fighter": FIGHTERS[chosen].color } as React.CSSProperties} aria-label="Selected fighter">
            <div className="arena-lines" aria-hidden="true" />
            <div className="showcase-heading">
              <span className="menu-kicker">{FIGHTERS[chosen].team}</span>
              <h1>{FIGHTERS[chosen].name}</h1>
              <span className="role-badge">{FIGHTERS[chosen].role} · {FIGHTERS[chosen].hp.toLocaleString()} HP</span>
            </div>
            <div className="character-platform" aria-hidden="true" />
            <img key={chosen} className="showcase-character" src={fighterArt(chosen)} alt={`${FIGHTERS[chosen].name}, cartoon fighter`} />
            <button className="fighter-details-button" onClick={() => setGallery(true)}>Fighter details</button>
            <div className="fighter-dock" aria-label="Choose your fighter">
              {IDS.map(id => <button key={id} className={chosen === id ? "dock-fighter active" : "dock-fighter"} style={{ "--fighter": FIGHTERS[id].color } as React.CSSProperties} aria-label={`Select ${FIGHTERS[id].name}`} aria-pressed={chosen === id} onClick={() => setChosen(id)}><img src={fighterArt(id)} alt="" /><span>{FIGHTERS[id].name}</span></button>)}
            </div>
          </section>
          <section className="play-panel" aria-label="Play with friends">
            <div className="panel-heading"><span className="menu-kicker">YOUR NEXT MATCH</span><h2>LET’S PLAY.</h2></div>
            <label className="player-name" htmlFor="nickname"><span>PLAYER NAME</span><input id="nickname" maxLength={18} value={name} placeholder="Enter your nickname" onChange={e => setName(e.target.value)} autoComplete="nickname" /></label>
            <div className="menu-mode-picker" aria-label="Game mode">
              {(["showdown", "broomball"] as const).map(mode => <button key={mode} className={`menu-mode ${menuMode === mode ? "active" : ""}`} aria-pressed={menuMode === mode} onClick={() => setMenuMode(mode)}><span className={`mode-emblem ${mode}`} aria-hidden="true">{mode === "showdown" ? "FFA" : "3v3"}</span><span><strong>{mode === "showdown" ? "SHOWDOWN" : "BROOMBALL"}</strong><small>{mode === "showdown" ? "Last fighter standing · 2–8 players" : "First to 2 goals · 6 players"}</small></span><span className="mode-selected" aria-hidden="true">{menuMode === mode ? "✓" : ""}</span></button>)}
            </div>
            <button className="launch-button" disabled={busy} onClick={() => enter(true)}>{busy ? "CONNECTING…" : "CREATE PARTY"}<span aria-hidden="true">→</span></button>
            <p className="play-help">Invite your friends, ready up, and jump in.</p>
            <form className="party-join" onSubmit={e => { e.preventDefault(); if (!busy && code.length === 6) void enter(false); }}>
              <label htmlFor="party-code">GOT AN INVITE?</label>
              <div><input id="party-code" aria-label="Room code" value={code} onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-Z2-9]/g, ""))} placeholder="ROOM CODE" maxLength={6} autoComplete="off" spellCheck={false} /><button disabled={busy || code.length !== 6} type="submit">JOIN</button></div>
            </form>
            <div className="selected-kit"><span>YOUR LOADOUT</span><strong>{FIGHTERS[chosen].attack}</strong><small>SUPER · {FIGHTERS[chosen].super}</small></div>
          </section>
        </main>
      )}
      {lobby && (!match || lobby.phase === "lobby") && (
        <main className="lobby">
          <section className="lobby-top">
            <div>
              <div className="eyebrow">PARTY LOBBY</div>
              <h1 className="room-code">{lobby.code}</h1>
              <p>{status}</p>
            </div>
            <div className="room-actions">
              <button onClick={copyInvite}>Invite friends</button>
              <button className="quiet" onClick={leave}>
                Leave room
              </button>
            </div>
          </section>
          <div className="lobby-columns">
            <section>
              <div className="section-label">GAME MODE</div>
              <div className="mode-picker">
                {(["showdown", "broomball"] as const).map((mode) => (
                  <button
                    key={mode}
                    className={lobby.mode === mode ? "selected" : ""}
                    disabled={!host}
                    onClick={() => command({ type: "mode", mode })}
                  >
                    <strong>
                      {mode === "showdown" ? "Showdown FFA" : "3v3 Broomball"}
                    </strong>
                    <span>
                      {mode === "showdown"
                        ? "Central Lawn · Last leader standing · 2–8 players"
                        : "Broomball Night · First to 2 goals · Exactly 6"}
                    </span>
                  </button>
                ))}
              </div>
              <div className="section-label roster-label">
                YOUR PARTY{" "}
                <span>
                  {lobby.members.length}/{lobby.mode === "showdown" ? 8 : 6}
                </span>
              </div>
              <div className="members">
                {lobby.members.map((p) => (
                  <div className="member" key={p.id}>
                    <img
                      src={fighterArt(p.fighter)}
                      alt=""
                      style={{ background: FIGHTERS[p.fighter].color }}
                    />
                    <div>
                      <strong>
                        {p.name}
                        {p.id === lobby.host ? " · HOST" : ""}
                      </strong>
                      <span>
                        {FIGHTERS[p.fighter].name} /{" "}
                        {p.connected
                          ? p.ready
                            ? "Ready"
                            : "Choosing…"
                          : "Reconnecting…"}
                      </span>
                    </div>
                    {lobby.mode === "broomball" && (
                      <button
                        className={`team team-${p.team}`}
                        disabled={!host}
                        onClick={() =>
                          command({
                            type: "team",
                            id: p.id,
                            team: p.team === 0 ? 1 : 0,
                          })
                        }
                      >
                        {p.team === 0 ? "▲ BLUE" : "◆ RED"}
                      </button>
                    )}
                    <span className={p.ready ? "ready yes" : "ready"}>
                      {p.ready ? "✓" : "·"}
                    </span>
                  </div>
                ))}
              </div>
              {host && lobby.mode === "broomball" && (
                <button
                  className="quiet"
                  onClick={() => command({ type: "shuffle" })}
                >
                  Shuffle teams
                </button>
              )}
              <div className="lobby-buttons">
                <button
                  className={me?.ready ? "selected" : "primary"}
                  onClick={() => command({ type: "ready", ready: !me?.ready })}
                >
                  {me?.ready ? "Ready ✓ · Undo" : "I’m ready"}
                </button>
                {host && (
                  <button
                    className="primary"
                    onClick={() => command({ type: "start" })}
                  >
                    PLAY →
                  </button>
                )}
              </div>
              <p className="hint">
                {host
                  ? "Everyone must be connected and ready. Broomball requires three different fighters per team."
                  : "The host starts when everyone is ready."}
              </p>
            </section>
            <section>
              <div className="section-label">CHOOSE YOUR FIGHTER</div>
              <div className="fighter-grid">
                {IDS.map((id) => (
                  <FighterCard
                    key={id}
                    id={id}
                    selected={me?.fighter === id}
                    onClick={() => command({ type: "select", fighter: id })}
                  />
                ))}
              </div>
            </section>
          </div>
          <div className="connection-note">
            <span className="live-dot" />
            {host
              ? "You’re the host. Keep this tab in the foreground; a desktop works best."
              : "Connected directly to the host’s browser."}
            <button className="quiet" onClick={reconnect}>
              Reconnect
            </button>
          </div>
        </main>
      )}
      {inGame && match && (
        <>
          <GameView bridge={bridge.current} />
          <div className="match-hud">
            <button className="quiet" onClick={() => setSettings(true)}>
              Ⅱ Settings
            </button>
            <div className="score">
              <span>
                {match.mode === "showdown"
                  ? `${match.aliveCount} alive`
                  : `▲ ${match.score[0]} — ${match.score[1]} ◆`}
              </span>
              <b>
                {match.phase === "countdown"
                  ? Math.max(1, Math.ceil(match.phaseUntil - match.time))
                  : formatTime(
                      Math.max(
                        0,
                        (match.overtime
                          ? 180
                          : match.mode === "showdown"
                            ? 210
                            : 150) -
                          (match.time - 3),
                      ),
                    )}
              </b>
              {match.overtime && <em>GOLDEN GOAL</em>}
            </div>
            <span className="net-status">
              {status.includes("lost") ? "Connection lost" : "Browser host"}
              <button onClick={reconnect} className="quiet">
                Reconnect
              </button>
            </span>
          </div>
          <div className="match-notice" key={match.notice}>
            {match.phase === "countdown" ? "GET READY" : match.notice}
          </div>
          {self?.alive ? (
            <>
              <div className="personal-hud">
                <strong>{FIGHTERS[self.fighter].name}</strong>
                <span>{Math.ceil(self.hp)} HP</span>
                <span>
                  {"●".repeat(self.ammo)}
                  {"○".repeat(
                    Math.max(0, FIGHTERS[self.fighter].ammo - self.ammo),
                  )}
                </span>
                <span>
                  {match.ball.carrier === self.id
                    ? "CARRYING • RELEASE TO PASS"
                    : `${Math.floor(self.charge / 50)}% SUPER`}
                </span>
              </div>
              <TouchControls
                bridge={bridge.current}
                carrying={match.ball.carrier === self.id}
                charge={self.charge}
              />
            </>
          ) : (
            <div className="spectator">
              {match.mode === "showdown" ? (
                <>
                  <strong>You placed #{self?.placement}</strong>
                  <span>
                    Watching{" "}
                    {match.players.find((p) => p.id === spectate)?.name ||
                      "the arena"}
                  </span>
                  <button
                    onClick={() => {
                      const alive = match.players.filter((p) => p.alive);
                      const next =
                        alive[
                          (alive.findIndex((p) => p.id === spectate) + 1) %
                            alive.length
                        ];
                      setSpectate(next?.id || null);
                      bridge.current.spectate = next?.id || null;
                    }}
                  >
                    Next survivor →
                  </button>
                </>
              ) : (
                <strong>
                  Back on the ice in{" "}
                  {Math.max(0, Math.ceil((self?.respawn || 0) - match.time))}…
                </strong>
              )}
            </div>
          )}
          {match.phase === "goal" && (
            <div className="countdown-overlay">
              GOAL!
              <small>
                Kickoff in {Math.ceil(match.phaseUntil - match.time)}
              </small>
            </div>
          )}
          <div className="rotate">
            <strong>Turn your phone sideways</strong>
            <span>The arena plays best in landscape.</span>
          </div>
          <div className="desktop-help">
            WASD move · Mouse aim · Click attack · Space / right click Super ·
            Hold click to charge a ball shot
          </div>
        </>
      )}
      {match?.phase === "finished" && (
        <main className="results">
          <div className="eyebrow">THAT’S A ROUND</div>
          <h1>
            {match.mode === "showdown"
              ? (match.players.find((p) => p.id === match.winner)?.name ||
                  "Nobody") + " wins!"
              : match.winner
                ? (match.winner === "blue" ? "Blue" : "Red") + " takes the ice!"
                : "It’s a draw!"}
          </h1>
          <p>
            {match.mode === "showdown"
              ? "Same friends. Fresh rivalries."
              : `Final score · Blue ${match.score[0]} — ${match.score[1]} Red`}
          </p>
          <div className="results-table">
            <table>
              <thead>
                <tr>
                  <th>PLAYER</th>
                  <th>{match.mode === "showdown" ? "PLACE" : "G / A"}</th>
                  <th>K / D</th>
                  <th>DAMAGE</th>
                  <th>HEALING</th>
                  {match.mode === "showdown" && <th>RECEIVED</th>}
                  <th>{match.mode === "showdown" ? "SURVIVED" : "MVP"}</th>
                </tr>
              </thead>
              <tbody>
                {[...match.players]
                  .sort((a, b) =>
                    match.mode === "showdown"
                      ? a.placement - b.placement
                      : mvp(b) - mvp(a),
                  )
                  .map((p, i) => (
                    <tr key={p.id}>
                      <td>
                        <img src={fighterArt(p.fighter)} alt="" />
                        {p.name}
                      </td>
                      <td>
                        {match.mode === "showdown"
                          ? `#${p.placement}`
                          : `${p.stats.goals} / ${p.stats.assists}`}
                      </td>
                      <td>
                        {p.stats.kills} / {p.stats.deaths}
                      </td>
                      <td>{Math.round(p.stats.damage).toLocaleString()}</td>
                      <td>{Math.round(p.stats.healing).toLocaleString()}</td>
                      {match.mode === "showdown" && (
                        <td>{Math.round(p.stats.received).toLocaleString()}</td>
                      )}
                      <td>
                        {match.mode === "showdown"
                          ? formatTime(p.stats.survived)
                          : i === 0
                            ? "★"
                            : ""}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <div className="result-actions">
            {host ? (
              <button
                className="primary"
                onClick={() => command({ type: "lobby" })}
              >
                Run it back →
              </button>
            ) : (
              <span>Waiting for the host to return to the lobby…</span>
            )}
            <button onClick={leave}>Leave room</button>
          </div>
          <small>
            Rematch returns everyone to the lobby to choose fighters and ready
            up.
          </small>
        </main>
      )}
      {gallery && (
        <div className="modal-backdrop">
          <section className="modal gallery" role="dialog" aria-modal="true" aria-label="Fighter select">
            <button
              className="close"
              onClick={() => setGallery(false)}
              aria-label="Close gallery"
            >
              ×
            </button>
            <div className="eyebrow">FIGHTER SELECT</div>
            <h2>CHOOSE YOUR FIGHTER</h2>
            <div className="fighter-grid">
              {IDS.map((id) => (
                <FighterCard
                  key={id}
                  id={id}
                  selected={chosen === id}
                  onClick={() => setChosen(id)}
                />
              ))}
            </div>
          </section>
        </div>
      )}
      {settings && (
        <div className="modal-backdrop">
          <section
            className="modal settings"
            role="dialog"
            aria-modal="true"
            aria-label="Settings"
          >
            <button
              className="close"
              onClick={() => setSettings(false)}
              aria-label="Close settings"
            >
              ×
            </button>
            <div className="eyebrow">MAKE YOURSELF COMFORTABLE</div>
            <h2>Settings</h2>
            <label>
              Sound effects{" "}
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={soundVolume}
                onChange={(e) => {
                  unlockAudio();
                  setSoundVolume(+e.target.value);
                }}
              />
            </label>
            <label>
              Music{" "}
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={musicVolume}
                onChange={(e) => {
                  unlockAudio();
                  setMusicVolume(+e.target.value);
                }}
              />
            </label>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={touchControls}
                onChange={(e) => setTouchControls(e.target.checked)}
              />{" "}
              Show touch controls
            </label>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={shake}
                onChange={(e) => setShake(e.target.checked)}
              />{" "}
              Screen shake
            </label>
            <p>
              WASD to move, mouse to aim, click to attack. Space or right click
              activates your Super. Hold and release click for stronger ball
              shots.
            </p>
            <p>
              On touch: left stick moves. Drag and release the right stick to
              aim and fire. Drag and release the Super stick when charged.
            </p>
            {inGame && (
              <>
                <p>The match keeps running while settings are open.</p>
                <button
                  onClick={() => {
                    leave();
                    setSettings(false);
                  }}
                >
                  {host ? "End room and leave" : "Leave match"}
                </button>
              </>
            )}
            <button className="primary" onClick={() => setSettings(false)}>
              Back to it →
            </button>
          </section>
        </div>
      )}
    </div>
  );
}
function FighterCard({
  id,
  selected,
  onClick,
}: {
  id: FighterId;
  selected: boolean;
  onClick: () => void;
}) {
  const f = FIGHTERS[id];
  return (
    <button
      className={selected ? "fighter-card selected" : "fighter-card"}
      style={{ "--fighter": f.color } as React.CSSProperties}
      onClick={onClick}
      aria-pressed={selected}
    >
      <div className="card-art">
        <span>{f.role}</span>
        <img src={fighterArt(id)} alt="" />
        <b>{f.hp.toLocaleString()} HP</b>
      </div>
      <div className="card-copy">
        <h3>
          {f.name} {selected && "✓"}
        </h3>
        <small>{f.team}</small>
        <p>{f.description}</p>
        <span>
          <strong>SUPER</strong> {f.super}
        </span>
        <p className="super-description">{f.superDescription}</p>
      </div>
    </button>
  );
}
function GameView({ bridge }: { bridge: GameBridge }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let disposed = false;
    let game: import("phaser").Game | undefined;
    void import("./game").then((module) => {
      if (!disposed) game = module.mountGame(ref.current!, bridge);
    });
    return () => {
      disposed = true;
      game?.destroy(true);
    };
  }, [bridge]);
  return <div className="game-canvas" ref={ref} />;
}
function Stick({
  label,
  onMove,
  onRelease,
  disabled = false,
  kind = "move",
}: {
  label: string;
  onMove: (v: Vec, power: number) => void;
  onRelease: (tap: boolean, power: number) => void;
  disabled?: boolean;
  kind?: string;
}) {
  const ref = useRef<HTMLDivElement>(null),
    active = useRef<number | null>(null),
    start = useRef<Vec>({ x: 0, y: 0 }),
    value = useRef<Vec>({ x: 0, y: 0 }),
    power = useRef(0.35);
  const [thumb, setThumb] = useState<Vec>({ x: 0, y: 0 });
  const update = (e: React.PointerEvent) => {
    if (active.current !== e.pointerId) return;
    const dx = e.clientX - start.current.x,
      dy = e.clientY - start.current.y,
      d = Math.hypot(dx, dy),
      r = kind === "super" ? 25 : 40;
    value.current = { x: dx / Math.max(r, d), y: dy / Math.max(r, d) };
    power.current = clamp(d / r, 0.35, 1);
    setThumb({ x: value.current.x * r, y: value.current.y * r });
    onMove(value.current, power.current);
  };
  return (
    <div
      ref={ref}
      className={`stick ${kind} ${disabled ? "disabled" : ""}`}
      role="button"
      aria-label={label}
      aria-disabled={disabled}
      onPointerDown={(e) => {
        if (disabled || active.current !== null) return;
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        active.current = e.pointerId;
        start.current = { x: e.clientX, y: e.clientY };
        value.current = { x: 0, y: 0 };
        power.current = 0.35;
      }}
      onPointerMove={update}
      onPointerUp={(e) => {
        if (active.current !== e.pointerId) return;
        e.preventDefault();
        active.current = null;
        onRelease(
          Math.hypot(value.current.x, value.current.y) < 0.2,
          power.current,
        );
        setThumb({ x: 0, y: 0 });
      }}
      onPointerCancel={(e) => {
        if (active.current !== e.pointerId) return;
        active.current = null;
        setThumb({ x: 0, y: 0 });
        onMove({ x: 0, y: 0 }, 0);
      }}
    >
      <div
        className="stick-thumb"
        style={{ transform: `translate(${thumb.x}px, ${thumb.y}px)` }}
      >
        {kind === "super" ? "★" : kind === "move" ? "✥" : "↗"}
      </div>
      <span>{label}</span>
    </div>
  );
}
function TouchControls({
  bridge,
  carrying,
  charge,
}: {
  bridge: GameBridge;
  carrying: boolean;
  charge: number;
}) {
  const aim = (v: Vec) => {
    if (Math.hypot(v.x, v.y) > 0.05) {
      const n = Math.hypot(v.x, v.y);
      bridge.input.aim = { x: v.x / n, y: v.y / n };
    }
  };
  const autoAim = () => {
    const m = bridge.match,
      me = m?.players.find((p) => p.id === bridge.id);
    if (!m || !me) return;
    const valid = (a: Vec, b: Vec) =>
      !m.walls.some((w) => {
        for (let t = 0; t <= 1; t += 0.02) {
          const x = a.x + (b.x - a.x) * t,
            y = a.y + (b.y - a.y) * t;
          if (x > w.x && x < w.x + w.w && y > w.y && y < w.y + w.h) return true;
        }
        return false;
      });
    const target = m.players
      .filter(
        (p) =>
          p.id !== me.id &&
          p.alive &&
          (m.mode === "showdown" || p.team !== me.team) &&
          distance(p.pos, me.pos) <= FIGHTERS[me.fighter].range &&
          valid(me.pos, p.pos),
      )
      .sort((a, b) => distance(a.pos, me.pos) - distance(b.pos, me.pos))[0];
    if (target) aim({ x: target.pos.x - me.pos.x, y: target.pos.y - me.pos.y });
  };
  return (
    <div className="touch-controls">
      <Stick
        label="MOVE"
        onMove={(v) => {
          bridge.input.move = v;
        }}
        onRelease={() => {
          bridge.input.move = { x: 0, y: 0 };
        }}
      />
      <div className="right-controls">
        <Stick
          kind="super"
          label={
            carrying
              ? "LOCKED"
              : charge >= 5000
                ? "SUPER"
                : `${Math.floor(charge / 50)}%`
          }
          disabled={charge < 5000 || carrying}
          onMove={aim}
          onRelease={() => {
            bridge.input.super = true;
          }}
        />
        <Stick
          kind="attack"
          label={carrying ? "PASS / SHOOT" : "AIM / FIRE"}
          onMove={(v, p) => {
            aim(v);
            bridge.input.power = p;
          }}
          onRelease={(tap, p) => {
            if (tap && !carrying) autoAim();
            bridge.input.attack = true;
            bridge.input.power = p;
          }}
        />
      </div>
    </div>
  );
}
const formatTime = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
const mvp = (p: Match["players"][number]) =>
  p.stats.goals * 5000 +
  p.stats.assists * 3000 +
  p.stats.kills * 800 +
  p.stats.damage +
  p.stats.healing * 0.6;
const root =
  import.meta.hot?.data.root ?? createRoot(document.getElementById("root")!);
if (import.meta.hot) import.meta.hot.data.root = root;
root.render(<App />);
