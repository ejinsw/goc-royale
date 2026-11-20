import { test } from "node:test";
import assert from "node:assert/strict";
import { Engine } from "../shared/engine";
import { ITEMS, MAPS, distance } from "../shared/definitions";
import type { Input, Member } from "../shared/types";

const members: Member[] = [
  {
    id: "a",
    name: "A",
    fighter: "brandon",
    team: 0,
    ready: true,
    connected: true,
  },
  {
    id: "b",
    name: "B",
    fighter: "daniel",
    team: 1,
    ready: true,
    connected: true,
  },
];
const seeded = (seed: number) => () =>
  (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32;
const ready = (mode: "showdown" | "broomball" = "broomball") => {
  const e = new Engine(mode, members, seeded(42));
  e.state.phase = "playing";
  e.state.time = 3;
  e.state.ball.state = "free";
  e.state.players[0].pos = { x: 10, y: 10 };
  e.state.players[1].pos = { x: 20, y: 10 };
  return e;
};
const input = (e: Engine, id: string, action: Partial<Input>, seq?: number) =>
  e.setInput(id, { move: { x: 0, y: 0 }, aim: { x: 1, y: 0 }, ...action, seq });
const pickup = (
  e: Engine,
  kind: "golden_broom" | "goc_flyer",
  seq?: number,
) => {
  const item = e.state.items.find((i) => i.kind === kind)!;
  item.pos = { ...e.state.players[0].pos };
  input(e, "a", { itemPickup: true }, seq);
  e.step();
  assert.equal(e.state.players[0].heldItem, item.id);
  return item;
};

test("item spawning is seeded, bounded and avoids obstacles, other items and spawns", () => {
  for (const mode of ["showdown", "broomball", "fishing"] as const) {
    const a = new Engine(mode, members, seeded(3));
    const b = new Engine(mode, members, seeded(3));
    assert.deepEqual(a.state.items, b.state.items);
    assert.equal(a.state.items.length, 6);
    for (const item of a.state.items) {
      assert.ok(a.valid(item.pos, 0.65));
      assert.ok(
        [...MAPS[mode].spawns, ...(MAPS[mode].respawns?.flat() ?? [])].every(
          (p) => distance(p, item.pos) >= 2,
        ),
      );
      assert.ok(
        a.state.items.every(
          (other) => other.id === item.id || distance(other.pos, item.pos) >= 2,
        ),
      );
    }
    assert.equal(new Engine(mode, members, () => 0).state.items.length, 6);
  }
});

test("pickup requires proximity and one free slot; actions latch and possession drops on disconnect or elimination", () => {
  const e = ready();
  const p = e.state.players[0];
  const broom = e.state.items.find((i) => i.kind === "golden_broom")!;
  broom.pos = { x: 16, y: 10 };
  input(e, "a", { itemPickup: true }, 1);
  e.step();
  assert.equal(p.heldItem, null);
  broom.pos = { ...p.pos };
  input(e, "a", { itemPickup: true }, 2);
  input(e, "a", {}, 3);
  e.step();
  assert.equal(p.heldItem, broom.id);
  const flyer = e.state.items.find((i) => i.kind === "goc_flyer")!;
  flyer.pos = { ...p.pos };
  input(e, "a", { itemPickup: true }, 4);
  e.step();
  assert.equal(p.heldItem, broom.id);
  input(e, "a", { itemDrop: true }, 5);
  e.step();
  assert.equal(p.heldItem, null);
  assert.equal(broom.state, "ground");
  input(e, "a", { itemPickup: true }, 6);
  e.step();
  assert.notEqual(p.heldItem, null);
  const held = e.state.items.find((i) => i.id === p.heldItem)!;
  e.disconnect("a");
  assert.equal(p.heldItem, null);
  assert.equal(held.state, "ground");
  p.connected = true;
  input(e, "a", { itemPickup: true }, 7);
  e.step();
  const heldAgain = e.state.items.find((i) => i.id === p.heldItem)!;
  e.eliminate(p);
  assert.equal(p.heldItem, null);
  assert.equal(heldAgain.state, "ground");
});

test("broom knocks rivals and their carried ball forward once, and stale actions do not replay", () => {
  const e = ready();
  const broom = pickup(e, "golden_broom", 1);
  const rival = e.state.players[1];
  rival.pos = { x: 12, y: 10 };
  e.state.ball.carrier = rival.id;
  e.state.ball.state = "carried";
  e.state.ball.pos = { x: 30, y: 1 }; // stale snapshot position
  input(e, "a", { itemUse: true }, 2);
  input(e, "a", {}, 3);
  e.step();
  assert.ok(rival.pos.x > 14);
  assert.equal(e.state.ball.state, "flight");
  assert.ok(e.state.ball.velocity.x > 10);
  assert.equal(e.state.ball.scorer, "a");
  assert.ok(
    e.state.events.some(
      (ev) => ev.type === "item_hit" && ev.target === rival.id,
    ),
  );
  assert.equal(broom.state, "carried");
  assert.equal(
    e.state.events.filter((ev) => ev.type === "item_used").length,
    1,
  );
  assert.equal(
    e.state.events.find((ev) => ev.type === "item_used")?.inputSeq,
    2,
  );
  for (let i = 0; i < 35; i++) e.step();
  input(e, "a", { itemUse: true }, 2);
  e.step();
  assert.equal(
    e.state.events.filter((ev) => ev.type === "item_used").length,
    0,
  );
  input(e, "a", { itemUse: true }, 4);
  e.step();
  assert.equal(
    e.state.events.filter((ev) => ev.type === "item_used").length,
    1,
  );
});

test("broom respects cover, protection and cooldown", () => {
  const e = ready("showdown");
  const p = e.state.players[0];
  p.pos = { x: 6.5, y: 7.5 };
  const broom = pickup(e, "golden_broom");
  const rival = e.state.players[1];
  rival.pos = { x: 11.5, y: 7.5 };
  input(e, "a", { itemUse: true });
  e.step();
  assert.equal(rival.pos.x, 11.5);
  rival.pos = { x: 7.5, y: 7.5 };
  input(e, "a", { itemUse: true });
  e.step();
  assert.equal(rival.pos.x, 7.5);
  assert.ok(broom.cooldownUntil > e.state.time);
  for (let i = 0; i < 30; i++) e.step();
  rival.protectedUntil = e.state.time + 1;
  input(e, "a", { itemUse: true });
  e.step();
  assert.equal(rival.pos.x, 7.5);
});

test("broom rectangle hits its corners and respects rounded body edges", () => {
  const hitAt = (x: number, y: number) => {
    const e = ready();
    pickup(e, "golden_broom");
    const rival = e.state.players[1];
    rival.pos = { x: 10 + x, y: 10 + y };
    input(e, "a", { itemUse: true });
    e.step();
    return e.state.events.some(
      (event) => event.type === "item_hit" && event.target === rival.id,
    );
  };
  assert.equal(hitAt(3.7, 3.2), true, "far corner is inside the rectangle");
  assert.equal(hitAt(4, 3.5), true, "target body overlaps the corner");
  assert.equal(
    hitAt(4.15, 3.65),
    false,
    "target body misses the rounded corner",
  );
  assert.equal(hitAt(2, 3.75), false, "outside the side edge");
  assert.equal(hitAt(4.3, 0), false, "past the front edge");
  assert.equal(hitAt(-0.5, 0), false, "behind the rear edge");
});

test("broom rectangle strikes the ball and mobile entities near its far corners", () => {
  const e = ready();
  pickup(e, "golden_broom");
  e.state.ball.pos = { x: 13.6, y: 13.1 };
  e.state.ball.velocity = { x: 0, y: 0 };
  e.state.areas.push({
    id: 999,
    owner: "b",
    kind: "panda",
    pos: { x: 13.6, y: 6.9 },
    radius: 0.7,
    end: 100,
    hp: 3600,
  });
  input(e, "a", { itemUse: true });
  e.step();
  assert.ok(e.state.ball.velocity.x > 10);
  assert.ok(e.state.areas.find((area) => area.id === 999)!.pos.x > 16);
});

test("flyer travels as a single-use item and applies damage only to opponents", () => {
  const e = ready();
  const flyer = pickup(e, "goc_flyer");
  const rival = e.state.players[1];
  rival.pos = { x: 13, y: 10 };
  const hp = rival.hp;
  input(e, "a", { itemUse: true });
  e.step();
  assert.equal(e.state.players[0].heldItem, null);
  assert.equal(flyer.state, "flight");
  for (let i = 0; i < 12; i++) e.step();
  assert.equal(rival.hp, hp - ITEMS.goc_flyer.damage);
  assert.ok(
    e.state.events.some(
      (ev) => ev.type === "item_hit" && ev.target === rival.id,
    ),
  );
  assert.equal(
    e.state.items.some((i) => i.id === flyer.id),
    false,
  );
  assert.equal(
    e.state.events.filter(
      (ev) => ev.type === "item_hit" && ev.itemKind === "goc_flyer",
    ).length,
    1,
  );
});
