import {
  BufferGeometry,
  CapsuleGeometry,
  ConeGeometry,
  CylinderGeometry,
  SphereGeometry,
  TorusGeometry,
} from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import type { FighterId } from "../../../../shared/definitions";
import { merge, part, place, type V3 } from "./geometry";

/**
 * One procedural model factory for every fighter (docs/CODE-PRACTICES.md §7).
 * Each fighter is a row in LOOKS that mirrors its 2D portrait: shirt, skin,
 * hair, collar accent, hair style, glasses, and signature prop. Geometry is
 * merged per animated part with vertex colors, so every fighter on the stage
 * shares one material and costs a handful of draw calls.
 */
type PropName = "clipboard" | "keys" | "camera" | "cookie" | "speaker" | "laptop" | "guitar";

export interface FighterLook {
  shirt: string;
  skin: string;
  hair: string;
  collar: string;
  hairStyle: "swept" | "sides" | "spiky";
  /** -1..1, which way the fringe sweeps. */
  sweep: number;
  glasses: boolean;
  prop: PropName;
  /** Resting rotation of the prop arm (radians). */
  hold: { x: number; z: number };
}

const SKIN = "#ecc29b";
const HOLD = { x: -0.55, z: 0.32 };
export const LOOKS: Record<FighterId, FighterLook> = {
  brandon: { shirt: "#417bc2", skin: SKIN, hair: "#3b3337", collar: "#f2c65d", hairStyle: "sides", sweep: 0.4, glasses: false, prop: "clipboard", hold: HOLD },
  daniel: { shirt: "#83b5ef", skin: SKIN, hair: "#303d42", collar: "#f4f7fb", hairStyle: "swept", sweep: 0.7, glasses: false, prop: "keys", hold: HOLD },
  rich: { shirt: "#b9a3ee", skin: SKIN, hair: "#373641", collar: "#f4f7fb", hairStyle: "swept", sweep: 0.5, glasses: true, prop: "camera", hold: HOLD },
  samuel: { shirt: "#f5d46e", skin: SKIN, hair: "#4c3a31", collar: "#f4f7fb", hairStyle: "swept", sweep: -0.5, glasses: false, prop: "cookie", hold: HOLD },
  josh: { shirt: "#f5a474", skin: SKIN, hair: "#403733", collar: "#f4f7fb", hairStyle: "swept", sweep: -0.2, glasses: false, prop: "speaker", hold: HOLD },
  elijah: { shirt: "#77d5b9", skin: SKIN, hair: "#283f3d", collar: "#f4f7fb", hairStyle: "swept", sweep: 0.3, glasses: true, prop: "laptop", hold: HOLD },
  ethan: { shirt: "#df83c8", skin: "#e8bc94", hair: "#30343f", collar: "#ffedb8", hairStyle: "spiky", sweep: 0, glasses: false, prop: "guitar", hold: { x: -0.85, z: -0.35 } },
};

const INK = "#161a22";
const PANTS = "#2b313d";
const SHOE = "#11141a";

const sphere = (r: number, w = 16, h = 10) => new SphereGeometry(r, w, h);
const box = (x: number, y: number, z: number, r = 0.02) => new RoundedBoxGeometry(x, y, z, 2, r);
const capsule = (r: number, len: number) => new CapsuleGeometry(r, len, 4, 12);
const cylinder = (r: number, h: number, seg = 18) => new CylinderGeometry(r, r, h, seg);
const HALF = Math.PI / 2;

