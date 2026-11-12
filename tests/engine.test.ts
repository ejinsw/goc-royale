import { test } from "node:test";
import assert from "node:assert/strict";
import { Engine } from "../shared/engine";
import { Room } from "../shared/room";
import { IDS, FIGHTERS, distance, type FighterId } from "../shared/definitions";
import type { Member, HostMessage } from "../shared/types";
const members = (n = 2): Member[] =>
  Array.from({ length: n }, (_, i) => ({
    id: "p" + i,
    name: "Player " + i,
    fighter: IDS[i % IDS.length],
    team: i < 3 ? 0 : 1,
    ready: true,
    connected: true,
  }));
const advance = (e: Engine, seconds: number) => {
  for (let i = 0; i < Math.round(seconds * 30); i++) e.step();
};
const engine = (
  fighter: FighterId = "brandon",
  mode: "showdown" | "broomball" = "showdown",
) => {
  const m = members(mode === "showdown" ? 2 : 6);
  m[0].fighter = fighter;
  const e = new Engine(mode, m);
  advance(e, 3.1);
  return e;
};
const fire = (e: Engine, id = "p0", aim = { x: 1, y: 0 }) =>
  e.setInput(id, { move: { x: 0, y: 0 }, aim, attack: true });
test("roster: the seven pilot fighters keep their HP, followed by David and the other leaders", () => {
  assert.deepEqual(IDS, [
    "brandon",
    "daniel",
    "rich",
    "samuel",
    "josh",
    "elijah",
    "ethan",
    "david",
    "dylan",
    "isaac",
    "tovya",
    "rosalie",
    "joelle",
    "susannah",
    "joyce",
    "miriam",
    "jemuel",
    "russell",
  ]);
  assert.deepEqual(
    IDS.slice(0, 7).map((i) => FIGHTERS[i].hp),
    [5700, 8200, 4600, 5900, 5600, 5100, 5400],
  );
  // Every ministry team with a named leader is represented.
  assert.deepEqual(
    [...new Set(IDS.map((i) => FIGHTERS[i].team))].sort(),
    [
      "Admin",
      "Care",
      "Finance",
      "Fisherman's",
      "Homeless Outreach",
      "Media",
      "Music",
      "Prayer",
      "Rides",
      "Sound",
      "Web",
      "Welcome & Follow-Up",
    ],
  );
  // Basic attacks are projectiles or cones; cones never need a speed.
  for (const id of IDS) {
    const f = FIGHTERS[id];
    assert.ok(f.hp > 0 && f.ammo > 0 && f.reload > 0 && f.range > 0, id);
    if (f.abilities.attack.kind === "shot") assert.ok(f.projectileSpeed > 0, id);
  }
});
test("countdown locks movement and attacks", () => {
  const e = new Engine("showdown", members());
  const p = e.playerList[0],
    old = { ...p.pos };
  fire(e);
  e.step();
  assert.deepEqual(p.pos, old);
  assert.equal(p.ammo, 3);
});
test("input rejects NaN and normalizes oversized movement", () => {
  const e = engine();
  assert.equal(
    e.setInput("p0", { move: { x: NaN, y: 0 }, aim: { x: 1, y: 0 } }),
    false,
  );
  const p = e.playerList[0],
    old = { ...p.pos };
  e.setInput("p0", { move: { x: 99, y: 99 }, aim: { x: 1, y: 0 } });
  e.step();
  assert.ok(distance(p.pos, old) <= 5.2 / 30 + 0.0001);
});
test("walls block movement and knockback without tunneling", () => {
  const e = engine();
  const p = e.playerList[0];
  p.pos = { x: 7, y: 7.5 };
  e.move(p, { x: 5, y: 0 });
  assert.ok(p.pos.x < 7.59);
  e.knock(p, { x: 1, y: 0 }, 10);
  assert.ok(p.pos.x < 7.59);
});
test("ammo, cadence, and sequential reload are authoritative", () => {
  const e = engine(),
    p = e.playerList[0];
  fire(e);
  e.step();
  assert.equal(p.ammo, 2);
  fire(e);
  e.step();
  assert.equal(p.ammo, 2);
  advance(e, 1.4);
  assert.equal(p.ammo, 3);
});
test("swept projectiles hit and Brandon reveal refreshes", () => {
  const e = engine(),
    [p, t] = e.playerList;
  p.pos = { x: 10, y: 12 };
  t.pos = { x: 13, y: 12 };
  fire(e);
  advance(e, 0.4);
  assert.equal(t.hp, FIGHTERS[t.fighter].hp - 700);
  assert.ok(t.revealUntil > e.state.time);
  assert.equal(p.charge, 700);
});
test("Daniel spread can hit one nearby enemy five times", () => {
  const e = engine("daniel"),
    [p, t] = e.playerList;
  p.pos = { x: 10, y: 12 };
  t.pos = { x: 11, y: 12 };
  fire(e);
  advance(e, 0.2);
  assert.equal(t.hp, FIGHTERS[t.fighter].hp - 1650);
});
test("Rich gets the final 20 percent range bonus", () => {
  const e = engine("rich"),
    [p, t] = e.playerList;
  p.pos = { x: 3, y: 10 };
  t.pos = { x: 13, y: 10 };
  e.state.walls = [];
  fire(e);
  advance(e, 0.5);
  assert.equal(t.hp, FIGHTERS[t.fighter].hp - 1550);
});
test("Samuel heals only missing ally HP and earns effective charge", () => {
  const e = engine("samuel", "broomball"),
    [p, t] = e.playerList;
  p.pos = { x: 10, y: 10 };
  t.pos = { x: 12, y: 10 };
  t.hp -= 300;
  fire(e);
  advance(e, 0.3);
  assert.equal(t.hp, FIGHTERS[t.fighter].hp);
  assert.equal(p.stats.healing, 300);
  assert.equal(p.charge, 180);
});
test("full-health allies do not intercept snacks", () => {
  const e = engine("samuel", "broomball"),
    [p, t, , enemy] = e.playerList;
  p.pos = { x: 10, y: 10 };
  t.pos = { x: 12, y: 10 };
  enemy.pos = { x: 14, y: 10 };
  fire(e);
  advance(e, 0.5);
  assert.equal(enemy.hp, FIGHTERS[enemy.fighter].hp - 800);
});
test("Josh cone hits multiple enemies once and respects walls", () => {
  const e = engine("josh", "broomball");
  const p = e.playerList[0],
    a = e.playerList[3],
    b = e.playerList[4];
  p.pos = { x: 10, y: 10 };
  a.pos = { x: 13, y: 9.7 };
  b.pos = { x: 13, y: 10.3 };
  fire(e);
  e.step();
  assert.equal(a.hp, FIGHTERS[a.fighter].hp - 950);
  assert.equal(b.hp, FIGHTERS[b.fighter].hp - 950);
});
test("Elijah ricochets exactly once", () => {
  const e = engine("elijah");
  const p = e.playerList[0];
  p.pos = { x: 7, y: 7.5 };
  fire(e);
  advance(e, 0.2);
  assert.equal(e.state.projectiles[0]?.bounces, 0);
  assert.ok(e.state.projectiles[0]?.dir.x < 0);
});
test("David Mixed Voice rewards the narrow center without changing its outer hit", () => {
  const centered = engine("david"),
    [p, t] = centered.playerList;
  centered.state.walls = [];
  p.pos = { x: 10, y: 12 };
  t.pos = { x: 13, y: 12 };
  fire(centered);
  advance(centered, 0.4);
  assert.equal(t.hp, FIGHTERS[t.fighter].hp - 900);
  assert.ok(centered.state.effects.some((effect) => effect.kind === "harmony"));

  const outer = engine("david"),
    [outerP, outerT] = outer.playerList;
  outer.state.walls = [];
  outerP.pos = { x: 10, y: 12 };
  outerT.pos = { x: 13, y: 12.65 };
  fire(outer);
  advance(outer, 0.4);
  assert.equal(outerT.hp, FIGHTERS[outerT.fighter].hp - 500);
  assert.ok(!outer.state.effects.some((effect) => effect.kind === "harmony"));
});
test("David Side Eye warns, then shoves away from its center line and slows", () => {
  const e = engine("david"),
    [p, t] = e.playerList;
  e.state.walls = [];
  p.pos = { x: 10, y: 12 };
  p.aim = { x: 1, y: 0 };
  p.charge = 5000;
  t.pos = { x: 14, y: 13 };
  assert.ok(e.activateSuper(p));
  assert.equal(t.hp, FIGHTERS[t.fighter].hp);
  assert.ok(e.state.effects.some((effect) => effect.kind === "gaze" && !effect.value));
  advance(e, 0.5);
  assert.equal(t.hp, FIGHTERS[t.fighter].hp - 750);
  assert.ok(t.pos.y > 14.5);
  assert.equal(t.slow, 0.25);
  assert.ok(e.state.effects.some((effect) => effect.kind === "gaze" && effect.value === 1));
});
test("passive healing starts after four quiet seconds and stays bounded", () => {
  const e = engine();
  const p = e.playerList[0];
  p.hp -= 2000;
  p.quietSince = e.state.time;
  advance(e, 3.8);
  assert.equal(p.hp, 3700);
  advance(e, 1);
  assert.ok(p.hp > 3700);
  advance(e, 6);
  assert.equal(p.hp, 5700);
});
test("invalid Super does not consume charge; carrier cannot use Super", () => {
  const e = engine("elijah", "broomball");
  const p = e.playerList[0];
  p.charge = 5000;
  assert.equal(e.activateSuper(p), false);
  assert.equal(p.charge, 5000);
  e.state.ball.carrier = p.id;
  advance(e, 2.1);
  assert.equal(e.activateSuper(p), false);
});
test("Brandon zone slows enemies, heals owner, expires", () => {
  const e = engine();
  const [p, t] = e.playerList;
  p.pos = { x: 10, y: 12 };
  p.charge = 5000;
  p.hp -= 1000;
  t.pos = { x: 14, y: 12 };
  assert.equal(e.activateSuper(p), true);
  p.pos = { x: 12, y: 12 };
  e.step();
  assert.equal(t.slow, 0.3);
  assert.ok(p.hp > 4700);
  assert.equal(p.charge, 0);
  advance(e, 5.1);
  assert.equal(e.state.areas.length, 0);
});
test("Samuel table can be destroyed by enemy projectiles", () => {
  const e = engine("samuel");
  const [p, t] = e.playerList;
  p.pos = { x: 10, y: 12 };
  p.charge = 5000;
  p.aim = { x: 1, y: 0 };
  e.activateSuper(p);
  t.fighter = "rich";
  t.pos = { x: 18, y: 12 };
  fire(e, t.id, { x: -1, y: 0 });
  advance(e, 0.4);
  fire(e, t.id, { x: -1, y: 0 });
  advance(e, 0.4);
  assert.equal(e.state.areas.length, 0);
});
test("Rich windup then rectangular stun drops possession", () => {
  const e = engine("rich", "broomball");
  const p = e.playerList[0],
    t = e.playerList[3];
  p.pos = { x: 10, y: 10 };
  t.pos = { x: 14, y: 10 };
  p.charge = 5000;
  e.state.ball.carrier = t.id;
  e.state.ball.state = "carried";
  assert.ok(e.activateSuper(p));
  assert.equal(t.stunUntil, 0);
  advance(e, 0.4);
  assert.ok(t.stunUntil > e.state.time);
  assert.notEqual(e.state.ball.carrier, t.id);
});
test("Daniel van damages each target once and breaks crates", () => {
  const e = engine("daniel");
  const [p, t] = e.playerList;
  p.pos = { x: 10, y: 12 };
  t.pos = { x: 14, y: 12 };
  p.charge = 5000;
  e.state.walls = [{ id: "crate", x: 12, y: 11.5, w: 1, h: 1, hp: 1800 }];
  e.activateSuper(p);
  advance(e, 1);
  assert.equal(t.hp, FIGHTERS[t.fighter].hp - 1400);
  assert.equal(e.state.walls.length, 0);
});
test("Josh sound Super knocks enemies back with no new charge", () => {
  const e = engine("josh");
  const [p, t] = e.playerList;
  p.pos = { x: 10, y: 12 };
  t.pos = { x: 13, y: 12 };
  p.charge = 5000;
  e.activateSuper(p);
  assert.equal(p.charge, 0);
  assert.equal(t.hp, FIGHTERS[t.fighter].hp - 1400);
  assert.ok(t.pos.x > 15.5);
});
test("rollback restores historical HP up to 2500 without restoring ammo", () => {
  const e = engine("elijah");
  const p = e.playerList[0];
  p.pos = { x: 10, y: 12 };
  advance(e, 2.2);
  p.pos = { x: 14, y: 12 };
  p.hp = 1000;
  p.ammo = 1;
  p.charge = 5000;
  assert.ok(e.activateSuper(p));
  assert.equal(p.hp, 3500);
  assert.ok(p.pos.x < 10.1);
  assert.equal(p.ammo, 1);
  assert.equal(p.charge, 0);
});
test("Showdown damage eliminates permanently and placements are deterministic", () => {
  const e = engine();
  const [p, t] = e.playerList;
  e.damage(t, 99999, p);
  e.step();
  assert.equal(e.state.phase, "finished");
  assert.equal(e.state.winner, p.id);
  assert.equal(t.placement, 2);
  assert.equal(p.placement, 1);
  advance(e, 4);
  assert.equal(t.alive, false);
});
test("Showdown zone shrinks and deals continuous hazard damage", () => {
  const e = engine();
  const [p, t] = e.playerList;
  p.pos = { x: 18, y: 12 };
  t.pos = { x: 3, y: 3 };
  e.state.time = 124;
  e.step();
  assert.ok(e.state.zone < 10);
  assert.ok(t.hp < FIGHTERS[t.fighter].hp);
});
test("Broomball respawns with protection and preserved Super charge", () => {
  const e = engine("brandon", "broomball");
  const p = e.playerList[0];
  p.charge = 2500;
  e.damage(p, 99999);
  advance(e, 3.1);
  assert.equal(p.alive, true);
  assert.equal(p.charge, 2500);
  assert.ok(p.protectedUntil > e.state.time);
  assert.equal(e.damage(p, 500), false);
  fire(e);
  e.step();
  assert.equal(p.protectedUntil, 0);
});
test("ball pickup has exactly one owner and release preserves ammunition", () => {
  const e = engine("brandon", "broomball"),
    p = e.playerList[0];
  p.pos = { x: 17, y: 10 };
  e.step();
  assert.equal(e.state.ball.carrier, p.id);
  const ammo = p.ammo;
  fire(e);
  e.step();
  assert.equal(e.state.ball.state, "flight");
  assert.equal(e.state.ball.carrier, null);
  assert.equal(p.ammo, ammo);
  assert.ok(e.state.ball.lockUntil > e.state.time);
});
test("a carried ball cannot score by walking over the goal line", () => {
  const e = engine("brandon", "broomball"),
    p = e.playerList[0];
  p.pos = { x: 33.5, y: 10 };
  e.state.ball.carrier = p.id;
  e.state.ball.state = "carried";
  e.step();
  assert.deepEqual(e.state.score, [0, 0]);
});
test("free ball crossing goal plane scores exactly once and resets", () => {
  const e = engine("brandon", "broomball");
  const b = e.state.ball;
  b.pos = { x: 33.5, y: 10 };
  b.velocity = { x: 16, y: 0 };
  b.state = "flight";
  b.scorer = "p0";
  e.step();
  assert.deepEqual(e.state.score, [1, 0]);
  advance(e, 1);
  assert.deepEqual(e.state.score, [1, 0]);
  advance(e, 2.1);
  assert.equal(e.state.phase, "playing");
  assert.deepEqual(e.state.ball.pos, { x: 17, y: 10 });
  assert.equal(e.playerList[0].stats.goals, 1);
});
test("interception clears assist chain, teammates receive pass assist", () => {
  const e = engine("brandon", "broomball");
  const p = e.playerList[1];
  p.pos = { x: 17, y: 10 };
  e.state.ball.scorer = "p0";
  e.step();
  assert.equal(e.state.ball.passer, "p0");
  e.state.ball.scorer = "p1";
  e.goal(0);
  assert.equal(e.playerList[0].stats.assists, 1);
  assert.equal(p.stats.goals, 1);
});
test("rink boards bounce the ball, goal posts do not score", () => {
  const e = engine("brandon", "broomball");
  const b = e.state.ball;
  b.pos = { x: 33.6, y: 4 };
  b.velocity = { x: 16, y: 0 };
  b.state = "flight";
  e.step();
  assert.ok(b.velocity.x < 0);
  assert.deepEqual(e.state.score, [0, 0]);
});
test("two goals win, tied regulation leads to 30 second golden goal", () => {
  const e = engine("brandon", "broomball");
  e.state.time = 153.1;
  e.step();
  assert.equal(e.state.overtime, true);
  e.goal(1);
  assert.equal(e.state.winner, "red");
  assert.equal(e.state.phase, "finished");
  const draw = engine("brandon", "broomball");
  draw.state.time = 153.1;
  draw.step();
  draw.state.time = 183.1;
  draw.step();
  assert.equal(draw.state.phase, "finished");
  assert.equal(draw.state.winner, null);
});
test("bush concealment hides enemies until revealed or approached", () => {
  const e = engine();
  e.playerList[0].pos = { x: 18, y: 12 };
  e.playerList[1].pos = { x: 5, y: 12 };
  assert.equal(e.snapshot("p0").players.length, 1);
  assert.equal(e.snapshot("p0").aliveCount, 2);
  e.playerList[1].revealUntil = e.state.time + 4;
  assert.equal(e.snapshot("p0").players.length, 2);
});
test("host-only start, ready validation, reconnect identity, rematch", () => {
  const messages: { id: string; m: HostMessage }[] = [];
  const r = new Room("ABCDEF", (id, m) =>
    messages.push({ id, m: structuredClone(m) }),
  );
  const a = r.join("Host"),
    b = r.join("Guest");
  r.command(b.id, { type: "start" });
  assert.equal(r.engine, null);
  r.command(a.id, { type: "start" });
  assert.equal(r.engine, null);
  r.command(a.id, { type: "ready", ready: true });
  r.command(b.id, { type: "ready", ready: true });
  r.command(a.id, { type: "start" });
  assert.ok(r.engine);
  r.disconnect(b.id);
  const restored = r.join("Guest", b.token);
  assert.equal(restored.id, b.id);
  (r.engine as Engine | null)!.finish(a.id);
  r.tick();
  r.command(a.id, { type: "lobby" });
  assert.equal(r.lobby.phase, "lobby");
  assert.equal(
    r.lobby.members.every((m) => !m.ready),
    true,
  );
  assert.equal(r.engine, null);
});
test("Broomball allows duplicate fighters and uneven teams up to six", () => {
  const r = new Room("ABCDEF", () => {});
  const host = r.join("Host");
  for (let i = 0; i < 5; i++) r.join("Guest " + i);
  r.command(host.id, { type: "mode", mode: "broomball" });
  for (const m of r.lobby.members)
    r.command(m.id, { type: "ready", ready: true });
  assert.equal(r.validation(), null);
  // Duplicate fighter on the same team is now permitted.
  r.lobby.members[1].fighter = r.lobby.members[0].fighter;
  r.lobby.members[1].team = r.lobby.members[0].team;
  assert.equal(r.validation(), null);
  // Uneven split is permitted.
  for (const m of r.lobby.members) m.team = 0;
  assert.equal(r.validation(), null);
});
test("Broomball is capped at six players", () => {
  const r = new Room("ABCDEF", () => {});
  for (let i = 0; i < 6; i++) r.join("P" + i);
  r.command(r.lobby.host, { type: "mode", mode: "broomball" });
  assert.throws(() => r.join("Overflow"), /full/);
});
test("Showdown has no minimum and is capped at ten players", () => {
  const r = new Room("ABCDEF", () => {});
  const host = r.join("Host");
  // A single readied host can start (no minimum).
  r.command(host.id, { type: "ready", ready: true });
  assert.equal(r.validation(), null);
  // Fill to ten total and confirm the engine spawns everyone without error.
  for (let i = 0; i < 9; i++) r.join("Guest " + i);
  assert.equal(r.lobby.members.length, 10);
  assert.throws(() => r.join("Overflow"), /full/);
  for (const m of r.lobby.members)
    r.command(m.id, { type: "ready", ready: true });
  assert.equal(r.validation(), null);
  const e = new Engine("showdown", r.lobby.members);
  assert.equal(e.playerList.length, 10);
  assert.equal(
    e.playerList.every((p) => Number.isFinite(p.pos.x) && Number.isFinite(p.pos.y)),
    true,
  );
});
test("malformed inputs cannot mutate HP, cooldowns or score", () => {
  const e = engine();
  const p = e.playerList[0];
  const hp = p.hp;
  e.setInput(p.id, {
    move: { x: 0, y: 0 },
    aim: { x: 1, y: 0 },
    hp: 1,
    score: [99, 99],
  } as never);
  e.step();
  assert.equal(p.hp, hp);
  assert.deepEqual(e.state.score, [0, 0]);
});
test("eight-player Showdown completes at the hard limit and independent rooms stay separate", () => {
  const a = new Engine("showdown", members(8)),
    b = new Engine("showdown", members(4));
  advance(a, 214);
  assert.equal(a.state.phase, "finished");
  assert.equal(b.state.time, 0);
  assert.deepEqual(
    a.playerList.map((p) => p.placement).sort((a, b) => a - b),
    [1, 2, 3, 4, 5, 6, 7, 8],
  );
});
test("queued action survives a newer movement-only packet before a host tick", () => {
  const e = engine();
  const p = e.playerList[0];
  fire(e);
  e.setInput(p.id, { move: { x: 0, y: 0 }, aim: { x: 1, y: 0 } });
  e.step();
  assert.equal(p.ammo, 2);
});
test("Josh can damage destructible healing stations with his cone", () => {
  const e = engine("josh");
  const [p, t] = e.playerList;
  t.fighter = "samuel";
  t.pos = { x: 14, y: 12 };
  t.aim = { x: -1, y: 0 };
  t.charge = 5000;
  assert.ok(e.activateSuper(t));
  p.pos = { x: 7, y: 12 };
  fire(e);
  e.step();
  assert.equal(e.state.areas[0].hp, 1050);
});
test("final snapshots include all results even if survivors are inside bushes", () => {
  const e = engine();
  e.playerList[1].pos = { x: 5, y: 12 };
  e.finish("p0");
  assert.equal(e.snapshot("p0").players.length, 2);
});
test("Daniel charge stops at a diagonal wall impact instead of sliding along it", () => {
  const e = engine("daniel");
  const p = e.playerList[0];
  p.pos = { x: 6, y: 6 };
  p.aim = { x: Math.SQRT1_2, y: Math.SQRT1_2 };
  p.charge = 5000;
  e.state.walls = [{ id: "barrier", x: 8, y: 2, w: 1, h: 18 }];
  e.activateSuper(p);
  advance(e, 0.6);
  const stop = { ...p.pos };
  advance(e, 0.4);
  assert.ok(p.pos.x < 7.59);
  assert.deepEqual(p.pos, stop);
});

