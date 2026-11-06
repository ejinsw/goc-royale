import {
  BoxGeometry,
  CircleGeometry,
  Color,
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
import { MAPS, type Mode, type Vec, type Wall } from "../../../shared/definitions";
import type { Match } from "../../../shared/types";
import { merge, part } from "../ui/scene/geometry";
import type { ArenaMaterials } from "./materials";

/**
 * Arena presentation layer (performance standard §3, §5.2): the 3D treatment
 * of Central Lawn and Broomball Night. Footprints come straight from
 * `MAPS` (walls, bushes, bounds, goal mouths), so the art cannot drift from
 * collision. Static art is merged once per match into a few meshes; per
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

export function buildArenaMap(mode: Mode, mats: ArenaMaterials): ArenaMap {
  const group = new Group();
  const owned: { dispose(): void }[] = [];
  const own = <T extends { dispose(): void }>(r: T) => (owned.push(r), r);
  const base = new Mesh(own(mode === "showdown" ? lawnArt() : rinkArt()), mats.toon);
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
