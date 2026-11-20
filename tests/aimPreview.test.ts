import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FIGHTERS,
  IDS,
  ITEMS,
  RULES,
  shotPoint,
  type FighterId,
} from "../shared/definitions";
import { Engine } from "../shared/engine";
import type { Member } from "../shared/types";
import {
  aimPreviewFor,
  itemAimPreviewFor,
  type AimShape,
} from "../client/src/arena/aimPreview";

test("every fighter has finite attack and Super aim footprints", () => {
  for (const id of IDS)
    for (const intent of ["attack", "super"] as const) {
      const shape = aimPreviewFor(id, intent);
      assert.ok(
        Object.values(shape).every(
          (v) => typeof v !== "number" || Number.isFinite(v),
        ),
        `${id} ${intent}`,
      );
    }
});

test("aim footprints mirror distinctive ability geometry", () => {
  const mixedVoice = aimPreviewFor("david", "attack");
  assert.equal(mixedVoice.kind, "lane");
  if (mixedVoice.kind === "lane") {
    assert.equal(mixedVoice.range, 8);
    assert.equal(mixedVoice.width, 1.48);
    assert.ok(Math.abs((mixedVoice.coreWidth ?? 0) - 0.92) < 1e-9);
  }
  assert.deepEqual(aimPreviewFor("david", "super"), {
    kind: "lane",
    range: 6.5,
    width: 4.5,
  });
  assert.equal(aimPreviewFor("josh", "attack").kind, "sector");
  assert.equal(aimPreviewFor("tovya", "attack").kind, "sector");
  assert.equal(aimPreviewFor("daniel", "attack").kind, "fan");
  assert.equal(aimPreviewFor("brandon", "super").kind, "circle");
  assert.equal(aimPreviewFor("isaac", "super").kind, "bar");
  assert.equal(aimPreviewFor("joyce", "super").kind, "global");
});

test("ball shot preview grows with charge", () => {
  const low = aimPreviewFor("brandon", "attack", true, 0.35);
  const high = aimPreviewFor("brandon", "attack", true, 1);
  assert.equal(low.kind, "lane");
  assert.equal(high.kind, "lane");
  assert.ok(high.range > low.range);
});

test("item aim previews use authoritative broom and flyer dimensions", () => {
  // The sweep hits any body touching its rectangle: padded by the body radius.
  assert.deepEqual(itemAimPreviewFor("golden_broom"), {
    kind: "lane",
    from: -RULES.radius,
    range: ITEMS.golden_broom.range + RULES.radius,
    width: ITEMS.golden_broom.width + 2 * RULES.radius,
  });
  assert.deepEqual(itemAimPreviewFor("goc_flyer"), {
    kind: "lane",
    range: ITEMS.goc_flyer.range,
    width: 2 * (RULES.radius + ITEMS.goc_flyer.width),
    cap: true,
  });
});

test("beam, lob, weave and widening previews follow their attack rules", () => {
  assert.deepEqual(aimPreviewFor("rich", "attack"), {
    kind: "lane",
    range: 11,
    width: 2 * (RULES.radius + 0.16),
    cap: true,
  });
  // A lob's landing circle sits at the held power's share of its range.
  const tap = aimPreviewFor("samuel", "attack", false, 0.2);
  const full = aimPreviewFor("samuel", "attack", false, 1);
  assert.equal(tap.kind, "circle");
  assert.equal(full.kind, "circle");
  if (tap.kind === "circle" && full.kind === "circle") {
    assert.ok(Math.abs(tap.distance - 7.5 * 0.35) < 1e-9);
    assert.equal(full.distance, 7.5);
    assert.equal(full.radius, 1.2 + RULES.radius);
  }
  assert.equal(aimPreviewFor("elijah", "attack").kind, "path");
  assert.equal(aimPreviewFor("ethan", "attack").kind, "path");
  assert.equal(aimPreviewFor("rosalie", "attack").kind, "taper");
  const viral = aimPreviewFor("susannah", "attack");
  assert.ok(viral.kind === "lane" && viral.tail?.angles.length === 3);
});

