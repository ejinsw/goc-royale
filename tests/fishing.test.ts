import { test } from "node:test";
import assert from "node:assert/strict";
import { Engine } from "../shared/engine";
import { Room } from "../shared/room";
import {
  FIGHTERS,
  FISH,
  FISHERS,
  IDS,
  MAPS,
  MODES,
  distance,
  moveSpeed,
  type FighterId,
} from "../shared/definitions";
import type { HostMessage, Member, Player } from "../shared/types";
import { stepMove } from "../client/src/prediction";

const members = (n: number, fighter?: FighterId): Member[] =>
  Array.from({ length: n }, (_, i) => ({
    id: "p" + i,
    name: "Player " + i,
    fighter: fighter ?? IDS[i % IDS.length],
    team: i < 3 ? 0 : 1,
    ready: true,
    connected: true,
  }));
const seeded = (seed: number) => () => {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
};
const advance = (e: Engine, seconds: number) => {
  for (let i = 0; i < Math.round(seconds * 30); i++) e.step();
};
/** A started Fishers of Men match (past the countdown). */
const match = (n = 6, seed = 7, fighter?: FighterId) => {
  const e = new Engine("fishing", members(n, fighter), seeded(seed));
  advance(e, 3.1);
  return e;
};
const fishOf = (e: Engine) => e.playerList.filter((p) => p.team === FISH);
const fishersOf = (e: Engine) => e.playerList.filter((p) => p.team === FISHERS);
const bear = MAPS.fishing.respawns![FISHERS];
const atBear = (p: Player) => bear.some((d) => distance(d, p.pos) < 0.01);
/** Park everyone far apart so nothing but the test's own actions lands. */
const spread = (e: Engine) =>
  e.playerList.forEach((p, i) => (p.pos = { ...MAPS.fishing.spawns[i] }));

test("fishing: a quarter of the party starts as Fishers at the Bruin Bear, the rest as Fish on spawns", () => {
  for (const [n, fishers] of [
    [1, 1],
    [2, 1],
    [4, 1],
    [6, 2],
    [8, 2],
    [10, 3],
  ]) {
    const e = new Engine("fishing", members(n), seeded(n));
    assert.equal(fishersOf(e).length, fishers, `${n} players`);
    assert.equal(fishOf(e).length, n - fishers);
    for (const p of fishersOf(e)) assert.ok(atBear(p), `${p.id} starts at the Bruin Bear`);
    for (const p of fishOf(e))
      assert.ok(MAPS.fishing.spawns.some((s) => distance(s, p.pos) < 0.01));
    assert.deepEqual(e.state.score, [n - fishers, fishers]);
  }
  // Seeded and independent of lobby teams.
  const a = new Engine("fishing", members(10), seeded(3));
  const b = new Engine("fishing", members(10), seeded(3));
  assert.deepEqual(
    a.playerList.map((p) => p.team),
    b.playerList.map((p) => p.team),
  );
});

test("fishing: Fish are allies of Fish and Fishers of Fishers", () => {
  // Rich's shot is a plain projectile: what it hits shows who is an ally.
  const e = match(6, 7, "rich");
  spread(e);
  const [f0, f1] = fishOf(e);
  const [h0, h1] = fishersOf(e);
  assert.ok(e.allies(f0, f1) && e.allies(h0, h1));
  assert.ok(!e.allies(f0, h0));
  const shoot = (from: Player, at: Player) => {
    from.pos = { x: 4, y: 22 };
    at.pos = { x: 7, y: 22 };
    e.setInput(from.id, { move: { x: 0, y: 0 }, aim: { x: 1, y: 0 }, attack: true });
    advance(e, 1);
    const hurt = at.hp < FIGHTERS[at.fighter].hp;
    spread(e);
    return hurt;
  };
  assert.equal(shoot(f0, f1), false, "no friendly fire between Fish");
  assert.equal(shoot(h0, h1), false, "no friendly fire between Fishers");
  assert.equal(shoot(f0, h0), true, "Fish can fight back");
});

