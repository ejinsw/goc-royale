import { useState } from "react";
import type { Match } from "../../../../shared/types";
import { fighterArt } from "../../art";
import type { PressResult } from "../core/control";
import { menuKit } from "../menu/menuKit";
import { standings } from "./stageViews";

const { Control, Display } = menuKit;

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/**
 * Results: winner and placement first, rematch as the dominant action, and
 * the full table behind a Stats sheet (performance standard §8.3).
 */
export function ResultsScreen({
  match,
  selfId,
  host,
  onRematch,
  onLeave,
  onSettings,
}: {
  match: Match;
  selfId: string;
  host: boolean;
  onRematch: () => PressResult;
  onLeave: () => PressResult;
  onSettings: () => PressResult;
}) {
  const [stats, setStats] = useState(false);
  const { ordered, mvp } = standings(match);
  const me = match.players.find((p) => p.id === selfId);
  const showdown = match.mode === "showdown";
  const fishing = match.mode === "fishing";
  const ranked = showdown || fishing;
  const winner = match.players.find((p) => p.id === match.winner);
  // Fishers of Men's score is [Fish still free, Fishers].
  const headline = fishing
    ? match.winner === "fish"
      ? `${match.score[0] === 1 ? "A fish" : `${match.score[0]} fish`} got away!`
      : "Everyone got caught!"
    : showdown
      ? `${winner?.name ?? "Nobody"} wins!`
      : match.winner
        ? `${match.winner === "blue" ? "▲ Blue" : "◆ Red"} wins!`
        : "Draw!";
  const myPlace = ordered.findIndex((p) => p.id === selfId) + 1;
  const sub = ranked
    ? me
      ? `You placed #${myPlace} of ${ordered.length}${fishing && me.stats.catches ? ` · ${me.stats.catches} caught` : ""}`
      : `${ordered.length} fighters`
    : `▲ ${match.score[0]} — ${match.score[1]} ◆${
        me && match.winner ? ((me.team === 0) === (match.winner === "blue") ? " · Victory" : " · Defeat") : ""
      }`;
  const columns = fishing
    ? ["Player", "Place", "Caught", "K / D", "Damage", "Free for"]
    : showdown
      ? ["Player", "Place", "K / D", "Damage", "Healing", "Survived"]
      : ["Player", "G / A", "K / D", "Damage", "Healing", "MVP"];
  const rows = ordered.map((p, i) => ({
    key: p.id,
    cells: [
      <span className="cell-player">
        <Display kind="portrait" src={fighterArt(p.fighter)} alt="" />
        {p.name}
      </span>,
      ...(fishing
        ? [
            `#${i + 1}`,
            `${p.stats.catches}${p.id === mvp ? " ★" : ""}`,
            `${p.stats.kills} / ${p.stats.deaths}`,
            Math.round(p.stats.damage).toLocaleString(),
            // Starting Fishers were never free.
            p.stats.survived ? clock(p.stats.survived) : "—",
          ]
        : [
            showdown ? `#${i + 1}` : `${p.stats.goals} / ${p.stats.assists}`,
            `${p.stats.kills} / ${p.stats.deaths}`,
            Math.round(p.stats.damage).toLocaleString(),
            Math.round(p.stats.healing).toLocaleString(),
            showdown ? clock(p.stats.survived) : p.id === mvp ? "★ MVP" : "",
          ]),
    ],
  }));
  return (
    <main className="screen results">
      <header className="bar">
        <Display kind="badge" icon="star" text="THAT'S A ROUND" />
        <Control kind="icon" icon="gear" label="Settings" hideLabel onPress={onSettings} />
      </header>
      <Display
        kind="callout"
        className="results-banner"
        variant="primary"
        size="hero"
        icon={fishing ? "hook" : showdown ? "crown" : "ball"}
        text={headline}
        sub={sub}
        pulseKey={headline}
      />
      <section className="dock">
        <div className="dock-side">
          <Control kind="button" variant="dark" icon="chart" label="Stats" onPress={() => setStats(true)} />
          <Control kind="button" variant="dark" icon="leave" label="Leave" onPress={onLeave} />
        </div>
        <div className="dock-main">
          {host ? (
            <Control
              kind="button"
              variant="primary"
              size="hero"
              profile="heavy"
              icon="refresh"
              label="Run it back"
              sub="Back to the lobby"
              onPress={onRematch}
            />
          ) : (
            <Display kind="callout" icon="timer" text="Waiting for the host" sub="Rematch returns everyone to the lobby" />
          )}
        </div>
      </section>
      {stats && (
        <Display kind="sheet" title="Match stats" icon="chart" onClose={() => setStats(false)}>
          <Display kind="table" caption="Match statistics" columns={columns} rows={rows} />
        </Display>
      )}
    </main>
  );
}
