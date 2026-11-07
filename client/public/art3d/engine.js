// REDACTED / DEPRECATED: historical standalone 3D practice bundle.
// The live game does not load this file.
// shared/definitions.ts
var FIGHTERS = {
  brandon: {
    id: "brandon",
    name: "Brandon",
    team: "Welcome & Follow-Up",
    role: "Controller",
    hp: 5700,
    speed: 5.2,
    ammo: 3,
    reload: 1.3,
    damage: 700,
    range: 8,
    projectileSpeed: 12,
    attack: "Nametag Toss",
    super: "Welcome Committee",
    color: "#417bc2",
    description: "Throw a nametag. Mark enemies for 4 seconds.",
    superDescription: "A welcoming circle slows enemies and heals allies."
  },
  daniel: {
    id: "daniel",
    name: "Daniel",
    team: "Rides",
    role: "Tank",
    hp: 8200,
    speed: 4.6,
    ammo: 3,
    reload: 1.6,
    damage: 330,
    range: 5.5,
    projectileSpeed: 13,
    attack: "Key Toss",
    super: "Full Carpool",
    color: "#83b5ef",
    description: "Five keys. One close-range problem.",
    superDescription: "Wind up, then charge in a van. Knock enemies aside and break crates."
  },
  rich: {
    id: "rich",
    name: "Rich",
    team: "Media",
    role: "Marksman",
    hp: 4600,
    speed: 5.2,
    ammo: 2,
    reload: 1.7,
    damage: 1350,
    range: 11,
    projectileSpeed: 22,
    attack: "Shutter Shot",
    super: "Group Photo!",
    color: "#b9a3ee",
    description: "A precision flash with bonus damage at long range.",
    superDescription: "Frame the crowd, then stun everyone caught in the photo."
  },
  samuel: {
    id: "samuel",
    name: "Samuel",
    team: "Care",
    role: "Healer",
    hp: 5900,
    speed: 5.2,
    ammo: 3,
    reload: 1.4,
    damage: 800,
    range: 7.5,
    projectileSpeed: 12,
    attack: "Munchie Toss",
    super: "Midterm Munchies",
    color: "#f5d46e",
    description: "Snacks hurt rivals and heal injured teammates.",
    superDescription: "Deploy a destructible snack table that heals nearby allies."
  },
  josh: {
    id: "josh",
    name: "Josh",
    team: "Sound",
    role: "Artillery",
    hp: 5600,
    speed: 5.2,
    ammo: 3,
    reload: 1.5,
    damage: 950,
    range: 6.5,
    projectileSpeed: 0,
    attack: "Feedback Burst",
    super: "Soundcheck!",
    color: "#f5a474",
    description: "A wide sound cone hits every enemy in its path.",
    superDescription: "A huge sound blast pierces enemies and pushes them back."
  },
  elijah: {
    id: "elijah",
    name: "Elijah",
    team: "Web",
    role: "Trickster",
    hp: 5100,
    speed: 5.8,
    ammo: 3,
    reload: 1.3,
    damage: 750,
    range: 8,
    projectileSpeed: 14,
    attack: "Bug Report",
    super: "Production Rollback",
    color: "#77d5b9",
    description: "A software bug ricochets once off a wall.",
    superDescription: "Rewind two seconds, recover up to 2,500 HP, leave an explosive glitch."
  },
  ethan: {
    id: "ethan",
    name: "Ethan",
    team: "Music",
    role: "Burst",
    hp: 5400,
    speed: 5.2,
    ammo: 3,
    reload: 1.4,
    damage: 420,
    range: 8,
    projectileSpeed: 14,
    attack: "Rizz",
    super: "Aura Pulse",
    color: "#df83c8",
    description: "Strum two notes, each dealing 420 damage.",
    superDescription: "Instantly knock out rivals within 4 units. Walls and spawn protection block it."
  }
};
var IDS = Object.keys(FIGHTERS);
var RULES = {
  tick: 30,
  radius: 0.42,
  superCharge: 5e3,
  healDelay: 4,
  healRate: 0.12,
  attackInterval: 0.32,
  respawn: 3,
  protection: 1.5
};
var MAPS = {
  showdown: {
    w: 36,
    h: 24,
    walls: [
      { id: "a", x: 8, y: 7, w: 3, h: 1 },
      { id: "b", x: 25, y: 16, w: 3, h: 1 },
      { id: "c", x: 8, y: 16, w: 3, h: 1 },
      { id: "d", x: 25, y: 7, w: 3, h: 1 },
      { id: "e", x: 16, y: 9, w: 1, h: 2 },
      { id: "f", x: 19, y: 13, w: 1, h: 2 },
      ...[
        [12, 5],
        [23, 18],
        [12, 18],
        [23, 5]
      ].map(([x, y], i) => ({ id: "crate" + i, x, y, w: 1, h: 1, hp: 1800 }))
    ],
    bushes: [
      { x: 4, y: 10, w: 3, h: 4 },
      { x: 29, y: 10, w: 3, h: 4 },
      { x: 14, y: 3, w: 4, h: 2 },
      { x: 18, y: 19, w: 4, h: 2 }
    ],
    spawns: [
      { x: 3, y: 3 },
      { x: 33, y: 21 },
      { x: 33, y: 3 },
      { x: 3, y: 21 },
      { x: 18, y: 3 },
      { x: 18, y: 21 },
      { x: 3, y: 12 },
      { x: 33, y: 12 }
    ]
  },
  broomball: {
    w: 34,
    h: 20,
    walls: [],
    bushes: [],
    spawns: [
      { x: 4, y: 10 },
      { x: 7, y: 5 },
      { x: 7, y: 15 },
      { x: 30, y: 10 },
      { x: 27, y: 5 },
      { x: 27, y: 15 }
    ]
  }
};
var add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y });
var sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
var mul = (a, n) => ({ x: a.x * n, y: a.y * n });
var length = (a) => Math.hypot(a.x, a.y);
var distance = (a, b) => length(sub(a, b));
var clamp = (n, a, b) => Math.max(a, Math.min(b, n));
var unit = (a) => length(a) > 0 ? mul(a, 1 / length(a)) : { x: 1, y: 0 };
function finiteVec(v) {
  return !!v && typeof v === "object" && Number.isFinite(v.x) && Number.isFinite(v.y) && Math.abs(v.x) < 1e5 && Math.abs(v.y) < 1e5;
}
function segmentDistance(p, a, b) {
  const v = sub(b, a);
  const t = clamp(
    ((p.x - a.x) * v.x + (p.y - a.y) * v.y) / (v.x * v.x + v.y * v.y || 1),
    0,
    1
  );
  return distance(p, add(a, mul(v, t)));
}

