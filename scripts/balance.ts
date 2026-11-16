/**
 * Bot-vs-bot balance report. Run with: npm run balance
 *
 * Every fighter is driven by the same simple policy on the real, headless
 * `Engine`, with seeded randomness so a run repeats exactly. Two measures:
 *
 * - Duels: every pair in Showdown, both spawn orders, last one standing.
 * - Skirmishes: 3v3 in the Broomball arena with the ball parked, random
 *   teammates and rivals, most knockouts in 90 seconds. This is where
 *   healing and shields for teammates count.
 *
 * What this is not: the bots see through bushes, never use items, do not
 * dodge individual shots and all share one playstyle, so a fighter whose
 * strength needs a human trick (a wall bounce, a rollback at the right
 * moment) is undersold. Treat the numbers as a rough ranking under one
 * policy, never as proof that a fighter is balanced for people.
 *
 * Options:
 *   --duels N      matches per pair and spawn order (default 30)
 *   --teams N      skirmishes per fighter (default 150)
  *   --only ID      print one fighter's matchups in full
 *   --subject ID   run only that fighter's duels and skirmishes (quick)
 *   --set a.b=v    override a number first, e.g. --set brandon_n.damage=360
 *                  (repeatable; nested paths such as
 *                  brandon_n.abilities.super.heal=1000 work)
 */
import {
  AREAS,
  FIGHTERS,
  IDS,
  MAPS,
  RULES,
  distance,
  type FighterId,
  type Mode,
  type Vec,
} from "../shared/definitions";
import { Engine } from "../shared/engine";
import type { Input, Member, Player } from "../shared/types";

/** Small seeded generator (mulberry32). */
export function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Bot {
  strafe: 1 | -1;
  strafeUntil: number;
}
const AIM_NOISE = 0.06;
const unitOf = (v: Vec): Vec => {
  const l = Math.hypot(v.x, v.y);
  return l > 1e-6 ? { x: v.x / l, y: v.y / l } : { x: 1, y: 0 };
};

/** The distance this fighter wants to fight at. */
function preferred(id: FighterId) {
  const f = FIGHTERS[id],
    attack = f.abilities.attack;
  if (attack.kind === "cone") return f.range * 0.8;
  const widest = Math.max(0, ...(attack.spread ?? [0]).map(Math.abs));
  if (widest > 0.1) {
    // A fan: close enough that every projectile lands.
    const full = (RULES.radius + (attack.width ?? 0.13)) / Math.tan(widest);
    return Math.max(1.6, Math.min(f.range * 0.8, full * 0.9));
  }
  return f.range * 0.8;
}

/** Whether to spend a charged Super now, against the nearest rival at `d`. */
function wantsSuper(e: Engine, me: Player, d: number) {
  const f = FIGHTERS[me.fighter],
    spec = f.abilities.super,
    hurt = me.hp < f.hp * 0.6;
  const allyHurt = (radius: number) =>
    e.state.players.some(
      (p) =>
        p.alive &&
        e.allies(me, p) &&
        distance(p.pos, me.pos) <= radius &&
        p.hp < FIGHTERS[p.fighter].hp * 0.6,
    );
  switch (spec.kind) {
    case "burst": {
      const hits = spec.damage || spec.stun || spec.drain || spec.pull;
      if (spec.at > 0) return Math.abs(d - spec.at) <= spec.radius * 0.7;
      if (hits) return d <= spec.radius * 0.9;
      return allyHurt(spec.radius) || (!!spec.shield && d <= 6 && hurt);
    }
    case "zone": {
      const area = AREAS[spec.area];
      if (area.chase || area.wall) return d <= 8;
      if (area.slow) return d <= spec.distance + area.radius * 0.6 || hurt;
      return hurt || allyHurt(spec.distance + area.radius);
    }
    case "frame":
      return d <= spec.range * 0.9;
    case "charge":
      return d <= spec.distance * 0.8;
    case "leap":
      return Math.abs(d - spec.distance) <= spec.landing.radius * 0.8;
    case "shot":
      return d <= spec.range * 0.9;
    case "rewind":
      return me.hp < f.hp * 0.5;
  }
}

