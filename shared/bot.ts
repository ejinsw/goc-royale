import {
  AREAS,
  FIGHTERS,
  MAPS,
  MODES,
  RULES,
  add,
  clamp,
  distance,
  length,
  mul,
  sub,
  unit,
  type Fighter,
  type SuperSpec,
  type Vec,
} from "./definitions";
import { aimPreviewFor, footprintEdge, toFootprint } from "./footprints";
import type { Engine } from "./engine";
import type { Player } from "./types";

/**
 * Bots (room authority layer). One brain plays every fighter: it reads the
 * match the way a player can (rivals hidden in bushes stay hidden) and acts
 * only through Engine.setInput, so a bot obeys exactly the rules, cooldowns
 * and speeds a person does. It never branches on a fighter id. When to
 * attack and when to use the Super come from the fighter's ability data via
 * the same exact footprints the aim preview draws; how it moves comes from
 * the fighter's `bot` row. A new fighter row is therefore a playable bot.
 * Modes steer it through their data too: Showdown's zone, Broomball's
 * ball, and a mode's `prey` team (Fishers of Men), whose bots hide while
 * the other side hunts.
 */

/** Ticks between plans (10 Hz at the 30 Hz simulation); input goes every tick. */
const THINK_EVERY = 3;

/**
 * How calm and how sharp every bot is: the one place to tune them. Bots
 * notice rivals only nearby, take a moment before engaging, walk unless
 * something is dangerous, rest between moves, and aim, lead and dodge
 * like a casual player rather than a perfect one.
 */
export const TEMPER = {
  /** Rivals farther than this are not noticed (world units). */
  sight: 10,
  /** Seconds it takes to react to a newly noticed rival. */
  react: [0.4, 0.9],
  /** Speed share when nothing is dangerous; danger moves at full speed. */
  walk: 0.65,
  /** Seconds standing still on reaching a roaming point. */
  rest: [0.8, 2.4],
  /** How far a roaming point is from where the bot stands. */
  roam: 6,
  /** Aim error on each shot, radians either side: some shots miss. */
  aimError: 0.17,
  /** Share of a rival's motion it leads its shots by, low to high. */
  lead: [0.15, 0.7],
  /** Chance per plan to take a clean shot. */
  trigger: 0.4,
  /** Seconds it waits after a shot before the next, beyond the attack interval. */
  shotRest: [0.5, 1.3],
  /** Chance per plan to step out of an incoming shot. */
  dodge: 0.3,
  /** Sidestep strength, scaling the fighter's own `strafe`. */
  strafe: 0.5,
  /** Seconds between sidestep changes; some spells stand still instead. */
  strafeHold: [1.4, 3.2],
  stillChance: 0.45,
  /** Chance per plan to use a ready Super when the moment fits. */
  superChance: 0.3,
};
const between = (r: () => number, [lo, hi]: readonly number[]) =>
  lo + r() * (hi - lo);
/** Showdown's shrinking zone is centered here (see Engine.step). */
const ZONE_CENTER = { x: 18, y: 12 };
/** Broomball goal mouths span this band on each end line. */
const GOAL_Y = [8.6, 11.4] as const;

/** What a Super is for, read from its data. */
export type SuperUse = "strike" | "mend" | "guard" | "summon";

export function superUses(spec: SuperSpec): SuperUse[] {
  switch (spec.kind) {
    case "zone": {
      const area = AREAS[spec.area];
      const uses: SuperUse[] = [];
      if (area.chase) uses.push("summon");
      if (area.wall) uses.push("guard");
      if (area.heal) uses.push("mend");
      if (area.slow) uses.push("strike");
      return uses;
    }
    case "rewind":
      return ["mend", "strike"];
    case "burst": {
      const uses: SuperUse[] = [];
      if (spec.damage || spec.stun || spec.drain || spec.pull || spec.knock)
        uses.push("strike");
      if (spec.heal || spec.shield || spec.protect) uses.push("mend");
      return uses;
    }
    default:
      return ["strike"];
  }
}

