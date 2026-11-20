import {
  BoxGeometry,
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshToonMaterial,
  PlaneGeometry,
  RingGeometry,
  ShaderMaterial,
  type BufferGeometry,
} from "three";
import { MAPS, type Arena, type Mode, type Vec, type Wall } from "../../../shared/definitions";
import type { Match } from "../../../shared/types";
import { merge, part } from "../ui/scene/geometry";
import type { ArenaMaterials } from "./materials";

/**
 * Arena presentation layer (performance standard §3, §5.2): the 3D treatment
 * of Central Lawn, Bruin Plaza (Fishers of Men) and Broomball Night. Footprints
 * come straight from `MAPS` (walls, bushes, bounds, goal mouths), so the art
 * cannot drift from collision. Static art is merged once per match into a few meshes; per
 * frame only the shrinking zone (a uniform), crate visibility and the
 * occupied-bush fade change.
 *
 * Map space (x, y) is world (x, 0, y): x runs right, y runs toward the camera.
 */
const WALL_HEIGHT = 1.15;
const CRATE_HEIGHT = 0.9;
const BUSH_HEIGHT = 0.95;
export const ZONE_CENTER = { x: 18, y: 12 };

/** A flat painted rectangle (map coords), `y` above the ground. */
const flat = (hex: string, x: number, z: number, w: number, d: number, y: number) =>
  part(new PlaneGeometry(w, d), hex, [x + w / 2, y, z + d / 2], [-Math.PI / 2, 0, 0]);
/** A box standing on `y0` over a map rectangle. */
const block = (hex: string, x: number, z: number, w: number, d: number, h: number, y0 = 0) =>
  part(new BoxGeometry(w, h, d), hex, [x + w / 2, y0 + h / 2, z + d / 2]);
const ring = (hex: string, cx: number, cz: number, r0: number, r1: number, y: number) =>
  part(new RingGeometry(r0, r1, 64), hex, [cx, y, cz], [-Math.PI / 2, 0, 0]);
const disc = (hex: string, cx: number, cz: number, r: number, y: number) =>
  part(new CircleGeometry(r, 32), hex, [cx, y, cz], [-Math.PI / 2, 0, 0]);