test("fishing: a caught Fish joins the Fishers, is credited to its catcher and returns at the Bruin Bear", () => {
  const e = match(6);
  spread(e);
  const fish = fishOf(e);
  const [catcher] = fishersOf(e);
  const target = fish[0];
  const before = fish.length;
  // Anything the Fish still has in play is withdrawn when it changes sides.
  e.state.projectiles.push({
    id: 999,
    owner: target.id,
    fighter: target.fighter,
    pos: { ...target.pos },
    dir: { x: 1, y: 0 },
    remaining: 5,
    traveled: 0,
    bounces: 0,
  });
  e.damage(target, 1e6, catcher);
  assert.equal(target.alive, false);
  assert.equal(target.team, FISHERS);
  assert.equal(target.placement, before, "the first caught places last among Fish");
  assert.equal(catcher.stats.catches, 1);
  assert.equal(catcher.stats.kills, 1);
  assert.ok(!e.state.projectiles.some((q) => q.owner === target.id));
  assert.match(e.state.notice, /caught/);
  const caught = e.state.events.find((ev) => ev.type === "fighter_caught");
  assert.equal(caught?.owner, catcher.id);
  assert.equal(caught?.target, target.id);
  assert.ok(e.state.effects.some((fx) => fx.kind === "caught" && fx.owner === catcher.id));
  e.step();
  assert.deepEqual(e.state.score, [before - 1, 6 - before + 1]);
  advance(e, MODES.fishing.respawn! - 0.1);
  assert.equal(target.alive, false, "not back before the respawn delay");
  advance(e, 0.2);
  assert.equal(target.alive, true);
  assert.equal(target.team, FISHERS);
  assert.ok(atBear(target));
  assert.ok(target.protectedUntil > e.state.time, "spawn protection");
  assert.equal(target.hp, FIGHTERS[target.fighter].hp);
});

test("fishing: a knocked-out Fisher comes back as a Fisher; Fish never come back as Fish", () => {
  const e = match(6);
  spread(e);
  const [fish] = fishOf(e);
  const [fisher] = fishersOf(e);
  e.damage(fisher, 1e6, fish);
  assert.equal(fisher.team, FISHERS);
  assert.equal(fisher.placement, 0, "a Fisher's knockout does not place it");
  assert.equal(fish.stats.catches, 0);
  advance(e, MODES.fishing.respawn! + 0.1);
  assert.ok(fisher.alive && atBear(fisher));
  // The point by the Bear farthest from living Fish is used.
  const far = (p: { x: number; y: number }) =>
    Math.min(...fishOf(e).map((f) => distance(f.pos, p)));
  assert.equal(far(fisher.pos), Math.max(...bear.map(far)));
});

test("fishing: a Fisher never respawns on top of a fighter standing at the Bear", () => {
  const e = match(6);
  spread(e);
  const [fish] = fishOf(e);
  const [down, standing] = fishersOf(e);
  const far = (p: { x: number; y: number }) =>
    Math.min(...fishOf(e).map((f) => distance(f.pos, p)));
  // Another Fisher stands on the point that would otherwise be chosen.
  const best = bear.reduce((a, b) => (far(b) > far(a) ? b : a));
  standing.pos = { ...best };
  e.damage(down, 1e6, fish);
  advance(e, MODES.fishing.respawn! + 0.1);
  assert.ok(down.alive && atBear(down));
  assert.ok(distance(down.pos, standing.pos) > 0.84, "respawned on a free point");
  // The farthest free point from living Fish is used.
  const free = bear.filter((b) => distance(b, standing.pos) > 0.84);
  assert.equal(far(down.pos), Math.max(...free.map(far)));
});

test("fishing: the Fishers win when every Fish is caught, with placements by how long each stayed free", () => {
  const e = match(5);
  spread(e);
  const [catcher] = fishersOf(e);
  const order = fishOf(e);
  for (const f of order) {
    e.damage(f, 1e6, catcher);
    advance(e, 1);
  }
  assert.equal(e.state.phase, "finished");
  assert.equal(e.state.winner, "fishers");
  // Last caught places first; the starting Fisher follows every Fish.
  assert.deepEqual(
    order.map((f) => f.placement),
    order.map((_, i) => order.length - i),
  );
  assert.equal(catcher.placement, order.length + 1);
  assert.equal(catcher.stats.catches, order.length);
  assert.equal(catcher.stats.survived, 0, "a starting Fisher was never free");
  assert.ok(order[3].stats.survived > order[0].stats.survived);
});

test("fishing: any Fish still free at the final whistle wins it for the Fish", () => {
  const e = match(6);
  spread(e);
  const [catcher] = fishersOf(e);
  const [first] = fishOf(e);
  e.damage(first, 1e6, catcher);
  advance(e, MODES.fishing.length + 0.5);
  assert.equal(e.state.phase, "finished");
  assert.equal(e.state.winner, "fish");
  const free = fishOf(e).sort((a, b) => a.placement - b.placement);
  assert.deepEqual(
    free.map((p) => p.placement),
    free.map((_, i) => i + 1),
  );
  assert.equal(first.placement, free.length + 1);
  for (const p of free) assert.ok(p.stats.survived >= MODES.fishing.length - 0.1);
  // Every player has a distinct placement.
  const places = e.playerList.map((p) => p.placement).sort((a, b) => a - b);
  assert.deepEqual(places, e.playerList.map((_, i) => i + 1));
});

test("fishing: one Fisher alone with no Fish ends at once, like a one-player Showdown", () => {
  const e = match(1);
  assert.equal(e.state.phase, "finished");
  assert.equal(e.state.winner, "fishers");
});