/** Seconds from the press until a Super's hit lands `d` units away. */
function superLead(spec: SuperSpec, d: number) {
  switch (spec.kind) {
    case "frame":
      return spec.windup;
    case "charge":
      return spec.windup + d / spec.speed;
    case "shot":
      return d / spec.speed;
    case "leap":
      return spec.air;
    case "burst":
      return spec.delay ?? 0;
    default:
      return 0;
  }
}

/** Seconds from the press until a basic attack reaches `d` units away. */
function attackLead(f: Fighter, d: number) {
  const a = f.abilities.attack;
  if (a.kind === "cone") return 0;
  if (a.kind === "beam") return a.windup;
  return d / Math.max(1, f.projectileSpeed);
}

const rotate = (v: Vec, a: number): Vec => ({
  x: v.x * Math.cos(a) - v.y * Math.sin(a),
  y: v.x * Math.sin(a) + v.y * Math.cos(a),
});
/** Left of a heading. */
const left = (v: Vec): Vec => ({ x: -v.y, y: v.x });

/**
 * Walking distance to one goal cell over a 1-unit grid of the map: the
 * route a bot takes when cover blocks the straight line. Cells are open
 * when a fighter fits at their center; diagonals need both sides open.
 */
interface Route {
  goal: number;
  walls: number;
  at: number;
  dist: Int32Array;
}
function routeField(e: Engine, goal: Vec): Route | null {
  const map = MAPS[e.state.mode],
    w = Math.floor(map.w),
    h = Math.floor(map.h);
  const open = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      open[y * w + x] = e.valid({ x: x + 0.5, y: y + 0.5 }) ? 1 : 0;
  // Start from the open cell nearest the goal.
  const gx = clamp(Math.floor(goal.x), 0, w - 1),
    gy = clamp(Math.floor(goal.y), 0, h - 1);
  let start = -1;
  for (let r = 0; r < 4 && start < 0; r++)
    for (let dy = -r; dy <= r && start < 0; dy++)
      for (let dx = -r; dx <= r && start < 0; dx++) {
        const x = gx + dx,
          y = gy + dy;
        if (x >= 0 && y >= 0 && x < w && y < h && open[y * w + x]) start = y * w + x;
      }
  if (start < 0) return null;
  const dist = new Int32Array(w * h).fill(-1);
  const queue = new Int32Array(w * h);
  let head = 0,
    tail = 0;
  dist[start] = 0;
  queue[tail++] = start;
  while (head < tail) {
    const c = queue[head++],
      cx = c % w,
      cy = (c - cx) / w;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const x = cx + dx,
          y = cy + dy;
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        const n = y * w + x;
        if (!open[n] || dist[n] >= 0) continue;
        if (dx && dy && (!open[cy * w + x] || !open[y * w + cx])) continue;
        dist[n] = dist[c] + 1;
        queue[tail++] = n;
      }
  }
  return { goal: gy * w + gx, walls: e.state.walls.length, at: e.state.time, dist };
}

interface Seen {
  pos: Vec;
  t: number;
  vel: Vec;
}

export class Bot {
  private tick: number;
  private move: Vec = { x: 0, y: 0 };
  private aim: Vec = { x: 1, y: 0 };
  private fire = false;
  private cast = false;
  private power = 0.35;
  private target: string | null = null;
  /** Sidestep direction; 0 stands its ground. */
  private strafeSign: -1 | 0 | 1 = 0;
  private strafeUntil = 0;
  private retreating = false;
  private waypoint: Vec | null = null;
  private waypointUntil = 0;
  private detour: Vec | null = null;
  private detourUntil = 0;
  private stuck = 0;
  private last: Vec | null = null;
  private lastHp = Infinity;
  private hurtAt = -Infinity;
  /** When it has finished reacting to its current target. */
  private engageAt = 0;
  /** Earliest time for its next shot. */
  private shotAt = 0;
  /** Standing still on a roaming point until then. */
  private restUntil = 0;
  /** Something dangerous is happening: move at full speed this plan. */
  private hurry = false;
  private seen = new Map<string, Seen>();
  private route: Route | null = null;
  /** The bush a hiding bot is heading for or sitting in. */
  private den: { x: number; y: number; w: number; h: number } | null = null;