/** Props in hand space: the hand is at the origin, the arm hangs along -y. */
const PROPS: Record<PropName, () => BufferGeometry[]> = {
  clipboard: () =>
    place(
      [
        part(box(0.3, 0.4, 0.035), "#fff3cf"),
        part(box(0.12, 0.06, 0.05), "#f2c65d", [0, 0.19, 0.01]),
        part(box(0.18, 0.02, 0.012, 0.005), "#315e94", [0, 0.07, 0.022]),
        part(box(0.18, 0.02, 0.012, 0.005), "#315e94", [0, 0, 0.022]),
        part(box(0.11, 0.02, 0.012, 0.005), "#315e94", [-0.035, -0.07, 0.022]),
      ],
      [0.04, -0.14, 0.08],
      [0.15, -0.35, 0],
    ),
  keys: () =>
    place(
      [
        part(new TorusGeometry(0.065, 0.02, 6, 16), "#ffdc76"),
        part(box(0.035, 0.17, 0.02, 0.008), "#ffdc76", [0.03, -0.13, 0], [0, 0, 0.3]),
        part(box(0.06, 0.03, 0.02, 0.008), "#ffdc76", [0.07, -0.2, 0], [0, 0, 0.3]),
        part(box(0.035, 0.15, 0.02, 0.008), "#e9c45c", [-0.04, -0.12, 0.01], [0, 0, -0.35]),
      ],
      [0, -0.06, 0.06],
    ),
  camera: () =>
    place(
      [
        part(box(0.34, 0.24, 0.18, 0.04), "#243e47"),
        part(cylinder(0.085, 0.08), "#91d6d7", [0.02, 0, 0.11], [HALF, 0, 0]),
        part(cylinder(0.045, 0.09), "#243e47", [0.02, 0, 0.12], [HALF, 0, 0]),
        part(box(0.1, 0.05, 0.1), "#243e47", [-0.09, 0.14, 0]),
      ],
      [0.04, -0.1, 0.1],
      [0, -0.4, 0],
    ),
  cookie: () =>
    place(
      [
        part(cylinder(0.17, 0.05, 24), "#d4944d", [0, 0, 0], [HALF, 0, 0]),
        part(sphere(0.026, 8, 6), "#6f4636", [-0.07, 0.06, 0.03]),
        part(sphere(0.026, 8, 6), "#6f4636", [0.06, 0.04, 0.03]),
        part(sphere(0.026, 8, 6), "#6f4636", [-0.03, -0.07, 0.03]),
        part(sphere(0.02, 8, 6), "#6f4636", [0.08, -0.07, 0.03]),
      ],
      [0.03, -0.12, 0.1],
      [0, -0.3, 0.2],
    ),
  speaker: () =>
    place(
      [
        part(box(0.26, 0.42, 0.2, 0.04), "#244348"),
        part(cylinder(0.055, 0.03), "#f9bd82", [0, 0.11, 0.1], [HALF, 0, 0]),
        part(cylinder(0.088, 0.03), "#f9bd82", [0, -0.07, 0.1], [HALF, 0, 0]),
        part(cylinder(0.035, 0.035), "#244348", [0, -0.07, 0.11], [HALF, 0, 0]),
      ],
      [0.05, -0.2, 0.06],
      [0, -0.35, 0],
    ),
  laptop: () =>
    place(
      [
        part(box(0.4, 0.27, 0.025, 0.012), "#244348"),
        part(box(0.07, 0.016, 0.01, 0.004), "#79e5ba", [-0.07, 0.025, 0.017], [0, 0, 0.7]),
        part(box(0.07, 0.016, 0.01, 0.004), "#79e5ba", [-0.07, -0.025, 0.017], [0, 0, -0.7]),
        part(box(0.07, 0.016, 0.01, 0.004), "#79e5ba", [0.07, 0.025, 0.017], [0, 0, -0.7]),
        part(box(0.07, 0.016, 0.01, 0.004), "#79e5ba", [0.07, -0.025, 0.017], [0, 0, 0.7]),
        part(box(0.4, 0.025, 0.24, 0.012), "#1b3236", [0, -0.14, -0.12]),
      ],
      [0.06, -0.13, 0.12],
      [0.15, -0.4, 0],
    ),
  guitar: () =>
    place(
      [
        part(sphere(0.2, 18, 10), "#d89c51", [0, 0, 0], [0, 0, 0], [1, 1, 0.35]),
        part(sphere(0.15, 18, 10), "#d89c51", [0, 0.2, 0], [0, 0, 0], [1, 1, 0.35]),
        part(cylinder(0.055, 0.02), "#473b44", [0, 0.06, 0.07], [HALF, 0, 0]),
        part(box(0.055, 0.44, 0.035, 0.01), "#b77b3e", [0, 0.52, 0.02]),
        part(box(0.09, 0.11, 0.04, 0.015), "#473b44", [0, 0.77, 0.02]),
        part(box(0.012, 0.6, 0.012, 0.004), "#fff0cb", [0, 0.35, 0.065]),
      ],
      [-0.05, 0.42, 0.29],
      [0, 0, -0.85],
    ),
};

