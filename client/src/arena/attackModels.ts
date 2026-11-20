import {
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  OctahedronGeometry,
  Path,
  Shape,
  SphereGeometry,
  TorusGeometry,
  type BufferGeometry,
} from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import type { FighterId, ItemKind } from "../../../shared/definitions";
import { merge, part, type V3 } from "../ui/scene/geometry";

/**
 * Arena presentation asset factory (performance standard §7.3): the 3D
 * models of everything thrown or swung in an attack, one table entry per
 * fighter and per pickup item. Each is built once per arena from painted
 * low-poly primitives and extruded silhouettes, merged into one geometry
 * that `Projectiles` and `Items` (fx.ts) draw as a single instanced mesh,
 * so a model costs triangles, never extra draw calls or materials.
 *
 * Frame: the nose points along +z (the flight direction), +y is up, and a
 * model is about 0.25 to 0.5 units across before the arena's readability
 * scale. Flat things (cards, coins, wheels) lie in the ground plane so the
 * high game camera sees their faces; birds, bugs and planes fly nose-first.
 * Budget: under about 1,500 triangles per model.
 */

const T = Math.PI;

/** A flat silhouette `depth` thick, lying in the ground plane (shape y is +z). */
function slab(
  shape: Shape,
  depth: number,
  hex: string,
  at: V3 = [0, 0, 0],
  rot: V3 = [0, 0, 0],
  scale: V3 = [1, 1, 1],
) {
  const g = new ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: depth * 0.25,
    bevelSize: depth * 0.25,
    bevelSegments: 1,
    curveSegments: 4,
  })
    .rotateX(T / 2)
    .translate(0, depth / 2, 0);
  return part(g, hex, at, rot, scale);
}
/** A block; small details are plain boxes, larger ones get rounded edges. */
const box = (w: number, h: number, d: number, hex: string, at: V3 = [0, 0, 0], rot: V3 = [0, 0, 0], r = 0.012) =>
  part(
    Math.min(w, h, d) < 0.04
      ? new BoxGeometry(w, h, d)
      : new RoundedBoxGeometry(w, h, d, 1, Math.min(r, w / 2, h / 2, d / 2)),
    hex,
    at,
    rot,
  );
/** A sphere whose detail follows its size: chips and eyes stay a few faces. */
const ball = (
  r: number,
  hex: string,
  at: V3 = [0, 0, 0],
  scale: V3 = [1, 1, 1],
  detail: [number, number] = r < 0.03 ? [6, 4] : r < 0.07 ? [8, 6] : [10, 7],
) => part(new SphereGeometry(r, detail[0], detail[1]), hex, at, [0, 0, 0], scale);
const rod = (r: number, len: number, hex: string, at: V3, rot: V3 = [0, 0, 0], sides = 8) =>
  part(new CylinderGeometry(r, r, len, sides), hex, at, rot);
/** A disc lying in the ground plane. */
const disc = (r: number, h: number, hex: string, at: V3 = [0, 0, 0], sides = 24) =>
  part(new CylinderGeometry(r, r, h, sides), hex, at);
/** A torus in the ground plane, or its arc centered on +z. */
const ringGeo = (r: number, tube: number, arc = T * 2) =>
  new TorusGeometry(r, tube, 5, Math.max(10, Math.round(24 * (arc / (T * 2)))), arc)
    .rotateX(-T / 2)
    .rotateY(arc < T * 2 ? -T / 2 - arc / 2 : 0);
const ringFlat = (r: number, tube: number, hex: string, at: V3 = [0, 0, 0], arc = T * 2) =>
  part(ringGeo(r, tube, arc), hex, at);
/** A disc standing upright, facing +z. */
const plate = (r: number, h: number, hex: string, at: V3, sides = 20) =>
  part(new CylinderGeometry(r, r, h, sides).rotateX(T / 2), hex, at);