  /** `offset` staggers plans so several bots do not all think on one tick. */
  constructor(
    readonly id: string,
    private random: () => number = Math.random,
    offset = 0,
  ) {
    this.tick = offset;
  }

  /** Feed this tick's input. Call once per simulation tick, before Engine.step. */
  update(e: Engine) {
    const s = e.state;
    const me = s.players.find((p) => p.id === this.id);
    if (!me) return;
    if (!me.alive || s.phase !== "playing") {
      this.fire = this.cast = false;
      this.move = { x: 0, y: 0 };
      this.target = null;
      this.lastHp = Infinity;
      e.setInput(this.id, { move: this.move, aim: this.aim });
      return;
    }
    if (this.tick++ % THINK_EVERY === 0) this.think(e, me);
    e.setInput(this.id, {
      move: this.move,
      aim: this.aim,
      attack: this.fire,
      super: this.cast,
      power: this.power,
      // A bot never holds everyone in a long Super cutscene.
      brief: true,
    });
    this.fire = this.cast = false;
  }

  private think(e: Engine, me: Player) {
    const s = e.state,
      f = FIGHTERS[me.fighter],
      style = f.bot,
      now = s.time;
    if (Number.isFinite(this.lastHp) && me.hp < this.lastHp - 1)
      this.hurtAt = now;
    this.lastHp = me.hp;

    if (now >= this.strafeUntil) {
      this.strafeSign =
        this.random() < TEMPER.stillChance ? 0 : this.random() < 0.5 ? 1 : -1;
      this.strafeUntil = now + between(this.random, TEMPER.strafeHold);
    }
    this.hurry = false;

    // The snapshot's rule: a rival in a bush is hidden unless this bot or
    // a living teammate is close (or it is marked).
    const eyes = s.players.filter((a) => a.alive && e.allies(me, a));
    const rivals = s.players.filter(
      (t) =>
        t.alive &&
        !e.allies(me, t) &&
        !eyes.every((a) => e.concealed(t, a.pos)),
    );
    const prey = MODES[s.mode].prey;
    const hiding = prey !== undefined && me.team === prey;
    const hunting = prey !== undefined && me.team !== prey;
    // Hunters come straight back after a knockout, so they never back off.
    const share = me.hp / f.hp;
    if (share < style.retreat && !hunting) this.retreating = true;
    else if (hunting || share > Math.min(0.95, style.retreat + 0.3))
      this.retreating = false;
    this.observe(rivals, now);
    const ball = s.ball;
    const broomball = s.mode === "broomball";
    const carrying = broomball && ball.carrier === me.id;
    const target = this.pick(me, rivals, broomball ? ball.carrier : null);
    if (target && target.id !== this.target)
      this.engageAt = now + between(this.random, TEMPER.react);
    this.target = target?.id ?? null;
    // Still taking in a newly noticed rival: stop and look at it.
    const reacting = !!target && now < this.engageAt;

    let want: Vec = { x: 0, y: 0 };
    if (carrying) want = this.runBall(me, rivals);
    else {
      if (target && reacting) this.aim = unit(sub(target.pos, me.pos));
      else if (target) {
        want = hiding
          ? this.evade(e, me, target, rivals)
          : this.approach(e, me, target);
        if (!this.trySuper(e, me, target, rivals)) this.tryAttack(e, me, target);
      } else {
        this.trySuper(e, me, null, rivals);
        want = hiding
          ? this.hide(e, me, rivals)
          : hunting
            ? this.search(e, me)
            : this.wander(e, me);
      }
      if (hunting && target) this.hurry = true;
      if (broomball) want = this.playBall(e, me, want);
    }
    if (s.mode === "showdown") {
      // The zone hurts more every stage: stay well inside it.
      const d = distance(me.pos, ZONE_CENTER);
      const k = clamp((d - (s.zone - 2.5)) / 2, 0, 2.5);
      if (k > 0) {
        want = add(want, mul(unit(sub(ZONE_CENTER, me.pos)), k));
        this.hurry = true;
      }
    }
    if (this.retreating && target) this.hurry = true;
    want = add(want, this.dodge(e, me));
    this.steer(e, me, want, now);
  }