export interface FighterParts {
  /**
   * Torso, collar, and the guitar for Ethan; the legs too unless they were
   * built separately. Origin at the feet.
   */
  body: BufferGeometry;
  /**
   * Only with `separateLegs`: each leg and shoe, in body space (origin at the
   * feet), so a rig can hinge them at HIP_Y. `legL` is the -x leg.
   */
  legL?: BufferGeometry;
  legR?: BufferGeometry;
  /** Head and hair; origin at the neck pivot. */
  head: BufferGeometry;
  /** Eyes, smile, glasses in head space; no outline. */
  face: BufferGeometry;
  /** Arms; origin at each shoulder pivot. */
  armL: BufferGeometry;
  armR: BufferGeometry;
  /** Optional floating accessory in body space (Ethan's note). */
  extra?: BufferGeometry;
}

export const NECK_Y = 0.98;
export const SHOULDER: V3 = [0.29, 0.86, 0];
/** Hip hinge height for separately built legs (top of the leg capsules). */
export const HIP_Y = 0.34;
/** Leg offset from the center line. */
export const HIP_X = 0.12;

function arm(look: FighterLook, withProp: boolean): BufferGeometry {
  const parts = [
    part(sphere(0.1, 12, 8), look.shirt, [0, -0.02, 0]),
    part(capsule(0.068, 0.16), look.skin, [0, -0.18, 0]),
    part(sphere(0.075, 12, 8), look.skin, [0, -0.33, 0]),
  ];
  if (withProp && look.prop !== "guitar") parts.push(...place(PROPS[look.prop](), [0, -0.36, 0.02]));
  return merge(parts);
}

function hair(look: FighterLook): BufferGeometry[] {
  const c = look.hair,
    s = look.sweep;
  const parts = [
    part(new SphereGeometry(0.448, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.53), c, [0, 0.3, -0.01], [-0.34, 0, 0], [1.03, 1, 1]),
  ];
  if (look.hairStyle === "spiky") {
    for (let i = 0; i < 6; i++) {
      const a = -0.8 + i * 0.32;
      parts.push(part(new ConeGeometry(0.075, 0.24, 8), c, [Math.sin(a) * 0.33, 0.56, Math.cos(a) * 0.27], [1.75, a, 0]));
    }
    for (let i = 0; i < 3; i++)
      parts.push(part(new ConeGeometry(0.08, 0.2, 8), c, [(i - 1) * 0.16, 0.75, -0.08], [-0.35, 0, (i - 1) * -0.4]));
    return parts;
  }
  parts.push(
    part(sphere(0.2, 14, 8), c, [s * 0.12, 0.6, 0.25], [0.35, 0, s * 0.5], [1.55, 0.42, 0.8]),
    part(sphere(0.16, 12, 8), c, [-s * 0.18, 0.62, 0.2], [0.3, 0, -s * 0.4], [1.2, 0.4, 0.8]),
  );
  if (look.hairStyle === "sides")
    for (const side of [-1, 1])
      parts.push(part(sphere(0.14, 12, 8), c, [side * 0.39, 0.3, -0.04], [0, 0, side * 0.12], [0.55, 1.55, 1.45]));
  return parts;
}