/** A silhouette from points in the ground plane (x, z). */
function poly(points: [number, number][]) {
  const s = new Shape();
  points.forEach(([x, z], i) => (i ? s.lineTo(x, z) : s.moveTo(x, z)));
  return s;
}
/** A little heart lying in the ground plane, point toward +z. */
function heart(size: number, hex: string, at: V3, lift = 0.02) {
  const s = new Shape();
  s.moveTo(0, 0.35);
  s.bezierCurveTo(0, 0.6, -0.5, 0.65, -0.5, 0.3);
  s.bezierCurveTo(-0.5, 0, 0, -0.15, 0, -0.5);
  s.bezierCurveTo(0, -0.15, 0.5, 0, 0.5, 0.3);
  s.bezierCurveTo(0.5, 0.65, 0, 0.6, 0, 0.35);
  return slab(s, lift, hex, at, [0, T, 0], [size, 1, size]);
}
/** A rounded-rectangle silhouette (cards, phones), centered. */
function roundRect(w: number, h: number, r: number) {
  const s = new Shape(),
    x = -w / 2,
    y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}
/** A cut key: a round bow with a hole, a shank and teeth. */
function keyShape() {
  const s = new Shape();
  s.absarc(0, 0, 0.06, T * 0.3, T * 1.7, false);
  s.lineTo(0.05, -0.018);
  s.lineTo(0.27, -0.018);
  s.lineTo(0.27, 0.0);
  s.lineTo(0.24, 0.0);
  s.lineTo(0.225, 0.02);
  s.lineTo(0.2, 0.0);
  s.lineTo(0.18, 0.024);
  s.lineTo(0.155, 0.0);
  s.lineTo(0.13, 0.02);
  s.lineTo(0.11, 0.018);
  s.lineTo(0.05, 0.018);
  const hole = new Path();
  hole.absarc(-0.015, 0, 0.022, 0, T * 2, true);
  s.holes.push(hole);
  return s;
}
/** A feathered wing, root at the origin, reaching along +x (or -x). */
function wingShape(side: 1 | -1) {
  return poly(
    (
      [
        [0, 0.05], [0.08, 0.1], [0.18, 0.1], [0.3, 0.06], [0.27, 0.02],
        [0.3, -0.01], [0.24, -0.03], [0.26, -0.06], [0.18, -0.06],
        [0.18, -0.09], [0.1, -0.07], [0.04, -0.06], [0, -0.04],
      ] as [number, number][]
    ).map(([x, z]) => [x * side, z]),
  );
}