  /** Track rivals' velocity from what the bot has seen of them. */
  private observe(rivals: Player[], now: number) {
    for (const t of rivals) {
      const was = this.seen.get(t.id);
      if (!was || now - was.t > 0.5) {
        this.seen.set(t.id, { pos: { ...t.pos }, t: now, vel: { x: 0, y: 0 } });
        continue;
      }
      const dt = now - was.t;
      if (dt <= 0) continue;
      const raw = mul(sub(t.pos, was.pos), 1 / dt);
      const vel = length(raw) > 9 ? mul(unit(raw), 9) : raw;
      was.vel = add(mul(was.vel, 0.5), mul(vel, 0.5));
      was.pos = { ...t.pos };
      was.t = now;
    }
  }

  /** Where a rival will be `lead` seconds from now, leading imperfectly. */
  private predict(t: Player, lead: number): Vec {
    const v = this.seen.get(t.id)?.vel ?? { x: 0, y: 0 };
    return add(t.pos, mul(v, lead * between(this.random, TEMPER.lead)));
  }

  /** Close, weak and current rivals first; a rival ball carrier above all. */
  private pick(me: Player, rivals: Player[], carrier: string | null) {
    let best: Player | null = null,
      score = Infinity;
    for (const t of rivals) {
      const d = distance(me.pos, t.pos);
      // Out of notice range, unless it is carrying the ball.
      if (d > TEMPER.sight && t.id !== carrier) continue;
      const v =
        d -
        (1 - t.hp / FIGHTERS[t.fighter].hp) * 3 -
        (t.id === this.target ? 3 : 0) -
        (t.id === carrier ? 5 : 0);
      if (v < score) {
        score = v;
        best = t;
      }
    }
    return best;
  }

  /**
   * Hold the fighter's preferred distance: walk in, back off, and otherwise
   * stand its ground or sidestep now and then.
   */
  private approach(e: Engine, me: Player, t: Player): Vec {
    const f = FIGHTERS[me.fighter],
      style = f.bot;
    const to = sub(t.pos, me.pos),
      d = length(to),
      dir = unit(to);
    if (this.retreating) return mul(dir, -1);
    const keep = Math.max(1, style.keep * f.range);
    let want: Vec = { x: 0, y: 0 };
    if (!e.lineClear(me.pos, t.pos)) return this.toward(e, me, t.pos);
    else if (d > keep + 1) want = dir;
    else if (d < keep - 1) want = mul(dir, -0.8);
    return add(want, mul(left(dir), style.strafe * TEMPER.strafe * this.strafeSign));
  }

