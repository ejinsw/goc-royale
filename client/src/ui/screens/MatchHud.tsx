import { useEffect, useMemo, useRef, useState } from "react";
import { FIGHTERS, ITEMS, RULES, type FighterId, type ItemKind } from "../../../../shared/definitions";
import type { Match } from "../../../../shared/types";
import { uiCue } from "../../audio";
import type { ArenaHandle, GameBridge } from "../../game";
import { useGameSelector, type GameStore } from "../../gameStore";
import { metrics } from "../../metrics";
import type { PressResult } from "../core/control";
import { feedback } from "../core/feedback";
import { gameKit } from "../game/gameKit";
import { createHudSignals } from "../game/signals";
import { installStickRouter } from "../game/touchRouter";

const { Control, Display } = gameKit;

const matchDuration = (mode: Match["mode"], overtime: boolean) =>
  overtime ? 180 : mode === "showdown" ? 210 : 150;
const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/**
 * Structural HUD state: values that change the HUD's shape, at <= 10 Hz and
 * only on change (performance standard §5.1). Health, ammo, Super charge,
 * and zone danger are live signals written to the DOM instead.
 */
interface HudView {
  mode: Match["mode"];
  phase: Match["phase"];
  aliveCount: number;
  score0: number;
  score1: number;
  overtime: boolean;
  clock: string;
  countdown: number | null;
  notice: string;
  carrying: boolean;
  item: ItemKind | null;
  ball: "self" | "blue" | "red" | "loose" | null;
  goalKickoff: number | null;
  alive: boolean;
  fighter: FighterId | null;
  ammoMax: number;
  superReady: boolean;
  placement: number;
  respawnIn: number;
  spectateName: string;
}

const deriveHud = (match: Match | null, selfId: string, spectate: string | null): HudView | null => {
  if (!match) return null;
  const self = match.players.find((p) => p.id === selfId);
  const watched =
    match.players.find((p) => p.id === spectate && p.alive) ??
    (!self?.alive ? match.players.find((p) => p.alive) : undefined);
  const carrier = match.players.find((p) => p.id === match.ball.carrier);
  const countdown =
    match.phase === "countdown" ? Math.max(1, Math.ceil(match.phaseUntil - match.time)) : null;
  return {
    mode: match.mode,
    phase: match.phase,
    aliveCount: match.aliveCount,
    score0: match.score[0],
    score1: match.score[1],
    overtime: match.overtime,
    clock: formatTime(
      Math.max(0, matchDuration(match.mode, match.overtime) - Math.max(0, match.time - 3)),
    ),
    countdown,
    notice: match.phase === "countdown" ? "" : match.notice,
    carrying: match.ball.carrier === selfId,
    item: match.items.find((item) => item.id === self?.heldItem)?.kind ?? null,
    ball:
      match.mode !== "broomball"
        ? null
        : carrier?.id === selfId
          ? "self"
          : carrier
            ? carrier.team === 0
              ? "blue"
              : "red"
            : "loose",
    goalKickoff: match.phase === "goal" ? Math.ceil(match.phaseUntil - match.time) : null,
    alive: !!self?.alive,
    fighter: self?.fighter ?? null,
    ammoMax: self ? FIGHTERS[self.fighter].ammo : 0,
    superReady: (self?.charge ?? 0) >= RULES.superCharge,
    placement: self?.placement ?? 0,
    respawnIn: Math.max(0, Math.ceil((self?.respawn || 0) - match.time)),
    spectateName: watched?.name || "the arena",
  };
};

const hudEqual = (a: HudView | null, b: HudView | null) => {
  if (a === b) return true;
  if (!a || !b) return false;
  for (const k of Object.keys(a) as (keyof HudView)[]) if (a[k] !== b[k]) return false;
  return true;
};

/** Snapshot gap (ms) after which the HUD shows a degraded warning. */
const STALE_WARNING_MS = 1000;

/**
 * Connection health: "lost" from transport status, "unstable" when snapshots
 * are overdue. Polled at 2 Hz; re-renders only on change.
 */