const MODELS: Record<FighterId, () => BufferGeometry[]> = {
  // HELLO my name is: a red-banded name sticker, scribbled on.
  brandon: () => [
    slab(roundRect(0.5, 0.34, 0.04), 0.022, "#fdfdfd"),
    slab(roundRect(0.5, 0.11, 0.035), 0.03, "#d83b3b", [0, 0, -0.115]),
    box(0.3, 0.012, 0.035, "#ffffff", [0, 0.034, -0.125]),
    box(0.16, 0.012, 0.018, "#ffffff", [0, 0.034, -0.085]),
    box(0.5, 0.03, 0.03, "#d83b3b", [0, 0.005, 0.157]),
    ...[-0.12, -0.02, 0.08].map((x, i) =>
      box(0.13, 0.012, 0.022, "#2b4c8c", [x, 0.03, 0.04 + (i % 2) * 0.03], [0, 0.35 - i * 0.3, 0]),
    ),
    box(0.3, 0.008, 0.01, "#9aa6b8", [0, 0.026, 0.1]),
  ],
  // A key ring: two cut keys and a remote fob.
  daniel: () => [
    ringFlat(0.07, 0.013, "#cfd6de"),
    slab(keyShape(), 0.018, "#e8c25a", [0.04, 0, 0.05], [0, -T / 2 - 0.35, 0]),
    slab(keyShape(), 0.018, "#c9d1d9", [-0.04, 0, 0.05], [0, -T / 2 + 0.45, 0]),
    box(0.1, 0.045, 0.15, "#22262e", [0, 0, -0.14], [0, 0, 0], 0.03),
    disc(0.022, 0.06, "#e04848", [0, 0.01, -0.12], 12),
    disc(0.016, 0.06, "#4b9be0", [0, 0.01, -0.175], 12),
    rod(0.008, 0.06, "#cfd6de", [0, 0, -0.065], [T / 2, 0, 0]),
  ],
  rich: () => [ball(0.01, "#ffffff", [0, 0, 0], [1, 1, 1], [4, 2])],
  // A puffy snack bag with crimped seals and a cookie on both labels.
  samuel: () => [
    ball(0.19, "#f5d46e", [0, 0, 0], [0.95, 1.2, 0.42], [14, 10]),
    box(0.36, 0.05, 0.07, "#d8994c", [0, 0.235, 0]),
    box(0.36, 0.05, 0.07, "#d8994c", [0, -0.235, 0]),
    ...[-0.15, -0.09, -0.03, 0.03, 0.09, 0.15].flatMap((x) => [
      part(new ConeGeometry(0.022, 0.04, 3), "#c4843f", [x, 0.27, 0]),
      part(new ConeGeometry(0.022, 0.04, 3), "#c4843f", [x, -0.27, 0], [T, 0, 0]),
    ]),
    ...[1, -1].flatMap((side) => [
      plate(0.11, 0.02, "#e8553a", [0, 0, side * 0.075]),
      plate(0.075, 0.025, "#d8994c", [0, 0, side * 0.086], 18),
      ball(0.016, "#5a3c2a", [0.025, 0.03, side * 0.1]),
      ball(0.014, "#5a3c2a", [-0.03, -0.01, side * 0.1]),
      ball(0.013, "#5a3c2a", [0.01, -0.035, side * 0.1]),
    ]),
  ],
  josh: () => [ball(0.01, "#ffffff", [0, 0, 0], [1, 1, 1], [4, 2])],
  // A beetle-shaped software bug: split shell, glitch pixels, red error eyes.
  elijah: () => [
    ball(0.12, "#77d5b9", [0, 0, -0.04], [1, 0.62, 1.3], [14, 9]),
    box(0.014, 0.02, 0.3, "#1f3a37", [0, 0.07, -0.04]),
    ...[[-0.05, -0.08], [0.06, -0.02], [-0.04, 0.05], [0.05, -0.12]].map(([x, z]) =>
      box(0.03, 0.012, 0.03, "#d9fff1", [x, 0.072, z]),
    ),
    ball(0.07, "#1f3a37", [0, 0.01, 0.12], [1, 0.8, 0.9]),
    ball(0.055, "#1f3a37", [0, 0.02, 0.19]),
    ball(0.02, "#ff4d5e", [0.028, 0.045, 0.225]),
    ball(0.02, "#ff4d5e", [-0.028, 0.045, 0.225]),
    ...[1, -1].flatMap((s) => [
      rod(0.006, 0.12, "#1f3a37", [s * 0.04, 0.07, 0.27], [T / 2 - 0.6, 0, s * 0.5], 5),
      ball(0.012, "#77d5b9", [s * 0.07, 0.115, 0.31]),
      ...[-0.06, 0.03, 0.11].map((z, i) =>
        rod(0.008, 0.15, "#1f3a37", [s * 0.13, -0.03, z], [0, (i - 1) * 0.35 * s, s * 1.15], 5),
      ),
    ]),
  ],
  // An eighth note with a curling flag and a shine.
  ethan: () => [
    ball(0.1, "#df83c8", [0, 0, 0], [1.3, 0.85, 0.85], [14, 10]),
    ball(0.03, "#ffe3f5", [-0.05, 0.04, 0.05]),
    rod(0.02, 0.42, "#df83c8", [0.115, 0.21, 0]),
    part(new TorusGeometry(0.12, 0.025, 6, 14, T * 0.65), "#df83c8", [0.2, 0.33, 0], [0, 0, T * 0.55]),
    part(new OctahedronGeometry(0.035, 0), "#fff3b0", [-0.16, 0.25, 0]),
  ],
  // Mixed Voice: two layers of sound rolling forward around a bright core.
  david: () => [
    ball(0.05, "#fff8d7", [0, 0, 0], [1, 1, 1], [12, 8]),
    ringFlat(0.1, 0.024, "#f2c65d", [0, 0, 0], T * 0.9),
    ringFlat(0.17, 0.024, "#4f7fd1", [0, 0, -0.03], T * 0.8),
    ringFlat(0.24, 0.024, "#f2c65d", [0, 0, -0.06], T * 0.7),
    ringFlat(0.17, 0.02, "#f2c65d", [0, 0.045, -0.03], T * 0.8),
    ringFlat(0.1, 0.02, "#4f7fd1", [0, 0.045, 0], T * 0.9),
  ],
  // A barbed hook with a little lure fish snagged on the bend; the line
  // ties to the eye at the back.
  dylan: () => [
    rod(0.012, 0.2, "#8a96a3", [0, 0, -0.02], [T / 2, 0, 0], 6),
    ringFlat(0.025, 0.008, "#8a96a3", [0, 0, -0.14]),
    part(new TorusGeometry(0.06, 0.012, 5, 12, T), "#8a96a3", [0.06, 0, 0.08], [T / 2, 0, 0]),
    part(new ConeGeometry(0.016, 0.05, 5), "#8a96a3", [0.12, 0, 0.05], [-T / 2, 0, 0]),
    ball(0.055, "#ff8a3d", [0.06, 0.04, 0.15], [0.8, 0.9, 1.6], [12, 8]),
    ball(0.04, "#fff4e0", [0.06, 0.015, 0.15], [0.7, 0.6, 1.4], [10, 6]),
    part(new ConeGeometry(0.045, 0.07, 4), "#ff8a3d", [0.06, 0.04, 0.05], [-T / 2, 0, 0]),
    ball(0.012, "#11141a", [0.1, 0.06, 0.2]),
    ball(0.012, "#11141a", [0.02, 0.06, 0.2]),
  ],
  // A chunky staple, points first.
  isaac: () => [
    box(0.3, 0.045, 0.05, "#d7dde4", [0, 0, -0.1]),
    box(0.05, 0.045, 0.2, "#c0c7cf", [-0.125, 0, 0.0]),
    box(0.05, 0.045, 0.2, "#c0c7cf", [0.125, 0, 0.0]),
    part(new ConeGeometry(0.028, 0.06, 4), "#8b939d", [-0.125, 0, 0.13], [T / 2, T / 4, 0]),
    part(new ConeGeometry(0.028, 0.06, 4), "#8b939d", [0.125, 0, 0.13], [T / 2, T / 4, 0]),
    box(0.22, 0.01, 0.012, "#ffffff", [0, 0.026, -0.11]),
  ],
  tovya: () => [ball(0.01, "#ffffff", [0, 0, 0], [1, 1, 1], [4, 2])],
  // A rolling crest of welcome with hearts riding on it.
  rosalie: () => [
    ringFlat(0.3, 0.06, "#fbe8d3", [0, 0, 0], T),
    ringFlat(0.24, 0.045, "#e8553a", [0, 0.03, -0.02], T),
    ringFlat(0.35, 0.025, "#ffffff", [0, -0.02, 0.01], T * 0.85),
    heart(0.09, "#e8553a", [0, 0.08, 0.31]),
    heart(0.07, "#ff8fa3", [0.2, 0.07, 0.24]),
    heart(0.07, "#ff8fa3", [-0.2, 0.07, 0.24]),
  ],
  // A real steering wheel: rim, grip, three spokes and a horn hub.
  joelle: () => [
    ringFlat(0.21, 0.04, "#2b2b2b"),
    ringFlat(0.175, 0.014, "#ffb300", [0, 0.02, 0]),
    ...[T / 2, T / 2 + (T * 2) / 3, T / 2 + (T * 4) / 3].map((a) =>
      box(0.18, 0.03, 0.04, "#3a3a3a", [Math.cos(a) * 0.1, 0, Math.sin(a) * 0.1], [0, -a, 0]),
    ),
    disc(0.07, 0.06, "#ffb300", [0, 0.005, 0], 20),
    part(new OctahedronGeometry(0.035, 0), "#ffffff", [0, 0.05, 0], [0, 0, 0], [1, 0.4, 1]),
  ],
  // A social post: avatar, photo, and a like.
  susannah: () => [
    slab(roundRect(0.38, 0.48, 0.05), 0.026, "#fff6fa"),
    slab(roundRect(0.38, 0.1, 0.04), 0.032, "#ff6f91", [0, 0, -0.19]),
    disc(0.035, 0.04, "#3b3f63", [-0.13, 0.01, -0.19], 14),
    box(0.15, 0.01, 0.025, "#ffffff", [-0.01, 0.036, -0.19]),
    slab(roundRect(0.32, 0.2, 0.02), 0.03, "#ffd1dc", [0, 0, -0.02]),
    slab(poly([[-0.14, 0.07], [-0.05, -0.06], [0.04, 0.07]]), 0.036, "#9fd4a8", [0, 0, -0.02]),
    disc(0.025, 0.04, "#fff3b0", [0.09, 0.015, -0.07], 12),
    heart(0.07, "#ff3b6b", [-0.12, 0.035, 0.16]),
    box(0.16, 0.01, 0.025, "#c9b3bd", [0.06, 0.032, 0.16]),
  ],
  // A folded paper plane with a green stripe and a heart seal.
  joyce: () => {
    const wing = (s: number) => poly([[0, 0.24], [0.2 * s, -0.2], [0.015 * s, -0.12], [0, -0.2]]);
    const stripe = (s: number) => poly([[0.02 * s, 0.05], [0.13 * s, -0.18], [0.09 * s, -0.16], [0.02 * s, 0]]);
    return [
      slab(wing(1), 0.012, "#fffdf4", [0, 0, 0], [0, 0, 0.32]),
      slab(wing(-1), 0.012, "#fffdf4", [0, 0, 0], [0, 0, -0.32]),
      slab(stripe(1), 0.016, "#2e9e5b", [0, 0.004, 0], [0, 0, 0.32]),
      slab(stripe(-1), 0.016, "#2e9e5b", [0, 0.004, 0], [0, 0, -0.32]),
      box(0.012, 0.07, 0.36, "#e8e2cf", [0, -0.035, 0.02]),
      heart(0.06, "#e04870", [0, 0.03, -0.06]),
    ];
  },
  // A peace dove with an olive branch in its beak.
  miriam: () => [
    ball(0.1, "#fbfbf7", [0, 0, 0], [0.85, 0.75, 1.5], [14, 10]),
    ball(0.062, "#fbfbf7", [0, 0.06, 0.15]),
    part(new ConeGeometry(0.02, 0.06, 6), "#f2a33a", [0, 0.05, 0.225], [T / 2, 0, 0]),
    ball(0.01, "#11141a", [0.035, 0.08, 0.18]),
    ball(0.01, "#11141a", [-0.035, 0.08, 0.18]),
    slab(wingShape(1), 0.014, "#ffffff", [0.05, 0.04, 0.0], [0, 0, 0.45]),
    slab(wingShape(-1), 0.014, "#ffffff", [-0.05, 0.04, 0.0], [0, 0, -0.45]),
    slab(poly([[0, -0.08], [0.1, -0.3], [0.03, -0.27], [0, -0.31], [-0.03, -0.27], [-0.1, -0.3]]), 0.016, "#e3e6df", [0, 0.01, 0]),
    rod(0.006, 0.16, "#5b7d2c", [0.06, 0.04, 0.25], [0, 0, T / 2 - 0.2], 5),
    ...[0.03, 0.08, 0.12].map((x, i) =>
      ball(0.02, "#7aa64a", [x, 0.05 + (i % 2 ? 0.02 : -0.015), 0.25], [1.6, 0.5, 0.9], [6, 4]),
    ),
  ],
  jemuel: () => [ball(0.01, "#ffffff", [0, 0, 0], [1, 1, 1], [4, 2])],
  // A tied coin pouch with a dollar seal, coins riding along: it is lobbed
  // and tumbles end over end, so both faces carry the seal.
  russell: () => [
    ball(0.17, "#7cb342", [0, 0, 0], [1, 0.95, 0.9], [12, 9]),
    part(new ConeGeometry(0.09, 0.12, 10), "#6a9a38", [0, 0.2, 0]),
    ringFlat(0.06, 0.02, "#c9962f", [0, 0.17, 0]),
    ...[-0.04, 0.04].map((x) =>
      part(new ConeGeometry(0.03, 0.08, 6), "#7cb342", [x, 0.29, 0], [0, 0, x * 8]),
    ),
    ...[1, -1].flatMap((side) => [
      plate(0.08, 0.02, "#f3c26b", [0, 0, side * 0.155]),
      part(new TorusGeometry(0.03, 0.01, 4, 10, T * 1.3), "#a87a1e", [0, 0.025, side * 0.168], [0, 0, T * 0.15]),
      part(new TorusGeometry(0.03, 0.01, 4, 10, T * 1.3), "#a87a1e", [0, -0.025, side * 0.168], [0, 0, T * 1.15]),
      box(0.012, 0.13, 0.012, "#a87a1e", [0, 0, side * 0.168]),
    ]),
    ...[[0.17, -0.06], [-0.16, 0.05], [0.12, 0.12]].map(([x, y]) =>
      plate(0.05, 0.015, "#f3c26b", [x, y, 0.02], 14),
    ),
  ],
  // A UCLA meal card: gold stripe, chip and a magnetic stripe on the back.
  brandon_n: () => [
    slab(roundRect(0.42, 0.27, 0.03), 0.022, "#2d6fc0"),
    box(0.42, 0.012, 0.06, "#ffd24a", [0, 0.026, -0.08]),
    box(0.08, 0.012, 0.06, "#ffd24a", [-0.12, 0.026, 0.04]),
    box(0.06, 0.016, 0.003, "#b8901f", [-0.12, 0.03, 0.04]),
    box(0.16, 0.012, 0.025, "#f4f7fb", [0.07, 0.026, 0.06]),
    box(0.42, 0.012, 0.05, "#11141a", [0, -0.004, -0.06]),
  ],
};

