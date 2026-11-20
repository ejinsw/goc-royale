import {
  AREAS,
  FIGHTERS,
  FISH,
  FISHERS,
  FISHING,
  ITEMS,
  MAPS,
  MODES,
  RULES,
  moveSpeed,
  add,
  sub,
  mul,
  unit,
  length,
  distance,
  clamp,
  finiteVec,
  segmentDistance,
  shotPoint,
  type AreaKind,
  type BeamSpec,
  type BurstSpec,
  type ConeSpec,
  type LobSpec,
  type ShotSpec,
  type SuperSpec,
  type Vec,
  type Mode,
  type ItemKind,
} from "./definitions";
import type {
  Area,
  Member,
  Player,
  Input,
  Match,
  Projectile,
  Effect,
  GameEvent,
  GameEventType,
  Item,
} from "./types";
type SuperOf<K extends SuperSpec["kind"]> = Extract<SuperSpec, { kind: K }>;
const emptyStats = () => ({
  kills: 0,
  deaths: 0,
  damage: 0,
  received: 0,
  healing: 0,
  goals: 0,
  assists: 0,
  survived: 0,
  catches: 0,
});
interface History {
  t: number;
  pos: Vec;
  hp: number;
}
/**
 * Work scheduled for a later tick: the rest of a windup Super (frame,
 * charge, thrown burst), a later volley of a burst attack, or a beam
 * attack firing at the end of its windup.
 */
type Pending =
  | {
      kind: "super";
      at: number;
      id: string;
      pos: Vec;
      dir: Vec;
      spec: SuperSpec;
    }
  | { kind: "volley"; at: number; id: string; dir: Vec }
  | { kind: "beam"; at: number; id: string; dir: Vec };
