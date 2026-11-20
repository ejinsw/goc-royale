import { test } from "node:test";
import assert from "node:assert/strict";
import { IDS, ITEMS, type ItemKind } from "../shared/definitions";
import { itemModel, projectileModel } from "../client/src/arena/attackModels";

/** Under this many triangles each, so dozens in flight stay cheap. */
const BUDGET = 1500;

const check = (name: string, g: ReturnType<typeof projectileModel>) => {
  const pos = g.attributes.position;
  const tris = (g.index ? g.index.count : pos.count) / 3;
  assert.ok(tris > 0 && tris <= BUDGET, `${name}: ${tris} triangles`);
  for (const key of ["position", "normal", "color"])
    assert.ok(g.attributes[key], `${name} has ${key}`);
  for (const v of pos.array as Float32Array) assert.ok(Number.isFinite(v), `${name} finite`);
  g.computeBoundingSphere();
  // Readable at gameplay scale, but never bigger than a fighter.
  assert.ok(g.boundingSphere!.radius < 1.3, `${name} radius ${g.boundingSphere!.radius}`);
  return tris;
};

test("every attack item and pickup has a merged, budgeted model", () => {
  const report: Record<string, number> = {};
  for (const id of IDS) report[id] = check(id, projectileModel(id));
  for (const kind of Object.keys(ITEMS) as ItemKind[]) report[kind] = check(kind, itemModel(kind));
  // The thrown objects are real models, not placeholder dots.
  for (const id of ["brandon", "daniel", "samuel", "elijah", "ethan", "david", "dylan", "isaac", "rosalie", "joelle", "susannah", "joyce", "miriam", "russell", "brandon_n"] as const)
    assert.ok(report[id] >= 60, `${id} has ${report[id]} triangles`);
});