// shared/engine.ts
var emptyStats = () => ({
  kills: 0,
  deaths: 0,
  damage: 0,
  received: 0,
  healing: 0,
  goals: 0,
  assists: 0,
  survived: 0
});
var Engine = class {
  state;
  inputs = /* @__PURE__ */ new Map();
  histories = /* @__PURE__ */ new Map();
  pending = [];
  dashes = [];
  serial = 0;
  constructor(mode, members) {
    const map = MAPS[mode];
    let blue = 0, red = 3;
    const players = members.map((m, i) => {
      const f = FIGHTERS[m.fighter];
      const spawn = map.spawns[mode === "showdown" ? i : m.team === 0 ? blue++ : red++];
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
        stats: emptyStats()
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
        scorer: null
      },
      winner: null,
      notice: "Get ready",
      tick: 0,
      aliveCount: players.length
    };
  }
  get playerList() {
    return this.state.players;
  }
  allies(a, b) {
    return a.id === b.id || this.state.mode === "broomball" && a.team === b.team;
  }
  setInput(id, input) {
    if (!input || !finiteVec(input.move) || !finiteVec(input.aim)) return false;
    const m = length(input.move) > 1 ? unit(input.move) : input.move;
    const previous = this.inputs.get(id);
    this.inputs.set(id, {
      move: m,
      aim: unit(input.aim),
      attack: input.attack === true || previous?.attack === true,
      super: input.super === true || previous?.super === true,
      power: previous?.attack && !input.attack ? previous.power : clamp(Number.isFinite(input.power) ? input.power : 0.35, 0.35, 1)
    });
    return true;
  }
  valid(pos, r = RULES.radius) {
    const m = MAPS[this.state.mode];
    return pos.x >= r && pos.y >= r && pos.x <= m.w - r && pos.y <= m.h - r && !this.state.walls.some(
      (w) => pos.x + r > w.x && pos.x - r < w.x + w.w && pos.y + r > w.y && pos.y - r < w.y + w.h
    );
  }
  move(p, delta) {
    const n = Math.max(1, Math.ceil(length(delta) / 0.18));
    for (let i = 0; i < n; i++) {
      const dx = delta.x / n, dy = delta.y / n;
      if (this.valid({ x: p.pos.x + dx, y: p.pos.y })) p.pos.x += dx;
      if (this.valid({ x: p.pos.x, y: p.pos.y + dy })) p.pos.y += dy;
    }
  }
  lineClear(a, b) {
    const n = Math.max(1, Math.ceil(distance(a, b) / 0.12));
    for (let i = 1; i <= n; i++) {
      const p = add(a, mul(sub(b, a), i / n));
      if (this.state.walls.some(
        (w) => p.x > w.x && p.x < w.x + w.w && p.y > w.y && p.y < w.y + w.h
      ))
        return false;
    }
    return true;
  }
  effect(kind, p, owner = "", dir = { x: 1, y: 0 }, value, duration = 0.5) {
    this.state.effects.push({
      id: ++this.serial,
      kind,
      pos: { ...p },
      dir: { ...dir },
      owner,
      value,
      end: this.state.time + duration
    });
  }
  heal(target, amount, source, charge = true) {
    if (!target.alive) return;
    const actual = Math.min(
      FIGHTERS[target.fighter].hp - target.hp,
      Math.max(0, amount)
    );
    target.hp += actual;
    if (source && actual > 0) {
      source.stats.healing += actual;
      if (charge && source.id !== target.id)
        source.charge = Math.min(
          RULES.superCharge,
          source.charge + actual * 0.6
        );
    }
  }
  damage(target, amount, source, isSuper = false) {
    const s = this.state;
    if (!target.alive || s.time < target.protectedUntil || amount <= 0)
      return false;
    const actual = Math.min(target.hp, amount);
    target.hp -= actual;
    target.stats.received += actual;
    target.quietSince = s.time;
    if (source && source.id !== target.id) {
      source.stats.damage += actual;
      if (!isSuper) source.charge = Math.min(5e3, source.charge + actual);
    }
    if (actual >= 100)
      this.effect(
        "hit",
        target.pos,
        source?.id,
        target.aim,
        Math.round(actual)
      );
    if (target.hp <= 0) this.eliminate(target, source);
    return true;
  }
  eliminate(p, source) {
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
    this.state.notice = `${p.name} eliminated`;
  }
  disconnect(id) {
    const p = this.state.players.find((x) => x.id === id);
    if (p) {
      p.connected = false;
      this.inputs.delete(id);
      this.dropBall(p);
    }
  }
  knock(p, dir, n) {
    this.dropBall(p);
    this.move(p, mul(dir, n));
  }
  dropBall(p) {
    const b = this.state.ball;
    if (b.carrier !== p.id) return;
    b.carrier = null;
    b.pos = { ...p.pos };
    b.velocity = mul(p.aim, 2);
    b.state = "free";
    b.last = p.id;
    b.lockUntil = this.state.time + 0.4;
  }
  attack(p) {
    const s = this.state, f = FIGHTERS[p.fighter];
    if (s.ball.carrier === p.id) {
      this.shoot(p, this.inputs.get(p.id)?.power ?? 0.35);
      return;
    }
    if (p.ammo < 1 || s.time - p.lastAttack < RULES.attackInterval) return;
    p.ammo--;
    p.lastAttack = s.time;
    p.quietSince = s.time;
    p.protectedUntil = 0;
    this.effect("attack", p.pos, p.id, p.aim, void 0, 0.2);
    if (p.fighter === "josh") {
      this.effect("cone", p.pos, p.id, p.aim);
      for (const t of s.players) {
        const d = sub(t.pos, p.pos);
        if (t.alive && !this.allies(p, t) && length(d) <= f.range + RULES.radius && Math.acos(clamp(unit(d).x * p.aim.x + unit(d).y * p.aim.y, -1, 1)) <= Math.PI / 9 && this.lineClear(p.pos, t.pos))
          this.damage(t, f.damage, p);
      }
      for (const a of s.areas) {
        const owner = s.players.find((x) => x.id === a.owner);
        const d = sub(a.pos, p.pos);
        if (a.kind === "table" && owner && !this.allies(p, owner) && length(d) <= f.range && Math.acos(clamp(unit(d).x * p.aim.x + unit(d).y * p.aim.y, -1, 1)) <= Math.PI / 9 && this.lineClear(p.pos, a.pos))
          a.hp -= f.damage;
      }
      return;
    }
    const angles = p.fighter === "daniel" ? [-0.25, -0.125, 0, 0.125, 0.25] : p.fighter === "ethan" ? [-0.055, 0.055] : [0];
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
        bounces: p.fighter === "elijah" ? 1 : 0
      });
    }
  }
  activateSuper(p) {
    const s = this.state;
    if (!p.alive || p.charge < 5e3 || s.time < p.stunUntil || s.ball.carrier === p.id)
      return false;
    let pos = add(p.pos, mul(p.aim, 4));
    const m = MAPS[s.mode];
    pos = { x: clamp(pos.x, 0.5, m.w - 0.5), y: clamp(pos.y, 0.5, m.h - 0.5) };
    if (p.fighter === "ethan") {
      this.effect("aura", p.pos, p.id, p.aim, void 0, 0.6);
      for (const target of s.players) {
        if (!target.alive || distance(p.pos, target.pos) > 4 || !this.lineClear(p.pos, target.pos))
          continue;
        if (!this.allies(p, target)) this.damage(target, target.hp, p, true);
      }
    } else if (p.fighter === "elijah") {
      const hist = this.histories.get(p.id) || [];
      const past = hist.filter((h) => h.t <= s.time - 2 && this.valid(h.pos)).at(-1);
      if (!past) return false;
      const old = { ...p.pos };
      p.pos = { ...past.pos };
      this.heal(p, Math.min(2500, Math.max(0, past.hp - p.hp)), p, false);
      this.effect("glitch", old, p.id, p.aim, void 0, 0.65);
      for (const t of s.players)
        if (t.alive && !this.allies(p, t) && distance(old, t.pos) <= 3 && this.lineClear(old, t.pos))
          this.damage(t, 1200, p, true);
    } else if (p.fighter === "brandon" || p.fighter === "samuel") {
      if (!this.valid(pos, 0.3) || !this.lineClear(p.pos, pos)) return false;
      s.areas.push({
        id: ++this.serial,
        owner: p.id,
        kind: p.fighter === "brandon" ? "welcome" : "table",
        pos,
        radius: p.fighter === "brandon" ? 3.5 : 3,
        end: s.time + (p.fighter === "brandon" ? 5 : 6),
        hp: p.fighter === "samuel" ? 2e3 : Infinity
      });
    } else if (p.fighter === "rich" || p.fighter === "daniel") {
      this.pending.push({
        at: s.time + (p.fighter === "rich" ? 0.35 : 0.3),
        id: p.id,
        kind: p.fighter === "rich" ? "photo" : "dash",
        pos: { ...p.pos },
        dir: { ...p.aim }
      });
      this.effect(
        p.fighter === "rich" ? "photo" : "van",
        p.pos,
        p.id,
        p.aim,
        void 0,
        0.35
      );
    } else {
      this.effect("sound", p.pos, p.id, p.aim, void 0, 0.6);
      this.rectangle(p, p.pos, p.aim, 10, 4, 1400, 0, 3);
    }
    p.charge = 0;
    p.protectedUntil = 0;
    return true;
  }
  rectangle(owner, pos, dir, range, width, damage, stun, knock) {
    for (const t of this.state.players) {
      if (!t.alive || this.allies(owner, t)) continue;
      const d = sub(t.pos, pos), along = d.x * dir.x + d.y * dir.y, across = Math.abs(d.x * dir.y - d.y * dir.x);
      if (along >= 0 && along <= range && across <= width / 2 && this.lineClear(pos, t.pos) && this.damage(t, damage, owner, true)) {
        if (stun) {
          t.stunUntil = this.state.time + stun;
          this.dropBall(t);
        }
        if (knock) this.knock(t, dir, knock);
      }
    }
  }
  projectiles(dt) {
    const s = this.state;
    const surviving = [];
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
          (w) => next.x >= w.x && next.x <= w.x + w.w && next.y >= w.y && next.y <= w.y + w.h
        );
        const boundary = next.x < 0 || next.y < 0 || next.x > m.w || next.y > m.h;
        if (wall || boundary) {
          if (wall?.hp !== void 0) {
            wall.hp -= f.damage;
            if (wall.hp <= 0) s.walls = s.walls.filter((w) => w.id !== wall.id);
          }
          if (q.bounces > 0) {
            q.bounces--;
            const hitX = wall ? old.x <= wall.x || old.x >= wall.x + wall.w : next.x < 0 || next.x > m.w;
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
          if (!t.alive || t.id === owner.id || distance(q.pos, t.pos) > RULES.radius + 0.13)
            continue;
          if (this.allies(owner, t)) {
            if (q.fighter === "samuel" && t.hp < FIGHTERS[t.fighter].hp) {
              this.heal(t, 850, owner);
              this.effect("heal", t.pos, owner.id, t.aim, 850);
              dead = true;
              break;
            }
            continue;
          }
          const bonus = q.fighter === "rich" && q.traveled >= f.range * 0.8 ? 200 : 0;
          if (this.damage(t, f.damage + bonus, owner) && q.fighter === "brandon")
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
  shoot(p, power) {
    const b = this.state.ball;
    if (b.carrier !== p.id) return;
    this.dropBall(p);
    b.state = "flight";
    b.velocity = mul(p.aim, 8 + (clamp(power, 0.35, 1) - 0.35) / 0.65 * 8);
    b.scorer = p.id;
  }
  ball(dt) {
    const s = this.state, b = s.ball;
    if (s.mode !== "broomball") return;
    if (b.carrier) {
      const p = s.players.find((p2) => p2.id === b.carrier);
      if (p?.alive && p.connected) b.pos = add(p.pos, mul(p.aim, 0.58));
      else if (p) this.dropBall(p);
      return;
    }
    if (b.state === "resetting") return;
    const steps = Math.max(1, Math.ceil(length(b.velocity) * dt / 0.12));
    for (let i = 0; i < steps; i++) {
      const prev = { ...b.pos };
      b.pos = add(b.pos, mul(b.velocity, dt / steps));
      if ((prev.x >= 0.32 && b.pos.x < 0.32 || prev.x <= 33.68 && b.pos.x > 33.68) && b.pos.y > 8 && b.pos.y < 12) {
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
        if (!p.alive || !p.connected || s.time < p.stunUntil || p.id === b.last && s.time < b.lockUntil)
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
          return;
        }
      }
    }
    b.velocity = mul(b.velocity, Math.exp(-0.32 * dt));
  }
  goal(team) {
    const s = this.state;
    if (s.phase !== "playing") return;
    s.score[team]++;
    const scorer = s.players.find((x) => x.id === s.ball.scorer);
    if (scorer?.team === team) {
      scorer.stats.goals++;
      const passer = s.players.find((x) => x.id === s.ball.passer);
      if (passer && passer.id !== scorer.id && passer.team === team && s.time - s.ball.passAt <= 8)
        passer.stats.assists++;
    }
    s.ball.carrier = null;
    s.ball.state = "resetting";
    s.notice = `${team === 0 ? "Blue" : "Red"} team scores!`;
    this.effect("goal", s.ball.pos, scorer?.id, void 0, void 0, 3);
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
    let blue = 0, red = 3;
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
      scorer: null
    };
  }
  finish(winner) {
    const s = this.state;
    if (s.phase === "finished") return;
    s.phase = "finished";
    s.winner = winner;
    s.projectiles = [];
    s.ball.carrier = null;
    s.ball.state = "resetting";
    const survivors = s.players.filter((p) => p.alive).sort(
      (a, b) => b.hp / FIGHTERS[b.fighter].hp - a.hp / FIGHTERS[a.fighter].hp || b.stats.damage - a.stats.damage || a.id.localeCompare(b.id)
    );
    if (s.mode === "showdown")
      survivors.forEach((p, i) => p.placement = i + 1);
    for (const p of survivors) p.stats.survived = Math.max(0, s.time - 3);
  }
  step(dt = 1 / RULES.tick) {
    const s = this.state;
    if (s.phase === "finished") return;
    s.time += dt;
    s.tick++;
    s.aliveCount = s.players.filter((p) => p.alive).length;
    s.effects = s.effects.filter((e) => e.end > s.time);
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
      const f = FIGHTERS[p.fighter], input = this.inputs.get(p.id);
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
        history.filter((h) => h.t >= s.time - 3)
      );
    }
    for (const item of this.pending.filter((x) => x.at <= s.time)) {
      const p = s.players.find((x) => x.id === item.id);
      if (!p?.alive) continue;
      if (item.kind === "photo") {
        this.rectangle(p, item.pos, item.dir, 8, 5, 900, 0.75, 0);
        this.effect("photo", item.pos, p.id, item.dir, 1, 0.4);
      } else
        this.dashes.push({
          id: p.id,
          remaining: 10,
          dir: item.dir,
          hit: /* @__PURE__ */ new Set()
        });
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
        if (w.hp !== void 0 && segmentDistance(
          { x: w.x + w.w / 2, y: w.y + w.h / 2 },
          p.pos,
          add(p.pos, mul(dash.dir, step))
        ) < 1)
          w.hp = 0;
      s.walls = s.walls.filter((w) => w.hp === void 0 || w.hp > 0);
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
        if (t.alive && !this.allies(p, t) && !dash.hit.has(t.id) && segmentDistance(t.pos, old, p.pos) < 1) {
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
        [180, 0.25]
      ];
      s.zone = 0.25;
      for (let i = 1; i < stages.length; i++)
        if (elapsed <= stages[i][0]) {
          const [t0, r0] = stages[i - 1], [t1, r1] = stages[i];
          s.zone = r0 + (r1 - r0) * clamp((elapsed - t0) / (t1 - t0), 0, 1);
          break;
        }
      for (const p of s.players)
        if (p.alive && distance(p.pos, { x: 18, y: 12 }) > s.zone)
          this.damage(
            p,
            (elapsed < 70 ? 350 : elapsed < 120 ? 650 : elapsed < 150 ? 1100 : 1800) * dt
          );
      const alive = s.players.filter((p) => p.alive);
      if (alive.length <= 1) this.finish(alive[0]?.id || null);
      else if (elapsed >= 210) {
        const sorted = alive.sort(
          (a, b) => b.hp / FIGHTERS[b.fighter].hp - a.hp / FIGHTERS[a.fighter].hp || b.stats.damage - a.stats.damage || a.id.localeCompare(b.id)
        );
        this.finish(sorted[0].id);
      }
    } else if (elapsed >= 150 && !s.overtime) {
      if (s.score[0] === s.score[1]) {
        s.overtime = true;
        s.notice = "Golden goal \u2022 30 seconds";
      } else this.finish(s.score[0] > s.score[1] ? "blue" : "red");
    } else if (s.overtime && elapsed >= 180) this.finish(null);
  }
  /** Conceal enemies in bushes, except near allies or while marked. Dead participants spectate all. */
  snapshot(viewerId) {
    const s = this.state, viewer = s.players.find((p) => p.id === viewerId);
    const snap = structuredClone(s);
    if (viewer?.alive && s.mode === "showdown" && s.phase !== "finished")
      snap.players = snap.players.filter(
        (p) => p.id === viewer.id || !p.alive || p.revealUntil > s.time || !MAPS[s.mode].bushes.some(
          (b) => p.pos.x >= b.x && p.pos.x <= b.x + b.w && p.pos.y >= b.y && p.pos.y <= b.y + b.h
        ) || distance(p.pos, viewer.pos) < 2.5
      );
    snap.aliveCount = s.players.filter((p) => p.alive).length;
    snap.areas.forEach((a) => {
      if (!Number.isFinite(a.hp)) a.hp = 999999;
    });
    return snap;
  }
};
export {
  Engine
};
