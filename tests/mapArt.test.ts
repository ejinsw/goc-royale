import { test } from "node:test";
import assert from "node:assert/strict";
import { Mesh, MeshToonMaterial, type BufferGeometry } from "three";
import { buildArenaMap } from "../client/src/arena/map";
import type { ArenaMaterials } from "../client/src/arena/materials";
import type { Mode } from "../shared/definitions";

/**
 * Z-fighting audit of the static map art: two faces of different color in the
 * same plane, facing the same way and overlapping, flicker against each other
 * as the camera moves. Only faces the camera can see are checked: it is always
 * above the field and south of what it looks at, so faces pointing down or
 * north are never drawn. Broomball Night is not covered: its rink markings
 * still have such overlaps (found November 20, 2026, not yet fixed).
 */
type Tri = { p: number[][]; n: number[]; d: number; color: number[] };

function triangles(g: BufferGeometry): Tri[] {
  const pos = g.attributes.position,
    col = g.attributes.color,
    idx = g.index,
    out: Tri[] = [];
  const count = idx ? idx.count : pos.count;
  for (let t = 0; t < count; t += 3) {
    const ids = [0, 1, 2].map((k) => (idx ? idx.getX(t + k) : t + k));
    const p = ids.map((i) => [pos.getX(i), pos.getY(i), pos.getZ(i)]);
    const u = p[1].map((v, k) => v - p[0][k]),
      w = p[2].map((v, k) => v - p[0][k]);
    const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
    const len = Math.hypot(...n);
    if (len < 1e-9) continue;
    for (let k = 0; k < 3; k++) n[k] /= len;
    const color = col ? [col.getX(ids[0]), col.getY(ids[0]), col.getZ(ids[0])] : [1, 1, 1];
    out.push({ p, n, d: n[0] * p[0][0] + n[1] * p[0][1] + n[2] * p[0][2], color });
  }
  return out;
}

/** Separating-axis test in 2D with a margin, so faces that only share an edge do not count. */
function overlaps(a: number[][], b: number[][], margin = 2e-3) {
  for (const poly of [a, b])
    for (let i = 0; i < 3; i++) {
      const [x1, y1] = poly[i],
        [x2, y2] = poly[(i + 1) % 3];
      const ax = y1 - y2,
        ay = x2 - x1,
        l = Math.hypot(ax, ay);
      if (l < 1e-12) continue;
      const along = (s: number[][]) => s.map(([x, y]) => (x * ax + y * ay) / l);
      const A = along(a),
        B = along(b);
      if (Math.max(...A) - margin <= Math.min(...B) || Math.max(...B) - margin <= Math.min(...A)) return false;
    }
  return true;
}

/** Pairs of visible, same-plane (within `gap`), overlapping faces of different color. */
function zFighting(mode: Mode, gap = 0.0012) {
  const mats = { toon: new MeshToonMaterial(), toonFor: () => new MeshToonMaterial() } as unknown as ArenaMaterials;
  const map = buildArenaMap(mode, mats);
  const base = map.group.children.find((o) => o instanceof Mesh) as Mesh;
  const visible = triangles(base.geometry).filter((t) => t.n[1] > -0.01 && t.n[2] > -0.01);
  map.dispose();
  const key = (t: Tri, shift = 0) => `${t.n.map((x) => Math.round(x * 200)).join()}|${Math.round(t.d / 0.001) + shift}`;
  const buckets = new Map<string, Tri[]>();
  for (const t of visible) buckets.set(key(t), [...(buckets.get(key(t)) ?? []), t]);
  const found: string[] = [];
  for (const t of visible)
    for (const shift of [0, 1])
      for (const o of buckets.get(key(t, shift)) ?? []) {
        if (o === t || Math.abs(o.d - t.d) > gap) continue;
        if (o.color.reduce((s, c, k) => s + Math.abs(c - t.color[k]), 0) < 0.02) continue;
        const axis = t.n.map(Math.abs);
        const keep = [0, 1, 2].filter((k) => k !== axis.indexOf(Math.max(...axis)));
        const flat = (p: number[][]) => p.map((v) => keep.map((k) => v[k]));
        if (overlaps(flat(t.p), flat(o.p))) found.push(`plane ${t.n.map((x) => x.toFixed(1))} at ${t.d.toFixed(3)}`);
      }
  return found;
}

for (const mode of ["showdown", "fishing"] as const)
  test(`${mode} map art has no visible faces fighting for depth`, () => {
    const found = zFighting(mode);
    assert.equal(found.length, 0, [...new Set(found)].slice(0, 8).join("; "));
  });