test("Ethan Rizz spends one ammo for two damaging notes", () => {
  const e = engine("ethan", "broomball");
  const [p, , , target] = e.playerList;
  p.pos = { x: 10, y: 10 };
  target.pos = { x: 13, y: 10 };
  const hp = target.hp;
  fire(e);
  e.step();
  assert.equal(p.ammo, 2);
  assert.equal(e.state.projectiles.length, 2);
  advance(e, 0.25);
  assert.equal(target.hp, hp - 840);
  assert.equal(p.charge, 840);
});
test("Ethan Aura Pulse knocks out rivals, spares allies, respects range and does not recharge", () => {
  const e = engine("ethan", "broomball");
  const [p, ally, far, enemy] = e.playerList;
  p.pos = { x: 10, y: 10 };
  ally.pos = { x: 12, y: 10 };
  far.pos = { x: 15, y: 10 };
  enemy.pos = { x: 10, y: 12 };
  p.hp -= 1500;
  ally.hp -= 500;
  far.hp -= 500;
  const hp = enemy.hp,
    farHp = far.hp;
  p.charge = 5000;
  assert.equal(e.activateSuper(p), true);
  assert.equal(p.hp, 3900);
  assert.equal(ally.hp, FIGHTERS[ally.fighter].hp - 500);
  assert.equal(far.hp, farHp);
  assert.equal(enemy.hp, 0);
  assert.equal(enemy.alive, false);
  assert.equal(p.charge, 0);
  assert.equal(p.stats.healing, 0);
});
test("Aura Pulse cannot pass through walls or activate while carrying the ball", () => {
  const e = engine("ethan", "broomball");
  const [p, , , enemy] = e.playerList;
  p.pos = { x: 10, y: 10 };
  enemy.pos = { x: 12, y: 10 };
  e.state.walls = [{ id: "barrier", x: 11, y: 9, w: 0.5, h: 2 }];
  const hp = enemy.hp;
  p.charge = 5000;
  e.state.ball.carrier = p.id;
  assert.equal(e.activateSuper(p), false);
  assert.equal(p.charge, 5000);
  e.state.ball.carrier = null;
  assert.equal(e.activateSuper(p), true);
  assert.equal(enemy.hp, hp);
});