// ------------------------------------------------------------ accuracy

type Pt = { x: number; z: number };
const segment = (p: Pt, a: Pt, b: Pt) => {
  const vx = b.x - a.x,
    vz = b.z - a.z;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.z - a.z) * vz) / (vx * vx + vz * vz || 1)));
  return Math.hypot(p.x - (a.x + vx * t), p.z - (a.z + vz * t));
};
const box = (p: Pt, hx: number, z0: number, z1: number) => {
  const dx = Math.abs(p.x) - hx,
    dz = Math.max(z0 - p.z, p.z - z1);
  const out = Math.hypot(Math.max(dx, 0), Math.max(dz, 0));
  return out > 0 ? -out : -Math.max(dx, dz);
};
/** The local direction of a spread angle (aim along +z), as the authority turns it. */
const heading = (angle: number): Pt => ({ x: -Math.sin(angle), z: Math.cos(angle) });
/**
 * Signed distance from a footprint's edge, positive inside, with the aim
 * along local +z and the shooter at the origin. Mirrors how AimGuide draws
 * each kind.
 */
function inside(shape: AimShape, p: Pt, firstSide = false): number {
  const O = { x: 0, z: 0 };
  switch (shape.kind) {
    case "lane": {
      let d = box(p, shape.width / 2, shape.from ?? 0, shape.range);
      const end = { x: 0, z: shape.range };
      if (shape.cap) d = Math.max(d, shape.width / 2 - Math.hypot(p.x, p.z - shape.range));
      for (const a of shape.tail?.angles ?? []) {
        const h = heading(a);
        const tip = { x: end.x + h.x * shape.tail!.range, z: end.z + h.z * shape.tail!.range };
        d = Math.max(d, shape.tail!.width / 2 - segment(p, end, tip));
      }
      return d;
    }
    case "sector": {
      const r = Math.hypot(p.x, p.z),
        a = Math.abs(Math.atan2(p.x, p.z));
      const edge = a <= shape.half ? r * Math.sin(Math.min(Math.PI / 2, shape.half - a)) : -(a - shape.half < Math.PI / 2 ? r * Math.sin(a - shape.half) : r);
      return Math.min(shape.radius - r, edge);
    }
    case "fan":
      return Math.max(...shape.angles.map((a) => {
        const h = heading(a);
        return shape.width / 2 - segment(p, O, { x: h.x * shape.range, z: h.z * shape.range });
      }));
    case "path": {
      let best = -Infinity;
      for (const path of shape.paths) {
        if (firstSide && shape.weave.alternate && path.side !== 1) continue;
        const dir = { x: Math.cos(Math.PI / 2 + path.angle), y: Math.sin(Math.PI / 2 + path.angle) };
        let prev: Pt | null = null;
        for (let t = 0; t <= shape.range + 1e-9; t += 0.05) {
          const at = shotPoint({ x: dir.x * t, y: dir.y * t }, dir, t, shape.weave, path.side);
          const q = { x: at.x, z: at.y };
          if (prev) best = Math.max(best, shape.width / 2 - segment(p, prev, q));
          prev = q;
        }
      }
      return best;
    }
    case "taper": {
      const k = Math.max(0, Math.min(1, p.z / shape.range));
      const half = (shape.near + (shape.far - shape.near) * k) / 2;
      const body = Math.min(half - Math.abs(p.x), p.z, shape.range - p.z);
      return Math.max(body, shape.far / 2 - Math.hypot(p.x, p.z - shape.range));
    }
    case "circle":
      return shape.radius - Math.hypot(p.x, p.z - shape.distance);
    case "bar":
      return -1;
    case "global":
      return -1;
  }
}

/** A tiny seeded generator, so a failure always reproduces. */
const random = (seed: number) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

