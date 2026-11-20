import {
  AREAS,
  FIGHTERS,
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
 */

/** Ticks between plans (10 Hz at the 30 Hz simulation); input goes every tick. */
const THINK_EVERY = 3;
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
  private strafeSign: 1 | -1 = 1;
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
  private seen = new Map<string, Seen>();

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
    const share = me.hp / f.hp;
    if (share < style.retreat) this.retreating = true;
    else if (share > Math.min(0.95, style.retreat + 0.3))
      this.retreating = false;
    if (now >= this.strafeUntil) {
      this.strafeSign = this.random() < 0.5 ? 1 : -1;
      this.strafeUntil = now + 0.7 + this.random() * 1.3;
    }

    const rivals = s.players.filter(
      (t) => t.alive && !e.allies(me, t) && !e.concealed(t, me.pos),
    );
    this.observe(rivals, now);
    const ball = s.ball;
    const broomball = s.mode === "broomball";
    const carrying = broomball && ball.carrier === me.id;
    const target = this.pick(me, rivals, broomball ? ball.carrier : null);
    this.target = target?.id ?? null;

    let want: Vec = { x: 0, y: 0 };
    if (carrying) want = this.runBall(me, rivals);
    else {
      if (target) {
        want = this.approach(e, me, target);
        if (!this.trySuper(e, me, target, rivals)) this.tryAttack(e, me, target);
      } else {
        this.trySuper(e, me, null, rivals);
        want = this.wander(e, me);
      }
      if (broomball) want = this.playBall(e, me, want);
    }
    if (s.mode === "showdown") {
      // The zone hurts more every stage: stay well inside it.
      const d = distance(me.pos, ZONE_CENTER);
      const k = clamp((d - (s.zone - 2.5)) / 2, 0, 2.5);
      if (k > 0) want = add(want, mul(unit(sub(ZONE_CENTER, me.pos)), k));
    }
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
    return add(t.pos, mul(v, lead * (0.55 + this.random() * 0.45)));
  }

  /** Close, weak and current rivals first; a rival ball carrier above all. */
  private pick(me: Player, rivals: Player[], carrier: string | null) {
    let best: Player | null = null,
      score = Infinity;
    for (const t of rivals) {
      const d = distance(me.pos, t.pos);
      if (d > 16) continue;
      const v =
        d -
        (1 - t.hp / FIGHTERS[t.fighter].hp) * 3 -
        (t.id === this.target ? 1.5 : 0) -
        (t.id === carrier ? 5 : 0);
      if (v < score) {
        score = v;
        best = t;
      }
    }
    return best;
  }

  /** Hold the fighter's preferred distance, sidestepping as it fights. */
  private approach(e: Engine, me: Player, t: Player): Vec {
    const f = FIGHTERS[me.fighter],
      style = f.bot;
    const to = sub(t.pos, me.pos),
      d = length(to),
      dir = unit(to);
    if (this.retreating) return add(mul(dir, -1.2), mul(left(dir), 0.4 * this.strafeSign));
    const keep = Math.max(1, style.keep * f.range);
    let want: Vec = { x: 0, y: 0 };
    if (!e.lineClear(me.pos, t.pos)) want = dir;
    else if (d > keep + 0.6) want = dir;
    else if (d < keep - 0.6) want = mul(dir, -0.8);
    return add(want, mul(left(dir), style.strafe * this.strafeSign));
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
    // A little hand shake, so a bot can be outplayed.
    this.aim = rotate(unit(rel), (this.random() - 0.5) * 0.12);
    this.power = attack.kind === "lob" ? clamp(d / f.range, 0.35, 1) : 0.35;
    if (me.ammo < 1 || s.time - me.lastAttack < RULES.attackInterval) return;
    const shape = aimPreviewFor(me.fighter, "attack", false, this.power);
    if (footprintEdge(shape, toFootprint(rel, this.aim)) < 0.1) return;
    if (attack.kind !== "lob" && !e.lineClear(me.pos, t.pos)) return;
    // Trigger discipline: not every chance, so shots come at a human pace.
    if (this.random() < 0.7) this.fire = true;
  }

  /** Use the Super when its data says this is the moment for it. */
  private trySuper(e: Engine, me: Player, t: Player | null, rivals: Player[]) {
    const s = e.state,
      f = FIGHTERS[me.fighter],
      spec = f.abilities.super;
    if (me.charge < RULES.superCharge || s.ball.carrier === me.id) return false;
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

  /** No rival in sight: drift toward open ground near the middle. */
  private wander(e: Engine, me: Player): Vec {
    const s = e.state;
    if (
      !this.waypoint ||
      s.time >= this.waypointUntil ||
      distance(me.pos, this.waypoint) < 1.5
    ) {
      const center =
        s.mode === "showdown" ? ZONE_CENTER : { x: 17, y: 10 };
      const r = s.mode === "showdown" ? Math.min(8, s.zone * 0.6) : 6;
      this.waypoint = null;
      for (let i = 0; i < 10 && !this.waypoint; i++) {
        const a = this.random() * Math.PI * 2,
          k = Math.sqrt(this.random()) * r;
        const c = add(center, { x: Math.cos(a) * k, y: Math.sin(a) * k });
        if (e.valid(c)) this.waypoint = c;
      }
      this.waypoint ??= center;
      this.waypointUntil = s.time + 5;
    }
    const to = sub(this.waypoint, me.pos);
    if (length(to) > 0.1) this.aim = unit(to);
    return unit(to);
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
    const own = { x: me.team === 0 ? 0 : 34, y: 10 };
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
      return length(to) > 0.2 ? unit(to) : { x: 0, y: 0 };
    }
    const chaser = b.carrier ? null : nearest(where, team);
    if (chaser?.id === me.id || (!b.carrier && distance(me.pos, where) < 3.5))
      return add(unit(sub(where, me.pos)), mul(fight, 0.25));
    const carrier = s.players.find((p) => p.id === b.carrier);
    const threat = carrier
      ? carrier.team !== me.team
      : Math.abs(b.pos.x - own.x) < 17;
    const keeper =
      threat && nearest(own, team.filter((p) => p.bot && p !== chaser));
    if (keeper && keeper.id === me.id) {
      const spot = add(own, mul(unit(sub(b.pos, own)), 1.6));
      const to = sub(spot, me.pos);
      return length(to) > 0.4 ? add(unit(to), mul(fight, 0.3)) : mul(fight, 0.3);
    }
    return fight;
  }

  /** Carry the ball at the rival goal and shoot once it is in range. */
  private runBall(me: Player, rivals: Player[]): Vec {
    const goalX = me.team === 0 ? 34 : 0;
    const goal = { x: goalX, y: 10 };
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
    if (this.random() < 0.35) return { x: 0, y: 0 };
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
        out = add(out, mul(left(dir), side >= 0 ? 1.6 : -1.6));
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
        out = add(out, mul(unit(sub(me.pos, fx.pos)), 1.6));
    }
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
    if (!open(dir))
      for (const a of [0.6, 1.2, 1.8, 2.4]) {
        const turn = rotate(dir, a * this.strafeSign);
        if (open(turn)) {
          dir = turn;
          break;
        }
        const other = rotate(dir, -a * this.strafeSign);
        if (open(other)) {
          dir = other;
          break;
        }
      }
    if (this.last && distance(this.last, me.pos) < 0.08) this.stuck++;
    else this.stuck = 0;
    if (this.stuck >= 3) {
      this.detour = rotate(dir, (Math.PI / 2) * (this.random() < 0.5 ? 1 : -1));
      this.detourUntil = now + 0.8;
      this.stuck = 0;
    }
    this.last = { ...me.pos };
    this.move = dir;
  }
}