interface Dash {
  id: string;
  remaining: number;
  dir: Vec;
  hit: Set<string>;
  spec: SuperOf<"charge">;
}
interface Leap {
  id: string;
  from: Vec;
  to: Vec;
  start: number;
  end: number;
  spec: SuperOf<"leap">;
}
/** Projectile hit tolerance beyond the target's body when a spec omits it. */
const SHOT_WIDTH = 0.13;
/** Broomball's golden-goal overtime (s). */
const OVERTIME = 30;
/** Factory for authority-owned items; presentation consumes the same state. */
export function createItem(id: number, kind: ItemKind, pos: Vec): Item {
  return {
    id,
    kind,
    pos: { ...pos },
    state: "ground",
    carrier: null,
    owner: null,
    dir: { x: 1, y: 0 },
    remaining: 0,
    cooldownUntil: 0,
  };
}
/** Fishers of Men's starting Fishers: a seeded shuffle, at least one. */
function pickFishers(members: Member[], random: () => number) {
  const order = members.map((m) => m.id);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(clamp(random(), 0, 0.999999) * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const count = clamp(
    Math.round(members.length * FISHING.starters),
    1,
    members.length,
  );
  return new Set(order.slice(0, count));
}
/**
 * A player's timestamped movement timeline on the authority. Segment i is
 * active from segs[i].t until segs[i + 1].t; the last segment is open.
 * `c` is how far along the client's clock movement has been applied.
 */
interface MoveTrack {
  segs: { t: number; move: Vec }[];
  c: number | null;
  /** Unused real time (s) available for bounded catch-up after a stall. */
  bank: number;
}
/** Tuning for timeline movement consumption. */
export const TIMELINE = {
  /** How far (s) the authority may extrapolate past the newest input. */
  extrapolate: 0.06,
  /** Maximum banked catch-up time (s); bounds bursts and speed abuse. */
  bankMax: 0.25,
};
/** Transport independent authority. Call step exactly once per fixed simulation tick. */
export class Engine {
  state: Match;
  inputs = new Map<string, Input>();
  histories = new Map<string, History[]>();
  /** Highest input sequence processed per player, echoed back as ackSeq. */
  lastSeq = new Map<string, number>();
  /** Sequence of a latched item use, retained while newer movement arrives. */
  private itemUseSeq = new Map<string, number>();
  /** Timestamped movement timelines, per player (see MoveTrack). */
  tracks = new Map<string, MoveTrack>();
  pending: Pending[] = [];
  dashes: Dash[] = [];
  leaps: Leap[] = [];
  private serial = 0;
  /** Fishers of Men: the Fish already announced as the last one free. */
  private lastFish = "";
  constructor(
    mode: Mode,
    members: Member[],
    random: () => number = Math.random,
  ) {
    const map = MAPS[mode];
    // Fishers of Men ignores lobby teams: a random share starts as Fishers.
    const starters = mode === "fishing" ? pickFishers(members, random) : null;
    let blue = 0,
      red = 3,
      fish = 0,
      started = 0;
    const players = members.map((m, i): Player => {
      const f = FIGHTERS[m.fighter];
      const team = starters ? (starters.has(m.id) ? FISHERS : FISH) : m.team;
      const starts = map.respawns?.[FISHERS] ?? map.spawns;
      const spawnIndex = starters
        ? team === FISH
          ? fish++
          : -1
        : mode === "showdown"
          ? i
          : m.team === 0
            ? blue++
            : red++;
      // Fall back to a valid spawn if a roster ever exceeds the authored
      // spawn points (e.g. uneven broomball teams with no minimum).
      const spawn =
        spawnIndex < 0
          ? starts[started++ % starts.length]
          : (map.spawns[spawnIndex] ??
            map.spawns[spawnIndex % map.spawns.length]);
      return {
        ...m,
        team,
        heldItem: null,
        pos: { ...spawn },
        aim: { x: team === 0 ? 1 : -1, y: 0 },
        hp: f.hp,
        ammo: f.ammo,
        reload: 0,
        charge: 0,
        alive: true,
        respawn: 0,
        protectedUntil: 0,
        stunUntil: 0,
        revealUntil: 0,
        slow: 0,
        slowBy: 0,
        slowUntil: 0,
        shield: 0,
        shieldUntil: 0,
        busyUntil: 0,
        quietSince: 3,
        lastAttack: -1,
        placement: 0,
        stats: emptyStats(),
      };
    });
    this.state = {
      mode,
      time: 0,
      phase: "countdown",
      cutscene: null,
      phaseUntil: 3,
      players,
      items: [],
      projectiles: [],
      areas: [],
      effects: [],
      events: [],
      walls: structuredClone(map.walls),
      zone: 22,
      score:
        mode === "fishing"
          ? [
              players.filter((p) => p.team === FISH).length,
              players.filter((p) => p.team === FISHERS).length,
            ]
          : [0, 0],
      overtime: false,
      ball: {
        pos: { x: 17, y: 10 },
        velocity: { x: 0, y: 0 },
        carrier: null,
        state: "resetting",
        last: null,
        lockUntil: 0,
        passer: null,
        passAt: 0,
        scorer: null,
      },
      winner: null,
      notice: "Get ready",
      tick: 0,
      aliveCount: players.length,
      sampleTime: 0,
      ackSeq: 0,
      ackTime: 0,
    };
    // Bounded sampling plus a deterministic grid fallback: always terminate,
    // even with an injected constant random source or a crowded map.
    const kinds: ItemKind[] = [
      "golden_broom",
      "goc_flyer",
      "goc_flyer",
      "golden_broom",
      "goc_flyer",
      "goc_flyer",
    ];
    const available = (pos: Vec) =>
      this.valid(pos, 0.65) &&
      [...map.spawns, ...(map.respawns?.flat() ?? [])].every(
        (spawn) => distance(spawn, pos) >= 2,
      ) &&
      (mode !== "broomball" || distance(pos, this.state.ball.pos) >= 2) &&
      this.state.items.every((item) => distance(item.pos, pos) >= 2);
    for (const kind of kinds) {
      let pos: Vec | undefined;
      for (let attempt = 0; attempt < 80; attempt++) {
        const candidate = {
          x: 1 + clamp(random(), 0, 1) * (map.w - 2),
          y: 1 + clamp(random(), 0, 1) * (map.h - 2),
        };
        if (available(candidate)) {
          pos = candidate;
          break;
        }
      }
      if (!pos) {
        for (let y = 1; y < map.h - 1 && !pos; y += 2)
          for (let x = 1; x < map.w - 1 && !pos; x += 2)
            if (available({ x, y })) pos = { x, y };
      }
      if (pos) this.state.items.push(createItem(++this.serial, kind, pos));
    }
  }
  get playerList() {
    return this.state.players;
  }
  allies(a: Player, b: Player) {
    return a.id === b.id || (MODES[this.state.mode].teams && a.team === b.team);
  }
  setInput(id: string, input: Input) {
    if (!input || !finiteVec(input.move) || !finiteVec(input.aim)) return false;
    const m = length(input.move) > 1 ? unit(input.move) : input.move;
    const previous = this.inputs.get(id);
    const freshAction =
      typeof input.seq !== "number" ||
      !Number.isFinite(input.seq) ||
      input.seq > (this.lastSeq.get(id) ?? 0);
    if (
      freshAction &&
      input.itemUse === true &&
      !previous?.itemUse &&
      typeof input.seq === "number" &&
      Number.isFinite(input.seq)
    )
      this.itemUseSeq.set(id, input.seq);
    // Record the highest processed sequence (monotonic) for acknowledgement.
    if (typeof input.seq === "number" && Number.isFinite(input.seq)) {
      const prevSeq = this.lastSeq.get(id) ?? 0;
      if (input.seq > prevSeq) this.lastSeq.set(id, input.seq);
    }
    if (typeof input.t === "number" && Number.isFinite(input.t)) {
      let track = this.tracks.get(id);
      const last = track?.segs.at(-1);
      // A clock that jumps back (page reload, new renderer) starts a new
      // timeline; small reorderings are ignored for movement.
      if (!track || (last && input.t < last.t - 1)) {
        track = { segs: [], c: null, bank: 0 };
        this.tracks.set(id, track);
      }
      const tail = track.segs.at(-1);
      if (!tail || input.t > tail.t) track.segs.push({ t: input.t, move: m });
      if (track.segs.length > 300)
        track.segs.splice(0, track.segs.length - 300);
    }
    this.inputs.set(id, {
      move: m,
      aim: unit(input.aim),
      attack: input.attack === true || previous?.attack === true,
      super: input.super === true || previous?.super === true,
      // The short-cutscene request rides with the Super press it came with,
      // so a later input that arrives before the tick cannot drop it.
      brief:
        input.brief === true ||
        (previous?.super === true && previous.brief === true),
      itemPickup:
        (freshAction && input.itemPickup === true) ||
        previous?.itemPickup === true,
      itemDrop:
        (freshAction && input.itemDrop === true) || previous?.itemDrop === true,
      itemUse:
        (freshAction && input.itemUse === true) || previous?.itemUse === true,
      power:
        previous?.attack && !input.attack
          ? previous.power
          : clamp(Number.isFinite(input.power) ? input.power! : 0.35, 0.35, 1),
    });
    return true;
  }
  /**
   * Advance a player's movement timeline by one tick (standard §4.3: apply
   * each input for the time it was held, in order, instead of only the newest
   * input per tick).
   *
   * - Normally consumes exactly `dt` of client time, so speed is unchanged.
   * - May extrapolate the newest (open) input by at most
   *   TIMELINE.extrapolate; beyond that the stream is stalled and the fighter
   *   holds position rather than guessing.
   * - Time not consumed is banked (capped at TIMELINE.bankMax) and lets the
   *   fighter catch up at no more than 2x once delayed inputs arrive. Total
   *   movement therefore never exceeds speed x real elapsed time + bankMax,
   *   which also bounds timestamp abuse.
   * - Backlog that banked time cannot recover (a stall longer than bankMax)
   *   is skipped, not replayed, so a long stall never leaves permanent lag.
   */
  private consumeTimeline(
    p: Player,
    track: MoveTrack,
    dt: number,
    moves: boolean,
  ) {
    const segs = track.segs;
    if (!segs.length) return;
    const newest = segs[segs.length - 1].t;
    if (track.c === null) track.c = segs[0].t;
    if (newest - track.c > track.bank + TIMELINE.extrapolate)
      track.c = newest - track.bank;
    const budget = dt + Math.min(track.bank, dt);
    const target = Math.max(
      track.c,
      Math.min(track.c + budget, newest + TIMELINE.extrapolate),
    );
    const used = target - track.c;
    track.bank = clamp(track.bank + dt - used, 0, TIMELINE.bankMax);
    if (moves) {
      const speed = moveSpeed(this.state.mode, p) * (1 - p.slow);
      for (let i = 0; i < segs.length; i++) {
        const start = Math.max(segs[i].t, track.c);
        const end = Math.min(
          i + 1 < segs.length ? segs[i + 1].t : Infinity,
          target,
        );
        if (end > start) this.move(p, mul(segs[i].move, speed * (end - start)));
      }
    }
    track.c = target;
    // Drop segments that ended at or before the consumption point.
    let drop = 0;
    while (drop + 1 < segs.length && segs[drop + 1].t <= target) drop++;
    if (drop) segs.splice(0, drop);
  }
  /** Re-anchor a timeline at its newest input (no backlog, no bank). */
  private anchorTimeline(track: MoveTrack) {
    const last = track.segs.at(-1);
    if (!last) return;
    track.segs = [last];
    track.c = last.t;
    track.bank = 0;
  }
  valid(pos: Vec, r = RULES.radius) {
    const m = MAPS[this.state.mode];
    return (
      pos.x >= r &&
      pos.y >= r &&
      pos.x <= m.w - r &&
      pos.y <= m.h - r &&
      !this.state.walls.some(
        (w) =>
          pos.x + r > w.x &&
          pos.x - r < w.x + w.w &&
          pos.y + r > w.y &&
          pos.y - r < w.y + w.h,
      )
    );
  }
  /** Slide a fighter (or a companion, with its own radius) around cover. */
  move(p: { pos: Vec }, delta: Vec, r = RULES.radius) {
    // Substeps prevent charges and knockback from crossing thin cover.
    const n = Math.max(1, Math.ceil(length(delta) / 0.18));
    for (let i = 0; i < n; i++) {
      const dx = delta.x / n,
        dy = delta.y / n;
      if (this.valid({ x: p.pos.x + dx, y: p.pos.y }, r)) p.pos.x += dx;
      if (this.valid({ x: p.pos.x, y: p.pos.y + dy }, r)) p.pos.y += dy;
    }
  }
  /** The last point on the way from `a` to `b` before it enters cover. */
  stopAtCover(a: Vec, b: Vec) {
    const n = Math.max(1, Math.ceil(distance(a, b) / 0.12));
    let last = { ...a };
    for (let i = 1; i <= n; i++) {
      const p = add(a, mul(sub(b, a), i / n));
      if (
        this.state.walls.some(
          (w) => p.x > w.x && p.x < w.x + w.w && p.y > w.y && p.y < w.y + w.h,
        )
      )
        return last;
      last = p;
    }
    return last;
  }
  /** Clamp a point inside the arena with a margin. */
  inArena(p: Vec, margin: number) {
    const m = MAPS[this.state.mode];
    return {
      x: clamp(p.x, margin, m.w - margin),
      y: clamp(p.y, margin, m.h - margin),
    };
  }
  /**
   * Hidden in a bush from someone at `from`: the concealment rule that
   * snapshot() applies per viewer, reused so homing shots, chains and
   * companions cannot find fighters their owner cannot see. Maps without
   * bushes (Broomball Night) never conceal.
   */
  concealed(t: Player, from: Vec) {
    const s = this.state;
    return (
      t.revealUntil <= s.time &&
      distance(t.pos, from) >= 2.5 &&
      MAPS[s.mode].bushes.some(
        (b) =>
          t.pos.x >= b.x &&
          t.pos.x <= b.x + b.w &&
          t.pos.y >= b.y &&
          t.pos.y <= b.y + b.h,
      )
    );
  }
  lineClear(a: Vec, b: Vec) {
    const n = Math.max(1, Math.ceil(distance(a, b) / 0.12));
    for (let i = 1; i <= n; i++) {
      const p = add(a, mul(sub(b, a), i / n));
      if (
        this.state.walls.some(
          (w) => p.x > w.x && p.x < w.x + w.w && p.y > w.y && p.y < w.y + w.h,
        )
      )
        return false;
    }
    return true;
  }
  effect(
    kind: Effect["kind"],
    p: Vec,
    owner = "",
    dir: Vec = { x: 1, y: 0 },
    value?: number,
    duration = 0.5,
  ) {
    this.state.effects.push({
      id: ++this.serial,
      kind,
      pos: { ...p },
      dir: { ...dir },
      owner,
      value,
      end: this.state.time + duration,
    });
  }
  /**
   * Emit a discrete presentation event (standard §6.2). Pure presentation
   * output: it records something the simulation already decided so the client
   * can play a cue exactly once, keyed by the stable id. It must not read back
   * into or alter authoritative state.
   */
  emit(
    type: GameEventType,
    pos: Vec,
    owner = "",
    dir?: Vec,
    value?: number,
    itemKind?: ItemKind,
    inputSeq?: number,
    target?: string,
  ) {
    this.state.events.push({
      id: ++this.serial,
      tick: this.state.tick,
      type,
      owner,
      pos: { ...pos },
      ...(dir ? { dir: { ...dir } } : {}),
      ...(value !== undefined ? { value } : {}),
      ...(itemKind !== undefined ? { itemKind } : {}),
      ...(inputSeq !== undefined ? { inputSeq } : {}),
      ...(target !== undefined ? { target } : {}),
    });
  }
  heal(target: Player, amount: number, source?: Player, charge = true) {
    if (!target.alive) return;
    const actual = Math.min(
      FIGHTERS[target.fighter].hp - target.hp,
      Math.max(0, amount),
    );
    target.hp += actual;
    if (source && actual > 0) {
      source.stats.healing += actual;
      if (charge && source.id !== target.id)
        source.charge = Math.min(
          RULES.superCharge,
          source.charge +
            actual * 0.6 * (FIGHTERS[source.fighter].chargeRate ?? 1),
        );
    }
  }
  damage(target: Player, amount: number, source?: Player, isSuper = false) {
    const s = this.state;
    if (!target.alive || s.time < target.protectedUntil || amount <= 0)
      return false;
    // A shield absorbs first; absorbed damage still counts as dealt.
    const absorbed = Math.min(target.shield, amount);
    target.shield -= absorbed;
    const fromHp = Math.min(target.hp, amount - absorbed);
    target.hp -= fromHp;
    const actual = absorbed + fromHp;
    target.stats.received += actual;
    target.quietSince = s.time;
    if (source && source.id !== target.id) {
      source.stats.damage += actual;
      if (!isSuper)
        source.charge = Math.min(
          5000,
          source.charge +
            actual * (FIGHTERS[source.fighter].chargeRate ?? 1),
        );
    }
    if (actual >= 100)
      this.effect(
        "hit",
        target.pos,
        source?.id,
        target.aim,
        Math.round(actual),
      );
    this.emit(
      "attack_hit",
      target.pos,
      source?.id ?? "",
      target.aim,
      Math.round(actual),
    );
    if (target.hp <= 0) this.eliminate(target, source);
    return true;
  }
  eliminate(p: Player, source?: Player) {
    if (!p.alive) return;
    p.alive = false;
    p.hp = 0;
    p.shield = 0;
    p.busyUntil = 0;
    // Companions leave with their owner.
    this.state.areas = this.state.areas.filter(
      (a) => !(a.owner === p.id && AREAS[a.kind].bound),
    );
    const s = this.state;
    p.stats.deaths++;
    p.respawn = s.time + (MODES[s.mode].respawn ?? RULES.respawn);
    if (s.mode !== "fishing") {
      p.stats.survived = Math.max(0, s.time - 3);
      p.placement = s.players.filter((x) => x.alive).length + 1;
    }
    if (source && source.id !== p.id) source.stats.kills++;
    this.dropBall(p);
    this.dropItem(p);
    this.effect("eliminated", p.pos, p.id);
    this.emit("fighter_eliminated", p.pos, p.id, undefined, source?.id ? 1 : 0);
    s.notice = `${p.name} eliminated`;
    if (s.mode === "fishing" && p.team === FISH) this.catchFish(p, source);
  }
  /**
   * Fishers of Men: a caught Fish joins the Fishers and comes back at their
   * respawn. What it still has in play would change sides with it, so it is
   * withdrawn instead of being turned on its old team.
   */
  private catchFish(p: Player, source?: Player) {
    const s = this.state;
    // Fish still free, counting this one: the last one caught places best.
    p.placement = s.players.filter((x) => x.team === FISH).length;
    p.stats.survived = Math.max(0, s.time - 3);
    p.team = FISHERS;
    s.projectiles = s.projectiles.filter((q) => q.owner !== p.id);
    s.areas = s.areas.filter((a) => a.owner !== p.id);
    s.items = s.items.filter(
      (i) => !(i.state === "flight" && i.owner === p.id),
    );
    this.pending = this.pending.filter((x) => x.id !== p.id);
    const catcher =
      source && source.id !== p.id && source.team === FISHERS
        ? source
        : undefined;
    if (catcher) catcher.stats.catches++;
    this.effect(
      "caught",
      p.pos,
      catcher?.id ?? p.id,
      catcher ? unit(sub(catcher.pos, p.pos)) : { x: 0, y: -1 },
      catcher ? distance(catcher.pos, p.pos) : 0,
      0.8,
    );
    this.emit(
      "fighter_caught",
      p.pos,
      catcher?.id ?? "",
      undefined,
      undefined,
      undefined,
      undefined,
      p.id,
    );
    s.notice = catcher
      ? `${catcher.name} caught ${p.name}!`
      : `${p.name} got caught`;
  }
  /** Where a fighter comes back: the team's point farthest from living rivals. */
  private respawnPoint(p: Player): Vec {
    const s = this.state,
      map = MAPS[s.mode];
    const points = map.respawns?.[p.team]?.length
      ? map.respawns[p.team]
      : map.spawns;
    const rivals = s.players.filter((r) => r.alive && !this.allies(p, r));
    let best = points[0],
      bestD = -1;
    for (const point of points) {
      const d = Math.min(
        Infinity,
        ...rivals.map((r) => distance(r.pos, point)),
      );
      if (d > bestD) {
        bestD = d;
        best = point;
      }
    }
    return { ...best };
  }
  disconnect(id: string) {
    const p = this.state.players.find((x) => x.id === id);
    if (p) {
      p.connected = false;
      this.resetInput(id);
      this.dropBall(p);
      this.dropItem(p);
    }
  }
  /** A new connection starts a new input sequence and movement timeline. */
  resetInput(id: string) {
    this.inputs.delete(id);
    this.itemUseSeq.delete(id);
    this.lastSeq.delete(id);
    this.tracks.delete(id);
  }
  knock(p: Player, dir: Vec, n: number) {
    this.dropBall(p);
    this.move(p, mul(dir, n));
  }
  dropBall(p: Player) {
    const b = this.state.ball;
    if (b.carrier !== p.id) return;
    b.carrier = null;
    b.pos = { ...p.pos };
    b.velocity = mul(p.aim, 2);
    b.state = "free";
    b.last = p.id;
    b.lockUntil = this.state.time + 0.4;
    this.emit("ball_released", p.pos, p.id, p.aim);
  }
  /** Pickups, possessions and uses are decided only by the authority. */
  private pickupItem(p: Player) {
    if (p.heldItem !== null) return;
    const item = this.state.items
      .filter(
        (i) =>
          i.state === "ground" &&
          distance(i.pos, p.pos) <= 1.2 &&
          this.lineClear(p.pos, i.pos),
      )
      .sort(
        (a, b) =>
          distance(a.pos, p.pos) - distance(b.pos, p.pos) || a.id - b.id,
      )[0];
    if (!item) return;
    item.state = "carried";
    item.carrier = p.id;
    item.owner = p.id;
    p.heldItem = item.id;
    this.emit("item_picked_up", p.pos, p.id, p.aim, undefined, item.kind);
  }
  private dropItem(p: Player) {
    const item = this.state.items.find(
      (i) => i.id === p.heldItem && i.carrier === p.id,
    );
    p.heldItem = null;
    if (!item) return;
    item.state = "ground";
    item.carrier = null;
    item.owner = null;
    item.pos = { ...p.pos };
    this.emit("item_dropped", item.pos, p.id, p.aim, undefined, item.kind);
  }
  private useItem(p: Player) {
    const s = this.state;
    const item = s.items.find(
      (i) => i.id === p.heldItem && i.carrier === p.id && i.state === "carried",
    );
    if (!item || s.time < item.cooldownUntil) return;
    const spec = ITEMS[item.kind];
    p.protectedUntil = 0;
    p.quietSince = s.time;
    this.emit(
      "item_used",
      p.pos,
      p.id,
      p.aim,
      spec.range,
      item.kind,
      this.itemUseSeq.get(p.id),
    );
    if (spec.kind === "throw") {
      p.heldItem = null;
      item.carrier = null;
      item.state = "flight";
      item.pos = { ...p.pos };
      item.dir = { ...p.aim };
      item.remaining = spec.range;
      return;
    }
    item.cooldownUntil = s.time + spec.cooldown;
    const inSweep = (pos: Vec, extra = 0) => {
      const offset = sub(pos, p.pos);
      const forward = offset.x * p.aim.x + offset.y * p.aim.y;
      const lateral = offset.x * -p.aim.y + offset.y * p.aim.x;
      // Test a circular target against the nearest point of the oriented
      // rectangle, including its rounded collision corners.
      const dx = forward - clamp(forward, 0, spec.range);
      const dy = lateral - clamp(lateral, -spec.width / 2, spec.width / 2);
      return dx * dx + dy * dy <= extra * extra && this.lineClear(p.pos, pos);
    };
    // Carried-ball presentation normally follows the carrier later in the
    // tick; sample it now so a sweep never tests last tick's position.
    const heldBallCarrier = s.players.find(
      (other) => other.id === s.ball.carrier,
    );
    if (heldBallCarrier)
      s.ball.pos = add(heldBallCarrier.pos, mul(heldBallCarrier.aim, 0.58));
    for (const target of s.players) {
      if (
        !target.alive ||
        this.allies(p, target) ||
        s.time < target.protectedUntil ||
        !inSweep(target.pos, RULES.radius)
      )
        continue;
      const hitPos = { ...target.pos };
      this.knock(target, p.aim, spec.knock);
      this.emit(
        "item_hit",
        hitPos,
        p.id,
        p.aim,
        undefined,
        item.kind,
        undefined,
        target.id,
      );
    }
    // Move mobile enemy entities; stationary zones and barriers have no velocity.
    for (const area of s.areas) {
      if (
        !AREAS[area.kind].chase ||
        !this.enemyArea(p, area) ||
        !inSweep(area.pos)
      )
        continue;
      const pos = add(area.pos, mul(p.aim, spec.knock));
      if (this.valid(pos, 0.3) && this.lineClear(area.pos, pos)) area.pos = pos;
      this.emit("item_hit", area.pos, p.id, p.aim, undefined, item.kind);
    }
    const ball = s.ball;
    if (
      s.mode === "broomball" &&
      ball.state !== "resetting" &&
      inSweep(ball.pos, 0.32)
    ) {
      const carrier = s.players.find((other) => other.id === ball.carrier);
      if (carrier) this.dropBall(carrier);
      ball.carrier = null;
      ball.state = "flight";
      ball.velocity = mul(p.aim, spec.ballSpeed);
      ball.last = p.id;
      ball.lockUntil = s.time + 0.4;
      ball.scorer = p.id;
      ball.passer = null;
      ball.passAt = 0;
      this.emit("item_hit", ball.pos, p.id, p.aim, undefined, item.kind);
    }
  }
  /** Advance the fixed number of items; thrown items are consumed on impact or expiry. */
  private updateItems(dt: number) {
    const s = this.state;
    const remove = new Set<number>();
    for (const item of s.items) {
      if (item.state === "carried") {
        const carrier = s.players.find((p) => p.id === item.carrier);
        if (carrier) item.pos = { ...carrier.pos };
        continue;
      }
      if (item.state !== "flight") continue;
      const spec = ITEMS[item.kind];
      const owner = s.players.find((p) => p.id === item.owner);
      if (spec.kind !== "throw" || !owner) {
        remove.add(item.id);
        continue;
      }
      const travel = Math.min(spec.speed * dt, item.remaining);
      const steps = Math.max(1, Math.ceil(travel / 0.12));
      for (let i = 0; i < steps && !remove.has(item.id); i++) {
        const next = add(item.pos, mul(item.dir, travel / steps));
        item.remaining -= travel / steps;
        if (!this.valid(next, spec.width)) {
          const wall = s.walls.find(
            (w) =>
              next.x + spec.width > w.x &&
              next.x - spec.width < w.x + w.w &&
              next.y + spec.width > w.y &&
              next.y - spec.width < w.y + w.h,
          );
          if (wall?.hp !== undefined) {
            wall.hp -= spec.damage;
            if (wall.hp <= 0) s.walls = s.walls.filter((w) => w.id !== wall.id);
          }
          remove.add(item.id);
          this.emit(
            "item_hit",
            item.pos,
            owner.id,
            item.dir,
            undefined,
            item.kind,
          );
          break;
        }
        item.pos = next;
        let hitTarget: string | undefined;
        const area = s.areas.find((a) => this.blocks(a, owner, item.pos));
        if (area) {
          area.hp -= spec.damage;
          remove.add(item.id);
        } else {
          const target = s.players.find(
            (p) =>
              p.alive &&
              !this.allies(owner, p) &&
              distance(p.pos, item.pos) <= RULES.radius + spec.width,
          );
          if (target) {
            if (this.damage(target, spec.damage, owner)) hitTarget = target.id;
            remove.add(item.id);
          }
        }
        if (remove.has(item.id))
          this.emit(
            "item_hit",
            item.pos,
            owner.id,
            item.dir,
            undefined,
            item.kind,
            undefined,
            hitTarget,
          );
      }
      if (item.remaining <= 1e-6) remove.add(item.id);
    }
    if (remove.size) s.items = s.items.filter((item) => !remove.has(item.id));
    s.areas = s.areas.filter((a) => a.hp > 0 && a.end > s.time);
  }
  private attack(p: Player) {
    const s = this.state,
      spec = FIGHTERS[p.fighter].abilities.attack;
    if (s.ball.carrier === p.id) {
      this.shoot(p, this.inputs.get(p.id)?.power ?? 0.35);
      return;
    }
    if (p.ammo < 1 || s.time - p.lastAttack < RULES.attackInterval) return;
    p.ammo--;
    p.lastAttack = s.time;
    p.quietSince = s.time;
    p.protectedUntil = 0;
    this.effect("attack", p.pos, p.id, p.aim, undefined, 0.2);
    this.emit("attack_started", p.pos, p.id, p.aim);
    if (spec.kind === "cone") {
      this.cone(p, spec);
      return;
    }
    if (spec.kind === "beam") {
      // The tell is the aim line for the windup; the beam fires later.
      this.effect("beam", p.pos, p.id, p.aim, 0, spec.windup);
      this.pending.push({
        kind: "beam",
        at: s.time + spec.windup,
        id: p.id,
        dir: { ...p.aim },
      });
      return;
    }
    if (spec.kind === "lob") {
      this.lob(p, spec);
      return;
    }
    this.volley(p, p.aim);
    // A burst fires its later volleys on later ticks, along the first aim.
    for (let k = 1; k < (spec.burst?.count ?? 1); k++)
      this.pending.push({
        kind: "volley",
        at: s.time + k * spec.burst!.gap,
        id: p.id,
        dir: { ...p.aim },
      });
  }
  /** Which way each fighter's next alternating weave bends first. */
  private weaveSide = new Map<string, 1 | -1>();
  /** One projectile per spread angle from the fighter's position. */
  private volley(p: Player, aim: Vec) {
    const f = FIGHTERS[p.fighter],
      spec = f.abilities.attack;
    if (spec.kind !== "shot") return;
    let first: 1 | -1 = 1;
    if (spec.weave?.alternate) {
      first = this.weaveSide.get(p.id) ?? 1;
      this.weaveSide.set(p.id, first === 1 ? -1 : 1);
    }
    for (const angle of spec.spread ?? [0]) {
      const a = Math.atan2(aim.y, aim.x) + angle;
      const dir = { x: Math.cos(a), y: Math.sin(a) };
      this.state.projectiles.push({
        id: ++this.serial,
        owner: p.id,
        fighter: p.fighter,
        pos: { ...p.pos },
        dir,
        remaining: f.range,
        traveled: 0,
        bounces: spec.bounces ?? 0,
        // Spread shots bend away from the aim on their own side.
        ...(spec.weave
          ? { side: angle < 0 ? (-first as 1 | -1) : first }
          : {}),
      });
      this.emit("projectile_spawned", p.pos, p.id, dir);
    }
  }
  /**
   * Throw an arc to a point along the aim: the attack's power share of the
   * range, 35% to 100%. Everyone sees where it will land while it flies.
   */
  private lob(p: Player, spec: LobSpec) {
    const f = FIGHTERS[p.fighter];
    const power = clamp(this.inputs.get(p.id)?.power ?? 0.35, 0.35, 1);
    const target = this.inArena(add(p.pos, mul(p.aim, f.range * power)), 0.3);
    const d = distance(p.pos, target);
    const dir = d > 1e-6 ? unit(sub(target, p.pos)) : { ...p.aim };
    this.state.projectiles.push({
      id: ++this.serial,
      owner: p.id,
      fighter: p.fighter,
      pos: { ...p.pos },
      dir,
      remaining: d,
      traveled: 0,
      bounces: 0,
      lob: true,
    });
    this.effect(
      "lob",
      target,
      p.id,
      dir,
      spec.radius,
      Math.max(0.1, d / f.projectileSpeed),
    );
    this.emit("projectile_spawned", p.pos, p.id, dir);
  }
  /**
   * A lob lands: rivals in the splash with a clear line from its center are
   * hit, injured teammates (not the thrower) are fed, and enemy stations
   * and crates in reach take the damage too.
   */
  private splash(owner: Player, at: Vec, spec: LobSpec) {
    const s = this.state,
      f = FIGHTERS[owner.fighter];
    this.effect("splash", at, owner.id, { x: 1, y: 0 }, spec.radius, 0.45);
    let dealt = 0;
    for (const t of s.players) {
      if (!t.alive || distance(at, t.pos) > spec.radius + RULES.radius)
        continue;
      if (this.allies(owner, t)) {
        if (
          spec.healAllies &&
          t.id !== owner.id &&
          t.hp < FIGHTERS[t.fighter].hp
        ) {
          const before = t.hp;
          this.heal(t, spec.healAllies, owner);
          const got = Math.round(t.hp - before);
          if (got > 0) {
            this.effect("heal", t.pos, owner.id, t.aim, got);
            this.emit("heal_applied", t.pos, owner.id, t.aim, got);
          }
        }
        continue;
      }
      if (!this.lineClear(at, t.pos)) continue;
      const before = t.hp + t.shield;
      if (this.damage(t, f.damage, owner)) dealt += before - Math.max(0, t.hp) - t.shield;
    }
    if (spec.lifesteal && dealt > 0) {
      const hp = owner.hp;
      this.heal(owner, Math.round(dealt * spec.lifesteal), owner, false);
      const got = Math.round(owner.hp - hp);
      if (got > 0) {
        this.effect("heal", owner.pos, owner.id, owner.aim, got);
        this.emit("heal_applied", owner.pos, owner.id, owner.aim, got);
      }
    }
    for (const a of s.areas)
      if (this.enemyArea(owner, a) && distance(a.pos, at) <= spec.radius + 0.5)
        a.hp -= f.damage;
    for (const w of s.walls) {
      if (w.hp === undefined) continue;
      const near = {
        x: clamp(at.x, w.x, w.x + w.w),
        y: clamp(at.y, w.y, w.y + w.h),
      };
      if (distance(near, at) <= spec.radius) w.hp -= f.damage;
    }
    s.walls = s.walls.filter((w) => w.hp === undefined || w.hp > 0);
    s.areas = s.areas.filter((a) => a.hp > 0 && a.end > s.time);
  }
  /**
   * A beam fires: an instant line along `dir` from where the fighter
   * stands. It stops at cover (chipping a crate), at an enemy station,
   * barrier or companion, or at the first rival whose body it touches.
   */
  private beam(p: Player, dir: Vec) {
    const s = this.state,
      f = FIGHTERS[p.fighter],
      spec = f.abilities.attack as BeamSpec,
      m = MAPS[s.mode],
      from = { ...p.pos };
    const n = Math.max(1, Math.ceil(f.range / 0.12));
    let reach = 0;
    let target: Player | null = null;
    trace: for (let i = 1; i <= n; i++) {
      const d = (f.range * i) / n;
      const at = add(from, mul(dir, d));
      if (at.x < 0 || at.y < 0 || at.x > m.w || at.y > m.h) break;
      const wall = s.walls.find(
        (w) => at.x >= w.x && at.x <= w.x + w.w && at.y >= w.y && at.y <= w.y + w.h,
      );
      if (wall) {
        if (wall.hp !== undefined) {
          wall.hp -= f.damage;
          if (wall.hp <= 0) s.walls = s.walls.filter((w) => w.id !== wall.id);
        }
        break;
      }
      reach = d;
      for (const a of s.areas)
        if (this.blocks(a, p, at)) {
          a.hp -= f.damage;
          break trace;
        }
      for (const t of s.players)
        if (
          t.alive &&
          !this.allies(p, t) &&
          distance(at, t.pos) <= RULES.radius + spec.width
        ) {
          target = t;
          break trace;
        }
    }
    this.effect("beam", from, p.id, dir, Math.max(0.05, reach), 0.3);
    s.areas = s.areas.filter((a) => a.hp > 0 && a.end > s.time);
    if (!target) return;
    const bonus =
      spec.farBonus && reach >= f.range * spec.farBonus.from
        ? spec.farBonus.damage
        : 0;
    this.damage(target, f.damage + bonus, p);
  }
  /** An instant cone: each rival and enemy station inside it is hit once. */
  private cone(p: Player, spec: ConeSpec) {
    const s = this.state,
      f = FIGHTERS[p.fighter];
    this.effect("cone", p.pos, p.id, p.aim);
    const inside = (at: Vec, reach: number) => {
      const d = sub(at, p.pos);
      return (
        length(d) <= reach &&
        Math.acos(clamp(unit(d).x * p.aim.x + unit(d).y * p.aim.y, -1, 1)) <=
          spec.halfAngle &&
        this.lineClear(p.pos, at)
      );
    };
    for (const t of s.players)
      if (
        t.alive &&
        !this.allies(p, t) &&
        inside(t.pos, f.range + RULES.radius)
      )
        this.damage(t, f.damage, p);
    for (const a of s.areas)
      if (this.enemyArea(p, a) && inside(a.pos, f.range)) a.hp -= f.damage;
  }
  /** A destructible area (station, companion, barrier) owned by p's rivals. */
  private enemyArea(p: Player, a: Area) {
    if (AREAS[a.kind].hp === undefined) return false;
    const owner = this.state.players.find((x) => x.id === a.owner);
    return !!owner && !this.allies(p, owner);
  }
  private lastCutscene = new Map<string, number>();
  private afterCutscene: (() => boolean) | null = null;
  activateSuper(p: Player) {
    const s = this.state;
    if (
      !p.alive ||
      p.charge < 5000 ||
      s.time < p.stunUntil ||
      s.time < p.busyUntil ||
      s.ball.carrier === p.id
    )
      return false;
    // Validation first: a Super that cannot resolve keeps its charge.
    const resolve = this.planSuper(p, FIGHTERS[p.fighter].abilities.super);
    if (!resolve) return false;
    p.charge = 0;
    p.protectedUntil = 0;
    this.emit("super_started", p.pos, p.id, p.aim);
    const spec = FIGHTERS[p.fighter].abilities.super;
    const scene = spec.kind === "burst" ? spec.cutscene : undefined;
    if (scene && s.phase === "playing") {
      // A repeat inside the window, or a caster who asked, gets the short one.
      const repeat =
        s.time - (this.lastCutscene.get(p.id) ?? -Infinity) < scene.window;
      const total =
        repeat || this.inputs.get(p.id)?.brief ? scene.again : scene.seconds;
      this.lastCutscene.set(p.id, s.time);
      s.phase = "cutscene";
      s.cutscene = { owner: p.id, left: total, total };
      this.afterCutscene = resolve;
      return true;
    }
    // Instant Supers resolve now; windups, throws, leaps and Super shots
    // emit super_resolved later, when they land.
    if (resolve()) this.emit("super_resolved", p.pos, p.id, p.aim);
    return true;
  }
  /**
   * Check a Super can happen and return the step that performs it (true when
   * it resolved immediately), or null to reject it without spending charge.
   */
  private planSuper(p: Player, spec: SuperSpec): (() => boolean) | null {
    const s = this.state;
    const later = (pos: Vec) =>
      this.pending.push({
        kind: "super",
        at:
          s.time +
          ("windup" in spec
            ? spec.windup
            : "delay" in spec
              ? (spec.delay ?? 0)
              : 0),
        id: p.id,
        pos,
        dir: { ...p.aim },
        spec,
      });
    switch (spec.kind) {
      case "zone": {
        const pos = this.inArena(add(p.pos, mul(p.aim, spec.distance)), 0.5);
        // A placement behind a wall is rejected without consuming charge.
        if (!this.valid(pos, 0.3) || !this.lineClear(p.pos, pos)) return null;
        return () => {
          this.placeArea(p, spec.area, pos);
          return true;
        };
      }
      case "frame":
        return () => {
          if (spec.windup <= 0) {
            this.effect(spec.effect, p.pos, p.id, p.aim, undefined, 0.6);
            this.rectangle(
              p,
              p.pos,
              p.aim,
              spec.range,
              spec.width,
              spec.damage,
              spec.stun,
              spec.knock,
              spec.sideKnock,
              spec.slow,
            );
            return true;
          }
          later({ ...p.pos });
          this.effect(
            spec.effect,
            p.pos,
            p.id,
            p.aim,
            undefined,
            Math.max(0.35, spec.windup),
          );
          return false;
        };
      case "charge":
        return () => {
          later({ ...p.pos });
          this.effect(
            "van",
            p.pos,
            p.id,
            p.aim,
            undefined,
            Math.max(0.35, spec.windup),
          );
          return false;
        };
      case "rewind": {
        const past = (this.histories.get(p.id) || [])
          .filter((h) => h.t <= s.time - spec.seconds && this.valid(h.pos))
          .at(-1);
        if (!past) return null;
        return () => {
          const old = { ...p.pos };
          p.pos = { ...past.pos };
          this.heal(
            p,
            Math.min(spec.heal, Math.max(0, past.hp - p.hp)),
            p,
            false,
          );
          this.effect("glitch", old, p.id, p.aim, undefined, 0.65);
          this.burst(p, old, spec.blast);
          return true;
        };
      }
      case "burst": {
        if (spec.at <= 0)
          return () => {
            this.burstCue(p, p.pos, spec, spec.effect);
            this.burst(p, p.pos, spec);
            return true;
          };
        let pos = this.inArena(add(p.pos, mul(p.aim, spec.at)), 0.3);
        // A throw stops at cover; a lob flies over it.
        if (!spec.overWalls) pos = this.stopAtCover(p.pos, pos);
        return () => {
          if (!spec.delay) {
            this.burstCue(p, pos, spec, spec.effect);
            this.burst(p, pos, spec);
            return true;
          }
          later(pos);
          this.effect("marker", pos, p.id, p.aim, spec.radius, spec.delay);
          return false;
        };
      }
      case "leap": {
        // Land as far along the aim as possible on open ground.
        let to: Vec | null = null;
        for (let d = spec.distance; d >= 0 && !to; d -= 0.25) {
          const c = this.inArena(add(p.pos, mul(p.aim, d)), RULES.radius);
          if (this.valid(c)) to = c;
        }
        if (!to) return null;
        const landing = to;
        return () => {
          this.leaps.push({
            id: p.id,
            from: { ...p.pos },
            to: landing,
            start: s.time,
            end: s.time + spec.air,
            spec,
          });
          p.busyUntil = s.time + spec.air;
          this.effect(
            "leap",
            landing,
            p.id,
            p.aim,
            spec.landing.radius,
            spec.air,
          );
          return false;
        };
      }
      case "shot":
        return () => {
          s.projectiles.push({
            id: ++this.serial,
            owner: p.id,
            fighter: p.fighter,
            pos: { ...p.pos },
            dir: { ...p.aim },
            remaining: spec.range,
            traveled: 0,
            bounces: 0,
            super: true,
          });
          this.emit("projectile_spawned", p.pos, p.id, p.aim);
          return false;
        };
    }
  }
  /** Put an area object down. A bound companion replaces the owner's last one. */
  private placeArea(p: Player, kind: AreaKind, pos: Vec) {
    const s = this.state,
      spec = AREAS[kind];
    if (spec.bound)
      s.areas = s.areas.filter((a) => !(a.owner === p.id && a.kind === kind));
    const area: Area = {
      id: ++this.serial,
      owner: p.id,
      kind,
      pos,
      radius: spec.radius,
      end: s.time + spec.duration,
      hp: spec.hp ?? Infinity,
    };
    if (spec.wall || spec.chase) area.dir = { ...p.aim };
    if (spec.chase) area.next = s.time + 0.3;
    s.areas.push(area);
  }
  /** The visible ring for a burst; `aura` keeps Ethan's original cue. */
  private burstCue(p: Player, at: Vec, b: BurstSpec, kind?: "aura") {
    if (kind === "aura") this.effect("aura", at, p.id, p.aim, undefined, 0.6);
    else if (Number.isFinite(b.radius))
      this.effect("burst", at, p.id, p.aim, b.radius, 0.5);
  }
  /**
   * Resolve a burst centered on `at` for its owner `p`. Teammates inside
   * the radius get the support effects; rivals need line of sight from the
   * center and are only controlled when the hit lands (not protected).
   */
  burst(p: Player, at: Vec, b: BurstSpec) {
    const s = this.state;
    for (const t of s.players) {
      if (!t.alive || distance(at, t.pos) > b.radius) continue;
      if (this.allies(p, t)) {
        if (b.heal) {
          const before = t.hp;
          this.heal(t, b.heal, p, false);
          const got = Math.round(t.hp - before);
          if (got > 0) {
            this.effect("heal", t.pos, p.id, t.aim, got);
            this.emit("heal_applied", t.pos, p.id, t.aim, got);
          }
        }
        if (b.shield) {
          t.shield = Math.max(t.shield, b.shield.amount);
          t.shieldUntil = Math.max(t.shieldUntil, s.time + b.shield.duration);
        }
        if (b.protect)
          t.protectedUntil = Math.max(t.protectedUntil, s.time + b.protect);
        continue;
      }
      if (!this.lineClear(at, t.pos)) continue;
      const landed =
        b.damage === undefined
          ? s.time >= t.protectedUntil
          : this.damage(
              t,
              b.damage,
              p,
              true,
            );
      if (!landed || !t.alive) continue;
      if (b.stun) {
        t.stunUntil = Math.max(t.stunUntil, s.time + b.stun);
        this.dropBall(t);
      }
      if (b.pull) {
        const d = distance(t.pos, at);
        if (d > 0.5) this.knock(t, unit(sub(at, t.pos)), d - 0.5);
      } else if (b.knock) this.knock(t, unit(sub(t.pos, at)), b.knock);
      if (b.drain) {
        t.ammo = 0;
        t.reload = 0;
      }
    }
  }
  rectangle(
    owner: Player,
    pos: Vec,
    dir: Vec,
    range: number,
    width: number,
    damage: number,
    stun: number,
    knock: number,
    sideKnock = 0,
    slow?: NonNullable<ShotSpec["slow"]>,
  ) {
    for (const t of this.state.players) {
      if (!t.alive || this.allies(owner, t)) continue;
      const d = sub(t.pos, pos),
        along = d.x * dir.x + d.y * dir.y,
        side = { x: -dir.y, y: dir.x },
        lateral = d.x * side.x + d.y * side.y,
        across = Math.abs(lateral);
      if (
        along >= 0 &&
        along <= range &&
        across <= width / 2 &&
        this.lineClear(pos, t.pos) &&
        this.damage(t, damage, owner, true)
      ) {
        if (stun) {
          t.stunUntil = this.state.time + stun;
          this.dropBall(t);
        }
        if (knock) this.knock(t, dir, knock);
        if (sideKnock)
          this.knock(t, lateral >= 0 ? side : mul(side, -1), sideKnock);
        if (slow) this.applySlow(t, slow);
      }
    }
  }
  /** Turn a homing shot toward the nearest rival ahead that its owner can see. */
  private steer(q: Projectile, owner: Player, maxTurn: number) {
    let best: Player | null = null,
      bestD = Infinity;
    for (const t of this.state.players) {
      if (!t.alive || this.allies(owner, t) || this.concealed(t, owner.pos))
        continue;
      const d = sub(t.pos, q.pos),
        len = length(d);
      // Ahead means within ~70 degrees of the current heading.
      if (
        len < 1e-6 ||
        len > q.remaining + 1 ||
        (d.x * q.dir.x + d.y * q.dir.y) / len < 0.34
      )
        continue;
      if (len < bestD && this.lineClear(q.pos, t.pos)) {
        best = t;
        bestD = len;
      }
    }
    if (!best) return;
    const have = Math.atan2(q.dir.y, q.dir.x);
    let turn = Math.atan2(best.pos.y - q.pos.y, best.pos.x - q.pos.x) - have;
    turn = Math.atan2(Math.sin(turn), Math.cos(turn));
    const a = have + clamp(turn, -maxTurn, maxTurn);
    q.dir = { x: Math.cos(a), y: Math.sin(a) };
  }
  /** Shot options that apply after a basic-attack hit lands. */
  private afterHit(owner: Player, t: Player, spec: ShotSpec, before: number) {
    const s = this.state;
    if (spec.reveal) t.revealUntil = s.time + spec.reveal;
    if (spec.lifesteal) {
      const got = Math.round((before - t.hp - t.shield) * spec.lifesteal);
      const hp = owner.hp;
      this.heal(owner, got, owner, false);
      if (owner.hp > hp) {
        this.effect(
          "heal",
          owner.pos,
          owner.id,
          owner.aim,
          Math.round(owner.hp - hp),
        );
        this.emit(
          "heal_applied",
          owner.pos,
          owner.id,
          owner.aim,
          Math.round(owner.hp - hp),
        );
      }
    }
    if (!t.alive) return;
    if (spec.slow) this.applySlow(t, spec.slow);
    if (spec.tug) {
      // Reel toward the shooter, never past arm's length; not a knockback.
      const n = Math.min(spec.tug, distance(owner.pos, t.pos) - 1);
      if (n > 0) this.move(t, mul(unit(sub(owner.pos, t.pos)), n));
    }
  }
  /** Apply the strongest active slow and refresh an equal-strength one. */
  private applySlow(t: Player, slow: NonNullable<ShotSpec["slow"]>) {
    const s = this.state;
    if (s.time >= t.slowUntil || slow.amount >= t.slowBy) {
      t.slowBy = slow.amount;
      t.slowUntil = s.time + slow.duration;
    }
  }
  /** A Super shot hit: damage, then stun and an optional place swap. */
  private superHit(
    owner: Player,
    t: Player,
    q: Projectile,
    spec: SuperOf<"shot">,
  ) {
    const s = this.state;
    if (!this.damage(t, spec.damage, owner, true)) return;
    if (t.alive && spec.stun) {
      t.stunUntil = Math.max(t.stunUntil, s.time + spec.stun);
      this.dropBall(t);
    }
    if (t.alive && owner.alive && spec.swap) {
      const a = { ...owner.pos },
        b = { ...t.pos };
      owner.pos = b;
      t.pos = a;
      this.effect("swap", a, owner.id, unit(sub(b, a)), distance(a, b), 0.4);
    }
    this.emit("super_resolved", q.pos, owner.id, q.dir);
  }
  /** True when an enemy shot at `pos` is stopped by this area. */
  private blocks(a: Area, shooter: Player, pos: Vec) {
    if (!this.enemyArea(shooter, a)) return false;
    const spec = AREAS[a.kind];
    if (spec.wall && a.dir) {
      const across = { x: -a.dir.y * a.radius, y: a.dir.x * a.radius };
      return (
        segmentDistance(pos, add(a.pos, across), sub(a.pos, across)) <=
        spec.wall.thickness / 2 + 0.1
      );
    }
    return distance(a.pos, pos) <= (spec.hitRadius ?? a.radius);
  }
  /**
   * Fan a split shot into its shares at `at`. They start moving next tick
   * and skip the rival the parent hit.
   */
  private split(q: Projectile, at: Vec, spec: ShotSpec, skip?: string) {
    const sp = spec.split!,
      owner = this.state.players.find((p) => p.id === q.owner);
    const a0 = Math.atan2(q.dir.y, q.dir.x),
      out: Projectile[] = [];
    for (let i = 0; i < sp.count; i++) {
      const a = a0 + (i - (sp.count - 1) / 2) * sp.spread;
      out.push({
        id: ++this.serial,
        owner: q.owner,
        fighter: q.fighter,
        pos: { ...at },
        dir: { x: Math.cos(a), y: Math.sin(a) },
        remaining: sp.range,
        traveled: 0,
        bounces: 0,
        shard: true,
        ...(skip ? { hit: [skip] } : {}),
      });
    }
    this.effect("split", at, q.owner, q.dir, sp.count, 0.35);
    if (owner) this.emit("projectile_spawned", at, owner.id, q.dir);
    return out;
  }
  private projectiles(dt: number) {
    const s = this.state;
    const surviving: Projectile[] = [];
    const spawned: Projectile[] = [];
    for (const q of s.projectiles) {
      const owner = s.players.find((p) => p.id === q.owner);
      if (!owner) continue;
      const f = FIGHTERS[q.fighter];
      const attack = f.abilities.attack;
      if (q.lob) {
        // In the air over everything; only the landing matters.
        const step = Math.min(f.projectileSpeed * dt, q.remaining);
        q.pos = add(q.pos, mul(q.dir, step));
        q.remaining -= step;
        q.traveled += step;
        if (q.remaining > 1e-6) surviving.push(q);
        else if (attack.kind === "lob") this.splash(owner, q.pos, attack);
        continue;
      }
      // A share flies as a plain shot with the split's damage.
      const spec: ShotSpec =
        attack.kind === "shot" && !q.shard ? attack : { kind: "shot" };
      const sup =
        q.super && f.abilities.super.kind === "shot" ? f.abilities.super : null;
      const speed = sup ? sup.speed : f.projectileSpeed;
      const power = sup
        ? sup.damage
        : q.shard && attack.kind === "shot" && attack.split
          ? attack.split.damage
          : f.damage;
      const width = sup ? sup.width : (spec.width ?? SHOT_WIDTH);
      const weave = sup ? undefined : spec.weave;
      if (!sup && spec.homing && !q.back)
        this.steer(q, owner, spec.homing * dt);
      let dead = false;
      const dist = Math.min(speed * dt, q.remaining);
      const steps = Math.max(1, Math.ceil(dist / 0.12));
      for (let i = 0; i < steps && !dead; i++) {
        if (q.back && owner.alive) {
          // A returning shot flies home and is caught by its owner.
          const home = sub(owner.pos, q.pos);
          if (length(home) < 0.5) {
            dead = true;
            break;
          }
          q.dir = unit(home);
        }
        const old = { ...q.pos };
        const next = add(old, mul(q.dir, dist / steps));
        const was = q.traveled;
        q.remaining -= dist / steps;
        q.traveled += dist / steps;
        // A weaving shot is tested where it is drawn, off its center line.
        const from = shotPoint(old, q.dir, was, weave, q.side);
        const probe = shotPoint(next, q.dir, q.traveled, weave, q.side);
        const m = MAPS[s.mode];
        const wall = s.walls.find(
          (w) =>
            probe.x >= w.x &&
            probe.x <= w.x + w.w &&
            probe.y >= w.y &&
            probe.y <= w.y + w.h,
        );
        const boundary =
          probe.x < 0 || probe.y < 0 || probe.x > m.w || probe.y > m.h;
        if (wall || boundary) {
          if (wall?.hp !== undefined) {
            wall.hp -= power;
            if (wall.hp <= 0) s.walls = s.walls.filter((w) => w.id !== wall.id);
          }
          if (q.bounces > 0) {
            q.bounces--;
            const hitX = wall
              ? from.x <= wall.x || from.x >= wall.x + wall.w
              : probe.x < 0 || probe.x > m.w;
            if (hitX) q.dir.x *= -1;
            else q.dir.y *= -1;
            if (weave) {
              // Restart the wave from where it bounced, so it does not jump.
              q.pos = from;
              const half = weave.wavelength / 2;
              q.traveled = Math.floor(was / half) * half;
            }
          } else dead = true;
          continue;
        }
        q.pos = next;
        // Enemy stations, companions and barriers absorb the shot.
        for (const a of s.areas)
          if (this.blocks(a, owner, probe)) {
            a.hp -= power;
            dead = true;
            break;
          }
        if (dead) break;
        const reach =
          RULES.radius + width + (sup ? 0 : (spec.grow ?? 0) * q.traveled);
        for (const t of s.players) {
          if (
            !t.alive ||
            t.id === owner.id ||
            distance(probe, t.pos) > reach
          )
            continue;
          if (this.allies(owner, t)) continue;
          if (q.hit?.includes(t.id)) continue;
          if (sup) {
            this.superHit(owner, t, q, sup);
            dead = true;
            break;
          }
          const centered =
            !!spec.centerBonus &&
            Math.abs(
              (t.pos.x - probe.x) * q.dir.y - (t.pos.y - probe.y) * q.dir.x,
            ) <=
              RULES.radius + spec.centerBonus.width;
          const centerBonus = centered ? spec.centerBonus!.damage : 0;
          // Checked before this hit refreshes the mark.
          const followUp =
            spec.followUp && t.revealUntil > s.time ? spec.followUp : 0;
          const before = t.hp + t.shield;
          if (this.damage(t, power + centerBonus + followUp, owner)) {
            if (centered)
              this.effect("harmony", t.pos, owner.id, q.dir, centerBonus, 0.3);
            this.afterHit(owner, t, spec, before);
          }
          if (spec.pierce) {
            (q.hit ??= []).push(t.id);
            continue;
          }
          if (spec.split) spawned.push(...this.split(q, probe, spec, t.id));
          dead = true;
          break;
        }
      }
      if (!dead && !sup && spec.returns && !q.back && q.remaining <= 1e-6) {
        // Out of range: turn around; every rival can be hit again.
        q.back = true;
        q.hit = [];
        q.remaining = f.range + 1;
      }
      if (!dead && q.remaining <= 1e-6 && spec.split && !sup) {
        // Out of range unshared: it goes viral where it stops.
        spawned.push(
          ...this.split(q, shotPoint(q.pos, q.dir, q.traveled, weave, q.side), spec),
        );
        dead = true;
      }
      if (!dead && q.remaining > 0) surviving.push(q);
    }
    s.projectiles = surviving.concat(spawned);
    s.areas = s.areas.filter((a) => a.hp > 0 && a.end > s.time);
  }
  /**
   * Companions: walk to the nearest rival they can see and swipe at it.
   * Their damage is Super damage, so it never charges the owner's Super.
   */
  private companions(dt: number) {
    const s = this.state;
    for (const a of s.areas) {
      const spec = AREAS[a.kind].chase;
      if (!spec || a.end <= s.time) continue;
      const owner = s.players.find((x) => x.id === a.owner);
      if (!owner) continue;
      let target: Player | null = null,
        best = Infinity;
      for (const t of s.players) {
        if (!t.alive || this.allies(owner, t) || this.concealed(t, a.pos))
          continue;
        const d = distance(a.pos, t.pos);
        if (d <= spec.sight && d < best && this.lineClear(a.pos, t.pos)) {
          target = t;
          best = d;
        }
      }
      // With nobody in sight it trots back to its owner.
      const goal = target?.pos ?? (owner.alive ? owner.pos : null);
      const stop = target ? spec.reach * 0.95 : 1.6;
      if (goal) {
        const d = distance(a.pos, goal);
        if (d > stop) {
          a.dir = unit(sub(goal, a.pos));
          this.move(a, mul(a.dir, Math.min(spec.speed * dt, d - stop)), 0.3);
        }
      }
      if (
        target &&
        distance(a.pos, target.pos) <= spec.reach &&
        s.time >= (a.next ?? 0)
      ) {
        a.next = s.time + spec.every;
        if (this.damage(target, spec.damage, owner, true))
          this.effect(
            "panda",
            target.pos,
            owner.id,
            a.dir ?? { x: 1, y: 0 },
            undefined,
            0.25,
          );
      }
    }
  }
  private shoot(p: Player, power: number) {
    const b = this.state.ball;
    if (b.carrier !== p.id) return;
    this.dropBall(p);
    b.state = "flight";
    b.velocity = mul(p.aim, 8 + ((clamp(power, 0.35, 1) - 0.35) / 0.65) * 8);
    b.scorer = p.id;
  }
  private ball(dt: number) {
    const s = this.state,
      b = s.ball;
    if (s.mode !== "broomball") return;
    if (b.carrier) {
      const p = s.players.find((p) => p.id === b.carrier);
      if (p?.alive && p.connected) b.pos = add(p.pos, mul(p.aim, 0.58));
      else if (p) this.dropBall(p);
      return;
    }
    if (b.state === "resetting") return;
    const steps = Math.max(1, Math.ceil((length(b.velocity) * dt) / 0.12));
    for (let i = 0; i < steps; i++) {
      const prev = { ...b.pos };
      b.pos = add(b.pos, mul(b.velocity, dt / steps));
      // Only a released ball crossing the plane counts; carrying never scores.
      if (
        ((prev.x >= 0.32 && b.pos.x < 0.32) ||
          (prev.x <= 33.68 && b.pos.x > 33.68)) &&
        b.pos.y > 8 &&
        b.pos.y < 12
      ) {
        this.goal(b.pos.x < 1 ? 1 : 0);
        return;
      }
      if (b.pos.x < 0.32 || b.pos.x > 33.68) {
        b.pos.x = clamp(b.pos.x, 0.32, 33.68);
        b.velocity.x *= -0.8;
      }
      if (b.pos.y < 0.32 || b.pos.y > 19.68) {
        b.pos.y = clamp(b.pos.y, 0.32, 19.68);
        b.velocity.y *= -0.8;
      }
      for (const p of s.players) {
        if (
          !p.alive ||
          !p.connected ||
          s.time < p.stunUntil ||
          s.time < p.busyUntil ||
          (p.id === b.last && s.time < b.lockUntil)
        )
          continue;
        if (segmentDistance(p.pos, prev, b.pos) < RULES.radius + 0.32) {
          const previous = s.players.find((x) => x.id === b.scorer);
          if (previous && previous.team === p.team && previous.id !== p.id) {
            b.passer = previous.id;
            b.passAt = s.time;
          } else if (previous && previous.team !== p.team) {
            b.passer = null;
            b.passAt = 0;
          }
          b.scorer = p.id;
          b.carrier = p.id;
          b.velocity = { x: 0, y: 0 };
          b.state = "carried";
          this.emit("ball_picked_up", p.pos, p.id);
          return;
        }
      }
    }
    b.velocity = mul(b.velocity, Math.exp(-0.32 * dt));
  }
  goal(team: 0 | 1) {
    const s = this.state;
    if (s.phase !== "playing") return;
    s.score[team]++;
    const scorer = s.players.find((x) => x.id === s.ball.scorer);
    if (scorer?.team === team) {
      scorer.stats.goals++;
      const passer = s.players.find((x) => x.id === s.ball.passer);
      if (
        passer &&
        passer.id !== scorer.id &&
        passer.team === team &&
        s.time - s.ball.passAt <= 8
      )
        passer.stats.assists++;
    }
    s.ball.carrier = null;
    s.ball.state = "resetting";
    s.notice = `${team === 0 ? "Blue" : "Red"} team scores!`;
    this.effect("goal", s.ball.pos, scorer?.id, undefined, undefined, 3);
    this.emit("goal_scored", s.ball.pos, scorer?.id ?? "", undefined, team);
    if (s.score[team] >= 2 || s.overtime) {
      this.finish(team === 0 ? "blue" : "red");
      return;
    }
    s.phase = "goal";
    s.phaseUntil = s.time + 3;
    s.projectiles = [];
    s.areas = [];
    this.pending = [];
    this.dashes = [];
    this.leaps = [];
  }
  kickoff() {
    this.histories.clear();
    const s = this.state;
    let blue = 0,
      red = 3;
    for (const p of s.players) {
      p.pos = { ...MAPS.broomball.spawns[p.team === 0 ? blue++ : red++] };
      p.hp = FIGHTERS[p.fighter].hp;
      p.ammo = FIGHTERS[p.fighter].ammo;
      p.reload = 0;
      p.alive = p.connected;
      p.stunUntil = 0;
      p.protectedUntil = 0;
      this.clearStatus(p);
      p.quietSince = s.time;
    }
    s.ball = {
      pos: { x: 17, y: 10 },
      velocity: { x: 0, y: 0 },
      carrier: null,
      state: "free",
      last: null,
      lockUntil: 0,
      passer: null,
      passAt: 0,
      scorer: null,
    };
  }
  /** Clear timed slow, shield and leap state (kickoff and respawn). */
  private clearStatus(p: Player) {
    p.slowBy = p.slowUntil = 0;
    p.shield = p.shieldUntil = 0;
    p.busyUntil = 0;
  }
  finish(winner: string | null) {
    const s = this.state;
    if (s.phase === "finished") return;
    s.phase = "finished";
    s.winner = winner;
    s.projectiles = [];
    s.ball.carrier = null;
    s.ball.state = "resetting";
    const survivors = s.players
      .filter((p) => p.alive)
      .sort(
        (a, b) =>
          b.hp / FIGHTERS[b.fighter].hp - a.hp / FIGHTERS[a.fighter].hp ||
          b.stats.damage - a.stats.damage ||
          a.id.localeCompare(b.id),
      );
    if (s.mode === "fishing") return this.placeFishing(survivors);
    if (s.mode === "showdown")
      survivors.forEach((p, i) => (p.placement = i + 1));
    for (const p of survivors) p.stats.survived = Math.max(0, s.time - 3);
  }
  /**
   * Fishers of Men placement: Fish still free place first, then caught Fish
   * from last caught to first (set when caught), then the starting Fishers
   * by catches.
   */
  private placeFishing(survivors: Player[]) {
    const s = this.state;
    // Elimination always converts a Fish, so every Fish is a survivor.
    const free = survivors.filter((p) => p.team === FISH);
    free.forEach((p, i) => {
      p.placement = i + 1;
      p.stats.survived = Math.max(0, s.time - 3);
    });
    const caught = s.players.filter(
      (p) => p.team === FISHERS && p.placement > 0,
    );
    const starters = s.players
      .filter((p) => p.team === FISHERS && p.placement === 0)
      .sort(
        (a, b) =>
          b.stats.catches - a.stats.catches ||
          b.stats.damage - a.stats.damage ||
          a.id.localeCompare(b.id),
      );
    starters.forEach(
      (p, i) => (p.placement = free.length + caught.length + i + 1),
    );
  }
  /**
   * A Super's cinematic pause. The match clock is stopped, and every rule
   * runs on that clock, so movement, damage, reloads, cooldowns, shots,
   * zones, the ball and respawns all hold exactly where they were. Only the
   * cutscene's own countdown runs, and no input can shorten it. Inputs sent
   * meanwhile are dropped rather than queued, and the Super resolves on the
   * tick it was cast.
   */
  private holdForCutscene(dt: number) {
    const s = this.state,
      scene = s.cutscene!;
    scene.left = Math.max(0, scene.left - dt);
    for (const t of this.tracks.values()) this.anchorTimeline(t);
    for (const input of this.inputs.values())
      input.attack =
        input.super =
        input.itemPickup =
        input.itemDrop =
        input.itemUse =
          false;
    this.itemUseSeq.clear();
    if (scene.left > 0) return;
    s.cutscene = null;
    s.phase = "playing";
    const resolve = this.afterCutscene;
    this.afterCutscene = null;
    const p = s.players.find((x) => x.id === scene.owner);
    if (p?.alive && resolve?.())
      this.emit("super_resolved", p.pos, p.id, p.aim);
  }
  step(dt = 1 / RULES.tick) {
    const s = this.state;
    if (s.phase === "finished") return;
    if (s.cutscene) return this.holdForCutscene(dt);
    s.time += dt;
    s.tick++;
    s.aliveCount = s.players.filter((p) => p.alive).length;
    s.effects = s.effects.filter((e) => e.end > s.time);
    // Keep a short rolling window of discrete events (standard §6.2) so a
    // dropped snapshot does not lose a one-shot cue; the client dedupes by the
    // stable event id. ~0.5s at 30 Hz is a handful of ticks of coverage.
    s.events = s.events.filter((e) => e.tick > s.tick - 15);
    if (s.phase === "countdown") {
      if (s.time >= s.phaseUntil) {
        s.phase = "playing";
        s.notice = "Go!";
        s.ball.state = "free";
      } else {
        // Inputs sent before play must not become a backlog at "Go".
        for (const t of this.tracks.values()) this.anchorTimeline(t);
        for (const input of this.inputs.values())
          input.itemPickup = input.itemDrop = input.itemUse = false;
        this.itemUseSeq.clear();
        return;
      }
    }
    if (s.phase === "goal") {
      if (s.time >= s.phaseUntil) {
        this.kickoff();
        s.phase = "playing";
        s.notice = "Go!";
      } else {
        for (const t of this.tracks.values()) this.anchorTimeline(t);
        for (const input of this.inputs.values())
          input.itemPickup = input.itemDrop = input.itemUse = false;
        this.itemUseSeq.clear();
        return;
      }
    }
    for (const p of s.players) {
      if (!p.alive) {
        const t = this.tracks.get(p.id);
        if (t) this.anchorTimeline(t);
        const staleInput = this.inputs.get(p.id);
        if (staleInput)
          staleInput.itemPickup =
            staleInput.itemDrop =
            staleInput.itemUse =
              false;
        this.itemUseSeq.delete(p.id);
        if (
          MODES[s.mode].respawn !== null &&
          p.connected &&
          s.time >= p.respawn
        ) {
          p.pos = this.respawnPoint(p);
          p.hp = FIGHTERS[p.fighter].hp;
          p.ammo = FIGHTERS[p.fighter].ammo;
          p.reload = 0;
          p.alive = true;
          p.protectedUntil = s.time + RULES.protection;
          this.clearStatus(p);
          p.quietSince = s.time;
          this.histories.delete(p.id);
        } else continue;
      }
      const f = FIGHTERS[p.fighter],
        input = this.inputs.get(p.id);
      if (s.time >= p.shieldUntil) p.shield = 0;
      // The strongest active slow applies; slows never stack.
      p.slow = s.time < p.slowUntil ? p.slowBy : 0;
      for (const a of s.areas) {
        const spec = AREAS[a.kind];
        if (a.end <= s.time || (!spec.heal && !spec.slow)) continue;
        const owner = s.players.find((x) => x.id === a.owner);
        if (!owner || distance(p.pos, a.pos) > a.radius) continue;
        if (this.allies(owner, p)) {
          if (spec.heal) this.heal(p, spec.heal * dt, owner, false);
        } else if (spec.slow) p.slow = Math.max(p.slow, spec.slow);
      }
      const canAct =
        !!input &&
        p.connected &&
        s.time >= p.stunUntil &&
        s.time >= p.busyUntil;
      const track = this.tracks.get(p.id);
      // Timeline time always advances; it only produces movement when the
      // fighter can act (stun/disconnect consume time without moving).
      if (track) this.consumeTimeline(p, track, dt, canAct);
      if (input && canAct) {
        p.aim = input.aim;
        if (!track)
          this.move(
            p,
            mul(input.move, moveSpeed(s.mode, p) * (1 - p.slow) * dt),
          );
        if (input.itemDrop) this.dropItem(p);
        if (input.itemPickup) this.pickupItem(p);
        if (input.itemUse) this.useItem(p);
        if (input.super) this.activateSuper(p);
        if (input.attack) this.attack(p);
      }
      if (input) {
        input.attack = false;
        input.super = false;
        input.itemPickup = input.itemDrop = input.itemUse = false;
        this.itemUseSeq.delete(p.id);
      }
      if (p.ammo < f.ammo) {
        p.reload += dt;
        if (p.reload >= f.reload) {
          p.ammo++;
          p.reload -= f.reload;
        }
      } else p.reload = 0;
      if (s.time - p.quietSince >= 4) this.heal(p, f.hp * 0.12 * dt);
      const history = this.histories.get(p.id) || [];
      history.push({ t: s.time, pos: { ...p.pos }, hp: p.hp });
      this.histories.set(
        p.id,
        history.filter((h) => h.t >= s.time - 3),
      );
    }
    const due = this.pending.filter((x) => x.at <= s.time);
    this.pending = this.pending.filter((x) => x.at > s.time);
    for (const item of due) {
      const p = s.players.find((x) => x.id === item.id);
      if (!p?.alive) continue;
      if (item.kind === "volley" || item.kind === "beam") {
        // A stun or a ball pickup interrupts a burst or a beam windup.
        if (s.time >= p.stunUntil && s.ball.carrier !== p.id) {
          if (item.kind === "volley") this.volley(p, item.dir);
          else this.beam(p, item.dir);
        }
        continue;
      }
      const spec = item.spec;
      if (spec.kind === "frame") {
        this.rectangle(
          p,
          item.pos,
          item.dir,
          spec.range,
          spec.width,
          spec.damage,
          spec.stun,
          spec.knock,
          spec.sideKnock,
          spec.slow,
        );
        this.effect(spec.effect, item.pos, p.id, item.dir, 1, 0.4);
        this.emit("super_resolved", item.pos, p.id, item.dir);
      } else if (spec.kind === "charge") {
        this.dashes.push({
          id: p.id,
          remaining: spec.distance,
          dir: item.dir,
          hit: new Set(),
          spec,
        });
        this.emit("super_resolved", p.pos, p.id, item.dir);
      } else if (spec.kind === "burst") {
        this.burstCue(p, item.pos, spec, spec.effect);
        this.burst(p, item.pos, spec);
        this.emit("super_resolved", item.pos, p.id, item.dir);
      }
    }
    for (const leap of this.leaps) {
      const p = s.players.find((x) => x.id === leap.id);
      if (!p?.alive) {
        leap.end = -1;
        continue;
      }
      // Over cover: the authority places the fighter along the arc.
      const k = clamp((s.time - leap.start) / (leap.end - leap.start), 0, 1);
      p.pos = add(leap.from, mul(sub(leap.to, leap.from), k));
      if (k < 1) continue;
      this.burstCue(p, leap.to, leap.spec.landing);
      this.burst(p, leap.to, leap.spec.landing);
      this.emit("super_resolved", leap.to, p.id, unit(sub(leap.to, leap.from)));
      leap.end = -1;
    }
    this.leaps = this.leaps.filter((l) => l.end >= 0);
    for (const dash of this.dashes) {
      const p = s.players.find((x) => x.id === dash.id);
      if (!p?.alive || s.time < p.stunUntil) {
        dash.remaining = 0;
        continue;
      }
      const step = Math.min(dash.spec.speed * dt, dash.remaining);
      const old = { ...p.pos };
      for (const w of s.walls)
        if (
          w.hp !== undefined &&
          segmentDistance(
            { x: w.x + w.w / 2, y: w.y + w.h / 2 },
            p.pos,
            add(p.pos, mul(dash.dir, step)),
          ) < 1
        )
          w.hp = 0;
      s.walls = s.walls.filter((w) => w.hp === undefined || w.hp > 0);
      const pieces = Math.max(1, Math.ceil(step / 0.15));
      for (let i = 0; i < pieces; i++) {
        const next = add(p.pos, mul(dash.dir, step / pieces));
        if (!this.valid(next)) {
          dash.remaining = 0;
          break;
        }
        p.pos = next;
      }
      dash.remaining = Math.max(0, dash.remaining - step);
      this.effect("van", p.pos, p.id, dash.dir, 1, 0.1);
      for (const t of s.players)
        if (
          t.alive &&
          !this.allies(p, t) &&
          !dash.hit.has(t.id) &&
          segmentDistance(t.pos, old, p.pos) < 1
        ) {
          dash.hit.add(t.id);
          if (this.damage(t, dash.spec.damage, p, true))
            this.knock(t, dash.dir, dash.spec.knock);
        }
    }
    this.dashes = this.dashes.filter((d) => d.remaining > 0);
    this.companions(dt);
    this.projectiles(dt);
    this.updateItems(dt);
    this.ball(dt);
    const elapsed = s.time - 3;
    if (s.mode === "showdown") {
      const stages = [
        [0, 22],
        [20, 22],
        [70, 16.5],
        [120, 9.9],
        [150, 4.4],
        [180, 0.25],
      ];
      s.zone = 0.25;
      for (let i = 1; i < stages.length; i++)
        if (elapsed <= stages[i][0]) {
          const [t0, r0] = stages[i - 1],
            [t1, r1] = stages[i];
          s.zone = r0 + (r1 - r0) * clamp((elapsed - t0) / (t1 - t0), 0, 1);
          break;
        }
      for (const p of s.players)
        if (p.alive && distance(p.pos, { x: 18, y: 12 }) > s.zone)
          this.damage(
            p,
            (elapsed < 70
              ? 350
              : elapsed < 120
                ? 650
                : elapsed < 150
                  ? 1100
                  : 1800) * dt,
          );
      const alive = s.players.filter((p) => p.alive);
      if (alive.length <= 1) this.finish(alive[0]?.id || null);
      else if (elapsed >= MODES.showdown.length) {
        const sorted = alive.sort(
          (a, b) =>
            b.hp / FIGHTERS[b.fighter].hp - a.hp / FIGHTERS[a.fighter].hp ||
            b.stats.damage - a.stats.damage ||
            a.id.localeCompare(b.id),
        );
        this.finish(sorted[0].id);
      }
    } else if (s.mode === "fishing") this.fishing(elapsed);
    else if (elapsed >= MODES.broomball.length && !s.overtime) {
      if (s.score[0] === s.score[1]) {
        s.overtime = true;
        s.notice = "Golden goal • 30 seconds";
      } else this.finish(s.score[0] > s.score[1] ? "blue" : "red");
    } else if (s.overtime && elapsed >= MODES.broomball.length + OVERTIME)
      this.finish(null);
  }
  /**
   * Fishers of Men's end rules: the Fishers win once every Fish is caught,
   * the Fish win if any are still free at the final whistle. The last Fish
   * cannot hide in a bush.
   */
  private fishing(elapsed: number) {
    const s = this.state;
    const free = s.players.filter((p) => p.team === FISH);
    // Team sizes ride in the score so the HUD sees Fish hidden in bushes.
    s.score = [free.length, s.players.length - free.length];
    if (!free.length) return this.finish("fishers");
    if (elapsed >= MODES.fishing.length) return this.finish("fish");
    if (free.length !== 1) return;
    const last = free[0];
    last.revealUntil = Math.max(last.revealUntil, s.time + 0.25);
    if (this.lastFish !== last.id) {
      this.lastFish = last.id;
      s.notice = `${last.name} is the last fish!`;
    }
  }
  /**
   * Conceal rivals in bushes unless the viewer or a living teammate is close,
   * or the rival is marked. Dead participants spectate all.
   */
  snapshot(viewerId: string): Match {
    const s = this.state,
      viewer = s.players.find((p) => p.id === viewerId);
    const snap = structuredClone(s);
    if (viewer?.alive && s.phase !== "finished") {
      const eyes = s.players.filter((a) => a.alive && this.allies(viewer, a));
      const hidden = new Set(
        s.players
          .filter(
            (p) =>
              p.alive &&
              !this.allies(viewer, p) &&
              eyes.every((a) => this.concealed(p, a.pos)),
          )
          .map((p) => p.id),
      );
      if (hidden.size)
        snap.players = snap.players.filter((p) => !hidden.has(p.id));
    }
    // A carried item must not expose an otherwise concealed fighter.
    const visiblePlayers = new Set(snap.players.map((p) => p.id));
    snap.items = snap.items.filter(
      (item) => !item.carrier || visiblePlayers.has(item.carrier),
    );
    // Infinity is not portable across every JSON-based transport.
    snap.aliveCount = s.players.filter((p) => p.alive).length;
    snap.areas.forEach((a) => {
      if (!Number.isFinite(a.hp)) a.hp = 999999;
    });
    snap.sampleTime = s.time;
    snap.ackSeq = this.lastSeq.get(viewerId) ?? 0;
    snap.ackTime = this.tracks.get(viewerId)?.c ?? 0;
    this.compact(snap);
    return snap;
  }
  /**
   * Wire-size reduction for the transmitted snapshot (standard §4.2: prefer
   * quantization and omission over full-precision full-state JSON). Operates
   * only on the per-viewer clone, never on authoritative state, so it cannot
   * affect the simulation. Positions are quantized to 0.01 world units — far
   * below the <= 0.25-unit correction tolerance and imperceptible — and
   * HUD-only scalars are rounded. This is quantization/rounding; a full
   * delta-against-baseline encoding remains future work.
   */
  private compact(snap: Match) {
    const q2 = (v: Vec) => {
      v.x = Math.round(v.x * 100) / 100;
      v.y = Math.round(v.y * 100) / 100;
    };
    snap.sampleTime = Math.round(snap.sampleTime * 1000) / 1000;
    // Not rounded: ackTime is a replay boundary on the client's own clock.
    for (const p of snap.players) {
      q2(p.pos);
      q2(p.aim);
      // ceil so a living fighter with fractional HP never displays as 0.
      p.hp = Math.ceil(p.hp);
      p.shield = Math.ceil(p.shield);
      p.charge = Math.round(p.charge);
    }
    for (const q of snap.projectiles) {
      q2(q.pos);
      q2(q.dir);
    }
    for (const item of snap.items) {
      q2(item.pos);
      q2(item.dir);
    }
    for (const a of snap.areas) {
      q2(a.pos);
      if (a.dir) q2(a.dir);
      a.hp = Math.ceil(a.hp);
    }
    for (const b of [snap.ball]) {
      q2(b.pos);
      q2(b.velocity);
    }
    for (const e of snap.effects) {
      q2(e.pos);
      q2(e.dir);
      if (e.value !== undefined) e.value = Math.round(e.value * 100) / 100;
    }
    for (const ev of snap.events) {
      q2(ev.pos);
      if (ev.dir) q2(ev.dir);
    }
  }
}
