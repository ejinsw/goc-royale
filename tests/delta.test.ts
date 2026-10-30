import { test } from "node:test";
import assert from "node:assert/strict";
import {
  NONE,
  SnapshotDecoder,
  SnapshotEncoder,
  apply,
  diff,
} from "../shared/delta";
import { Room } from "../shared/room";
import type { HostMessage, Match } from "../shared/types";

/** Round-trip through JSON exactly as the data channel does. */
const wire = <T>(v: T): T => JSON.parse(JSON.stringify(v));
const roundTrip = (a: unknown, b: unknown) => {
  const d = diff(a, b);
  const result = d === NONE ? wire(a) : apply(wire(a), wire(d));
  assert.equal(JSON.stringify(result), JSON.stringify(b));
};

test("delta: primitives, nested objects, and deleted or undefined keys", () => {
  roundTrip({ a: 1, b: { c: 2, d: 3 } }, { a: 1, b: { c: 5, d: 3 } });
  roundTrip({ a: 1, b: 2 }, { a: 1 });
  roundTrip({ a: 1, v: 9 }, { a: 1, v: undefined });
  roundTrip({ a: null }, { a: { x: 1 } });
  roundTrip({ a: { x: 1 } }, { a: null });
  assert.equal(diff({ a: 1, b: [1, 2] }, { a: 1, b: [1, 2] }), NONE);
});

test("delta: keyed entity arrays handle add, remove, change, and reorder", () => {
  const a = [
    { id: 1, x: 0 },
    { id: 2, x: 0 },
    { id: 3, x: 0 },
  ];
  roundTrip(a, [
    { id: 1, x: 1 },
    { id: 3, x: 0 },
    { id: 4, x: 7 },
  ]);
  roundTrip(a, [
    { id: 3, x: 0 },
    { id: 1, x: 0 },
    { id: 2, x: 0 },
  ]);
  roundTrip(a, []);
  roundTrip([], a);
  // Unchanged keyed arrays produce no delta at all.
  assert.equal(diff(a, structuredClone(a)), NONE);
});

test("delta: non-keyed arrays are replaced whole and still round-trip", () => {
  roundTrip({ score: [0, 1] }, { score: [1, 1] });
  roundTrip({ walls: [{ x: 1 }, { x: 2 }] }, { walls: [{ x: 1 }] });
});

test("delta: randomized objects always reconstruct exactly", () => {
  let seed = 99;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const make = (depth: number): unknown => {
    const r = rnd();
    if (depth > 2 || r < 0.3) return r < 0.1 ? null : Math.round(rnd() * 100) / 10;
    if (r < 0.5)
      return Array.from({ length: Math.floor(rnd() * 4) }, (_, i) => ({
        id: Math.floor(rnd() * 6) * 10 + i,
        v: make(depth + 1),
      }));
    const o: Record<string, unknown> = {};
    for (const k of ["a", "b", "c", "d"]) if (rnd() < 0.7) o[k] = make(depth + 1);
    return o;
  };
  for (let i = 0; i < 400; i++) roundTrip(make(0), make(0));
});

test("delta: decoder detects a gap and recovers on the next keyframe", () => {
  const enc = new SnapshotEncoder(1000);
  const dec = new SnapshotDecoder();
  const m = (t: number) => ({ tick: t, players: [{ id: "a", hp: t }] }) as unknown as Match;
  assert.ok(dec.accept(wire(enc.encode(m(1)))));
  enc.encode(m(2)); // dropped in transit
  assert.equal(dec.accept(wire(enc.encode(m(3)))), null, "gap must be detected");
  enc.reset(); // host reacts to the guest's resync request
  assert.equal(dec.accept(wire(enc.encode(m(4))))?.tick, 4);
  assert.equal(dec.accept(wire(enc.encode(m(5))))?.tick, 5);
});

test("delta: periodic keyframes are full snapshots", () => {
  const enc = new SnapshotEncoder(3);
  const types = [1, 2, 3, 4, 5, 6, 7].map(
    (t) => enc.encode({ tick: t } as unknown as Match).type,
  );
  assert.deepEqual(types, ["snapshot", "delta", "delta", "snapshot", "delta", "delta", "snapshot"]);
});

for (const [mode, n] of [
  ["showdown", 10],
  ["broomball", 6],
] as const)
  test(`delta: a full ${mode} match round-trips losslessly per viewer and is smaller`, () => {
    const enc = new Map<string, SnapshotEncoder>();
    const dec = new Map<string, SnapshotDecoder>();
    let full = 0,
      sent = 0,
      checked = 0;
    const r = new Room("DELTAS", (id, m: HostMessage) => {
      if (m.type !== "snapshot") return;
      if (!enc.has(id)) {
        enc.set(id, new SnapshotEncoder());
        dec.set(id, new SnapshotDecoder());
      }
      const out = enc.get(id)!.encode(m.match);
      const got = dec.get(id)!.accept(wire(out));
      assert.equal(JSON.stringify(got), JSON.stringify(m.match));
      full += JSON.stringify(m).length;
      sent += JSON.stringify(out).length;
      checked++;
    });
    const ids = Array.from({ length: n }, (_, i) => r.join("P" + i).id);
    r.command(ids[0], { type: "mode", mode });
    ids.forEach((id) => r.command(id, { type: "ready", ready: true }));
    r.command(ids[0], { type: "start" });
    let seed = 7;
    const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    for (let t = 0; t < 40 * 30; t++) {
      if (t % 15 === 0)
        for (const id of ids)
          r.command(id, {
            type: "input",
            input: {
              move: { x: rnd() * 2 - 1, y: rnd() * 2 - 1 },
              aim: { x: rnd() * 2 - 1, y: rnd() * 2 - 1 },
              attack: rnd() < 0.5,
              super: rnd() < 0.2,
            },
          });
      r.tick();
      if (t % 2 === 0) r.snapshots();
    }
    assert.ok(checked > 1000);
    assert.ok(sent < full * 0.4, `delta ${sent} vs full ${full}`);
  });
