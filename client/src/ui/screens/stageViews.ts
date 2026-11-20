import { FIGHTERS, type FighterId } from "../../../../shared/definitions";
import type { Lobby, Match } from "../../../../shared/types";
import type { PressResult } from "../core/control";
import type { Pose, StageFighter, StageFrame, StageState } from "../scene/menuScene";
import type { StagePlate } from "../scene/MenuStage";

/**
 * What the 3D stage shows behind each menu screen. Screens own layout, so
 * the free area the stage may fill is declared here per screen and
 * orientation, matching ui.css.
 */
export type StageScreen = "home" | "picker" | "lobby" | "results";

const FRAMES: Record<StageScreen, { portrait: StageFrame; landscape: StageFrame }> = {
  home: {
    portrait: { x0: 0.06, y0: 0.18, x1: 0.94, y1: 0.7 },
    // Centered enough that the staircase stays in frame on the left.
    landscape: { x0: 0.22, y0: 0.2, x1: 0.78, y1: 0.96 },
  },
  picker: {
    portrait: { x0: 0.12, y0: 0.07, x1: 0.88, y1: 0.4 },
    landscape: { x0: 0.02, y0: 0.12, x1: 0.48, y1: 0.97 },
  },
  lobby: {
    portrait: { x0: 0.02, y0: 0.2, x1: 0.98, y1: 0.75 },
    landscape: { x0: 0.02, y0: 0.18, x1: 0.98, y1: 0.78 },
  },
  results: {
    portrait: { x0: 0.02, y0: 0.24, x1: 0.98, y1: 0.76 },
    landscape: { x0: 0.4, y0: 0.06, x1: 0.98, y1: 0.78 },
  },
};

export const stageFrame = (screen: StageScreen, portrait: boolean) =>
  FRAMES[screen][portrait ? "portrait" : "landscape"];

export interface StageView {
  state: StageState;
  plates: StagePlate[];
}

/**
 * One fighter in focus: the home screen and the picker. `key` is the stage
 * identity, so opening the picker from the lobby keeps your own fighter in
 * place while the rest of the party steps off.
 */
export function homeStage(
  fighter: FighterId,
  frame: StageFrame,
  openPicker: () => PressResult,
  key = "self",
): StageView {
  const f = FIGHTERS[fighter];
  return {
    state: {
      mode: "solo",
      frame,
      fighters: [{ key, fighter, pose: "idle", self: true, ring: "blue" }],
    },
    plates: [
      {
        key,
        label: `${f.name}, ${f.role}. Change fighter`,
        title: f.name,
        caption: f.role,
        badges: [{ icon: "swap", text: "CHANGE" }],
        variant: "selected",
        onPress: openPicker,
      },
    ],
  };
}

export function lobbyStage(
  lobby: Lobby,
  selfId: string,
  frame: StageFrame,
  actions: {
    openPicker: () => PressResult;
    setTeam: (id: string, team: 0 | 1) => PressResult;
    kick: (id: string) => PressResult;
  },
): StageView {
  const teams = lobby.mode === "broomball";
  const isHost = lobby.host === selfId;
  const fighters: StageFighter[] = lobby.members.map((m) => ({
    key: m.id,
    fighter: m.fighter,
    team: teams ? m.team : undefined,
    self: m.id === selfId,
    pose: (!m.connected ? "sad" : m.ready ? "ready" : "idle") as Pose,
    ring: teams ? (m.team === 0 ? "blue" : "grey") : m.id === selfId ? "blue" : undefined,
  }));
  // Plates stay compact so ten fit side by side on a phone: status is the
  // surface plus a leading icon, never color alone.
  const plates: StagePlate[] = lobby.members.map((m) => {
    const status = !m.connected ? "reconnecting" : m.ready ? "ready" : "choosing";
    const team = m.team === 0 ? "Blue" : "Red";
    const self = m.id === selfId;
    return {
      key: m.id,
      label: `${m.name}${self ? " (you)" : ""}, ${FIGHTERS[m.fighter].name}, ${status}${
        m.id === lobby.host ? ", host" : ""
      }${teams ? `, ${team} team` : ""}${
        self ? ". Change fighter" : teams && isHost ? `. Move to ${m.team === 0 ? "Red" : "Blue"}` : ""
      }`,
      title: `${teams ? (m.team === 0 ? "▲ " : "◆ ") : ""}${m.name}`,
      icon: !m.connected ? "refresh" : m.ready ? "check" : undefined,
      caption: `${FIGHTERS[m.fighter].name}${m.id === lobby.host ? " · Host" : ""}`,
      variant: !m.connected ? "dark" : m.ready ? "primary" : self ? "selected" : undefined,
      onPress: self ? actions.openPicker : undefined,
      actions: isHost
        ? [
            ...(teams
              ? [
                  {
                    key: "team",
                    label: `Move ${m.name} to ${m.team === 0 ? "Red" : "Blue"} team`,
                    text: `TO ${m.team === 0 ? "RED" : "BLUE"}`,
                    icon: "swap" as const,
                    onPress: () => actions.setTeam(m.id, m.team === 0 ? 1 : 0),
                  },
                ]
              : []),
            ...(self
              ? []
              : [
                  {
                    key: "kick",
                    label: `Kick ${m.name} from the room`,
                    text: "KICK",
                    icon: "leave" as const,
                    onPress: () => actions.kick(m.id),
                  },
                ]),
          ]
        : undefined,
    };
  });
  return { state: { mode: teams ? "teams" : "party", frame, fighters }, plates };
}