function useConnectionState(status: string): "ok" | "unstable" | "lost" {
  const lost = /connection lost/i.test(status);
  const [stale, setStale] = useState(false);
  useEffect(() => {
    const id = setInterval(() => {
      const last = metrics.lastSnapshotAt;
      const next = !!last && performance.now() - last > STALE_WARNING_MS;
      setStale((prev) => (prev === next ? prev : next));
    }, 500);
    return () => clearInterval(id);
  }, []);
  return lost ? "lost" : stale ? "unstable" : "ok";
}

const ONBOARDING_MATCHES = 3;
const ONBOARDING_MS = 10000;

/** Controls hint for the first 10 s of a player's first three matches. */
function useOnboardingControls() {
  const [show, setShow] = useState(
    () => Number(localStorage.getItem("goc.controlsSeen") || 0) < ONBOARDING_MATCHES,
  );
  useEffect(() => {
    if (!show) return;
    const seen = Number(localStorage.getItem("goc.controlsSeen") || 0);
    localStorage.setItem("goc.controlsSeen", String(seen + 1));
    const id = setTimeout(() => setShow(false), ONBOARDING_MS);
    return () => clearTimeout(id);
  }, []);
  return show;
}

/**
 * The 3D arena. Mounted only during a match, after the menu scene has been
 * disposed, so one renderer is live at a time (docs/CODE-PRACTICES.md §7).
 */
function GameView({ bridge }: { bridge: GameBridge }) {
  const ref = useRef<HTMLDivElement>(null);
  // Set once if WebGL cannot start; the HUD and controls still work.
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    let disposed = false;
    let arena: ArenaHandle | undefined;
    void import("../../game").then((module) => {
      if (!disposed) arena = module.mountGame(ref.current!, bridge, { onUnavailable: () => setUnavailable(true) });
    });
    return () => {
      disposed = true;
      arena?.destroy();
    };
  }, [bridge]);
  return (
    <div className="game-canvas" ref={ref}>
      {unavailable && (
        <Display
          kind="callout"
          className="hud-big"
          variant="danger"
          icon="warning"
          text="The 3D arena could not start"
          sub="This browser blocked WebGL. The match continues; try another browser to see it."
        />
      )}
    </div>
  );
}