test("Aura Pulse respects spawn protection and knocks out multiple opponents", () => {
  const e = engine("ethan", "broomball");
  const [p, , , a, b, shielded] = e.playerList;
  p.pos = { x: 10, y: 10 };
  a.pos = { x: 11, y: 10 };
  b.pos = { x: 10, y: 12 };
  shielded.pos = { x: 9, y: 10 };
  shielded.protectedUntil = e.state.time + 1.5;
  p.charge = 5000;
  e.activateSuper(p);
  assert.equal(a.alive, false);
  assert.equal(b.alive, false);
  assert.equal(shielded.hp, FIGHTERS[shielded.fighter].hp);
  assert.equal(p.stats.kills, 2);
});

test("presentation events carry stable ids, authoritative ticks, and payloads", () => {
  const e = engine("brandon");
  const p = e.playerList[0];
  e.state.events = [];
  fire(e);
  e.step();
  const started = e.state.events.filter((v) => v.type === "attack_started");
  const spawned = e.state.events.filter((v) => v.type === "projectile_spawned");
  assert.equal(started.length, 1);
  assert.equal(spawned.length, 1);
  assert.equal(started[0].owner, p.id);
  assert.equal(started[0].tick, e.state.tick);
  // Stable, strictly increasing ids so the client can dedupe.
  const ids = e.state.events.map((v) => v.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("attack_hit and fighter_eliminated events fire from authoritative damage", () => {
  const e = engine("brandon");
  const [p, enemy] = e.playerList;
  // Drive the authoritative damage path directly (the instrumented code).
  e.state.events = [];
  const before = enemy.hp;
  assert.equal(e.damage(enemy, 500, p), true);
  const hits = e.state.events.filter((v) => v.type === "attack_hit");
  assert.equal(hits.length, 1, "a hit event should be emitted");
  assert.equal(hits[0].value, Math.round(before - enemy.hp));
  assert.ok((hits[0].value ?? 0) > 0, "hit carries damage value");
  // Kill the enemy outright and confirm an elimination event is emitted.
  e.state.events = [];
  enemy.hp = 1;
  e.damage(enemy, 9999, p);
  assert.equal(enemy.alive, false);
  assert.equal(
    e.state.events.filter((v) => v.type === "fighter_eliminated").length,
    1,
  );
});

test("goal, pickup, and release events fire in broomball", () => {
  const e = engine("brandon", "broomball");
  const p = e.playerList[0];
  e.state.ball.state = "free";
  e.state.ball.pos = { x: p.pos.x + 0.3, y: p.pos.y };
  e.state.events = [];
  e.step();
  assert.ok(
    e.state.events.some((v) => v.type === "ball_picked_up"),
    "pickup emits when a player meets a free ball",
  );
  // A carrier that releases emits ball_released.
  e.state.events = [];
  e.dropBall(p);
  assert.ok(e.state.events.some((v) => v.type === "ball_released"));
});

test("events are pruned to a short rolling window", () => {
  const e = engine("brandon");
  e.emit("attack_started", { x: 1, y: 1 }, "p0");
  const first = e.state.events.at(-1)!;
  // Advance well past the window; the old event must be pruned.
  advance(e, 1);
  assert.ok(
    !e.state.events.some((v) => v.id === first.id),
    "stale events are dropped from the snapshot window",
  );
});

test("snapshot carries sampleTime and acknowledges the highest processed input seq", () => {
  const e = engine("brandon");
  // Out-of-order and stale sequences must not lower the ack.
  e.setInput("p0", { move: { x: 0, y: 0 }, aim: { x: 1, y: 0 }, seq: 5 });
  e.setInput("p0", { move: { x: 0, y: 0 }, aim: { x: 1, y: 0 }, seq: 3 });
  e.setInput("p0", { move: { x: 0, y: 0 }, aim: { x: 1, y: 0 }, seq: 9 });
  e.step();
  const snap = e.snapshot("p0");
  assert.equal(snap.ackSeq, 9, "ack reflects the highest seq, not the latest");
  // sampleTime is quantized for the wire; it should match within rounding.
  assert.ok(Math.abs(snap.sampleTime - e.state.time) < 0.001);
  // A different viewer with no inputs gets ack 0.
  assert.equal(e.snapshot("p1").ackSeq, 0);
});

test("inputs without a seq are still accepted and leave ack at zero", () => {
  const e = engine("brandon");
  assert.equal(
    e.setInput("p0", { move: { x: 1, y: 0 }, aim: { x: 1, y: 0 } }),
    true,
  );
  e.step();
  assert.equal(e.snapshot("p0").ackSeq, 0);
});

test("snapshot compaction quantizes the wire copy without mutating authority", () => {
  const e = engine("brandon");
  const p = e.playerList[0];
  // Give the authoritative player a high-precision position.
  p.pos = { x: 12.3456789, y: 7.9876543 };
  p.hp = 4211.7;
  const authoritativeBefore = { ...p.pos };
  const snap = e.snapshot("p0");
  const sp = snap.players.find((x) => x.id === p.id)!;
  // Wire copy is quantized to 0.01 units; HP is integer (ceil).
  assert.equal(sp.pos.x, 12.35);
  assert.equal(sp.pos.y, 7.99);
  assert.equal(sp.hp, 4212);
  // Authoritative state is untouched — simulation precision is preserved.
  assert.deepEqual(p.pos, authoritativeBefore);
  assert.equal(p.hp, 4211.7);
});

// --- Timestamped movement timeline (authority input queue) ---------------
const speed0 = (e: Engine) => FIGHTERS[e.playerList[0].fighter].speed;
const timed = (e: Engine, t: number, move: { x: number; y: number }) =>
  e.setInput("p0", { move, aim: { x: 1, y: 0 }, t });

test("timeline applies each input for the time it was held, in order", () => {
  const e = engine("brandon");
  const p = e.playerList[0];
  p.pos = { x: 18, y: 6 };
  const start = { ...p.pos };
  // Streamed 30 Hz inputs: +x for 0.2 s, then a turn to +y between ticks.
  for (let k = 0; k < 12; k++) {
    timed(e, 10 + k / 30, k < 6 ? { x: 1, y: 0 } : { x: 0, y: 1 });
    e.step();
  }
  const applied = e.snapshot("p0").ackTime - 10;
  assert.ok(applied > 0.35, `applied ${applied}`);
  // x moved exactly while +x was held; y covers the rest of applied time.
  assert.ok(Math.abs(p.pos.x - start.x - speed0(e) * 0.2) < 0.02, `x ${p.pos.x}`);
  assert.ok(
    Math.abs(p.pos.y - start.y - speed0(e) * (applied - 0.2)) < 0.03,
    `y ${p.pos.y}`,
  );
});

test("timeline holds position during a stall, then catches up at no more than 2x", () => {
  const e = engine("brandon");
  const p = e.playerList[0];
  p.pos = { x: 6, y: 6 };
  timed(e, 0, { x: 1, y: 0 });
  // No further inputs for 0.3 s: the authority extrapolates 60 ms and holds.
  for (let i = 0; i < 9; i++) e.step();
  const held = p.pos.x - 6;
  assert.ok(Math.abs(held - speed0(e) * 0.06) < 0.02, `held ${held}`);
  // The delayed inputs arrive: +x actually continued to t=0.3, then stop.
  timed(e, 0.3, { x: 0, y: 0 });
  let maxStep = 0;
  for (let i = 0; i < 15; i++) {
    const x = p.pos.x;
    e.step();
    maxStep = Math.max(maxStep, p.pos.x - x);
  }
  assert.ok(maxStep <= (2 * speed0(e)) / 30 + 1e-6, `step ${maxStep}`);
  // Full intended path recovered (0.3 s of movement), within banked limits.
  assert.ok(Math.abs(p.pos.x - 6 - speed0(e) * 0.3) < 0.03, `x ${p.pos.x}`);
});

test("timeline cannot exceed real-time speed even with forged timestamps", () => {
  const e = engine("brandon");
  const p = e.playerList[0];
  p.pos = { x: 4, y: 12 };
  // A client claims 10 s of held movement in one instant.
  timed(e, 0, { x: 1, y: 0 });
  timed(e, 10, { x: 1, y: 0 });
  const x0 = p.pos.x;
  for (let i = 0; i < 30; i++) e.step();
  // One real second: at most speed x (1 s + bankMax).
  assert.ok(p.pos.x - x0 <= speed0(e) * 1.25 + 1e-6, `moved ${p.pos.x - x0}`);
});

test("timeline does not turn countdown inputs into a burst at Go", () => {
  const e = new Engine("showdown", members());
  const p = e.playerList[0];
  const start = { ...p.pos };
  for (let i = 0; i < 89; i++) {
    timed(e, i / 30, { x: 1, y: 0 });
    e.step();
  }
  assert.deepEqual(p.pos, start, "no movement during countdown");
  timed(e, 89 / 30, { x: 1, y: 0 });
  e.step();
  e.step();
  assert.ok(p.pos.x - start.x <= (2 * speed0(e)) / 30 + 1e-6, `${p.pos.x - start.x}`);
});

test("timeline consumes time without moving while stunned", () => {
  const e = engine("brandon");
  const p = e.playerList[0];
  p.pos = { x: 6, y: 12 };
  p.stunUntil = e.state.time + 0.5;
  for (let i = 0; i < 15; i++) {
    timed(e, 20 + i / 30, { x: 1, y: 0 });
    e.step();
  }
  assert.equal(p.pos.x, 6, "stunned fighter does not move");
  for (let i = 15; i < 18; i++) {
    timed(e, 20 + i / 30, { x: 1, y: 0 });
    e.step();
  }
  // After the stun, no replay of the stunned period.
  assert.ok(p.pos.x - 6 < speed0(e) * 0.15, `moved ${p.pos.x - 6}`);
});

test("timeline restarts when the client clock jumps back (reload)", () => {
  const e = engine("brandon");
  timed(e, 500, { x: 1, y: 0 });
  e.step();
  timed(e, 1, { x: 0, y: 1 });
  const p = e.playerList[0];
  const y = p.pos.y;
  e.step();
  e.step();
  assert.ok(p.pos.y > y, "new timeline is applied");
});

// --- Ministry leaders beyond the pilot seven -------------------------------
/** A started match with p0 as `fighter`, p1 (and p3.. in broomball) as rivals. */
const duel = (fighter: FighterId, mode: "showdown" | "broomball" = "showdown") => {
  const e = engine(fighter, mode);
  e.state.walls = [];
  return e;
};
const charged = (p: { charge: number }) => (p.charge = 5000);

test("every fighter can attack and Super in both modes without breaking the match", () => {
  for (const mode of ["showdown", "broomball"] as const)
    for (const id of IDS) {
      const e = engine(id, mode);
      const [p] = e.playerList;
      const rival = e.playerList[mode === "showdown" ? 1 : 3];
      p.pos = { x: 10, y: mode === "showdown" ? 12 : 10 };
      rival.pos = { x: 13, y: p.pos.y };
      // A rewind needs two seconds of history before it can resolve.
      advance(e, 2.2);
      charged(p);
      e.setInput(p.id, { move: { x: 0, y: 0 }, aim: { x: 1, y: 0 }, attack: true, super: true });
      advance(e, 3);
      assert.ok(p.charge < 5000, `${id} ${mode} Super was not accepted`);
      assert.ok(rival.hp < FIGHTERS[rival.fighter].hp || !rival.alive, `${id} ${mode} dealt no damage`);
      // The wire copy must survive JSON: no Infinity or NaN anywhere.
      const snap = e.snapshot(p.id);
      const finiteNumbers = (value: unknown): boolean => {
        if (typeof value === "number") return Number.isFinite(value);
        if (value && typeof value === "object")
          return Object.values(value).every(finiteNumbers);
        return true;
      };
      assert.ok(finiteNumbers(snap), `${id} ${mode} non-finite wire value`);
      for (const q of e.state.projectiles) assert.ok(Number.isFinite(q.pos.x), id);
    }
});

test("Dylan's line cast reels a rival closer without dropping the ball", () => {
  const e = duel("dylan", "broomball");
  const [p, , , t] = e.playerList;
  p.pos = { x: 10, y: 10 };
  t.pos = { x: 15, y: 10 };
  e.state.ball.carrier = t.id;
  e.state.ball.state = "carried";
  fire(e);
  advance(e, 0.4);
  assert.equal(t.hp, FIGHTERS[t.fighter].hp - 720);
  assert.ok(Math.abs(t.pos.x - 13.8) < 0.05, `reeled to ${t.pos.x}`);
  assert.equal(e.state.ball.carrier, t.id, "a tug is not a knockback");
});

test("Dylan's net lands after a visible delay, drags rivals in and stuns them", () => {
  const e = duel("dylan");
  const [p, t] = e.playerList;
  p.pos = { x: 10, y: 12 };
  t.pos = { x: 16, y: 12 };
  charged(p);
  assert.ok(e.activateSuper(p));
  assert.ok(e.state.effects.some((x) => x.kind === "marker"));
  assert.equal(t.hp, FIGHTERS[t.fighter].hp, "nothing lands before the delay");
  advance(e, 0.45);
  assert.equal(t.hp, FIGHTERS[t.fighter].hp - 500);
  assert.ok(Math.abs(t.pos.x - 15) < 0.05, `pulled to ${t.pos.x}`);
  assert.ok(t.stunUntil > e.state.time);
});

test("Isaac's stapler fires three staples per ammo; his barrier blocks enemy shots only", () => {
  const e = duel("isaac", "broomball");
  const [p, ally, , rival] = e.playerList;
  p.pos = { x: 10, y: 10 };
  rival.pos = { x: 14, y: 10 };
  ally.pos = { x: 4, y: 3 };
  fire(e);
  e.step();
  assert.equal(p.ammo, 2, "one ammo for the whole burst");
  advance(e, 0.6);
  assert.equal(rival.hp, FIGHTERS[rival.fighter].hp - 990);
  // Barrier 1.8 ahead, facing right; a rival shooting left hits it.
  p.aim = { x: 1, y: 0 };
  charged(p);
  assert.ok(e.activateSuper(p));
  const wall = e.state.areas.find((a) => a.kind === "barrier")!;
  assert.ok(wall);
  rival.fighter = "rich";
  rival.pos = { x: 16, y: 10 };
  const before = p.hp;
  fire(e, rival.id, { x: -1, y: 0 });
  advance(e, 0.5);
  assert.equal(p.hp, before, "the barrier absorbed the shot");
  assert.equal(wall.hp, 3000 - 1350);
  // Isaac's own staples pass through his barrier.
  rival.hp = FIGHTERS.rich.hp;
  p.ammo = 3;
  fire(e);
  advance(e, 0.6);
  assert.ok(rival.hp < FIGHTERS.rich.hp, "own shots cross the barrier");
});

test("Tovya's ladle hits everyone in a wide arc; the leap clears cover and lands a slam", () => {
  const e = engine("tovya", "broomball");
  const [p, , , a, b] = e.playerList;
  p.pos = { x: 10, y: 10 };
  a.pos = { x: 11.5, y: 8.8 };
  b.pos = { x: 11.5, y: 11.2 };
  fire(e);
  e.step();
  assert.equal(a.hp, FIGHTERS[a.fighter].hp - 1050);
  assert.equal(b.hp, FIGHTERS[b.fighter].hp - 1050);
  e.state.walls = [{ id: "cover", x: 12, y: 7, w: 1, h: 6 }];
  a.pos = { x: 16, y: 10 };
  a.hp = FIGHTERS[a.fighter].hp;
  p.aim = { x: 1, y: 0 };
  charged(p);
  assert.ok(e.activateSuper(p));
  assert.ok(p.busyUntil > e.state.time, "airborne fighters cannot act");
  advance(e, 0.6);
  assert.ok(Math.abs(p.pos.x - 16) < 0.01, `landed at ${p.pos.x}`);
  assert.equal(a.hp, FIGHTERS[a.fighter].hp - 1200);
  assert.ok(a.pos.x > 16.4, "the slam knocks rivals back");
  assert.equal(p.charge, 0);
});

test("Rosalie's wave pierces every rival in its path", () => {
  const e = duel("rosalie", "broomball");
  const [p, , , a, b] = e.playerList;
  p.pos = { x: 10, y: 10 };
  a.pos = { x: 12, y: 10 };
  b.pos = { x: 14, y: 10.3 };
  fire(e);
  advance(e, 0.6);
  assert.equal(a.hp, FIGHTERS[a.fighter].hp - 800);
  assert.equal(b.hp, FIGHTERS[b.fighter].hp - 800);
});

test("Rosalie's red panda chases a rival, can be destroyed, and leaves with her", () => {
  const e = duel("rosalie");
  const [p, t] = e.playerList;
  p.pos = { x: 6, y: 12 };
  t.pos = { x: 14, y: 12 };
  p.aim = { x: 1, y: 0 };
  charged(p);
  assert.ok(e.activateSuper(p));
  const panda = e.state.areas.find((a) => a.kind === "panda")!;
  assert.ok(panda, "the panda is out");
  advance(e, 2.5);
  assert.ok(distance(panda.pos, t.pos) < 1.3, "it walked to the rival");
  assert.ok(t.hp < FIGHTERS[t.fighter].hp, "and swiped");
  assert.equal(p.charge, 0, "panda damage is Super damage: no charge");
  // A second panda replaces the first.
  charged(p);
  assert.ok(e.activateSuper(p));
  assert.equal(e.state.areas.filter((a) => a.kind === "panda").length, 1);
  // Shots wear it down.
  const next = e.state.areas.find((a) => a.kind === "panda")!;
  t.fighter = "rich";
  t.pos = { x: next.pos.x + 4, y: next.pos.y };
  next.hp = 1000;
  fire(e, t.id, { x: -1, y: 0 });
  advance(e, 0.3);
  assert.equal(e.state.areas.some((a) => a.kind === "panda"), false, "destroyed");
  // Bound: it disappears when Rosalie is eliminated.
  charged(p);
  e.playerList[0].pos = { x: 6, y: 12 };
  assert.ok(e.activateSuper(p));
  e.damage(p, 99999, t);
  assert.equal(e.state.areas.some((a) => a.kind === "panda"), false);
});

test("Joelle's throw comes back and hits on both legs", () => {
  const e = duel("joelle");
  const [p, t] = e.playerList;
  p.pos = { x: 10, y: 12 };
  t.pos = { x: 13, y: 12 };
  fire(e);
  advance(e, 1.6);
  assert.equal(t.hp, FIGHTERS[t.fighter].hp - 1120);
  assert.equal(e.state.projectiles.length, 0, "caught on the way home");
});

test("Joelle's Super swaps places with the first rival hit and stuns them", () => {
  const e = duel("joelle", "broomball");
  const [p, , , t] = e.playerList;
  p.pos = { x: 10, y: 10 };
  t.pos = { x: 15, y: 10 };
  charged(p);
  assert.ok(e.activateSuper(p));
  advance(e, 0.4);
  assert.ok(Math.abs(p.pos.x - 15) < 0.01 && Math.abs(t.pos.x - 10) < 0.01);
  assert.equal(t.hp, FIGHTERS[t.fighter].hp - 500);
  assert.ok(t.stunUntil > e.state.time);
});

test("Susannah's post chains to a second rival; her lob flies over cover", () => {
  const e = duel("susannah", "broomball");
  const [p, , , a, b] = e.playerList;
  p.pos = { x: 10, y: 10 };
  a.pos = { x: 13, y: 10 };
  b.pos = { x: 15, y: 11 };
  fire(e);
  advance(e, 0.4);
  assert.equal(a.hp, FIGHTERS[a.fighter].hp - 720);
  assert.equal(b.hp, FIGHTERS[b.fighter].hp - 450);
  assert.equal(p.charge, 1170);
  e.state.walls = [{ id: "cover", x: 12, y: 6, w: 1, h: 8 }];
  b.pos = { x: 16, y: 10 };
  b.hp = FIGHTERS[b.fighter].hp;
  p.aim = { x: 1, y: 0 };
  charged(p);
  assert.ok(e.activateSuper(p));
  advance(e, 0.7);
  assert.equal(b.hp, FIGHTERS[b.fighter].hp - 1300);
});

test("Joyce's note curves into a rival; her Super heals the whole team and protects it", () => {
  const e = duel("joyce", "broomball");
  const [p, ally, far, rival] = e.playerList;
  p.pos = { x: 10, y: 10 };
  rival.pos = { x: 15, y: 12 };
  fire(e, p.id, { x: 1, y: 0 });
  advance(e, 0.8);
  assert.equal(rival.hp, FIGHTERS[rival.fighter].hp - 700, "homed in from a straight-ahead aim");
  ally.pos = { x: 30, y: 2 };
  ally.hp -= 2500;
  far.hp -= 600;
  p.hp -= 1000;
  charged(p);
  assert.ok(e.activateSuper(p));
  assert.equal(ally.hp, FIGHTERS[ally.fighter].hp - 700, "any distance");
  assert.equal(far.hp, FIGHTERS[far.fighter].hp);
  assert.equal(p.hp, FIGHTERS.joyce.hp);
  assert.ok(ally.protectedUntil > e.state.time && p.protectedUntil > e.state.time);
  assert.equal(e.damage(ally, 500, rival), false);
});

test("Miriam's dove slows by the strongest slow only; Be Still stuns around her", () => {
  const e = duel("miriam");
  const [p, t] = e.playerList;
  p.pos = { x: 10, y: 12 };
  t.pos = { x: 13, y: 12 };
  fire(e);
  advance(e, 0.4);
  assert.equal(t.hp, FIGHTERS[t.fighter].hp - 680);
  assert.equal(t.slow, 0.3);
  advance(e, 1.5);
  assert.equal(t.slow, 0, "the slow wears off");
  charged(p);
  assert.ok(e.activateSuper(p));
  assert.ok(t.stunUntil > e.state.time + 1);
});

test("Jemuel's ring hits behind him too; his covering shield absorbs damage first", () => {
  const e = engine("jemuel", "broomball");
  const [p, ally, , a, b] = e.playerList;
  p.pos = { x: 10, y: 10 };
  a.pos = { x: 8, y: 10 };
  b.pos = { x: 12, y: 10 };
  fire(e);
  e.step();
  assert.equal(a.hp, FIGHTERS[a.fighter].hp - 900);
  assert.equal(b.hp, FIGHTERS[b.fighter].hp - 900);
  ally.pos = { x: 11, y: 11 };
  charged(p);
  assert.ok(e.activateSuper(p));
  assert.equal(ally.shield, 2000);
  assert.equal(p.shield, 2000);
  e.damage(ally, 2500, a);
  assert.equal(ally.shield, 0);
  assert.equal(ally.hp, FIGHTERS[ally.fighter].hp - 500);
  assert.equal(a.stats.damage, 2500, "absorbed damage still counts as dealt");
  advance(e, 6.1);
  assert.equal(p.shield, 0, "the shield expires");
});

test("Russell's coins refund health; Budget Cuts empties rivals' ammo", () => {
  const e = duel("russell");
  const [p, t] = e.playerList;
  p.pos = { x: 10, y: 12 };
  t.pos = { x: 13, y: 12 };
  p.hp -= 1000;
  fire(e);
  advance(e, 0.3);
  assert.equal(t.hp, FIGHTERS[t.fighter].hp - 760);
  assert.equal(p.hp, FIGHTERS.russell.hp - 1000 + 266);
  t.ammo = 3;
  charged(p);
  assert.ok(e.activateSuper(p));
  assert.equal(t.ammo, 0);
  assert.equal(t.hp, FIGHTERS[t.fighter].hp - 760 - 700);
});

test("Aura Pulse still knocks out a shielded rival", () => {
  const e = engine("ethan");
  const [p, t] = e.playerList;
  p.pos = { x: 10, y: 12 };
  t.pos = { x: 12, y: 12 };
  t.shield = 2000;
  t.shieldUntil = e.state.time + 5;
  charged(p);
  e.activateSuper(p);
  assert.equal(t.alive, false);
});

test("a thrown Super behind cover is cut short; a zone behind cover keeps the charge", () => {
  const e = duel("dylan");
  const [p, t] = e.playerList;
  p.pos = { x: 10, y: 12 };
  t.pos = { x: 15, y: 12 };
  e.state.walls = [{ id: "cover", x: 11, y: 10, w: 0.5, h: 4 }];
  charged(p);
  assert.ok(e.activateSuper(p));
  advance(e, 0.5);
  assert.equal(t.hp, FIGHTERS[t.fighter].hp, "the net hit the cover instead");
  const z = duel("rosalie");
  const r = z.playerList[0];
  r.pos = { x: 10, y: 12 };
  z.state.walls = [{ id: "cover", x: 11, y: 10, w: 0.5, h: 4 }];
  charged(r);
  assert.equal(z.activateSuper(r), false);
  assert.equal(r.charge, 5000);
});

test("rooms offer every fighter as a default pick", () => {
  const r = new Room("ABCDEF", () => {});
  for (let i = 0; i < 10; i++) r.join("P" + i);
  assert.deepEqual(
    r.lobby.members.map((m) => m.fighter),
    IDS.slice(0, 10),
  );
});