/** Deterministic jitter so the map looks the same for every player. */
function noise(i: number) {
  const s = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function tree(x: number, z: number, h: number, seed: number): BufferGeometry[] {
  const greens = ["#4f7b3c", "#3f6832", "#5b8c45"];
  const parts = [part(new CylinderGeometry(0.16, 0.24, h * 0.55, 6), "#7b6b5b", [x, h * 0.275, z])];
  for (let k = 0; k < 3; k++) {
    const r = h * (0.32 - k * 0.05);
    parts.push(
      part(
        new IcosahedronGeometry(r, 0),
        greens[(seed + k) % 3],
        [x + (noise(seed * 3 + k) - 0.5) * 0.6, h * (0.62 + k * 0.17), z + (noise(seed * 5 + k) - 0.5) * 0.6],
        [k, seed, 0],
      ),
    );
  }
  return parts;
}

/** Stone cover block, with a lighter cap and a darker foot. */
function wall(w: Wall): BufferGeometry[] {
  return [
    flat("#5e8a50", w.x - 0.16, w.y - 0.08, w.w + 0.32, w.h + 0.3, 0.012),
    block("#7f9180", w.x, w.y, w.w, w.h, 0.16),
    block("#a7b7a6", w.x + 0.02, w.y + 0.02, w.w - 0.04, w.h - 0.04, WALL_HEIGHT - 0.24, 0.16),
    block("#e1d3a6", w.x - 0.03, w.y - 0.03, w.w + 0.06, w.h + 0.06, 0.08, WALL_HEIGHT - 0.08),
  ];
}

/** Wooden crate in model space (origin at the footprint center, on the ground). */
function crate(w: number, d: number): BufferGeometry {
  const h = CRATE_HEIGHT,
    t = 0.09;
  const parts = [block("#c99155", -w / 2 + 0.03, -d / 2 + 0.03, w - 0.06, d - 0.06, h - 0.04)];
  // Dark frame along every edge, and a cross plank on the two visible faces.
  for (const [x, z] of [
    [-w / 2, -d / 2],
    [w / 2 - t, -d / 2],
    [-w / 2, d / 2 - t],
    [w / 2 - t, d / 2 - t],
  ])
    parts.push(block("#8d5f35", x, z, t, t, h));
  for (const y0 of [0, h - t]) {
    parts.push(block("#8d5f35", -w / 2, -d / 2, w, t, t, y0), block("#8d5f35", -w / 2, d / 2 - t, w, t, t, y0));
    parts.push(block("#8d5f35", -w / 2, -d / 2, t, d, t, y0), block("#8d5f35", w / 2 - t, -d / 2, t, d, t, y0));
  }
  parts.push(
    part(new BoxGeometry(Math.hypot(w, h) * 0.92, 0.08, 0.03), "#a8743f", [0, h / 2, d / 2 + 0.005], [0, 0, Math.atan2(h, w)]),
    part(new BoxGeometry(0.03, 0.08, Math.hypot(d, h) * 0.92), "#a8743f", [w / 2 + 0.005, h / 2, 0], [Math.atan2(h, d), 0, 0]),
  );
  return merge(parts);
}

function bush(b: { x: number; y: number; w: number; h: number }, seed: number): BufferGeometry {
  const parts = [block("#2f6e45", b.x + 0.12, b.y + 0.12, b.w - 0.24, b.h - 0.24, BUSH_HEIGHT * 0.55)];
  const shades = ["#3a8752", "#409157", "#2f754b", "#4c9d62"];
  let i = seed * 101;
  for (let x = b.x + 0.38; x < b.x + b.w - 0.1; x += 0.62)
    for (let z = b.y + 0.38; z < b.y + b.h - 0.1; z += 0.62) {
      i++;
      const r = 0.36 + noise(i) * 0.12;
      parts.push(
        part(
          new IcosahedronGeometry(r, 0),
          shades[i % shades.length],
          [x + (noise(i + 7) - 0.5) * 0.18, BUSH_HEIGHT - r * 0.75 + noise(i + 3) * 0.08, z + (noise(i + 11) - 0.5) * 0.18],
          [noise(i) * 3, noise(i + 1) * 3, 0],
          [1, 0.85, 1],
        ),
      );
    }
  return merge(parts);
}

function lawnArt(): BufferGeometry {
  const m = MAPS.showdown;
  const parts: BufferGeometry[] = [
    flat("#5f8f4f", -40, -40, m.w + 80, m.h + 80, -0.02),
    flat("#83b66a", 0, 0, m.w, m.h, 0),
  ];
  for (let x = 0; x < m.w; x += 2)
    for (let y = 0; y < m.h; y += 2) if ((x + y) % 4 === 0) parts.push(flat("#7aab61", x, y, 2, 2, 0.004));
  parts.push(flat("#dccf98", 0, 11, m.w, 2, 0.008), flat("#dccf98", 17, 0, 2, m.h, 0.008));
  // Hedge border just outside the playable bounds.
  const e = 0.7;
  for (const [x, z, w, d] of [
    [-e, -e, m.w + 2 * e, e],
    [-e, m.h, m.w + 2 * e, e],
    [-e, 0, e, m.h],
    [m.w, 0, e, m.h],
  ])
    parts.push(block("#3f7a4b", x, z, w, d, 0.62), block("#4f9259", x - 0.03, z - 0.03, w + 0.06, d + 0.06, 0.1, 0.6));
  for (const w of m.walls) if (w.hp === undefined) parts.push(...wall(w));
  // Trees beyond the hedge; kept short and further out on the camera side.
  let seed = 0;
  for (let x = -3; x <= m.w + 3; x += 3.1) {
    parts.push(...tree(x + noise(seed) * 1.2, -2.6 - noise(seed + 1) * 2.4, 2.8 + noise(seed + 2) * 0.9, seed++));
    parts.push(...tree(x + noise(seed) * 1.2, m.h + 4.4 + noise(seed + 1) * 2, 2.2 + noise(seed + 2) * 0.5, seed++));
  }
  for (let z = 0; z <= m.h; z += 3.2) {
    parts.push(...tree(-2.6 - noise(seed) * 2.2, z + noise(seed + 1), 2.8 + noise(seed + 2) * 0.9, seed++));
    parts.push(...tree(m.w + 2.6 + noise(seed) * 2.2, z + noise(seed + 1), 2.8 + noise(seed + 2) * 0.9, seed++));
  }
  return merge(parts);
}

/*
 * Bruin Plaza (Fishers of Men): UCLA's central campus around Ackerman Union,
 * an original low-poly interpretation built from primitives, with no photo
 * texture, traced geometry or scanned asset (as the menu plaza).
 *
 * The camera always looks north at a fixed pitch, so anything tall hides
 * whoever stands just north of it. Every building is therefore a body at
 * cover height whose tall part is its south facade, the side the camera
 * sees, and nothing on it rises faster than `SIGHT` per unit south of its
 * north face, which sight lines toward the camera clear even at the top of
 * the screen. The statue, buses, tables and planters stay near cover height.
 */
const CAMPUS_BODY = 1.3;
const SIGHT = 0.6;
/** The tallest a building may be `d` units south of its north face. */
const sightLimit = (d: number) => CAMPUS_BODY + SIGHT * d;
/** Bruin Walk (y range), Westwood Plaza (x range) and Bruin Plaza where they cross. */
const WALK = [17, 23] as const;
const ROAD = [27, 33] as const;
const PLAZA = { x: 22, y: 14, w: 16, h: 12 };
const BRICK = "#b0644b";
const STONE = "#e8dcc2";
const PAVING = "#cfc9bb";

interface BuildingStyle {
  body: string;
  roof: string;
  trim: string;
  glass: string;
  /** South facade height, before the sight-line limit. */
  facade: number;
  windows: "bands" | "grid" | "arches";
  /** A banner stripe across the top of the facade. */
  stripe?: string;
  /** A central tower in the facade (Kerckhoff Hall). */
  tower?: number;
  /** A raised arena roof (Pauley Pavilion). */
  dome?: number;
  /** A skylight down the roof (Ackerman Union). */
  skylight?: boolean;
}

/** Building art by wall id; footprints come from `MAPS.fishing`. */
const CAMPUS_BUILDINGS: Record<string, BuildingStyle> = {
  ackerman: { body: "#d8c8a8", roof: "#bdb6aa", trim: "#efe6d2", glass: "#56718a", facade: 2.9, windows: "bands", skylight: true },
  kerckhoff: { body: "#a8604a", roof: "#7d6a5c", trim: STONE, glass: "#4f6378", facade: 2.6, windows: "arches", tower: 3.9 },
  pauley: { body: "#c9ccd0", roof: "#eceeef", trim: "#2f5fa8", glass: "#55697e", facade: 2.4, windows: "bands", stripe: "#f2c65d", dome: 2.3 },
  wooden: { body: "#d9d6cf", roof: "#a9adb2", trim: "#2f5fa8", glass: "#5a7894", facade: 2.6, windows: "bands", stripe: "#f2c65d" },
  sac: { body: "#b56b52", roof: "#9a8f84", trim: "#ece2cc", glass: "#50657a", facade: 2.8, windows: "grid" },
  morgan: { body: "#cfc6b4", roof: "#9fa3a6", trim: "#2f5fa8", glass: "#4d6a86", facade: 2.3, windows: "grid", stripe: "#f2c65d" },
};

/** A pane on a south face at `z` (facing the camera). */
const pane = (hex: string, cx: number, cy: number, w: number, h: number, z: number) =>
  part(new PlaneGeometry(w, h), hex, [cx, cy, z]);

/** Window rows on a south face spanning x0..x1, up to `top`. */
function windows(st: Pick<BuildingStyle, "windows" | "glass" | "trim">, x0: number, x1: number, top: number, z: number): BufferGeometry[] {
  const parts: BufferGeometry[] = [];
  if (st.windows === "bands") {
    for (let y = 0.55; y + 0.4 < top - 0.2; y += 0.8) parts.push(pane(st.glass, (x0 + x1) / 2, y + 0.19, x1 - x0 - 0.6, 0.38, z));
    for (let x = x0 + 0.6; x < x1 - 0.4; x += 1.1) parts.push(pane(st.trim, x, (top - 0.1) / 2 + 0.2, 0.06, top - 0.7, z + 0.002));
  } else
    for (let y = st.windows === "arches" ? 0.5 : 0.45; y + (st.windows === "arches" ? 0.95 : 0.5) < top - 0.2; y += st.windows === "arches" ? 1.05 : 0.8)
      for (let x = x0 + 0.65; x < x1 - 0.45; x += 1)
        if (st.windows === "grid") parts.push(pane(st.glass, x, y + 0.22, 0.46, 0.44, z));
        else
          parts.push(
            pane(st.glass, x, y + 0.38, 0.36, 0.76, z),
            part(new PlaneGeometry(0.255, 0.255), st.glass, [x, y + 0.76, z], [0, 0, Math.PI / 4]),
          );
  return parts;
}

/** A campus building over a wall footprint: see the sight-line note above. */
function building(w: Wall, st: BuildingStyle): BufferGeometry[] {
  const { x, y } = w,
    south = y + w.h,
    face = south + 0.012,
    fd = 1,
    fh = Math.min(st.facade, sightLimit(w.h - fd));
  const parts = [
    flat(PAVING, x - 0.8, y - 0.8, w.w + 1.6, w.h + 1.6, 0.006),
    block(st.body, x, y, w.w, w.h, CAMPUS_BODY),
    block(st.trim, x - 0.04, y - 0.04, w.w + 0.08, w.h + 0.08, 0.08, CAMPUS_BODY - 0.08),
    block(st.roof, x + 0.12, y + 0.12, w.w - 0.24, w.h - 0.24, 0.04, CAMPUS_BODY),
    block(st.body, x, south - fd, w.w, fd, fh),
    block(st.trim, x - 0.05, south - fd - 0.05, w.w + 0.1, fd + 0.1, 0.1, fh - 0.1),
    block(st.trim, x - 0.03, south - 0.05, w.w + 0.06, 0.08, 0.22),
    ...windows(st, x, x + w.w, fh, face),
    pane("#2f3a46", x + w.w / 2, 0.5, 1.4, 1, face + 0.004),
    // Rooftop plant near the north face, under the sight-line limit there.
    block("#a3a8ad", x + w.w * 0.2, y + 0.8, 1, 0.7, 0.32, CAMPUS_BODY),
    block("#a3a8ad", x + w.w * 0.62, y + 1.2, 0.8, 0.8, 0.28, CAMPUS_BODY),
  ];
  if (st.stripe) parts.push(pane(st.stripe, x + w.w / 2, fh - 0.42, w.w, 0.16, face + 0.004));
  if (st.skylight) parts.push(flat("#8fb4cc", x + 1.5, y + 2.2, w.w - 3, 1.2, CAMPUS_BODY + 0.045));
  if (st.tower) {
    const tw = 1.8,
      tx = x + w.w / 2 - tw / 2,
      tz = south - tw,
      th = Math.min(st.tower, sightLimit(w.h - tw));
    parts.push(
      block(st.body, tx, tz, tw, tw, th),
      block(st.trim, tx - 0.06, tz - 0.06, tw + 0.12, tw + 0.12, 0.12, th - 0.12),
      ...[
        [tx, tz],
        [tx + tw - 0.4, tz],
        [tx, tz + tw - 0.4],
        [tx + tw - 0.4, tz + tw - 0.4],
      ].map(([cx, cz]) => block(st.trim, cx, cz, 0.4, 0.4, 0.28, th)),
      pane(st.glass, tx + tw / 2, th - 0.75, 0.4, 0.7, face + 0.004),
      part(new PlaneGeometry(0.28, 0.28), st.glass, [tx + tw / 2, th - 0.4, face + 0.004], [0, 0, Math.PI / 4]),
    );
  }
  if (st.dome) {
    const i = 2.4,
      dd = w.h - i - 1.6,
      dh = Math.min(st.dome, sightLimit(i));
    parts.push(
      block(st.roof, x + i, y + i, w.w - 2 * i, dd, dh),
      block(st.trim, x + i - 0.05, y + i - 0.05, w.w - 2 * i + 0.1, dd + 0.1, 0.12, dh - 0.12),
      block(st.roof, x + i + 0.7, y + i + 0.7, w.w - 2 * i - 1.4, dd - 1.4, Math.min(dh + 0.3, sightLimit(i + 0.7))),
    );
  }
  return parts;
}

/** The Bruin Bear: a bronze bear walking on all fours on a granite plinth. */
function bruinBear(w: Wall): BufferGeometry[] {
  const cx = w.x + w.w / 2,
    cz = w.y + w.h / 2,
    p = 0.62,
    bronze = "#6e4b2f",
    dark = "#4a3120";
  const ball = (r: number, hex: string, at: [number, number, number], scale: [number, number, number] = [1, 1, 1]) =>
    part(new IcosahedronGeometry(r, 1), hex, at, [0, 0, 0], scale);
  const parts = [
    block("#8f8a82", w.x, w.y, w.w, w.h, p - 0.1),
    block("#bdb7ac", w.x - 0.06, w.y - 0.06, w.w + 0.12, w.h + 0.12, 0.1, p - 0.1),
    ball(0.5, bronze, [cx - 0.08, p + 0.62, cz], [1.45, 0.78, 0.82]),
    ball(0.32, bronze, [cx + 0.18, p + 0.82, cz], [1, 0.7, 0.9]),
    ball(0.3, bronze, [cx + 0.62, p + 0.74, cz], [1, 0.9, 0.85]),
    ball(0.15, dark, [cx + 0.9, p + 0.66, cz], [1.2, 0.8, 0.9]),
    ball(0.09, bronze, [cx + 0.56, p + 1, cz - 0.17]),
    ball(0.09, bronze, [cx + 0.56, p + 1, cz + 0.17]),
  ];
  // Legs mid-stride.
  for (const [dx, dz, lean] of [
    [0.42, -0.2, 0.25],
    [0.38, 0.2, -0.1],
    [-0.5, -0.2, -0.2],
    [-0.46, 0.2, 0.15],
  ])
    parts.push(part(new CylinderGeometry(0.1, 0.12, 0.52, 8), bronze, [cx + dx, p + 0.26, cz + dz], [0, 0, lean]));
  return parts;
}

/** A blue-and-gold campus shuttle parked on Westwood Plaza. */
function bus(w: Wall): BufferGeometry[] {
  const parts = [
    block("#2b5aa0", w.x + 0.05, w.y + 0.05, w.w - 0.1, w.h - 0.1, 1.1, 0.25),
    block("#e9eef2", w.x + 0.1, w.y + 0.1, w.w - 0.2, w.h - 0.2, 0.06, 1.35),
    block("#f2c65d", w.x + 0.03, w.y + 0.3, w.w - 0.06, w.h - 0.6, 0.1, 0.5),
    block("#2a3340", w.x + 0.02, w.y + 0.4, w.w - 0.04, w.h - 0.8, 0.32, 0.8),
    block("#2a3340", w.x + 0.15, w.y + w.h - 0.08, w.w - 0.3, 0.06, 0.45, 0.72),
  ];
  for (const z of [w.y + 1, w.y + w.h - 1])
    for (const x of [w.x + 0.05, w.x + w.w - 0.05])
      parts.push(part(new CylinderGeometry(0.26, 0.26, 0.2, 10), "#25272b", [x, 0.26, z], [0, 0, Math.PI / 2]));
  return parts;
}

const TABLECLOTHS = ["#3d7cc2", "#d8606d", "#f2c65d", "#77d5b9", "#9b7fd1", "#e98b4a", "#5fae6e", "#3d7cc2"];

/** A club's table on Bruin Walk: cloth to the ground, flyers, a small sign. */
function table(w: Wall, i: number): BufferGeometry[] {
  const cloth = TABLECLOTHS[i % TABLECLOTHS.length];
  const parts = [
    block(cloth, w.x + 0.05, w.y + 0.05, w.w - 0.1, w.h - 0.1, 0.7),
    block("#f4f1ea", w.x + 0.02, w.y + 0.02, w.w - 0.04, w.h - 0.04, 0.04, 0.7),
    block(cloth, w.x + w.w / 2 - 0.45, w.y + w.h / 2 - 0.03, 0.9, 0.06, 0.38, 0.74),
  ];
  for (let k = 0; k < 3; k++) parts.push(block("#ffffff", w.x + 0.25 + k * 0.7, w.y + 0.12, 0.3, 0.22, 0.02, 0.74));
  return parts;
}

/** A brick planter with a shrub and a lamp post. */
function planter(w: Wall, i: number): BufferGeometry[] {
  const cx = w.x + w.w / 2,
    cz = w.y + w.h / 2;
  const parts = [
    block(BRICK, w.x, w.y, w.w, w.h, 0.5),
    block(STONE, w.x - 0.04, w.y - 0.04, w.w + 0.08, w.h + 0.08, 0.08, 0.5),
    block("#6b4e36", w.x + 0.12, w.y + 0.12, w.w - 0.24, w.h - 0.24, 0.02, 0.56),
    part(new CylinderGeometry(0.05, 0.07, 2.2, 6), "#3b4148", [w.x + 0.3, 1.6, w.y + 0.3]),
    part(new IcosahedronGeometry(0.16, 0), "#fff3c4", [w.x + 0.3, 2.75, w.y + 0.3]),
  ];
  for (let k = 0; k < 4; k++) {
    const r = 0.28 + noise(i * 7 + k) * 0.1;
    parts.push(
      part(new IcosahedronGeometry(r, 0), ["#3a8752", "#409157", "#2f754b"][k % 3], [
        cx + (k % 2 ? 0.25 : -0.25),
        0.6 + r * 0.7,
        cz + (k < 2 ? -0.25 : 0.25),
      ]),
    );
  }
  return parts;
}

const CAMPUS_PIECES: Record<string, (w: Wall, i: number) => BufferGeometry[]> = {
  bear: bruinBear,
  bus,
  table,
  planter,
};

/**
 * Steps rising away from the field (east with `dir` 1, west with -1) from
 * `x0`, between z0 and z0 + width, to a grassy campus terrace beyond that
 * spans `terrace` along z. Returns the parts, the terrace edge x and height.
 */
function stairs(
  x0: number,
  dir: 1 | -1,
  z0: number,
  width: number,
  terrace: readonly [number, number],
): { parts: BufferGeometry[]; edge: number; top: number } {
  const steps = 10,
    run = 0.7,
    rise = 0.3,
    parts: BufferGeometry[] = [];
  for (let k = 0; k < steps; k++) {
    const x = dir > 0 ? x0 + k * run : x0 - (k + 1) * run,
      h = (k + 1) * rise;
    parts.push(
      block("#d7d0c3", x, z0, run, width, h),
      flat("#c58066", dir > 0 ? x : x + run - 0.12, z0, 0.12, width, h + 0.003),
      block(BRICK, x, z0 - 0.5, run, 0.5, h + 0.35),
      block(BRICK, x, z0 + width, run, 0.5, h + 0.35),
    );
  }
  const edge = x0 + dir * steps * run,
    top = steps * rise;
  const x = dir > 0 ? edge : edge - 60,
    [t0, t1] = terrace;
  parts.push(block("#6b9450", x, t0, 60, t1 - t0, top), flat("#7fae63", x, t0, 60, t1 - t0, top + 0.002));
  return { parts, edge, top };
}

/** Royce Hall above Janss Steps: brick, twin towers, an arched loggia. */
function royce(x: number, z: number, base: number): BufferGeometry[] {
  const w = 15,
    d = 7,
    face = z + d + 0.012,
    roof = "#8c4f3c",
    glass = "#4b5d70";
  const parts = [
    block(BRICK, x, z, w, d, 4.2, base),
    block(STONE, x - 0.08, z - 0.08, w + 0.16, d + 0.16, 0.18, base + 4.1),
    block(roof, x + 0.3, z + 0.3, w - 0.6, d - 0.6, 0.6, base + 4.2),
  ];
  for (let k = 0; k < 3; k++) {
    const cx = x + w / 2 + (k - 1) * 1.3;
    parts.push(
      pane("#3a3330", cx, base + 0.8, 0.9, 1.6, face),
      part(new CircleGeometry(0.45, 12, 0, Math.PI), "#3a3330", [cx, base + 1.6, face]),
    );
  }
  for (let cx = x + 4.3; cx < x + w - 4; cx += 1.1)
    parts.push(pane(glass, cx, base + 2.9, 0.4, 0.8, face), part(new CircleGeometry(0.2, 10, 0, Math.PI), glass, [cx, base + 3.3, face]));
  for (const tx of [x + 0.9, x + w - 3.5]) {
    const tz = z + d - 2.6;
    parts.push(block(BRICK, tx, tz, 2.6, 2.6, 8.2, base));
    for (const y of [4.2, 6.2, 8.1]) parts.push(block(STONE, tx - 0.06, tz - 0.06, 2.72, 2.72, 0.14, base + y));
    parts.push(
      pane(glass, tx + 1.3, base + 5.2, 0.5, 1.1, face),
      pane(glass, tx + 1.3, base + 7.2, 0.4, 0.6, face),
      part(new CylinderGeometry(0.85, 1.05, 1.5, 8), STONE, [tx + 1.3, base + 9, tz + 1.3]),
      part(new ConeGeometry(1, 1.4, 8), roof, [tx + 1.3, base + 10.45, tz + 1.3]),
    );
  }
  return parts;
}

/** A plain brick campus building in the backdrop. */
function backdrop(x: number, z: number, w: number, d: number, h: number, base = 0): BufferGeometry[] {
  const st = { windows: "grid" as const, glass: "#4f6378", trim: STONE };
  return [
    block(BRICK, x, z, w, d, h, base),
    block(STONE, x - 0.06, z - 0.06, w + 0.12, d + 0.12, 0.14, base + h - 0.1),
    block("#8a8f94", x + 0.2, z + 0.2, w - 0.4, d - 0.4, 0.05, base + h),
    ...windows(st, x, x + w, h, z + d + 0.012).map((g) => g.translate(0, base, 0)),
  ];
}

/** Bruin Plaza: the campus field, its paths, buildings and what lies beyond. */
function campusArt(m: Arena): BufferGeometry {
  const parts: BufferGeometry[] = [
    flat("#5f8f4f", -40, -40, m.w + 80, m.h + 80, -0.02),
    flat("#83b66a", 0, 0, m.w, m.h, 0),
  ];
  for (let x = 0; x < m.w; x += 2)
    for (let y = 0; y < m.h; y += 2) if ((x + y) % 4 === 0) parts.push(flat("#7aab61", x, y, 2, 2, 0.004));
  // Bruin Walk, with brick edges and paving joints, running on to both stairs.
  const [w0, w1] = WALK,
    [r0, r1] = ROAD;
  parts.push(
    flat("#dcd5c7", -8, w0, m.w + 16, w1 - w0, 0.008),
    flat("#b07763", -8, w0, m.w + 16, 0.3, 0.01),
    flat("#b07763", -8, w1 - 0.3, m.w + 16, 0.3, 0.01),
  );
  for (let x = -8; x < m.w + 8; x += 2) parts.push(flat("#cbc3b3", x, w0 + 0.3, 0.06, w1 - w0 - 0.6, 0.009));
  // Westwood Plaza: asphalt, curbs and a dashed center line outside the plaza.
  parts.push(
    flat("#61656c", r0, -40, r1 - r0, m.h + 80, 0.0095),
    flat("#c9c4ba", r0 - 0.2, -40, 0.2, m.h + 80, 0.0097),
    flat("#c9c4ba", r1, -40, 0.2, m.h + 80, 0.0097),
  );
  for (let y = -40; y < m.h + 40; y += 2.4)
    if (y + 1.2 < PLAZA.y || y > PLAZA.y + PLAZA.h) parts.push(flat("#f2c65d", (r0 + r1) / 2 - 0.07, y, 0.14, 1.2, 0.012));
  // Bruin Plaza: brick pavers, rings around the Bear, and the Janss landing.
  const cx = PLAZA.x + PLAZA.w / 2,
    cz = PLAZA.y + PLAZA.h / 2;
  parts.push(
    flat("#c58066", PLAZA.x, PLAZA.y, PLAZA.w, PLAZA.h, 0.011),
    disc("#b7b1a6", cx, cz, 1.9, 0.013),
    ring("#e0b39e", cx, cz, 3, 3.25, 0.014),
    ring("#e0b39e", cx, cz, 5, 5.2, 0.014),
    flat("#c58066", m.w - 4, w0 - 2, 12, w1 - w0 + 4, 0.0105),
  );
  for (let x = PLAZA.x + 1; x < PLAZA.x + PLAZA.w; x += 1) parts.push(flat("#d39a82", x, PLAZA.y, 0.05, PLAZA.h, 0.012));
  for (let z = PLAZA.y + 1; z < PLAZA.y + PLAZA.h; z += 1) parts.push(flat("#d39a82", PLAZA.x, z, PLAZA.w, 0.05, 0.012));
  // Field pieces: buildings and props by wall id, plain cover otherwise.
  m.walls.forEach((w, i) => {
    if (w.hp !== undefined) return;
    const kind = w.id.replace(/\d+$/, "");
    const style = CAMPUS_BUILDINGS[kind];
    parts.push(...(style ? building(w, style) : (CAMPUS_PIECES[kind]?.(w, i) ?? wall(w))));
  });
  // Hedges around the field, open where the walk and the road leave it, and
  // bollards across those openings.
  const e = 0.7;
  const hedges = [
    [-e, -e, r0 + e, e],
    [r1, -e, m.w - r1 + e, e],
    [-e, m.h, r0 + e, e],
    [r1, m.h, m.w - r1 + e, e],
    [-e, 0, e, w0],
    [-e, w1, e, m.h - w1],
    [m.w, 0, e, w0],
    [m.w, w1, e, m.h - w1],
  ];
  for (const [x, z, w, d] of hedges)
    parts.push(block("#3f7a4b", x, z, w, d, 0.62), block("#4f9259", x - 0.03, z - 0.03, w + 0.06, d + 0.06, 0.1, 0.6));
  const bollard = (x: number, z: number) => part(new CylinderGeometry(0.09, 0.11, 0.7, 8), "#e9e4da", [x, 0.35, z]);
  for (let t = 0.4; t < 6; t += 1.3) parts.push(bollard(r0 + t, -0.35), bollard(r0 + t, m.h + 0.35), bollard(-0.35, w0 + t), bollard(m.w + 0.35, w0 + t));
  // Janss Steps in the east, with Royce Hall beside their top; stairs up to
  // the Hill in the west.
  const janss = stairs(m.w + 1.5, 1, w0 - 3, w1 - w0 + 6, [w0 - 3.5, 80]);
  const hill = stairs(-1.5, -1, w0 - 3, w1 - w0 + 6, [-40, 80]);
  parts.push(...janss.parts, ...hill.parts, ...royce(m.w + 2.5, w0 - 15.5, 0));
  parts.push(...backdrop(hill.edge - 14, w0 - 8, 12, 6, 4.2, hill.top), ...backdrop(hill.edge - 14, w1 + 6, 12, 6, 4.2, hill.top));
  // More of campus north of the field, set back behind a row of trees.
  parts.push(...backdrop(2, -12, 20, 6, 3.6), ...backdrop(38, -12, 20, 6, 3.6));
  let seed = 0;
  for (let x = -3; x <= m.w + 3; x += 3.1) {
    if (x > r0 - 2.5 && x < r1 + 1.5) {
      seed += 2;
      continue;
    }
    parts.push(...tree(x + noise(seed) * 1.2, -2.6 - noise(seed + 1) * 1.2, 2.8 + noise(seed + 2) * 0.9, seed++));
    parts.push(...tree(x + noise(seed) * 1.2, m.h + 4.4 + noise(seed + 1) * 2, 2.2 + noise(seed + 2) * 0.5, seed++));
  }
  for (let z = 0; z <= m.h; z += 3.2) {
    if (z > w0 - 4.5 && z < w1 + 3.5) {
      seed += 2;
      continue;
    }
    parts.push(...tree(-2.6 - noise(seed) * 2.2, z + noise(seed + 1), 2.8 + noise(seed + 2) * 0.9, seed++));
    // No trees in front of Royce Hall.
    if (z < w0 - 7) seed++;
    else parts.push(...tree(m.w + 2.6 + noise(seed) * 2.2, z + noise(seed + 1), 2.8 + noise(seed + 2) * 0.9, seed++));
  }
  return merge(parts);
}

const RINK_BLUE = "#3d7cc2";
const RINK_RED = "#d8606d";

function goal(side: -1 | 1, hex: string): BufferGeometry[] {
  const m = MAPS.broomball;
  const mouth = side < 0 ? 0 : m.w,
    depth = 1.3,
    back = mouth + side * depth,
    y0 = 8,
    y1 = 12,
    h = 1.1,
    r = 0.07;
  const post = (x: number, z: number, height = h) => part(new CylinderGeometry(r, r, height, 8), hex, [x, height / 2, z]);
  const parts = [
    flat("#9fb6c2", Math.min(mouth, back), y0, depth, y1 - y0, 0.004),
    post(mouth, y0),
    post(mouth, y1),
    post(back, y0, h * 0.8),
    post(back, y1, h * 0.8),
    part(new CylinderGeometry(r, r, y1 - y0, 8), hex, [mouth, h, (y0 + y1) / 2], [Math.PI / 2, 0, 0]),
    part(new CylinderGeometry(r * 0.8, r * 0.8, y1 - y0, 8), hex, [back, h * 0.8, (y0 + y1) / 2], [Math.PI / 2, 0, 0]),
  ];
  for (const z of [y0, y1])
    parts.push(
      part(new CylinderGeometry(r * 0.8, r * 0.8, Math.hypot(depth, h * 0.2), 8), hex, [(mouth + back) / 2, h * 0.9, z], [0, 0, Math.PI / 2 - side * Math.atan2(h * 0.2, depth)]),
    );
  // Net: thin strips on the back and roof.
  for (let z = y0 + 0.5; z < y1; z += 0.5) parts.push(part(new BoxGeometry(0.03, h * 0.8, 0.03), "#e8eef3", [back, h * 0.4, z]));
  for (let y = 0.25; y < h * 0.8; y += 0.25) parts.push(part(new BoxGeometry(0.03, 0.03, y1 - y0), "#e8eef3", [back, y, (y0 + y1) / 2]));
  for (let k = 0.33; k < 1; k += 0.33)
    parts.push(part(new BoxGeometry(0.03, 0.03, y1 - y0), "#e8eef3", [mouth + side * depth * k, h * (1 - 0.2 * k), (y0 + y1) / 2]));
  return parts;
}

function rinkArt(): BufferGeometry {
  const m = MAPS.broomball;
  const parts: BufferGeometry[] = [
    flat("#1d2738", -40, -40, m.w + 80, m.h + 80, -0.02),
    flat("#c9e9ee", 0, 0, m.w, m.h, 0),
  ];
  for (let x = 0; x < m.w; x += 2)
    for (let y = 0; y < m.h; y += 2) if ((x + y) % 4 === 0) parts.push(flat("#bde3ea", x, y, 2, 2, 0.003));
  parts.push(
    flat("#db6372", 17 - 0.07, 0, 0.14, m.h, 0.006),
    flat("#6193be", 10 - 0.07, 0, 0.14, m.h, 0.006),
    flat("#6193be", 24 - 0.07, 0, 0.14, m.h, 0.006),
    ring("#5f91b0", 17, 10, 2.93, 3.07, 0.007),
    disc("#5f91b0", 17, 10, 0.22, 0.007),
    ring(RINK_BLUE, 3, 10, 2.44, 2.56, 0.007),
    ring(RINK_RED, 31, 10, 2.44, 2.56, 0.007),
    flat(RINK_BLUE, 0, 8, 0.5, 4, 0.006),
    flat(RINK_RED, m.w - 0.5, 8, 0.5, 4, 0.006),
  );
  // Boards outside the playable bounds, open at the goal mouths.
  const t = 0.35,
    h = 0.8;
  const board = (x: number, z: number, w: number, d: number) =>
    parts.push(block("#e9eef2", x, z, w, d, h), block("#396977", x - 0.04, z - 0.04, w + 0.08, d + 0.08, 0.08, h));
  board(-t, -t, m.w + 2 * t, t);
  board(-t, m.h, m.w + 2 * t, t);
  for (const x of [-t, m.w]) {
    board(x, 0, t, 8);
    board(x, 12, t, m.h - 12);
  }
  parts.push(...goal(-1, RINK_BLUE), ...goal(1, RINK_RED));
  // Stands with a crowd along the far side; the camera side stays open.
  const crowd = ["#d8606d", "#3d7cc2", "#f2c65d", "#e9eef2", "#77d5b9"];
  let i = 0;
  for (let row = 0; row < 3; row++) {
    const z = -t - 0.9 - row * 1.05;
    parts.push(block(row % 2 ? "#2b3650" : "#27314a", -3, z - 1.05, m.w + 6, 1.05, 0.5 + row * 0.5));
    for (let x = -2.4; x < m.w + 2.6; x += 0.85) {
      i++;
      if (noise(i) < 0.25) continue;
      parts.push(block(crowd[i % crowd.length], x, z - 0.75, 0.42, 0.36, 0.5, 0.5 + row * 0.5));
    }
  }
  for (const [x, z] of [
    [-2.2, -2.2],
    [m.w + 2.2, -2.2],
    [-2.2, m.h + 2.4],
    [m.w + 2.2, m.h + 2.4],
  ]) {
    parts.push(part(new CylinderGeometry(0.1, 0.14, 4.6, 8), "#3a4356", [x, 2.3, z]));
    parts.push(part(new BoxGeometry(0.9, 0.3, 0.5), "#fff6d6", [x, 4.7, z]));
  }
  return merge(parts);
}

const ZONE_VERTEX = /* glsl */ `
varying vec2 vXZ;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vXZ = w.xz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const ZONE_FRAGMENT = /* glsl */ `
uniform vec2 center;
uniform float radius;
uniform float time;
uniform vec3 gas;
uniform vec3 edgeColor;
varying vec2 vXZ;
void main() {
  float d = distance(vXZ, center);
  if (d < radius) discard;
  float edge = 1.0 - smoothstep(radius, radius + 0.7, d);
  float bands = 0.5 + 0.5 * sin((vXZ.x + vXZ.y) * 1.4 - time * 1.6);
  gl_FragColor = vec4(mix(gas, edgeColor, edge * 0.75), 0.42 + 0.08 * bands + 0.3 * edge);
  #include <colorspace_fragment>
}`;
const ZONE_WALL_FRAGMENT = /* glsl */ `
uniform vec3 tint;
uniform float time;
varying float vH;
void main() {
  float a = pow(1.0 - clamp(vH, 0.0, 1.0), 2.0) * (0.55 + 0.1 * sin(time * 3.0));
  gl_FragColor = vec4(tint, a);
  #include <colorspace_fragment>
}`;
const ZONE_WALL_VERTEX = /* glsl */ `
varying float vH;
void main() {
  vH = position.y / 1.6;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

export interface ArenaMap {
  readonly group: Group;
  /**
   * Per-frame dynamic map art. `focus` is the viewed fighter's drawn
   * position. Calls `onCrateBroken` once for each crate that disappears.
   */
  update(match: Match, focus: Vec | null, time: number, dt: number, onCrateBroken: (at: Vec) => void): void;
  dispose(): void;
}

/** Each mode's static field art. */
const SCENERY: Record<Mode, () => BufferGeometry> = {
  showdown: lawnArt,
  broomball: rinkArt,
  fishing: () => campusArt(MAPS.fishing),
};

export function buildArenaMap(mode: Mode, mats: ArenaMaterials): ArenaMap {
  const group = new Group();
  const owned: { dispose(): void }[] = [];
  const own = <T extends { dispose(): void }>(r: T) => (owned.push(r), r);
  const base = new Mesh(
    own(SCENERY[mode]()),
    mats.toon,
  );
  group.add(base);

  // Bushes: one mesh each, so only the one the viewed fighter stands in fades.
  const bushes = MAPS[mode].bushes.map((b, i) => {
    const material = mats.toonFor({ transparent: true }) as MeshToonMaterial;
    const mesh = new Mesh(own(bush(b, i + 1)), material);
    mesh.renderOrder = 2;
    group.add(mesh);
    return { b, mesh, material, opacity: 1 };
  });

  const crates = new Map<string, { mesh: Mesh; hp: number; shake: number; x: number; z: number; present: boolean }>();
  for (const w of MAPS[mode].walls)
    if (w.hp !== undefined) {
      const mesh = new Mesh(own(crate(w.w, w.h)), mats.toon);
      const x = w.x + w.w / 2,
        z = w.y + w.h / 2;
      mesh.position.set(x, 0, z);
      group.add(mesh);
      crates.set(w.id, { mesh, hp: w.hp, shake: 0, x, z, present: true });
    }

  let zone: Mesh | null = null,
    zoneWall: Mesh | null = null,
    zoneMat: ShaderMaterial | null = null,
    zoneWallMat: ShaderMaterial | null = null;
  if (mode === "showdown") {
    const m = MAPS.showdown;
    zoneMat = own(
      new ShaderMaterial({
        uniforms: {
          center: { value: [ZONE_CENTER.x, ZONE_CENTER.y] },
          radius: { value: 99 },
          time: { value: 0 },
          gas: { value: new Color("#5b2f63") },
          edgeColor: { value: new Color("#ffde9f") },
        },
        vertexShader: ZONE_VERTEX,
        fragmentShader: ZONE_FRAGMENT,
        transparent: true,
        depthWrite: false,
      }),
    );
    zone = new Mesh(own(new PlaneGeometry(m.w + 60, m.h + 60).rotateX(-Math.PI / 2)), zoneMat);
    zone.position.set(m.w / 2, 0.03, m.h / 2);
    zone.renderOrder = 1;
    zoneWallMat = own(
      new ShaderMaterial({
        uniforms: { tint: { value: new Color("#ffde9f") }, time: { value: 0 } },
        vertexShader: ZONE_WALL_VERTEX,
        fragmentShader: ZONE_WALL_FRAGMENT,
        transparent: true,
        depthWrite: false,
        side: DoubleSide,
      }),
    );
    zoneWall = new Mesh(own(new CylinderGeometry(1, 1, 1.6, 96, 1, true).translate(0, 0.8, 0)), zoneWallMat);
    zoneWall.position.set(ZONE_CENTER.x, 0, ZONE_CENTER.y);
    zoneWall.renderOrder = 3;
    group.add(zone, zoneWall);
  }

  return {
    group,
    update(match, focus, time, dt, onCrateBroken) {
      if (zone && zoneWall && zoneMat && zoneWallMat) {
        // The circle only matters once it is inside the field's corners.
        const live = match.zone < 21.7;
        zone.visible = zoneWall.visible = live;
        zoneMat.uniforms.radius.value = match.zone;
        zoneMat.uniforms.time.value = time;
        zoneWallMat.uniforms.time.value = time;
        zoneWall.scale.set(Math.max(0.01, match.zone), 1, Math.max(0.01, match.zone));
      }
      for (const [id, c] of crates) {
        const w = match.walls.find((x) => x.id === id);
        if (!w) {
          if (c.present) {
            c.present = false;
            c.mesh.visible = false;
            onCrateBroken({ x: c.x, y: c.z });
          }
          continue;
        }
        if (!c.present) {
          c.present = true;
          c.mesh.visible = true;
        }
        if (w.hp !== undefined && w.hp < c.hp) c.shake = 1;
        c.hp = w.hp ?? c.hp;
        c.shake = Math.max(0, c.shake - dt * 6);
        const k = c.shake * c.shake;
        c.mesh.position.x = c.x + Math.sin(time * 70) * 0.06 * k;
        c.mesh.scale.y = 1 - 0.08 * k;
      }
      for (const b of bushes) {
        const inside =
          !!focus && focus.x >= b.b.x && focus.x <= b.b.x + b.b.w && focus.y >= b.b.y && focus.y <= b.b.y + b.b.h;
        const target = inside ? 0.42 : 1;
        b.opacity += (target - b.opacity) * (1 - Math.exp(-dt * 12));
        b.material.opacity = b.opacity;
        b.material.depthWrite = b.opacity > 0.98;
      }
    },
    dispose() {
      for (const r of owned.splice(0)) r.dispose();
    },
  };
}