const mvpScore = (p: Match["players"][number]) =>
  p.stats.goals * 5000 +
  p.stats.assists * 3000 +
  p.stats.kills * 800 +
  p.stats.damage +
  p.stats.healing * 0.6;

/** Showdown and Fishers of Men rank by placement; Broomball by MVP score. */
const ranked = (match: Match) => match.mode !== "broomball";

/** Players in finishing order, with the MVP (Fishers of Men: top catcher). */
export function standings(match: Match) {
  const place = (p: Match["players"][number]) =>
    match.mode === "showdown" && p.id === match.winner ? 0 : p.placement || 99;
  const ordered = [...match.players].sort((a, b) => (ranked(match) ? place(a) - place(b) : mvpScore(b) - mvpScore(a)));
  const catcher = [...match.players].sort((a, b) => b.stats.catches - a.stats.catches)[0];
  const mvp =
    match.mode === "broomball"
      ? ordered[0]?.id
      : match.mode === "fishing" && catcher?.stats.catches
        ? catcher.id
        : undefined;
  return { ordered, mvp };
}

export function resultsStage(match: Match, selfId: string, frame: StageFrame): StageView {
  const { ordered, mvp } = standings(match);
  const winTeam = match.winner === "blue" ? 0 : match.winner === "red" ? 1 : null;
  const fighters: StageFighter[] = ordered.map((p, i) => {
    if (ranked(match))
      return {
        key: p.id,
        fighter: p.fighter,
        rank: i + 1,
        self: p.id === selfId,
        pose: i === 0 ? "victory" : i < 3 ? "idle" : "sad",
        ring: p.id === selfId ? "blue" : undefined,
      };
    const won = winTeam === null || p.team === winTeam;
    return {
      key: p.id,
      fighter: p.fighter,
      team: p.team,
      winner: won,
      self: p.id === selfId,
      pose: winTeam === null ? "idle" : won ? "victory" : "sad",
      ring: p.team === 0 ? "blue" : "grey",
    };
  });
  // Plates for the podium (or winning side) and yourself only; the Stats
  // sheet has everyone. This keeps a 10-player podium readable on a phone.
  const featured = (p: Match["players"][number], i: number) =>
    p.id === selfId ||
    p.id === mvp ||
    (ranked(match) ? i < 3 : winTeam === null ? i < 3 : p.team === winTeam);
  const plates: StagePlate[] = ordered.filter(featured).map((p) => {
    const i = ordered.indexOf(p);
    const crown = ranked(match) && i === 0;
    const winnerIcon = crown || p.id === mvp;
    const fishing = match.mode === "fishing";
    return {
      key: p.id,
      label: fishing
        ? `${p.name}, place ${i + 1}, ${p.stats.catches} caught${p.id === mvp ? ", top fisher" : ""}`
        : match.mode === "showdown"
          ? `${p.name}, place ${i + 1}${i === 0 ? ", winner" : ""}, ${p.stats.kills} knockouts`
          : `${p.name}, ${p.stats.goals} goals, ${p.stats.assists} assists${p.id === mvp ? ", MVP" : ""}`,
      title: ranked(match) ? `#${i + 1} ${p.name}` : p.name,
      // One line per plate: the crown or MVP star leads instead of a badge row.
      icon: crown ? "crown" : winnerIcon ? "star" : undefined,
      caption: fishing
        ? `${p.id === mvp ? "Top fisher · " : ""}${p.stats.catches} caught`
        : match.mode === "showdown"
          ? `${p.stats.kills} KO · ${Math.round(p.stats.damage).toLocaleString()} dmg`
          : `${p.id === mvp ? "MVP · " : ""}${p.stats.goals}G ${p.stats.assists}A`,
      variant: p.id === selfId ? "selected" : winnerIcon ? "primary" : undefined,
    };
  });
  return { state: { mode: "podium", frame, fighters }, plates };
}
