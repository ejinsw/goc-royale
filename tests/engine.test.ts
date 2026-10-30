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
test("roster contains the seven fighters with canonical HP", () => {
  assert.deepEqual(IDS, [
    "brandon",
    "daniel",
    "rich",
    "samuel",
    "josh",
    "elijah",
    "ethan",
  ]);
  assert.deepEqual(
    IDS.map((i) => FIGHTERS[i].hp),
    [5700, 8200, 4600, 5900, 5600, 5100, 5400],
  );
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
test("Broomball start enforces exactly six and no same-team duplicate fighters", () => {
  const r = new Room("ABCDEF", () => {});
  const host = r.join("Host");
  for (let i = 0; i < 5; i++) r.join("Guest " + i);
  r.command(host.id, { type: "mode", mode: "broomball" });
  for (const m of r.lobby.members)
    r.command(m.id, { type: "ready", ready: true });
  assert.equal(r.validation(), null);
  r.lobby.members[1].fighter = r.lobby.members[0].fighter;
  assert.match(r.validation()!, /different fighters/);
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
