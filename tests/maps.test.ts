import { test } from "node:test";
import assert from "node:assert/strict";
import { Engine } from "../shared/engine";
import { FISHERS, MAPS, RULES, distance, type Mode, type Vec } from "../shared/definitions";
import type { Member } from "../shared/types";

const modes = Object.keys(MAPS) as Mode[];
const one: Member[] = [{ id: "a", name: "A", fighter: "brandon", team: 0, ready: true, connected: true }];
type Rect = { x: number; y: number; w: number; h: number };
const key = (r: Rect) => [r.x, r.y, r.w, r.h].map((n) => n.toFixed(3)).join(",");
const pointKey = (p: Vec) => `${p.x.toFixed(3)},${p.y.toFixed(3)}`;
const sorted = (keys: string[]) => [...keys].sort();
const points = (mode: Mode) => [...MAPS[mode].spawns, ...(MAPS[mode].respawns?.flat() ?? [])];

test("every map is fair: a half turn maps its cover, bushes, spawns and team respawns onto themselves", () => {
  for (const mode of modes) {
    const m = MAPS[mode];
    const rect = (r: Rect) => ({ x: m.w - r.x - r.w, y: m.h - r.y - r.h, w: r.w, h: r.h });
    const point = (p: Vec) => ({ x: m.w - p.x, y: m.h - p.y });
    assert.deepEqual(sorted(m.walls.map(rect).map(key)), sorted(m.walls.map(key)), `${mode} walls`);
    assert.deepEqual(
      sorted(m.walls.map((w) => `${key(rect(w))}:${w.hp ?? "-"}`)),
      sorted(m.walls.map((w) => `${key(w)}:${w.hp ?? "-"}`)),
      `${mode} crate health`,
    );
    assert.deepEqual(sorted(m.bushes.map(rect).map(key)), sorted(m.bushes.map(key)), `${mode} bushes`);
    assert.deepEqual(sorted(m.spawns.map(point).map(pointKey)), sorted(m.spawns.map(pointKey)), `${mode} spawns`);
    if (m.respawns)
      assert.deepEqual(
        sorted(m.respawns[0].map(point).map(pointKey)),
        sorted(m.respawns[1].map(pointKey)),
        `${mode} respawns`,
      );
  }
});

test("every map's cover is apart and clear of bushes, and every spawn is a free standing spot", () => {
  for (const mode of modes) {
    const m = MAPS[mode];
    const e = new Engine(mode, one, () => 0.5);
    assert.equal(new Set(m.walls.map((w) => w.id)).size, m.walls.length, `${mode} wall ids are unique`);
    const overlap = (a: Rect, b: Rect, gap = 0) =>
      a.x - gap < b.x + b.w && a.x + a.w + gap > b.x && a.y - gap < b.y + b.h && a.y + a.h + gap > b.y;
    m.walls.forEach((a, i) =>
      m.walls.forEach((b, j) => {
        // Narrower gaps than a fighter would read as passable and are not.
        if (i < j) assert.ok(!overlap(a, b, 2 * RULES.radius), `${mode}: ${a.id} and ${b.id} too close`);
      }),
    );
    for (const w of m.walls)
      for (const b of m.bushes) assert.ok(!overlap(w, b), `${mode}: ${w.id} overlaps a bush`);
    for (const p of points(mode)) assert.ok(e.valid(p), `${mode}: ${pointKey(p)} is blocked or out of bounds`);
  }
});

test("every open spot on every map can be walked to from every spawn", () => {
  const step = 0.25;
  for (const mode of modes) {
    const m = MAPS[mode];
    const e = new Engine(mode, one, () => 0.5);
    const cols = Math.floor(m.w / step),
      rows = Math.floor(m.h / step);
    const open = (i: number, j: number) => e.valid({ x: i * step, y: j * step });
    const seen = new Uint8Array((cols + 1) * (rows + 1));
    const start = m.spawns[0];
    const queue = [[Math.round(start.x / step), Math.round(start.y / step)]];
    seen[queue[0][1] * (cols + 1) + queue[0][0]] = 1;
    while (queue.length) {
      const [i, j] = queue.pop()!;
      for (const [di, dj] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const ni = i + di,
          nj = j + dj;
        if (ni < 0 || nj < 0 || ni > cols || nj > rows) continue;
        const k = nj * (cols + 1) + ni;
        if (seen[k] || !open(ni, nj)) continue;
        seen[k] = 1;
        queue.push([ni, nj]);
      }
    }
    let unreached = 0;
    for (let j = 0; j <= rows; j++) for (let i = 0; i <= cols; i++) if (open(i, j) && !seen[j * (cols + 1) + i]) unreached++;
    assert.equal(unreached, 0, `${mode}: ${unreached} open spots are sealed off`);
    for (const p of points(mode))
      assert.ok(seen[Math.round(p.y / step) * (cols + 1) + Math.round(p.x / step)], `${mode}: ${pointKey(p)} unreachable`);
  }
});

test("Bruin Plaza is a much larger field framed like Central Lawn, with Fish spawning away from the Bear", () => {
  const campus = MAPS.fishing,
    lawn = MAPS.showdown;
  const area = (campus.w * campus.h) / (lawn.w * lawn.h);
  assert.ok(area > 2.5 && area < 3, `area ratio ${area.toFixed(2)}`);
  assert.ok(Math.abs(campus.w / campus.h - lawn.w / lawn.h) < 0.05, "same proportions");
  // The camera fits the frame, not the field, so fighters keep their size on screen.
  assert.deepEqual(campus.frame, { w: lawn.w, h: lawn.h });
  assert.equal(campus.spawns.length, 10);
  const bear = campus.respawns![FISHERS];
  for (const s of campus.spawns)
    assert.ok(Math.min(...bear.map((d) => distance(d, s))) >= 8, `spawn ${pointKey(s)} is too close to the Bear`);
  // Nobody starts hidden. (Central Lawn's (18, 3) and (18, 21) sit on bush
  // corners, which the engine's inclusive bounds count as inside.)
  for (const p of points("fishing"))
    assert.ok(
      !campus.bushes.some((b) => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h),
      `${pointKey(p)} starts in a bush`,
    );
});