  /**
   * The way to `goal`: straight when a fighter's body clears the line,
   * otherwise along the grid route around cover.
   */
  private toward(e: Engine, me: Player, goal: Vec): Vec {
    const straight = unit(sub(goal, me.pos));
    const d = distance(me.pos, goal);
    if (d < 0.3) return { x: 0, y: 0 };
    if (!e.state.walls.length) return straight;
    const side = mul(left(straight), RULES.radius);
    if (
      d < 24 &&
      e.lineClear(me.pos, goal) &&
      e.lineClear(add(me.pos, side), add(goal, side)) &&
      e.lineClear(sub(me.pos, side), sub(goal, side))
    )
      return straight;
    const map = MAPS[e.state.mode],
      w = Math.floor(map.w),
      h = Math.floor(map.h);
    const cell = clamp(Math.floor(goal.y), 0, h - 1) * w + clamp(Math.floor(goal.x), 0, w - 1);
    const r = this.route;
    if (
      !r ||
      r.goal !== cell ||
      r.walls !== e.state.walls.length ||
      e.state.time - r.at > 3
    )
      this.route = routeField(e, goal);
    const dist = this.route?.dist;
    if (!dist) return straight;
    // Walk downhill from this cell, then aim at the farthest of the next few
    // cells still in a straight line, so the path is smooth, not stair-step.
    let x = clamp(Math.floor(me.pos.x), 0, w - 1),
      y = clamp(Math.floor(me.pos.y), 0, h - 1);
    if (dist[y * w + x] < 0) return straight;
    let next: Vec | null = null;
    for (let step = 0; step < 6 && dist[y * w + x] > 0; step++) {
      let bx = x,
        by = y;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx,
            ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const v = dist[ny * w + nx];
          if (v >= 0 && v < dist[by * w + bx]) {
            bx = nx;
            by = ny;
          }
        }
      if (bx === x && by === y) break;
      x = bx;
      y = by;
      const c = { x: x + 0.5, y: y + 0.5 };
      if (step === 0 || e.lineClear(me.pos, c)) next = c;
      else break;
    }
    return next ? unit(sub(next, me.pos)) : straight;
  }

  /**
   * Prey with a hunter in sight: hold the edge of its own range, poking
   * back, and break away to hide when hurt or when the hunter is far.
   */
  private evade(e: Engine, me: Player, t: Player, rivals: Player[]): Vec {
    const f = FIGHTERS[me.fighter];
    const to = sub(t.pos, me.pos),
      d = length(to),
      dir = unit(to);
    const side = mul(left(dir), f.bot.strafe * TEMPER.strafe * this.strafeSign);
    if (this.retreating) {
      this.hurry = true;
      return mul(dir, -1);
    }
    const keep = f.range * 0.95;
    if (d > keep + 2.5) return this.hide(e, me, rivals);
    if (d < keep - 0.5) {
      this.hurry = true;
      return add(mul(dir, -1), side);
    }
    return side;
  }

  /** Prey with no hunter in sight: get into a bush away from them and sit. */
  private hide(e: Engine, me: Player, rivals: Player[]): Vec {
    const bushes = MAPS[e.state.mode].bushes;
    if (!bushes.length) return this.wander(e, me);
    const center = (b: (typeof bushes)[number]) => ({
      x: b.x + b.w / 2,
      y: b.y + b.h / 2,
    });
    const exposed = (b: (typeof bushes)[number]) =>
      rivals.some((r) => distance(r.pos, center(b)) < 5);
    if (!this.den || exposed(this.den)) {
      let best = Infinity;
      this.den = null;
      for (const b of bushes) {
        if (exposed(b)) continue;
        const d = distance(me.pos, center(b));
        if (d < best) {
          best = d;
          this.den = b;
        }
      }
    }
    if (!this.den) return this.wander(e, me);
    const b = this.den,
      m = 0.35;
    if (
      me.pos.x > b.x + m &&
      me.pos.x < b.x + b.w - m &&
      me.pos.y > b.y + m &&
      me.pos.y < b.y + b.h - m
    )
      return { x: 0, y: 0 };
    return this.toward(e, me, center(b));
  }

  /**
   * A hunter with no prey in sight: run to where one was last seen, then
   * sweep the bushes, where hiding prey sit.
   */
  private search(e: Engine, me: Player): Vec {
    const s = e.state;
    let trail: Vec | null = null,
      best = Infinity;
    for (const [id, v] of this.seen) {
      const p = s.players.find((x) => x.id === id);
      if (!p?.alive || e.allies(me, p) || s.time - v.t > 4) continue;
      const d = distance(me.pos, v.pos);
      if (d > 1.5 && d < best) {
        best = d;
        trail = v.pos;
      }
    }
    if (trail) {
      this.aim = unit(sub(trail, me.pos));
      return this.toward(e, me, trail);
    }
    const bushes = MAPS[s.mode].bushes;
    if (
      bushes.length &&
      (!this.waypoint ||
        s.time >= this.waypointUntil ||
        distance(me.pos, this.waypoint) < 1.2)
    ) {
      const b = bushes[Math.floor(this.random() * bushes.length) % bushes.length];
      this.waypoint = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
      this.waypointUntil = s.time + 8;
    }
    return this.wander(e, me);
  }

  /** Fire when the attack's exact footprint covers where the rival will be. */
  private tryAttack(e: Engine, me: Player, t: Player) {
    const s = e.state,
      f = FIGHTERS[me.fighter],
      attack = f.abilities.attack;
    const d0 = distance(me.pos, t.pos);
    const at = this.predict(t, attackLead(f, d0));
    const rel = sub(at, me.pos);
    const d = length(rel);
    // It decides on the aim it means; a casual player's hand then sends
    // the shot a little to either side, so some shots really miss.
    const meant = unit(rel);
    this.aim = rotate(meant, (this.random() * 2 - 1) * TEMPER.aimError);
    this.power = attack.kind === "lob" ? clamp(d / f.range, 0.35, 1) : 0.35;
    if (me.ammo < 1 || s.time - me.lastAttack < RULES.attackInterval) return;
    if (s.time < this.shotAt) return;
    const shape = aimPreviewFor(me.fighter, "attack", false, this.power);
    if (footprintEdge(shape, toFootprint(rel, meant)) < 0.1) return;
    if (attack.kind !== "lob" && !e.lineClear(me.pos, t.pos)) return;
    // Trigger discipline: not every chance, and a breath between shots.
    if (this.random() < TEMPER.trigger) {
      this.fire = true;
      this.shotAt =
        s.time + RULES.attackInterval + between(this.random, TEMPER.shotRest);
    }
  }

  /** Use the Super when its data says this is the moment for it. */
  private trySuper(e: Engine, me: Player, t: Player | null, rivals: Player[]) {
    const s = e.state,
      f = FIGHTERS[me.fighter],
      spec = f.abilities.super;
    if (me.charge < RULES.superCharge || s.ball.carrier === me.id) return false;
    // A ready Super is not always used the moment it could be.
    if (this.random() >= TEMPER.superChance) return false;
    const uses = superUses(spec);
    const shape = aimPreviewFor(me.fighter, "super");
    const share = me.hp / f.hp;
    const cast = (aim: Vec) => {
      this.aim = unit(aim);
      this.cast = true;
      return true;
    };
    if (uses.includes("mend")) {
      const hurtAlly = s.players.some(
        (a) =>
          a.alive &&
          a.id !== me.id &&
          e.allies(me, a) &&
          a.hp / FIGHTERS[a.fighter].hp < 0.5 &&
          (shape.kind === "global" ||
            footprintEdge(shape, toFootprint(sub(a.pos, me.pos), this.aim)) > 0),
      );
      if (share < 0.55 || hurtAlly)
        // A placed station goes behind a retreating bot, so it walks in.
        return cast(t ? (this.retreating ? sub(me.pos, t.pos) : sub(t.pos, me.pos)) : this.aim);
    }
    if (!t) return false;
    const d = distance(me.pos, t.pos);
    const clear = e.lineClear(me.pos, t.pos);
    if (uses.includes("strike")) {
      const overWalls = spec.kind === "leap" || (spec.kind === "burst" && spec.overWalls);
      const at = this.predict(t, superLead(spec, d));
      const aim = unit(sub(at, me.pos));
      const inside = (p: Player) =>
        footprintEdge(shape, toFootprint(sub(p === t ? at : p.pos, me.pos), aim)) > 0.15;
      if ((overWalls || clear) && rivals.some(inside)) return cast(aim);
    }
    if (uses.includes("summon") && spec.kind === "zone") {
      const chase = AREAS[spec.area].chase!;
      if (clear && d < chase.sight) return cast(sub(t.pos, me.pos));
    }
    if (uses.includes("guard") && clear && d < f.range + 1 && s.time - this.hurtAt < 1.5)
      return cast(sub(t.pos, me.pos));
    return false;
  }

  /**
   * No rival in sight: roam a few steps from where it stands, resting at
   * each point. In Showdown the points stay inside the zone.
   */
  private wander(e: Engine, me: Player): Vec {
    const s = e.state;
    if (s.time < this.restUntil) return { x: 0, y: 0 };
    const arrived = !!this.waypoint && distance(me.pos, this.waypoint) < 1.2;
    if (arrived) {
      this.waypoint = null;
      this.restUntil = s.time + between(this.random, TEMPER.rest);
      return { x: 0, y: 0 };
    }
    if (!this.waypoint || s.time >= this.waypointUntil) {
      const map = MAPS[s.mode];
      this.waypoint = null;
      for (let i = 0; i < 12 && !this.waypoint; i++) {
        const a = this.random() * Math.PI * 2,
          k = (0.4 + 0.6 * this.random()) * TEMPER.roam;
        const c = this.inside(
          s.mode,
          add(me.pos, { x: Math.cos(a) * k, y: Math.sin(a) * k }),
          s.zone,
          map,
        );
        if (e.valid(c)) this.waypoint = c;
      }
      this.waypoint ??= s.mode === "showdown" ? ZONE_CENTER : { x: map.w / 2, y: map.h / 2 };
      this.waypointUntil = s.time + 6;
    }
    const to = sub(this.waypoint, me.pos);
    if (length(to) > 0.1) this.aim = unit(to);
    return this.toward(e, me, this.waypoint);
  }

  /** Keep a roaming point on the map, and in Showdown well inside the zone. */
  private inside(mode: string, p: Vec, zone: number, map: { w: number; h: number }): Vec {
    let q = { x: clamp(p.x, 1, map.w - 1), y: clamp(p.y, 1, map.h - 1) };
    if (mode === "showdown") {
      const r = Math.max(1, zone * 0.7);
      const off = sub(q, ZONE_CENTER);
      if (length(off) > r) q = add(ZONE_CENTER, mul(unit(off), r));
    }
    return q;
  }

  /**
   * Broomball without the ball: the teammate nearest a loose ball chases
   * it; while the ball threatens our goal, the bot teammate nearest our
   * goal keeps it; everyone else fights.
   */
  private playBall(e: Engine, me: Player, fight: Vec): Vec {
    const s = e.state,
      b = s.ball;
    if (b.state === "resetting") return fight;
    const team = s.players.filter((p) => p.alive && p.team === me.team);
    const where = add(b.pos, mul(b.velocity, 0.25));
    const nearest = (to: Vec, from: Player[]) =>
      from.reduce<Player | null>(
        (best, p) =>
          !best || distance(p.pos, to) < distance(best.pos, to) ? p : best,
        null,
      );
    const own = { x: me.team === 0 ? 0 : MAPS.broomball.w, y: 10 };
    // A shot flying at our goal: the bot nearest the goal steps into its path.
    const incoming =
      !b.carrier &&
      Math.abs(b.velocity.x) > 2 &&
      b.velocity.x * (own.x - b.pos.x) > 0;
    if (incoming && nearest(own, team.filter((p) => p.bot))?.id === me.id) {
      const lineX = own.x === 0 ? 1.2 : 32.8;
      const t = (lineX - b.pos.x) / b.velocity.x;
      const y = clamp(b.pos.y + b.velocity.y * t, GOAL_Y[0] - 1, GOAL_Y[1] + 1);
      const to = sub({ x: lineX, y }, me.pos);
      this.hurry = true;
      return length(to) > 0.2 ? unit(to) : { x: 0, y: 0 };
    }
    const chaser = b.carrier ? null : nearest(where, team);
    if (chaser?.id === me.id || (!b.carrier && distance(me.pos, where) < 3.5)) {
      this.hurry = true;
      return add(unit(sub(where, me.pos)), mul(fight, 0.25));
    }
    const carrier = s.players.find((p) => p.id === b.carrier);
    const threat = carrier
      ? carrier.team !== me.team
      : Math.abs(b.pos.x - own.x) < 17;
    const keeper =
      threat && nearest(own, team.filter((p) => p.bot && p !== chaser));
    if (keeper && keeper.id === me.id) {
      this.hurry = true;
      const spot = add(own, mul(unit(sub(b.pos, own)), 1.6));
      const to = sub(spot, me.pos);
      return length(to) > 0.4 ? add(unit(to), mul(fight, 0.3)) : mul(fight, 0.3);
    }
    return fight;
  }

  /** Carry the ball at the rival goal and shoot once it is in range. */
  private runBall(me: Player, rivals: Player[]): Vec {
    const goalX = me.team === 0 ? MAPS.broomball.w : 0;
    const goal = { x: goalX, y: 10 };
    this.hurry = true;
    let want = unit(sub(goal, me.pos));
    for (const r of rivals) {
      const rel = sub(r.pos, me.pos);
      const ahead = rel.x * want.x + rel.y * want.y;
      const side = want.x * rel.y - want.y * rel.x;
      if (ahead > 0 && ahead < 3 && Math.abs(side) < 1.4)
        want = add(want, mul(left(want), side > 0 ? -0.9 : 0.9));
    }
    const y = GOAL_Y[0] + this.random() * (GOAL_Y[1] - GOAL_Y[0]);
    this.aim = unit({ x: goalX - me.pos.x, y: y - me.pos.y });
    if (Math.abs(goalX - me.pos.x) < 10 && this.random() < 0.6) {
      this.power = 1;
      this.fire = true;
    }
    return want;
  }

  /** Step out of the way of rival shots, beams and landing spots. */
  private dodge(e: Engine, me: Player): Vec {
    if (this.random() >= TEMPER.dodge) return { x: 0, y: 0 };
    const s = e.state;
    let out: Vec = { x: 0, y: 0 };
    const rival = (id: string) => {
      const o = s.players.find((p) => p.id === id);
      return !!o && !e.allies(me, o);
    };
    const line = (from: Vec, dir: Vec, reach: number) => {
      const rel = sub(me.pos, from);
      const along = rel.x * dir.x + rel.y * dir.y;
      const side = dir.x * rel.y - dir.y * rel.x;
      if (along > 0 && along < reach && Math.abs(side) < 0.95)
        out = add(out, mul(left(dir), side >= 0 ? 1.4 : -1.4));
    };
    for (const q of s.projectiles)
      if (!q.lob && rival(q.owner)) line(q.pos, q.dir, 4.5);
    for (const fx of s.effects) {
      if (!fx.owner || !rival(fx.owner)) continue;
      if (fx.kind === "beam" && !fx.value) line(fx.pos, fx.dir, 12);
      else if (
        (fx.kind === "lob" || fx.kind === "marker" || fx.kind === "leap") &&
        distance(me.pos, fx.pos) < (fx.value ?? 1) + 0.8
      )
        out = add(out, mul(unit(sub(me.pos, fx.pos)), 1.4));
    }
    if (length(out) > 0) this.hurry = true;
    return out;
  }

  /** Turn the wish into a move that slides around cover and out of corners. */
  private steer(e: Engine, me: Player, want: Vec, now: number) {
    if (length(want) < 0.15) {
      this.move = { x: 0, y: 0 };
      this.last = { ...me.pos };
      this.stuck = 0;
      return;
    }
    let dir = unit(want);
    if (this.detour && now < this.detourUntil)
      dir = unit(add(dir, mul(this.detour, 1.5)));
    const open = (d: Vec) => e.valid(add(me.pos, mul(d, 0.7)));
    const hand = this.strafeSign || 1;
    if (!open(dir))
      for (const a of [0.6, 1.2, 1.8, 2.4]) {
        const turn = rotate(dir, a * hand);
        if (open(turn)) {
          dir = turn;
          break;
        }
        const other = rotate(dir, -a * hand);
        if (open(other)) {
          dir = other;
          break;
        }
      }
    // Walking covers less ground per plan, so "stuck" scales with the pace.
    const pace = this.hurry ? 1 : TEMPER.walk;
    if (this.last && distance(this.last, me.pos) < 0.08 * pace) this.stuck++;
    else this.stuck = 0;
    if (this.stuck >= 3) {
      this.detour = rotate(dir, (Math.PI / 2) * (this.random() < 0.5 ? 1 : -1));
      this.detourUntil = now + 0.8;
      this.stuck = 0;
    }
    this.last = { ...me.pos };
    this.move = mul(dir, pace);
  }
}