/** Small models scaled up so they read at gameplay distance. */
const SCALE: Partial<Record<FighterId, number>> = { dylan: 1.35, isaac: 1.1 };

/** The model a fighter's attack throws (also its Super shot, if any). */
export function projectileModel(id: FighterId): BufferGeometry {
  const g = merge(MODELS[id]());
  const k = SCALE[id];
  if (k) g.scale(k, k, k).computeBoundingSphere();
  return g;
}

const ITEM_MODELS: Record<ItemKind, () => BufferGeometry[]> = {
  // A golden broom: wrapped handle, binding bands and a fanned head.
  golden_broom: () => [
    rod(0.04, 1.2, "#e3a924", [0, 0, -0.05], [T / 2, 0, 0], 10),
    ...[-0.5, -0.38].map((z) => rod(0.047, 0.07, "#a96e12", [0, 0, z], [T / 2, 0, 0], 10)),
    ball(0.05, "#ffd85b", [0, 0, -0.66]),
    slab(poly([[-0.09, 0.56], [0.09, 0.56], [0.3, 1.0], [-0.3, 1.0]]), 0.1, "#ffd85b", [0, -0.05, 0]),
    box(0.22, 0.13, 0.08, "#a96e12", [0, 0, 0.55]),
    box(0.24, 0.02, 0.09, "#fff1a8", [0, 0.06, 0.55]),
    ...[-0.18, -0.09, 0, 0.09, 0.18].map((x) =>
      box(0.03, 0.05, 0.12, "#f2c43c", [x, 0, 0.98], [0, x * 0.6, 0]),
    ),
    part(new OctahedronGeometry(0.05, 0), "#fffbe0", [0.18, 0.12, 0.7]),
    part(new OctahedronGeometry(0.035, 0), "#fffbe0", [-0.15, 0.1, 0.9]),
  ],
  // A tri-fold GOC flyer: header, photo, text and a cross mark.
  goc_flyer: () => [
    box(0.24, 0.025, 0.66, "#f4f7ff", [0, 0, 0]),
    box(0.22, 0.025, 0.66, "#e9eef8", [0.225, 0.04, 0], [0, 0, 0.35]),
    box(0.22, 0.025, 0.66, "#e9eef8", [-0.225, 0.04, 0], [0, 0, -0.35]),
    box(0.24, 0.03, 0.14, "#387dce", [0, 0.004, -0.24]),
    box(0.03, 0.035, 0.1, "#ffffff", [0, 0.01, -0.24]),
    box(0.08, 0.035, 0.03, "#ffffff", [0, 0.01, -0.255]),
    box(0.18, 0.03, 0.18, "#9fc4ee", [0, 0.004, -0.02]),
    ...[0.12, 0.17, 0.22].map((z, i) => box(0.18 - i * 0.04, 0.03, 0.02, "#7a92ae", [0, 0.004, z])),
    box(0.16, 0.03, 0.05, "#ffd85b", [0.225, 0.052, 0.2], [0, 0, 0.35]),
  ],
};

/** The model of a pickup item, on the ground, carried or thrown. */
export function itemModel(kind: ItemKind): BufferGeometry {
  return merge(ITEM_MODELS[kind]());
}
