import { test } from "node:test";
import assert from "node:assert/strict";
import type { BufferGeometry } from "three";
import { IDS } from "../shared/definitions";
import { LOOKS, buildFighter, disposeFighter } from "../client/src/ui/scene/fighterModels";

/** Merged parts are non-indexed: three vertices per triangle. */
const triangles = (g: BufferGeometry) => g.getAttribute("position").count / 3;

test("every fighter builds a 3D look within the menu-stage budget", () => {
  const report: string[] = [];
  for (const id of IDS) {
    const parts = buildFighter(id);
    const total =
      triangles(parts.body) +
      triangles(parts.head) +
      triangles(parts.face) +
      triangles(parts.armL) +
      triangles(parts.armR) +
      (parts.companion ? triangles(parts.companion.geometry) : 0);
    report.push(`${id} ${total}`);
    // Procedural menu models stay well under the performance standard's
    // §7.3 runtime fighter range (10k-25k), so a 10-fighter stage stays
    // near the old cost. This is a regression ceiling, not the budget.
    assert.ok(total > 1000 && total < 12000, `${id}: ${total} triangles`);
    assert.ok(parts.top > 1.6 && parts.top < 2.4, `${id}: top ${parts.top}`);
    for (const g of [parts.body, parts.head, parts.face, parts.armL, parts.armR])
      assert.ok(g.getAttribute("color"), `${id}: vertex colors for the shared material`);
    disposeFighter(parts);
  }
  console.log(report.join(", "));
});

test("every look has a distinctive feature, prop or companion, and no two look alike", () => {
  const signatures = new Set<string>();
  for (const id of IDS) {
    const l = LOOKS[id];
    assert.ok(l.features.length > 0 || l.prop || l.companion, id);
    const sig = JSON.stringify([l.hairStyle, [...l.features].sort(), l.prop, l.companion]);
    assert.ok(!signatures.has(sig), `${id} duplicates another look`);
    signatures.add(sig);
  }
  assert.equal(LOOKS.rosalie.companion, "panda");
  assert.ok(LOOKS.rosalie.features.includes("pandaHood"));
});