function think(
  e: Engine,
  me: Player,
  bot: Bot,
  speeds: Map<string, Vec>,
  rng: () => number,
): Input {
  const s = e.state,
    f = FIGHTERS[me.fighter];
  let target: Player | null = null,
    d = Infinity;
  for (const p of s.players) {
    if (!p.alive || e.allies(me, p)) continue;
    const dp = distance(p.pos, me.pos);
    if (dp < d) {
      d = dp;
      target = p;
    }
  }
  const center =
    s.mode === "showdown" ? { x: 18, y: 12 } : { x: 17, y: 10 };
  if (!target)
    return {
      move: unitOf({ x: center.x - me.pos.x, y: center.y - me.pos.y }),
      aim: me.aim,
    };
  const to = unitOf({ x: target.pos.x - me.pos.x, y: target.pos.y - me.pos.y });
  if (s.time >= bot.strafeUntil) {
    bot.strafe = rng() < 0.5 ? 1 : -1;
    bot.strafeUntil = s.time + 0.5 + rng() * 0.9;
  }
  // Hold the preferred distance, stepping back while out of ammo.
  const want = preferred(me.fighter) * (me.ammo === 0 ? 1.3 : 1);
  const radial = d > want + 0.3 ? 1 : d < want - 0.3 ? -1 : 0;
  let mx = to.x * radial - to.y * bot.strafe * 0.8,
    my = to.y * radial + to.x * bot.strafe * 0.8;
  // Stay inside the closing zone.
  if (s.mode === "showdown") {
    const out = distance(me.pos, center) - (s.zone - 2.5);
    if (out > 0) {
      const home = unitOf({ x: center.x - me.pos.x, y: center.y - me.pos.y });
      mx += home.x * (1 + out);
      my += home.y * (1 + out);
    }
  }
  // Lead the shot by the target's current velocity, with a little error.
  const v = speeds.get(target.id) ?? { x: 0, y: 0 };
  const flight = f.projectileSpeed > 0 ? d / f.projectileSpeed : 0;
  const lead = unitOf({
    x: target.pos.x + v.x * flight - me.pos.x,
    y: target.pos.y + v.y * flight - me.pos.y,
  });
  const error = (rng() + rng() + rng() - 1.5) * AIM_NOISE * 1.6;
  const angle = Math.atan2(lead.y, lead.x) + error;
  const clear = e.lineClear(me.pos, target.pos);
  return {
    move: unitOf({ x: mx, y: my }),
    aim: { x: Math.cos(angle), y: Math.sin(angle) },
    attack: clear && d <= f.range * 0.98,
    super: me.charge >= RULES.superCharge && wantsSuper(e, me, d),
  };
}

/** Run one match of bots and return the engine when it is over. */
function play(
  mode: Mode,
  fighters: { fighter: FighterId; team: 0 | 1 }[],
  seed: number,
  seconds: number,
) {
  const members: Member[] = fighters.map((m, i) => ({
    id: "p" + i,
    name: "Bot " + i,
    fighter: m.fighter,
    team: m.team,
    ready: true,
    connected: true,
  }));
  const rng = seeded(seed);
  const e = new Engine(mode, members, seeded(seed ^ 0x9e3779b9));
  const bots = new Map<string, Bot>(
    members.map((m) => [m.id, { strafe: 1, strafeUntil: 0 }]),
  );
  const last = new Map<string, Vec>();
  const speeds = new Map<string, Vec>();
  const ticks = Math.round(seconds * RULES.tick);
  for (let i = 0; i < ticks && e.state.phase !== "finished"; i++) {
    for (const p of e.state.players) {
      const was = last.get(p.id);
      if (was)
        speeds.set(p.id, {
          x: (p.pos.x - was.x) * RULES.tick,
          y: (p.pos.y - was.y) * RULES.tick,
        });
      last.set(p.id, { ...p.pos });
    }
    for (const p of e.state.players)
      if (p.alive) e.setInput(p.id, think(e, p, bots.get(p.id)!, speeds, rng));
    e.step();
    // Skirmishes are fights, not Broomball: the ball stays out of play.
    if (mode === "broomball") e.state.ball.state = "resetting";
  }
  return e;
}

/** 1 if `a` beat `b`, 0 if it lost, 0.5 for no result. */
export function duel(a: FighterId, b: FighterId, seed: number) {
  const e = play(
    "showdown",
    [
      { fighter: a, team: 0 },
      { fighter: b, team: 1 },
    ],
    seed,
    230,
  );
  return e.state.winner === "p0" ? 1 : e.state.winner === "p1" ? 0 : 0.5;
}

/** A 3v3 with `subject` on the first team; its score, by knockouts. */
export function skirmish(subject: FighterId, seed: number) {
  const rng = seeded(seed * 7919 + 13);
  const others = IDS.filter((id) => id !== subject);
  const pick = () => others[Math.floor(rng() * others.length)];
  const e = play(
    "broomball",
    [
      { fighter: subject, team: 0 },
      { fighter: pick(), team: 0 },
      { fighter: pick(), team: 0 },
      { fighter: pick(), team: 1 },
      { fighter: pick(), team: 1 },
      { fighter: pick(), team: 1 },
    ],
    seed,
    93,
  );
  let mine = 0,
    theirs = 0;
  for (const p of e.state.players)
    if (p.team === 0) mine += p.stats.kills;
    else theirs += p.stats.kills;
  return mine > theirs ? 1 : mine < theirs ? 0 : 0.5;
}