test("fishing: bushes hide rivals unless a teammate is close, and the last Fish cannot hide", () => {
  const e = match(6, 11);
  spread(e);
  const [a, b] = fishOf(e);
  const [h0, h1] = fishersOf(e);
  const bush = MAPS.fishing.bushes[0];
  a.pos = { x: bush.x + bush.w / 2, y: bush.y + bush.h / 2 };
  h0.pos = { ...MAPS.fishing.spawns[4] };
  h1.pos = { ...MAPS.fishing.spawns[1] };
  const sees = (viewer: Player, t: Player) =>
    e.snapshot(viewer.id).players.some((p) => p.id === t.id);
  assert.ok(!sees(h0, a), "hidden from a distant Fisher");
  assert.ok(sees(b, a), "a Fish always sees its own team");
  h1.pos = { x: a.pos.x + 1.5, y: a.pos.y };
  assert.ok(sees(h0, a), "a teammate close to the bush reveals it to the team");
  h1.pos = { ...MAPS.fishing.spawns[1] };
  // Catch everyone but `a`.
  for (const f of fishOf(e)) if (f !== a) e.damage(f, 1e6, h0);
  e.step();
  assert.equal(fishOf(e).length, 1);
  assert.ok(sees(h0, a), "the last Fish is revealed");
  assert.match(e.state.notice, /last fish/);
});

test("fishing: Fishers move faster, and local prediction uses the same speed", () => {
  const e = match(6);
  spread(e);
  const [fish] = fishOf(e);
  const [fisher] = fishersOf(e);
  fish.pos = { x: 4, y: 22 };
  fisher.pos = { x: 4, y: 3 };
  const from = { fish: { ...fish.pos }, fisher: { ...fisher.pos } };
  for (const p of [fish, fisher]) e.setInput(p.id, { move: { x: 1, y: 0 }, aim: { x: 1, y: 0 } });
  advance(e, 1);
  const ran = (p: Player, at: { x: number; y: number }) => distance(p.pos, at);
  assert.ok(
    Math.abs(ran(fisher, from.fisher) / ran(fish, from.fish) -
      MODES.fishing.teamSpeed![1] * (FIGHTERS[fish.fighter].speed / FIGHTERS[fisher.fighter].speed)) < 0.02,
  );
  assert.equal(moveSpeed("fishing", fisher), FIGHTERS[fisher.fighter].speed * 1.1);
  assert.equal(moveSpeed("showdown", fisher), FIGHTERS[fisher.fighter].speed);
  const predicted = stepMove(e.state, { x: 4, y: 3 }, { x: 1, y: 0 }, 0, moveSpeed("fishing", fisher), 1);
  assert.ok(Math.abs(predicted.x - 4 - moveSpeed("fishing", fisher)) < 1e-9);
});

test("fishing: the room accepts the mode, holds ten and rejects unknown modes", () => {
  const sent: HostMessage[] = [];
  const room = new Room("ABCDEF", (_id, m) => sent.push(m));
  const host = room.join("Host").id;
  room.command(host, { type: "mode", mode: "fishing" });
  assert.equal(room.lobby.mode, "fishing");
  for (let i = 1; i < 10; i++) room.join("P" + i);
  assert.throws(() => room.join("Eleventh"), /full/);
  room.command(host, { type: "mode", mode: "__proto__" as never });
  assert.equal(room.lobby.mode, "fishing");
  for (const m of room.lobby.members) room.command(m.id, { type: "ready", ready: true });
  room.command(host, { type: "start" });
  assert.equal(room.lobby.phase, "match");
  assert.equal(room.engine?.state.mode, "fishing");
  assert.equal(fishersOf(room.engine!).length, 3);
});

test("fishing: every fighter can attack and Super as a Fisher without breaking the match", () => {
  const finite = (value: unknown): boolean =>
    typeof value === "number"
      ? Number.isFinite(value)
      : value && typeof value === "object"
        ? Object.values(value).every(finite)
        : true;
  for (const id of IDS) {
    const e = new Engine("fishing", members(4, id), seeded(5));
    advance(e, 3.1);
    const p = fishersOf(e)[0];
    const rival = fishOf(e)[0];
    // An open lane along Bruin Walk's south side.
    p.pos = { x: 10, y: 22 };
    rival.pos = { x: 13, y: 22 };
    advance(e, 2.2);
    p.charge = 5000;
    e.setInput(p.id, { move: { x: 0, y: 0 }, aim: { x: 1, y: 0 }, attack: true, super: true });
    e.step();
    while (e.state.cutscene) e.step();
    advance(e, 3);
    assert.ok(p.charge < 5000, `${id} Super was not accepted`);
    assert.ok(
      rival.hp < FIGHTERS[rival.fighter].hp || rival.team === FISHERS,
      `${id} dealt no damage`,
    );
    assert.ok(finite(e.snapshot(p.id)), `${id} non-finite wire value`);
  }
});
