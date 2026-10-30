import {
  FIGHTERS,
  MAPS,
  RULES,
  add,
  sub,
  mul,
  unit,
  length,
  distance,
  clamp,
  finiteVec,
  segmentDistance,
  type Vec,
  type Mode,
} from "./definitions";
import type {
  Member,
  Player,
  Input,
  Match,
  Projectile,
  Effect,
  GameEvent,
  GameEventType,
} from "./types";
const emptyStats = () => ({
  kills: 0,
  deaths: 0,
  damage: 0,
  received: 0,
  healing: 0,
  goals: 0,
  assists: 0,
  survived: 0,
});
interface History {
  t: number;
  pos: Vec;
  hp: number;
}
interface Pending {
  at: number;
  id: string;
  kind: "photo" | "dash";
  pos: Vec;
  dir: Vec;
}
interface Dash {
  id: string;
  remaining: number;
  dir: Vec;
  hit: Set<string>;
}
/** Transport independent authority. Call step exactly once per fixed simulation tick. */
export class Engine {
  state: Match;
  inputs = new Map<string, Input>();
  histories = new Map<string, History[]>();
  /** Highest input sequence processed per player, echoed back as ackSeq. */
  lastSeq = new Map<string, number>();
  /** Sim time at which each player's acknowledged input arrived. */
  lastSeqAt = new Map<string, number>();
  pending: Pending[] = [];
  dashes: Dash[] = [];
  private serial = 0;
  constructor(mode: Mode, members: Member[]) {
    const map = MAPS[mode];
    let blue = 0,
      red = 3;
    const players = members.map((m, i): Player => {
      const f = FIGHTERS[m.fighter];
      const spawnIndex =
        mode === "showdown" ? i : m.team === 0 ? blue++ : red++;
      // Fall back to a valid spawn if a roster ever exceeds the authored
      // spawn points (e.g. uneven broomball teams with no minimum).
      const spawn =
        map.spawns[spawnIndex] ?? map.spawns[spawnIndex % map.spawns.length];
      return {
        ...m,
        pos: { ...spawn },
        aim: { x: m.team === 0 ? 1 : -1, y: 0 },
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
      phaseUntil: 3,
      players,
      projectiles: [],
      areas: [],
      effects: [],
      events: [],
      walls: structuredClone(map.walls),
      zone: 22,
      score: [0, 0],
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
      ackAge: 0,
    };
  }
  get playerList() {
    return this.state.players;
  }
  allies(a: Player, b: Player) {
    return (
      a.id === b.id || (this.state.mode === "broomball" && a.team === b.team)
    );
  }
  setInput(id: string, input: Input) {
    if (!input || !finiteVec(input.move) || !finiteVec(input.aim)) return false;
    const m = length(input.move) > 1 ? unit(input.move) : input.move;
    const previous = this.inputs.get(id);
    // Record the highest processed sequence (monotonic) for acknowledgement.
    if (typeof input.seq === "number" && Number.isFinite(input.seq)) {
      const prevSeq = this.lastSeq.get(id) ?? 0;
      if (input.seq > prevSeq) {
        this.lastSeq.set(id, input.seq);
        // Inputs arrive between ticks; state.time is the last tick, so every
        // later tick applies this input and ackAge equals applied duration.
        this.lastSeqAt.set(id, this.state.time);
      }
    }
    this.inputs.set(id, {
      move: m,
      aim: unit(input.aim),
      attack: input.attack === true || previous?.attack === true,
      super: input.super === true || previous?.super === true,
      power:
        previous?.attack && !input.attack
          ? previous.power
          : clamp(Number.isFinite(input.power) ? input.power! : 0.35, 0.35, 1),
    });
    return true;
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
  move(p: Player, delta: Vec) {
    // Substeps prevent charges and knockback from crossing thin cover.
    const n = Math.max(1, Math.ceil(length(delta) / 0.18));
    for (let i = 0; i < n; i++) {
      const dx = delta.x / n,
        dy = delta.y / n;
      if (this.valid({ x: p.pos.x + dx, y: p.pos.y })) p.pos.x += dx;
      if (this.valid({ x: p.pos.x, y: p.pos.y + dy })) p.pos.y += dy;
    }
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
  ) {
    this.state.events.push({
      id: ++this.serial,
      tick: this.state.tick,
      type,
      owner,
      pos: { ...pos },
      ...(dir ? { dir: { ...dir } } : {}),
      ...(value !== undefined ? { value } : {}),
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
          source.charge + actual * 0.6,
        );
    }
  }
  damage(target: Player, amount: number, source?: Player, isSuper = false) {
    const s = this.state;
    if (!target.alive || s.time < target.protectedUntil || amount <= 0)
      return false;
    const actual = Math.min(target.hp, amount);
    target.hp -= actual;
    target.stats.received += actual;
    target.quietSince = s.time;
    if (source && source.id !== target.id) {
      source.stats.damage += actual;
      if (!isSuper) source.charge = Math.min(5000, source.charge + actual);
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
    p.stats.deaths++;
    p.stats.survived = Math.max(0, this.state.time - 3);
    p.respawn = this.state.time + 3;
    p.placement = this.state.players.filter((x) => x.alive).length + 1;
    if (source && source.id !== p.id) source.stats.kills++;
    this.dropBall(p);
    this.effect("eliminated", p.pos, p.id);
    this.emit("fighter_eliminated", p.pos, p.id, undefined, source?.id ? 1 : 0);
    this.state.notice = `${p.name} eliminated`;
  }
  disconnect(id: string) {
    const p = this.state.players.find((x) => x.id === id);
    if (p) {
      p.connected = false;
      this.inputs.delete(id);
      this.dropBall(p);
    }
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
  private attack(p: Player) {
    const s = this.state,
      f = FIGHTERS[p.fighter];
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
    if (p.fighter === "josh") {
      this.effect("cone", p.pos, p.id, p.aim);
      for (const t of s.players) {
        const d = sub(t.pos, p.pos);
        if (
          t.alive &&
          !this.allies(p, t) &&
          length(d) <= f.range + RULES.radius &&
          Math.acos(clamp(unit(d).x * p.aim.x + unit(d).y * p.aim.y, -1, 1)) <=
            Math.PI / 9 &&
          this.lineClear(p.pos, t.pos)
        )
          this.damage(t, f.damage, p);
      }
      for (const a of s.areas) {
        const owner = s.players.find((x) => x.id === a.owner);
        const d = sub(a.pos, p.pos);
        if (
          a.kind === "table" &&
          owner &&
          !this.allies(p, owner) &&
          length(d) <= f.range &&
          Math.acos(clamp(unit(d).x * p.aim.x + unit(d).y * p.aim.y, -1, 1)) <=
            Math.PI / 9 &&
          this.lineClear(p.pos, a.pos)
        )
          a.hp -= f.damage;
      }
      return;
    }
    const angles =
      p.fighter === "daniel"
        ? [-0.25, -0.125, 0, 0.125, 0.25]
        : p.fighter === "ethan"
          ? [-0.055, 0.055]
          : [0];
    for (const angle of angles) {
      const a = Math.atan2(p.aim.y, p.aim.x) + angle;
      const dir = { x: Math.cos(a), y: Math.sin(a) };
      s.projectiles.push({
        id: ++this.serial,
        owner: p.id,
        fighter: p.fighter,
        pos: { ...p.pos },
        dir,
        remaining: f.range,
        traveled: 0,
        bounces: p.fighter === "elijah" ? 1 : 0,
      });
      this.emit("projectile_spawned", p.pos, p.id, dir);
    }
  }
  activateSuper(p: Player) {
    const s = this.state;
    if (
      !p.alive ||
      p.charge < 5000 ||
      s.time < p.stunUntil ||
      s.ball.carrier === p.id
    )
      return false;
    let pos = add(p.pos, mul(p.aim, 4));
    const m = MAPS[s.mode];
    pos = { x: clamp(pos.x, 0.5, m.w - 0.5), y: clamp(pos.y, 0.5, m.h - 0.5) };
    if (p.fighter === "ethan") {
      this.effect("aura", p.pos, p.id, p.aim, undefined, 0.6);
      for (const target of s.players) {
        if (
          !target.alive ||
          distance(p.pos, target.pos) > 4 ||
          !this.lineClear(p.pos, target.pos)
        )
          continue;
        if (!this.allies(p, target)) this.damage(target, target.hp, p, true);
      }
    } else if (p.fighter === "elijah") {
      const hist = this.histories.get(p.id) || [];
      const past = hist
        .filter((h) => h.t <= s.time - 2 && this.valid(h.pos))
        .at(-1);
      if (!past) return false;
      const old = { ...p.pos };
      p.pos = { ...past.pos };
      this.heal(p, Math.min(2500, Math.max(0, past.hp - p.hp)), p, false);
      this.effect("glitch", old, p.id, p.aim, undefined, 0.65);
      for (const t of s.players)
        if (
          t.alive &&
          !this.allies(p, t) &&
          distance(old, t.pos) <= 3 &&
          this.lineClear(old, t.pos)
        )
          this.damage(t, 1200, p, true);
    } else if (p.fighter === "brandon" || p.fighter === "samuel") {
      // A placement behind a wall is rejected without consuming charge.
      if (!this.valid(pos, 0.3) || !this.lineClear(p.pos, pos)) return false;
      s.areas.push({
        id: ++this.serial,
        owner: p.id,
        kind: p.fighter === "brandon" ? "welcome" : "table",
        pos,
        radius: p.fighter === "brandon" ? 3.5 : 3,
        end: s.time + (p.fighter === "brandon" ? 5 : 6),
        hp: p.fighter === "samuel" ? 2000 : Infinity,
      });
    } else if (p.fighter === "rich" || p.fighter === "daniel") {
      this.pending.push({
        at: s.time + (p.fighter === "rich" ? 0.35 : 0.3),
        id: p.id,
        kind: p.fighter === "rich" ? "photo" : "dash",
        pos: { ...p.pos },
        dir: { ...p.aim },
      });
      this.effect(
        p.fighter === "rich" ? "photo" : "van",
        p.pos,
        p.id,
        p.aim,
        undefined,
        0.35,
      );
    } else {
      this.effect("sound", p.pos, p.id, p.aim, undefined, 0.6);
      this.rectangle(p, p.pos, p.aim, 10, 4, 1400, 0, 3);
    }
    this.emit("super_started", p.pos, p.id, p.aim);
    // Instant supers resolve on the same tick they start; rich/daniel resolve
    // later from the pending queue and emit super_resolved there.
    if (p.fighter !== "rich" && p.fighter !== "daniel")
      this.emit("super_resolved", p.pos, p.id, p.aim);
    p.charge = 0;
    p.protectedUntil = 0;
    return true;
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
  ) {
    for (const t of this.state.players) {
      if (!t.alive || this.allies(owner, t)) continue;
      const d = sub(t.pos, pos),
        along = d.x * dir.x + d.y * dir.y,
        across = Math.abs(d.x * dir.y - d.y * dir.x);
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
      }
    }
  }
  private projectiles(dt: number) {
    const s = this.state;
    const surviving: Projectile[] = [];
    for (const q of s.projectiles) {
      const owner = s.players.find((p) => p.id === q.owner);
      if (!owner) continue;
      const f = FIGHTERS[q.fighter];
      let dead = false;
      const dist = Math.min(f.projectileSpeed * dt, q.remaining);
      const steps = Math.max(1, Math.ceil(dist / 0.12));
      for (let i = 0; i < steps && !dead; i++) {
        const old = { ...q.pos };
        const next = add(old, mul(q.dir, dist / steps));
        q.remaining -= dist / steps;
        q.traveled += dist / steps;
        const m = MAPS[s.mode];
        const wall = s.walls.find(
          (w) =>
            next.x >= w.x &&
            next.x <= w.x + w.w &&
            next.y >= w.y &&
            next.y <= w.y + w.h,
        );
        const boundary =
          next.x < 0 || next.y < 0 || next.x > m.w || next.y > m.h;
        if (wall || boundary) {
          if (wall?.hp !== undefined) {
            wall.hp -= f.damage;
            if (wall.hp <= 0) s.walls = s.walls.filter((w) => w.id !== wall.id);
          }
          if (q.bounces > 0) {
            q.bounces--;
            const hitX = wall
              ? old.x <= wall.x || old.x >= wall.x + wall.w
              : next.x < 0 || next.x > m.w;
            if (hitX) q.dir.x *= -1;
            else q.dir.y *= -1;
          } else dead = true;
          continue;
        }
        q.pos = next;
        for (const a of s.areas) {
          if (a.kind !== "table" || distance(a.pos, q.pos) > 0.65) continue;
          const ap = s.players.find((p) => p.id === a.owner);
          if (ap && !this.allies(owner, ap)) {
            a.hp -= f.damage;
            dead = true;
            break;
          }
        }
        if (dead) break;
        for (const t of s.players) {
          if (
            !t.alive ||
            t.id === owner.id ||
            distance(q.pos, t.pos) > RULES.radius + 0.13
          )
            continue;
          if (this.allies(owner, t)) {
            if (q.fighter === "samuel" && t.hp < FIGHTERS[t.fighter].hp) {
              this.heal(t, 850, owner);
              this.effect("heal", t.pos, owner.id, t.aim, 850);
              this.emit("heal_applied", t.pos, owner.id, t.aim, 850);
              dead = true;
              break;
            }
            continue;
          }
          const bonus =
            q.fighter === "rich" && q.traveled >= f.range * 0.8 ? 200 : 0;
          if (
            this.damage(t, f.damage + bonus, owner) &&
            q.fighter === "brandon"
          )
            t.revealUntil = s.time + 4;
          dead = true;
          break;
        }
      }
      if (!dead && q.remaining > 0) surviving.push(q);
    }
    s.projectiles = surviving;
    s.areas = s.areas.filter((a) => a.hp > 0 && a.end > s.time);
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
    if (s.mode === "showdown")
      survivors.forEach((p, i) => (p.placement = i + 1));
    for (const p of survivors) p.stats.survived = Math.max(0, s.time - 3);
  }
  step(dt = 1 / RULES.tick) {
    const s = this.state;
    if (s.phase === "finished") return;
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
      } else return;
    }
    if (s.phase === "goal") {
      if (s.time >= s.phaseUntil) {
        this.kickoff();
        s.phase = "playing";
        s.notice = "Go!";
      } else return;
    }
    for (const p of s.players) {
      if (!p.alive) {
        if (s.mode === "broomball" && p.connected && s.time >= p.respawn) {
          const sp = MAPS.broomball.spawns[p.team === 0 ? 0 : 3];
          p.pos = { ...sp };
          p.hp = FIGHTERS[p.fighter].hp;
          p.ammo = FIGHTERS[p.fighter].ammo;
          p.reload = 0;
          p.alive = true;
          p.protectedUntil = s.time + RULES.protection;
          p.quietSince = s.time;
          this.histories.delete(p.id);
        } else continue;
      }
      const f = FIGHTERS[p.fighter],
        input = this.inputs.get(p.id);
      p.slow = 0;
      for (const a of s.areas) {
        if (a.end <= s.time) continue;
        const owner = s.players.find((x) => x.id === a.owner);
        if (!owner || distance(p.pos, a.pos) > a.radius) continue;
        if (this.allies(owner, p))
          this.heal(p, (a.kind === "welcome" ? 220 : 350) * dt, owner, false);
        else if (a.kind === "welcome") p.slow = 0.3;
      }
      if (input && p.connected && s.time >= p.stunUntil) {
        p.aim = input.aim;
        this.move(p, mul(input.move, f.speed * (1 - p.slow) * dt));
        if (input.super) this.activateSuper(p);
        if (input.attack) this.attack(p);
      }
      if (input) {
        input.attack = false;
        input.super = false;
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
    for (const item of this.pending.filter((x) => x.at <= s.time)) {
      const p = s.players.find((x) => x.id === item.id);
      if (!p?.alive) continue;
      if (item.kind === "photo") {
        this.rectangle(p, item.pos, item.dir, 8, 5, 900, 0.75, 0);
        this.effect("photo", item.pos, p.id, item.dir, 1, 0.4);
        this.emit("super_resolved", item.pos, p.id, item.dir);
      } else {
        this.dashes.push({
          id: p.id,
          remaining: 10,
          dir: item.dir,
          hit: new Set(),
        });
        this.emit("super_resolved", p.pos, p.id, item.dir);
      }
    }
    this.pending = this.pending.filter((x) => x.at > s.time);
    for (const dash of this.dashes) {
      const p = s.players.find((x) => x.id === dash.id);
      if (!p?.alive || s.time < p.stunUntil) {
        dash.remaining = 0;
        continue;
      }
      const step = Math.min(22 * dt, dash.remaining);
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
          if (this.damage(t, 1400, p, true)) this.knock(t, dash.dir, 2);
        }
    }
    this.dashes = this.dashes.filter((d) => d.remaining > 0);
    this.projectiles(dt);
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
      else if (elapsed >= 210) {
        const sorted = alive.sort(
          (a, b) =>
            b.hp / FIGHTERS[b.fighter].hp - a.hp / FIGHTERS[a.fighter].hp ||
            b.stats.damage - a.stats.damage ||
            a.id.localeCompare(b.id),
        );
        this.finish(sorted[0].id);
      }
    } else if (elapsed >= 150 && !s.overtime) {
      if (s.score[0] === s.score[1]) {
        s.overtime = true;
        s.notice = "Golden goal • 30 seconds";
      } else this.finish(s.score[0] > s.score[1] ? "blue" : "red");
    } else if (s.overtime && elapsed >= 180) this.finish(null);
  }
  /** Conceal enemies in bushes, except near allies or while marked. Dead participants spectate all. */
  snapshot(viewerId: string): Match {
    const s = this.state,
      viewer = s.players.find((p) => p.id === viewerId);
    const snap = structuredClone(s);
    if (viewer?.alive && s.mode === "showdown" && s.phase !== "finished")
      snap.players = snap.players.filter(
        (p) =>
          p.id === viewer.id ||
          !p.alive ||
          p.revealUntil > s.time ||
          !MAPS[s.mode].bushes.some(
            (b) =>
              p.pos.x >= b.x &&
              p.pos.x <= b.x + b.w &&
              p.pos.y >= b.y &&
              p.pos.y <= b.y + b.h,
          ) ||
          distance(p.pos, viewer.pos) < 2.5,
      );
    // Infinity is not portable across every JSON-based transport.
    snap.aliveCount = s.players.filter((p) => p.alive).length;
    snap.areas.forEach((a) => {
      if (!Number.isFinite(a.hp)) a.hp = 999999;
    });
    snap.sampleTime = s.time;
    snap.ackSeq = this.lastSeq.get(viewerId) ?? 0;
    const arrived = this.lastSeqAt.get(viewerId);
    snap.ackAge = arrived === undefined ? 0 : Math.max(0, s.time - arrived);
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
    snap.ackAge = Math.round(snap.ackAge * 1000) / 1000;
    for (const p of snap.players) {
      q2(p.pos);
      q2(p.aim);
      // ceil so a living fighter with fractional HP never displays as 0.
      p.hp = Math.ceil(p.hp);
      p.charge = Math.round(p.charge);
    }
    for (const q of snap.projectiles) {
      q2(q.pos);
      q2(q.dir);
    }
    for (const a of snap.areas) q2(a.pos);
    for (const b of [snap.ball]) {
      q2(b.pos);
      q2(b.velocity);
    }
    for (const e of snap.effects) {
      q2(e.pos);
      q2(e.dir);
    }
    for (const ev of snap.events) {
      q2(ev.pos);
      if (ev.dir) q2(ev.dir);
    }
  }
}