export interface Report {
  /** rate[a][b]: how often a beats b in a duel. */
  rate: Record<string, Record<string, number>>;
  duels: Record<string, number>;
  teams: Record<string, number>;
}

export function report(perPair: number, perTeam: number): Report {
  const rate: Report["rate"] = {};
  for (const a of IDS) rate[a] = {};
  IDS.forEach((a, i) => {
    for (let j = i + 1; j < IDS.length; j++) {
      const b = IDS[j];
      let wins = 0;
      for (let n = 0; n < perPair; n++) {
        const seed = (i * 131 + j) * 1000 + n;
        // Both spawn corners, so the map favors neither side.
        wins += duel(a, b, seed) + (1 - duel(b, a, seed + 500));
      }
      rate[a][b] = wins / (perPair * 2);
      rate[b][a] = 1 - rate[a][b];
    }
  });
  const duels: Report["duels"] = {},
    teams: Report["teams"] = {};
  IDS.forEach((a, i) => {
    const rivals = IDS.filter((b) => b !== a);
    duels[a] = rivals.reduce((sum, b) => sum + rate[a][b], 0) / rivals.length;
    let score = 0;
    for (let n = 0; n < perTeam; n++) score += skirmish(a, i * 100000 + n);
    teams[a] = perTeam ? score / perTeam : NaN;
  });
  return { rate, duels, teams };
}

/** One fighter against the roster, without the full round robin. */
export function subjectReport(id: FighterId, perPair: number, perTeam: number) {
  const i = IDS.indexOf(id);
  const rate: Record<string, number> = {};
  IDS.forEach((b, j) => {
    if (b === id) return;
    let wins = 0;
    for (let n = 0; n < perPair; n++) {
      const seed = (i * 131 + j) * 1000 + n;
      wins += duel(id, b, seed) + (1 - duel(b, id, seed + 500));
    }
    rate[b] = wins / (perPair * 2);
  });
  let score = 0;
  for (let n = 0; n < perTeam; n++) score += skirmish(id, i * 100000 + n);
  const all = Object.values(rate);
  return {
    rate,
    duels: all.reduce((a, b) => a + b, 0) / all.length,
    teams: perTeam ? score / perTeam : NaN,
  };
}

function main(argv: string[]) {
  const arg = (name: string, fallback: number) => {
    const i = argv.indexOf("--" + name);
    return i >= 0 ? Number(argv[i + 1]) : fallback;
  };
  argv.forEach((a, i) => {
    if (a !== "--set") return;
    const [path, value] = argv[i + 1].split("=");
    const keys = path.split(".");
    let at: Record<string, unknown> = FIGHTERS as never;
    for (const k of keys.slice(0, -1)) at = at[k] as Record<string, unknown>;
    at[keys.at(-1)!] = JSON.parse(value);
    console.log(`override ${path} = ${value}`);
  });
  const perPair = arg("duels", 30),
    perTeam = arg("teams", 150);
  const only = argv.includes("--only")
    ? (argv[argv.indexOf("--only") + 1] as FighterId)
    : null;
  const started = Date.now();
  const pct = (v: number) => (v * 100).toFixed(0).padStart(4) + "%";
  if (argv.includes("--subject")) {
    const id = argv[argv.indexOf("--subject") + 1] as FighterId;
    const one = subjectReport(id, perPair, perTeam);
    console.log(
      `${id}: duels${pct(one.duels)}, teams${pct(one.teams)} ` +
        `(${perPair * 2} duels per rival, ${perTeam} skirmishes)`,
    );
    console.log(
      IDS.filter((b) => b !== id)
        .map((b) => `${b}${pct(one.rate[b])}`)
        .join("  "),
    );
    return;
  }
  const r = report(perPair, perTeam);
  console.log(
    `\n${perPair * 2} duels per pair, ${perTeam} skirmishes per fighter, ` +
      `${((Date.now() - started) / 1000).toFixed(0)} s\n`,
  );
  console.log("fighter".padEnd(12), "role".padEnd(18), " duels", " teams");
  for (const id of [...IDS].sort((a, b) => r.duels[b] - r.duels[a]))
    console.log(
      id.padEnd(12),
      FIGHTERS[id].role.padEnd(18),
      pct(r.duels[id]),
      " " + pct(r.teams[id]),
    );
  if (only) {
    console.log(`\n${only} against each fighter (duels):`);
    for (const b of IDS)
      if (b !== only) console.log("  " + b.padEnd(12), pct(r.rate[only][b]));
  }
  void MAPS;
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/balance.ts"))
  main(process.argv.slice(2));