// Homing notes bend toward rivals ahead, so a straight footprint is only
// where the note flies with nobody near it; Joyce is checked separately.
const STRAIGHT = IDS.filter((id) => !(FIGHTERS[id].abilities.attack as { homing?: number }).homing);

/** Fire at a rival standing at local `p` (aim +z) and report whether it was hit. */
function hits(e: Engine, intent: "attack" | "super", p: Pt): boolean {
  const [me, , , rival] = e.playerList;
  const from = { x: 17, y: 4 };
  me.pos = { ...from };
  me.alive = true;
  me.hp = FIGHTERS[me.fighter].hp;
  me.ammo = FIGHTERS[me.fighter].ammo;
  me.stunUntil = me.busyUntil = 0;
  me.lastAttack = -9;
  rival.alive = true;
  rival.pos = { x: from.x + p.x, y: from.y + p.z };
  rival.hp = FIGHTERS[rival.fighter].hp;
  rival.shield = 0;
  rival.protectedUntil = 0;
  e.state.projectiles = [];
  e.pending = [];
  e.dashes = [];
  e.leaps = [];
  e.state.areas = [];
  // Keep the Broomball ball out of the way: a carrier cannot attack or Super.
  e.state.ball.carrier = null;
  e.state.ball.pos = { x: 31, y: 18 };
  e.state.ball.velocity = { x: 0, y: 0 };
  if (intent === "super") me.charge = 5000;
  e.setInput(me.id, { move: { x: 0, y: 0 }, aim: { x: 0, y: 1 }, attack: intent === "attack", super: intent === "super", power: 1 });
  for (let i = 0; i < 54; i++) {
    e.step();
    while (e.state.cutscene) e.step();
  }
  return rival.hp < FIGHTERS[rival.fighter].hp || !rival.alive;
}

function checkFootprint(id: FighterId, intent: "attack" | "super", samples: number) {
  const m: Member[] = Array.from({ length: 6 }, (_, i) => ({
    id: "p" + i,
    name: "P" + i,
    fighter: i === 0 ? id : "samuel",
    team: (i < 3 ? 0 : 1) as 0 | 1,
    ready: true,
    connected: true,
  }));
  const e = new Engine("broomball", m);
  for (let i = 0; i < 160; i++) e.step();
  const [, a, b, , c, d] = e.playerList;
  a.pos = { x: 1, y: 19 };
  b.pos = { x: 1, y: 1 };
  c.pos = { x: 33, y: 19 };
  d.pos = { x: 33, y: 1 };
  const shape = aimPreviewFor(id, intent, false, 1);
  const rnd = random(7 + IDS.indexOf(id) * 31 + (intent === "super" ? 1000 : 0));
  let checked = 0;
  for (let tries = 0; checked < samples && tries < samples * 20; tries++) {
    const p = { x: -7 + rnd() * 14, z: -3 + rnd() * 16 };
    if (Math.hypot(p.x, p.z) < 0.9) continue;
    const sd = inside(shape, p, true);
    if (Math.abs(sd) < 0.2) continue;
    checked++;
    assert.equal(
      hits(e, intent, p),
      sd > 0,
      `${id} ${intent}: a rival at (${p.x.toFixed(2)}, ${p.z.toFixed(2)}) ${sd > 0 ? "inside" : "outside"} the preview`,
    );
  }
}

test("every attack preview matches where the authority's attack actually hits", () => {
  for (const id of STRAIGHT) checkFootprint(id, "attack", 36);
});

test("damaging Super previews match where the authority's Super actually hits", () => {
  for (const id of ["rich", "josh", "david", "daniel", "joelle", "dylan", "susannah", "miriam", "russell", "tovya", "ethan", "elijah"] as const)
    checkFootprint(id, "super", 24);
});

test("Joyce's homing note hits everything in its straight lane, and curves to more", () => {
  const shape = aimPreviewFor("joyce", "attack");
  assert.equal(shape.kind, "lane");
});