export function MatchHud({
  store,
  bridge,
  selfId,
  status,
  spectate,
  setSpectate,
  onReconnect,
  onSettings,
}: {
  store: GameStore;
  bridge: GameBridge;
  selfId: string;
  status: string;
  spectate: string | null;
  setSpectate: (id: string | null) => void;
  onReconnect: () => PressResult;
  onSettings: () => PressResult;
}) {
  const hud = useGameSelector(store, (m) => deriveHud(m, selfId, spectate), hudEqual);
  const signals = useMemo(() => createHudSignals(store, selfId), [store, selfId]);
  const connection = useConnectionState(status);
  const onboarding = useOnboardingControls();
  const layer = useRef<HTMLDivElement>(null);
  const live = useRef({ carrying: false, superReady: false });
  live.current = { carrying: !!hud?.carrying, superReady: !!hud?.superReady };
  const alive = !!hud?.alive;

  // A respawn or new match always returns camera ownership to the player.
  useEffect(() => {
    if (!alive) return;
    bridge.spectate = null;
    if (spectate !== null) setSpectate(null);
  }, [alive, bridge, spectate, setSpectate]);

  // One router per life: sticks exist only while the local fighter is alive.
  useEffect(() => {
    if (!alive || !layer.current) return;
    return installStickRouter({
      root: layer.current,
      bridge,
      carrying: () => live.current.carrying,
      attackEmpty: () => !live.current.carrying && (signals.ammo.read().count ?? 0) < 1,
      superBlocked: () =>
        live.current.carrying
          ? "Can't Super while carrying the ball"
          : live.current.superReady
            ? null
            : "Super is still charging",
      onDeny: (role) => {
        if (role === "attack") feedback(layer.current?.querySelector(".hud-ammo"), "jolt", { intensity: 0.6 });
      },
    });
  }, [alive, bridge, signals]);

  // Countdown ticks and a short GO! when play starts.
  const [go, setGo] = useState(false);
  const phase = hud?.phase;
  const countdown = hud?.countdown ?? null;
  useEffect(() => {
    if (countdown !== null) uiCue("ui_count", 1);
  }, [countdown]);
  const phaseBefore = useRef(phase);
  useEffect(() => {
    // Play resuming after a Super cutscene is not a kickoff.
    const from = phaseBefore.current;
    phaseBefore.current = phase;
    if (phase !== "playing" || from === "cutscene") return;
    setGo(true);
    uiCue("ui_count", 1.5);
    const id = setTimeout(() => setGo(false), 900);
    return () => clearTimeout(id);
  }, [phase === "playing"]);

  // Engine notices persist until replaced; the HUD shows each one briefly.
  // "Go!" is skipped because the full-screen GO! already announces it.
  const [notice, setNotice] = useState("");
  const rawNotice = hud?.notice ?? "";
  useEffect(() => {
    if (!rawNotice || rawNotice === "Go!") return;
    setNotice(rawNotice);
    const id = setTimeout(() => setNotice(""), 2600);
    return () => clearTimeout(id);
  }, [rawNotice]);

  if (!hud) return <GameView bridge={bridge} />;
  const touch = document.documentElement.dataset.touch === "on";
  return (
    <>
      <GameView bridge={bridge} />
      <div className="hud" ref={layer} data-cinematic={phase === "cutscene" ? "" : undefined}>
        <Display kind="vignette" variant="secondary" signal={signals.hp} reactions={["hitFlash"]} />
        <Display kind="vignette" variant="primary" signal={signals.zone} reactions={["danger"]} />
        <div className="hud-top">
          <Control kind="icon" icon="pause" label="Pause and settings" hideLabel onPress={onSettings} />
          <Display kind="panel" className="hud-clock" label="Match status">
            <Display kind="label" level="number" text={hud.clock} />
            {hud.mode === "showdown" ? (
              <Display kind="badge" icon="users" text={`${hud.aliveCount} LEFT`} pulseKey={hud.aliveCount} emphasis="pulse" />
            ) : (
              <span className="hud-score">
                <Display kind="badge" variant="primary" text={`▲ ${hud.score0}`} pulseKey={hud.score0} emphasis="burst" />
                <Display kind="badge" variant="secondary" text={`${hud.score1} ◆`} pulseKey={hud.score1} emphasis="burst" />
              </span>
            )}
            {hud.overtime && <Display kind="badge" variant="primary" icon="timer" text="GOLDEN GOAL" />}
          </Display>
          <div className="hud-net">
            {connection !== "ok" && (
              <Display
                kind="badge"
                variant="danger"
                icon="warning"
                text={connection === "lost" ? "Connection lost" : "Connection unstable"}
              />
            )}
            {connection === "lost" && (
              <Control kind="button" variant="primary" size="sm" icon="refresh" label="Reconnect" onPress={onReconnect} />
            )}
          </div>
        </div>
        {/* One centered stack, so announcements never overlap the corner HUD. */}
        <div className="hud-feed">
          {hud.ball && (
            <Display
              kind="badge"
              icon="ball"
              variant={hud.ball === "self" || hud.ball === "blue" ? "primary" : hud.ball === "red" ? "secondary" : "dark"}
              text={
                hud.ball === "self"
                  ? "YOU HAVE THE BALL"
                  : hud.ball === "loose"
                    ? "LOOSE BALL"
                    : hud.ball === "blue"
                      ? "▲ BLUE BALL"
                      : "◆ RED BALL"
              }
              pulseKey={hud.ball}
            />
          )}
          {notice && <Display kind="callout" size="sm" text={notice} pulseKey={notice} />}
          <Display
            kind="callout"
            className="hud-zone-alert"
            variant="danger"
            size="sm"
            icon="warning"
            text="In the zone! Move to the center"
            signal={signals.zone}
            reactions={["enter"]}
          />
          {onboarding && (
            <Display
              kind="toast"
              icon="move"
              text={
                touch
                  ? "Left thumb moves · Right thumb aims and fires · Use the item stick to aim and use"
                  : "WASD move · Mouse aim · Attack / Super · F picks up or puts down · E uses"
              }
            />
          )}
        </div>
        {hud.alive ? (
          <>
            <div className="hud-self">
              <div className="hud-items">
                <Control
                  kind="button"
                  variant="glass"
                  size="sm"
                  label={hud.item ? `Put down · ${ITEMS[hud.item].name}` : "Pick up item"}
                  onPress={() => {
                    if (bridge.paused) return "deny";
                    const me = bridge.match?.players.find((p) => p.id === bridge.id);
                    if (me?.heldItem != null) bridge.input.itemDrop = true;
                    else bridge.input.itemPickup = true;
                  }}
                />
              </div>
              <Display kind="meter" mode="bar" className="hud-hp" variant="glass" icon="heart" label="Health" signal={signals.hp} reactions={["damage", "heal"]} />
              <Display kind="meter" mode="pips" className="hud-ammo" variant="glass" label="Ammo" max={hud.ammoMax} signal={signals.ammo} />
            </div>
            <div className="hud-sticks">
              <Control kind="stick" role="move" icon="move" label="Move" hideLabel />
              <Control
                kind="stick"
                role="attack"
                icon={hud.carrying ? "ball" : "aim"}
                label={hud.carrying ? "Shoot" : "Attack"}
                hideLabel
              />
              <Control
                kind="stick"
                role="item"
                hideLabel
                variant={hud.item ? "primary" : "glass"}
                icon={hud.item ? "aim" : "lock"}
                label={hud.item ? `${ITEMS[hud.item].useLabel} · ${ITEMS[hud.item].name}` : "Use item"}
                disabled={hud.item ? undefined : "Pick up an item first"}
              />
              <Control
                kind="stick"
                role="super"
                variant={hud.superReady && !hud.carrying ? "primary" : "glass"}
                icon={hud.carrying ? "lock" : "bolt"}
                label="Super"
                disabled={hud.carrying ? "Locked while carrying" : hud.superReady ? undefined : "Charging"}
              >
                <Display kind="meter" mode="ring" className="hud-charge" label="Super charge" signal={signals.charge} reactions={["ready"]} />
              </Control>
            </div>
          </>
        ) : hud.mode === "showdown" ? (
          <Display kind="panel" className="hud-spectate">
            <Display kind="label" level="title" text={`#${hud.placement}`} />
            <Display kind="label" level="caption" icon="eye" text={`Watching ${hud.spectateName}`} />
            <Control
              kind="button"
              variant="dark"
              size="sm"
              icon="next"
              label="Next survivor"
              onPress={() => {
                const alivePlayers = store.match?.players.filter((p) => p.alive) ?? [];
                const next =
                  alivePlayers[
                    (alivePlayers.findIndex((p) => p.id === spectate) + 1) % Math.max(1, alivePlayers.length)
                  ];
                setSpectate(next?.id || null);
                bridge.spectate = next?.id || null;
              }}
            />
          </Display>
        ) : (
          <Display kind="callout" className="hud-respawn" icon="timer" text={`Back in ${hud.respawnIn}`} pulseKey={hud.respawnIn} />
        )}
        {hud.countdown !== null && (
          <Display kind="callout" className="hud-big" variant="primary" size="mega" text={String(hud.countdown)} pulseKey={hud.countdown} />
        )}
        {go && <Display kind="callout" className="hud-big" variant="primary" size="mega" text="GO!" pulseKey="go" />}
        {hud.goalKickoff !== null && (
          <Display
            kind="callout"
            className="hud-big"
            variant="primary"
            size="mega"
            icon="ball"
            text="GOAL!"
            sub={`Kickoff in ${hud.goalKickoff}`}
            pulseKey={`goal-${hud.score0}-${hud.score1}`}
            emphasis="burst"
          />
        )}
        <div className="hud-rotate" role="status">
          <strong>Turn your phone sideways</strong>
          <span>The arena plays in landscape.</span>
        </div>
      </div>
    </>
  );
}