function head(look: FighterLook): BufferGeometry {
  return merge([
    part(sphere(0.42, 20, 14), look.skin, [0, 0.3, 0], [0, 0, 0], [1, 0.95, 0.92]),
    part(sphere(0.075, 10, 8), look.skin, [-0.42, 0.28, 0], [0, 0, 0], [0.6, 1, 1]),
    part(sphere(0.075, 10, 8), look.skin, [0.42, 0.28, 0], [0, 0, 0], [0.6, 1, 1]),
    ...hair(look),
  ]);
}

/** Eyes, smile, and glasses: drawn without the outline pass, which would blot them. */
function face(look: FighterLook): BufferGeometry {
  const parts = [
    part(capsule(0.032, 0.045), INK, [-0.145, 0.3, 0.378], [-0.15, 0, 0]),
    part(capsule(0.032, 0.045), INK, [0.145, 0.3, 0.378], [-0.15, 0, 0]),
    part(new TorusGeometry(0.055, 0.012, 6, 14, Math.PI), INK, [0, 0.175, 0.37], [-0.3, 0, Math.PI]),
  ];
  if (look.glasses)
    parts.push(
      part(new TorusGeometry(0.088, 0.016, 6, 16), INK, [-0.15, 0.3, 0.4], [-0.12, 0, 0], [1.2, 0.85, 1]),
      part(new TorusGeometry(0.088, 0.016, 6, 16), INK, [0.15, 0.3, 0.4], [-0.12, 0, 0], [1.2, 0.85, 1]),
      part(capsule(0.012, 0.05), INK, [0, 0.31, 0.415], [0, 0, HALF]),
    );
  return merge(parts);
}

/** One leg and shoe in body space; side -1 is the -x leg. */
function leg(side: -1 | 1): BufferGeometry[] {
  return [
    part(capsule(0.085, 0.14), PANTS, [side * HIP_X, 0.2, 0]),
    part(box(0.19, 0.11, 0.28, 0.05), SHOE, [side * HIP_X, 0.055, 0.04]),
  ];
}

function body(look: FighterLook, withLegs: boolean): BufferGeometry {
  const parts = [
    ...(withLegs ? [...leg(-1), ...leg(1)] : []),
    part(capsule(0.27, 0.16), look.shirt, [0, 0.62, 0], [0, 0, 0], [1.05, 1, 0.82]),
    part(box(0.14, 0.026, 0.02, 0.01), look.collar, [-0.05, 0.86, 0.215], [-0.3, 0, -0.6]),
    part(box(0.14, 0.026, 0.02, 0.01), look.collar, [0.05, 0.86, 0.215], [-0.3, 0, 0.6]),
  ];
  if (look.prop === "guitar") parts.push(...PROPS.guitar());
  return merge(parts);
}

function note(hex: string): BufferGeometry {
  return merge([
    part(sphere(0.06, 12, 8), hex, [0, 0, 0], [0, 0, 0.4], [1.3, 1, 0.6]),
    part(box(0.022, 0.19, 0.022, 0.008), hex, [0.065, 0.1, 0]),
    part(box(0.09, 0.03, 0.022, 0.01), hex, [0.1, 0.18, 0], [0, 0, -0.4]),
  ]);
}

/**
 * Build one fighter's parts. The menu stage uses the default (legs merged
 * into the body); the arena asks for `separateLegs` so its rig can swing
 * them. Both read the same look table.
 */
export function buildFighter(id: FighterId, opts: { separateLegs?: boolean } = {}): FighterParts {
  const look = LOOKS[id];
  const separate = !!opts.separateLegs;
  return {
    body: body(look, !separate),
    legL: separate ? merge(leg(-1)) : undefined,
    legR: separate ? merge(leg(1)) : undefined,
    head: head(look),
    face: face(look),
    armL: arm(look, false),
    armR: arm(look, true),
    extra: id === "ethan" ? note(look.shirt) : undefined,
  };
}

export function disposeFighter(p: FighterParts) {
  p.body.dispose();
  p.legL?.dispose();
  p.legR?.dispose();
  p.head.dispose();
  p.face.dispose();
  p.armL.dispose();
  p.armR.dispose();
  p.extra?.dispose();
}
