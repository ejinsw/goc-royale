import { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import type { FighterId } from "../../shared/definitions";
import type { Command, HostMessage, Lobby, Match } from "../../shared/types";
import { Network } from "./network";
import { GameStore } from "./gameStore";
import { installDevOverlay } from "./devOverlay";
import type { GameBridge } from "./game";
import { preferences, setMusic, unlockAudio } from "./audio";
import { setReducedMotion, uiPrefs } from "./ui/core/feedback";
import type { ControlHandle, PressResult } from "./ui/core/control";
import { menuKit } from "./ui/menu/menuKit";
import { MenuStage } from "./ui/scene/MenuStage";
import { HomeScreen } from "./ui/screens/Home";
import { LobbyScreen } from "./ui/screens/Lobby";
import { FighterSheet } from "./ui/screens/FighterSheet";
import { ResultsScreen } from "./ui/screens/Results";
import { SettingsSheet, type SettingsValues } from "./ui/screens/Settings";
import { MatchHud } from "./ui/screens/MatchHud";
import { homeStage, lobbyStage, resultsStage, stageFrame, type StageScreen } from "./ui/screens/stageViews";
import { usePortrait } from "./ui/screens/useViewport";
import "@fontsource/barlow/latin-500.css";
import "@fontsource/barlow/latin-600.css";
import "@fontsource/barlow/latin-700.css";
import "@fontsource/barlow-condensed/latin-700.css";
import "@fontsource/barlow-condensed/latin-800.css";
import "@fontsource/barlow-condensed/latin-900.css";
import "./ui/ui.css";

const { Display } = menuKit;

const initialInput = () => ({
  move: { x: 0, y: 0 },
  aim: { x: 1, y: 0 },
  power: 0.35,
  attack: false,
  super: false,
});

const DEFAULT_STATUS = "Ready when you are";

function loadPreferences(): SettingsValues {
  const fallback: SettingsValues = {
    sound: 0.35,
    music: 0,
    shake: true,
    reducedMotion: uiPrefs.reducedMotion,
    haptics: true,
  };
  try {
    return { ...fallback, ...JSON.parse(localStorage.getItem("goc.preferences") || "{}") };
  } catch {
    return fallback;
  }
}

/**
 * App shell: owns the network session and routes between screens. Every
 * screen is composed from menuKit or gameKit (docs/CODE-PRACTICES.md).
 */
function App() {
  const [lobby, setLobby] = useState<Lobby | null>(null),
    [matchPhase, setMatchPhase] = useState<Match["phase"] | null>(null),
    [status, setStatus] = useState(DEFAULT_STATUS),
    [toast, setToast] = useState<{ text: string; key: number } | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [name, setName] = useState(localStorage.getItem("goc.name") || ""),
    [code, setCode] = useState(new URLSearchParams(location.search).get("room")?.toUpperCase() || ""),
    [chosen, setChosen] = useState<FighterId>("brandon"),
    [picker, setPicker] = useState(false),
    [settings, setSettings] = useState(false),
    [spectate, setSpectate] = useState<string | null>(null),
    [prefs, setPrefs] = useState<SettingsValues>(loadPreferences);
  const invited = useRef(code.length === 6).current;
  const net = useRef<Network | null>(null),
    store = useRef<GameStore>(new GameStore()),
    nameHandle = useRef<ControlHandle>(null),
    bridge = useRef<GameBridge>({
      match: null,
      id: "",
      input: initialInput(),
      spectate: null,
      send: (input) => net.current?.input(input),
      paused: false,
      aiming: null,
    });
  const portrait = usePortrait();

  useEffect(
    () => () => {
      net.current?.close();
      setMusic(0);
    },
    [],
  );
  useEffect(() => {
    preferences.sound = prefs.sound;
    preferences.shake = prefs.shake;
    uiPrefs.haptics = prefs.haptics;
    setReducedMotion(prefs.reducedMotion);
    setMusic(prefs.music);
    localStorage.setItem("goc.preferences", JSON.stringify(prefs));
  }, [prefs]);
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
  // Warm the arena chunk and the fighters' runtime assets while in the lobby.
  const lobbyFighters = lobby ? [...new Set(lobby.members.map((m) => m.fighter))].sort().join(",") : "";
  useEffect(() => {
    if (!lobbyFighters) return;
    void import("./game").then((m) => m.preloadArena(lobbyFighters.split(",") as FighterId[]));
  }, [lobbyFighters]);
  useEffect(() => {
    if (!error) return;
    const id = setTimeout(() => setError(""), 6000);
    return () => clearTimeout(id);
  }, [error]);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(id);
  }, [toast]);

  const inGame = matchPhase !== null && lobby?.phase !== "lobby" && matchPhase !== "finished";
  const inGameRef = useRef(inGame);
  inGameRef.current = inGame;
  const announce = (text: string) => {
    setStatus(text);
    // The match HUD has its own compact connection state (standard §8.1).
    if (text !== DEFAULT_STATUS && !inGameRef.current) setToast({ text, key: Date.now() });
  };

  const receive = (m: HostMessage) => {
    if (m.type === "lobby") {
      setLobby(m.lobby);
      if (m.lobby.phase === "lobby") {
        store.current.clear();
        bridge.current.match = null;
        bridge.current.input = initialInput();
        setMatchPhase(null);
      }
    }
    if (m.type === "welcome") {
      bridge.current.id = m.id;
      setLobby(m.lobby);
      sessionStorage.setItem("goc.session", JSON.stringify({ code: m.lobby.code, token: m.token, name }));
    }
    if (m.type === "snapshot") {
      // Standard §5.1: the snapshot goes to the mutable store and the renderer
      // bridge, never into top-level React state. Only the phase is mirrored.
      bridge.current.match = m.match;
      store.current.setMatch(m.match);
      setMatchPhase((prev) => (prev === m.match.phase ? prev : m.match.phase));
    }
    if (m.type === "error") setError(m.message);
  };

  function enter(create: boolean): PressResult {
    if (!name.trim()) {
      nameHandle.current?.focus();
      nameHandle.current?.deny("Pick a nickname first");
      return "deny";
    }
    unlockAudio();
    setBusy(true);
    setError("");
    announce(create ? "Opening your room…" : "Connecting to the room…");
    net.current?.close();
    const network = new Network(receive, announce);
    net.current = network;
    return (async () => {
      try {
        localStorage.setItem("goc.name", name.trim());
        if (create) {
          await network.create(name);
          network.command({ type: "select", fighter: chosen });
        } else {
          let token: string | undefined;
          try {
            const saved = JSON.parse(sessionStorage.getItem("goc.session") || "null");
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
        throw e;
      } finally {
        setBusy(false);
      }
    })();
  }

  const command = (c: Command) => {
    setError("");
    net.current?.command(c);
  };
  const selfId = net.current?.id ?? "";
  const me = lobby?.members.find((p) => p.id === selfId);
  const host = lobby?.host === selfId;
  const lobbyView = !!lobby && (matchPhase === null || lobby.phase === "lobby");
  const finished = matchPhase === "finished" ? store.current.match : null;

  const copyInvite = () =>
    navigator.clipboard
      .writeText(`${location.origin}${location.pathname}?room=${lobby!.code}`)
      .then(() => announce("Invite link copied"))
      .catch((e) => {
        setError(`Share this room code: ${lobby?.code}`);
        throw e;
      });
  const leave = () => {
    net.current?.close();
    net.current = null;
    setLobby(null);
    setMatchPhase(null);
    setPicker(false);
    store.current.clear();
    bridge.current.match = null;
    bridge.current.input = initialInput();
    history.replaceState(null, "", location.pathname);
    setStatus(DEFAULT_STATUS);
  };
  const reconnect = async () => {
    setError("");
    try {
      await net.current?.reconnect(name);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Reconnect failed.");
      throw e;
    }
  };
  const openPicker = () => {
    setPicker(true);
  };
  const openSettings = () => {
    unlockAudio();
    setSettings(true);
  };
  const pickFighter = (id: FighterId) => {
    setChosen(id);
    if (lobbyView) command({ type: "select", fighter: id });
  };

  const screen: StageScreen = picker ? "picker" : finished ? "results" : lobbyView ? "lobby" : "home";
  const frame = stageFrame(screen, portrait);
  const pickerFighter = lobbyView && me ? me.fighter : chosen;
  const view = useMemo(() => {
    if (picker) return homeStage(pickerFighter, frame, openPicker, lobbyView ? selfId : "self");
    if (finished) return resultsStage(finished, selfId, frame);
    if (lobby && lobbyView)
      return lobbyStage(lobby, selfId, frame, {
        openPicker,
        setTeam: (id, team) => {
          command({ type: "team", id, team });
          return "confirm";
        },
      });
    return homeStage(chosen, frame, openPicker, "self");
  }, [picker, pickerFighter, finished, lobby, lobbyView, selfId, chosen, frame]);

  return (
    <div className={inGame ? "app playing" : "app"}>
      {!inGame && <MenuStage state={view.state} plates={view.plates} />}
      {!lobby && !picker && (
        <HomeScreen
          name={name}
          onName={setName}
          nameHandle={nameHandle}
          code={code}
          onCode={setCode}
          invited={invited}
          busy={busy}
          fighter={chosen}
          onCreate={() => enter(true)}
          onJoin={() => enter(false)}
          onFighters={openPicker}
          onSettings={openSettings}
        />
      )}
      {lobby && lobbyView && !picker && (
        <LobbyScreen
          lobby={lobby}
          selfId={selfId}
          command={command}
          onCopy={copyInvite}
          onLeave={leave}
          onFighters={openPicker}
          onSettings={openSettings}
        />
      )}
      {picker && <FighterSheet value={pickerFighter} onPick={pickFighter} onClose={() => setPicker(false)} />}
      {inGame && (
        <MatchHud
          store={store.current}
          bridge={bridge.current}
          selfId={selfId}
          status={status}
          spectate={spectate}
          setSpectate={setSpectate}
          onReconnect={reconnect}
          onSettings={openSettings}
        />
      )}
      {finished && !picker && (
        <ResultsScreen
          match={finished}
          selfId={selfId}
          host={!!host}
          onRematch={() => {
            command({ type: "lobby" });
            return "confirm";
          }}
          onLeave={leave}
          onSettings={openSettings}
        />
      )}
      <div className="toasts" aria-live="polite">
        {error && (
          <Display kind="toast" variant="danger" role="alert" icon="warning" text={error} pulseKey={error} onClose={() => setError("")} />
        )}
        {toast && !error && <Display kind="toast" icon="dot" text={toast.text} pulseKey={toast.key} />}
      </div>
      {settings && (
        <SettingsSheet
          values={prefs}
          onChange={(next) => setPrefs((p) => ({ ...p, ...next }))}
          inMatch={inGame}
          host={!!host}
          onReconnect={reconnect}
          onLeave={leave}
          onClose={() => setSettings(false)}
        />
      )}
    </div>
  );
}

const root = import.meta.hot?.data.root ?? createRoot(document.getElementById("root")!);
if (import.meta.hot) import.meta.hot.data.root = root;
if (!import.meta.hot?.data.overlay) {
  installDevOverlay();
  if (import.meta.hot) import.meta.hot.data.overlay = true;
}
root.render(<App />);
