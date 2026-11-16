import {
  BufferGeometry,
  CapsuleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Euler,
  Quaternion,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import type { FighterId } from "../../../../shared/definitions";
import { merge, part, place, type V3 } from "./geometry";

/**
 * One procedural model factory for every fighter (docs/CODE-PRACTICES.md §7).
 *
 * A fighter is one row in LOOKS: palette, hair style, a list of named
 * features, a held prop and an optional companion. Every feature, prop,
 * hair style and companion is one entry in its table below and says which
 * rig part it rides on, so:
 *
 * - restyling a fighter means editing its LOOKS row;
 * - a new distinctive characteristic is one FEATURES entry, then its name in
 *   any fighter's `features` list;
 * - nothing outside this file changes, and there is no per-fighter code.
 *
 * Geometry is merged per animated part with vertex colors, so every fighter
 * on the stage shares one material and costs a handful of draw calls. Rows
 * mirror each fighter's 2D portrait in client/public/art/.
 */

/** Rig parts a piece can ride on (see FighterParts). */
type Slot = "body" | "head" | "face" | "armR" | "armL";
type Pieces = Partial<Record<Slot, BufferGeometry[]>>;

export type HairStyle =
  | "swept"
  | "sides"
  | "medium"
  | "shoulder"
  | "wavyShoulder"
  | "middlePart"
  | "sidePart"
  | "bowl"
  | "shaved"
  | "spiky"
  | "braids"
  | "ponytail"
  | "long"
  | "bun"
  | "wavyTop";
export type FeatureName =
  | "glasses"
  | "sunglasses"
  | "nametag"
  | "capBack"
  | "apron"
  | "headphones"
  | "inEars"
  | "hoodie"
  | "cameraStrap"
  | "plushCharm"
  | "bucketHat"
  | "headset"
  | "chefHat"
  | "pandaHood"
  | "beret"
  | "beanie"
  | "scarf"
  | "bowtie"
  | "jacket"
  | "leatherJacket"
  | "slimGlasses";
export type PropName =
  | "clipboard"
  | "keys"
  | "camera"
  | "cookie"
  | "speaker"
  | "laptop"
  | "guitar"
  | "microphone"
  | "rod"
  | "stapler"
  | "ladle"
  | "wheel"
  | "phone"
  | "envelope"
  | "book"
  | "lantern"
  | "calculator"
  | "mealCard";
export type CompanionName = "note" | "dove" | "panda";

export interface FighterLook {
  shirt: string;
  skin: string;
  hair: string;
  /** Collar tabs and small trims. */
  collar: string;
  /** Feature color: hats, hoods, scarves, aprons, headphones. */
  accent: string;
  pants?: string;
  build?: "muscular";
  hairStyle: HairStyle;
  /** -1..1, which way the fringe sweeps. */
  sweep: number;
  /** Distinctive characteristics, built in order from FEATURES. */
  features: FeatureName[];
  prop?: PropName;
  companion?: CompanionName;
  /** Resting rotation of the prop arm (radians). */
  hold: { x: number; z: number };
}

const SKIN = "#ecc29b";
const HOLD = { x: -0.55, z: 0.32 };
const look = (
  l: Omit<FighterLook, "skin" | "hold" | "sweep" | "features"> &
    Partial<FighterLook>,
): FighterLook => ({
  skin: SKIN,
  hold: HOLD,
  sweep: 0.4,
  features: [],
  ...l,
});

/**
 * The per-fighter look table. Likeness: only Brandon and Ethan have supplied
 * references; every other row is a provisional, fictional game design
 * (docs/ART-AND-AUDIO-DIRECTION.md §3), not a claim about the person.
 */
export const LOOKS: Record<FighterId, FighterLook> = {
  brandon: look({
    shirt: "#b48a62",
    skin: "#d9a77d",
    hair: "#3b3337",
    collar: "#ead8bf",
    accent: "#765137",
    hairStyle: "sides",
    features: ["jacket", "glasses", "nametag"],
    prop: "clipboard",
  }),
  daniel: look({
    shirt: "#83b5ef",
    hair: "#303d42",
    collar: "#f4f7fb",
    accent: "#2f4f7a",
    hairStyle: "swept",
    sweep: 0.7,
    features: ["capBack"],
    prop: "keys",
  }),
  rich: look({
    shirt: "#b9a3ee",
    hair: "#373641",
    collar: "#f4f7fb",
    accent: "#243e47",
    hairStyle: "swept",
    sweep: 0.5,
    features: ["cameraStrap"],
    prop: "camera",
  }),
  samuel: look({
    shirt: "#f5d46e",
    hair: "#4c3a31",
    collar: "#f4f7fb",
    accent: "#74dda6",
    hairStyle: "medium",
    sweep: -0.5,
    features: ["glasses", "apron"],
    prop: "cookie",
  }),
  josh: look({
    shirt: "#17191f",
    hair: "#403733",
    collar: "#f4f7fb",
    accent: "#f9bd82",
    hairStyle: "swept",
    sweep: -0.2,
    features: ["headphones"],
    prop: "speaker",
  }),
  elijah: look({
    shirt: "#77d5b9",
    hair: "#283f3d",
    collar: "#f4f7fb",
    accent: "#3a5f59",
    hairStyle: "swept",
    sweep: 0.3,
    features: ["glasses", "hoodie"],
    prop: "laptop",
  }),
  ethan: look({
    shirt: "#2f6fca",
    skin: "#e8bc94",
    hair: "#30343f",
    collar: "#dbeaff",
    accent: "#a77be0",
    hairStyle: "bowl",
    sweep: 0,
    features: ["plushCharm"],
    prop: "guitar",
    companion: "note",
    hold: { x: -0.85, z: -0.35 },
  }),
  david: look({
    shirt: "#4f7fd1",
    hair: "#2d3442",
    collar: "#f4f7fb",
    accent: "#f2c65d",
    hairStyle: "sidePart",
    sweep: 0.55,
    features: ["inEars"],
    prop: "microphone",
  }),
  dylan: look({
    shirt: "#2a8fd6",
    hair: "#2e2a2b",
    collar: "#f4f7fb",
    accent: "#c9b98a",
    hairStyle: "swept",
    sweep: -0.4,
    features: ["bucketHat"],
    prop: "rod",
    hold: { x: -0.7, z: 0.3 },
  }),
  isaac: look({
    shirt: "#8d6e63",
    skin: "#d9a77d",
    hair: "#2b2523",
    collar: "#f4f7fb",
    accent: "#d7dde4",
    hairStyle: "middlePart",
    sweep: 0.2,
    features: ["headset"],
    prop: "stapler",
  }),
  tovya: look({
    shirt: "#9ead2c",
    hair: "#3a2d26",
    skin: "#a96f49",
    collar: "#f4f7fb",
    accent: "#ffffff",
    hairStyle: "wavyShoulder",
    sweep: 0.6,
    features: ["glasses", "chefHat"],
    prop: "ladle",
    hold: { x: -0.8, z: 0.36 },
  }),
  rosalie: look({
    shirt: "#e8553a",
    skin: "#d9a77d",
    hair: "#2a2124",
    collar: "#fbe8d3",
    accent: "#c8442a",
    hairStyle: "shoulder",
    sweep: 0.3,
    features: ["pandaHood"],
    companion: "panda",
    hold: { x: -1.05, z: 0.5 },
  }),
  joelle: look({
    shirt: "#ffb300",
    skin: "#d9a77d",
    hair: "#3b2c28",
    collar: "#f4f7fb",
    accent: "#1b1f2a",
    hairStyle: "shoulder",
    sweep: -0.3,
    features: ["sunglasses"],
    prop: "wheel",
    hold: { x: -0.95, z: 0.28 },
  }),
  susannah: look({
    shirt: "#ff6f91",
    hair: "#2c2326",
    collar: "#f4f7fb",
    accent: "#3b3f63",
    hairStyle: "long",
    sweep: 0.5,
    features: ["beret"],
    prop: "phone",
  }),
  joyce: look({
    shirt: "#2e9e5b",
    skin: "#d9a77d",
    hair: "#70452f",
    collar: "#f4f7fb",
    accent: "#d63a3a",
    hairStyle: "wavyShoulder",
    sweep: -0.4,
    features: ["beanie"],
    prop: "envelope",
  }),
  miriam: look({
    shirt: "#7e57c2",
    hair: "#2a2226",
    collar: "#f4f7fb",
    accent: "#5b3fa3",
    hairStyle: "bun",
    sweep: 0.2,
    features: ["glasses"],
    prop: "book",
    companion: "dove",
  }),
  jemuel: look({
    shirt: "#c2185b",
    hair: "#4a403d",
    collar: "#f4f7fb",
    accent: "#f3c26b",
    hairStyle: "shaved",
    build: "muscular",
    sweep: -0.6,
    features: ["scarf"],
    prop: "lantern",
    hold: { x: -0.35, z: 0.3 },
  }),
  russell: look({
    shirt: "#24201f",
    skin: "#d9a77d",
    hair: "#2d2829",
    collar: "#d2b08a",
    accent: "#754c32",
    hairStyle: "sides",
    sweep: -0.3,
    features: ["leatherJacket"],
    prop: "calculator",
  }),
  // Brandon Nguyen, from a supplied reference photo: a dark navy crew-neck
  // tee, slim rectangular black glasses and messy wavy hair over the brow.
  brandon_n: look({
    shirt: "#1b2238",
    skin: "#e3b48c",
    hair: "#1f1b1e",
    collar: "#2f3a5c",
    accent: "#2f3a5c",
    hairStyle: "wavyTop",
    sweep: 0.5,
    features: ["slimGlasses"],
    prop: "mealCard",
  }),
};

const INK = "#161a22";
const PANTS = "#2b313d";
const SHOE = "#11141a";
const CREAM = "#fbe8d3";
const DARK = "#2b3138";

const sphere = (r: number, w = 16, h = 10) => new SphereGeometry(r, w, h);
/** Open cap: the top `share` of a sphere (0.5 = a hemisphere). */
const dome = (r: number, share: number, w = 18, h = 9) =>
  new SphereGeometry(r, w, h, 0, Math.PI * 2, 0, Math.PI * share);
const box = (x: number, y: number, z: number, r = 0.02) =>
  new RoundedBoxGeometry(x, y, z, 2, r);
const capsule = (r: number, len: number) => new CapsuleGeometry(r, len, 4, 12);
const cylinder = (r: number, h: number, seg = 18) =>
  new CylinderGeometry(r, r, h, seg);
const ring = (r: number, tube: number, arc = Math.PI * 2) =>
  new TorusGeometry(r, tube, 6, 22, arc);
const HALF = Math.PI / 2;
const shade = (hex: string, k: number) =>
  "#" + new Color(hex).multiplyScalar(k).getHexString();

/** A capsule from `a` to `b`: straps, rods, fishing line. */
function rod(a: V3, b: V3, r: number, hex: string) {
  const d = new Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const len = d.length();
  const e = new Euler().setFromQuaternion(
    new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), d.normalize()),
  );
  return part(
    capsule(r, Math.max(0.001, len - 2 * r)),
    hex,
    [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2],
    [e.x, e.y, e.z],
  );
}

/**
 * Distinctive characteristics. Coordinates: head space has its origin at the
 * neck (face at z ~ 0.39, crown at y ~ 0.75); body space has its origin at
 * the feet (chest front at z ~ 0.22, neck at y ~ 0.98).
 */
const FEATURES: Record<FeatureName, (l: FighterLook) => Pieces> = {
  glasses: () => ({
    face: [
      part(
        ring(0.088, 0.016),
        INK,
        [-0.15, 0.3, 0.4],
        [-0.12, 0, 0],
        [1.2, 0.85, 1],
      ),
      part(
        ring(0.088, 0.016),
        INK,
        [0.15, 0.3, 0.4],
        [-0.12, 0, 0],
        [1.2, 0.85, 1],
      ),
      part(capsule(0.012, 0.05), INK, [0, 0.31, 0.415], [0, 0, HALF]),
    ],
  }),
  sunglasses: (l) => ({
    face: [
      part(
        box(0.17, 0.095, 0.03, 0.03),
        l.accent,
        [-0.15, 0.3, 0.405],
        [-0.12, 0, 0],
      ),
      part(
        box(0.17, 0.095, 0.03, 0.03),
        l.accent,
        [0.15, 0.3, 0.405],
        [-0.12, 0, 0],
      ),
      part(capsule(0.012, 0.05), l.accent, [0, 0.32, 0.418], [0, 0, HALF]),
    ],
  }),
  nametag: () => ({
    body: [
      part(
        box(0.17, 0.11, 0.02, 0.01),
        "#fff3cf",
        [0.12, 0.7, 0.228],
        [-0.1, 0, 0],
      ),
      part(
        box(0.17, 0.035, 0.022, 0.01),
        "#315e94",
        [0.12, 0.74, 0.232],
        [-0.1, 0, 0],
      ),
    ],
  }),
  capBack: (l) => ({
    head: [
      part(
        dome(0.46, 0.5),
        l.accent,
        [0, 0.35, -0.01],
        [-0.12, 0, 0],
        [1.02, 0.9, 1.04],
      ),
      part(
        box(0.34, 0.035, 0.24, 0.015),
        shade(l.accent, 0.8),
        [0, 0.47, -0.44],
        [0.35, 0, 0],
      ),
      part(sphere(0.035, 8, 6), shade(l.accent, 0.8), [0, 0.76, -0.04]),
    ],
  }),
  apron: (l) => ({
    body: [
      part(
        box(0.4, 0.4, 0.03, 0.03),
        l.accent,
        [0, 0.52, 0.226],
        [-0.06, 0, 0],
      ),
      part(
        box(0.18, 0.08, 0.034, 0.02),
        shade(l.accent, 0.82),
        [0, 0.45, 0.245],
        [-0.06, 0, 0],
      ),
      rod([-0.15, 0.7, 0.215], [-0.09, 0.93, 0.16], 0.016, l.accent),
      rod([0.15, 0.7, 0.215], [0.09, 0.93, 0.16], 0.016, l.accent),
    ],
  }),
  headphones: (l) => ({
    head: [
      part(ring(0.47, 0.035, Math.PI), DARK, [0, 0.3, -0.02]),
      part(cylinder(0.12, 0.09), l.accent, [-0.46, 0.29, 0], [0, 0, HALF]),
      part(cylinder(0.12, 0.09), l.accent, [0.46, 0.29, 0], [0, 0, HALF]),
    ],
  }),
  inEars: (l) => ({
    head: [
      part(sphere(0.065, 10, 7), l.accent, [-0.43, 0.3, 0.04]),
      part(sphere(0.065, 10, 7), l.accent, [0.43, 0.3, 0.04]),
      rod([-0.43, 0.27, 0.01], [-0.31, 0.05, -0.2], 0.01, DARK),
      rod([0.43, 0.27, 0.01], [0.31, 0.05, -0.2], 0.01, DARK),
    ],
  }),
  hoodie: (l) => ({
    body: [
      part(
        sphere(0.3, 14, 8),
        l.accent,
        [0, 0.98, -0.2],
        [0.2, 0, 0],
        [1.15, 0.7, 0.75],
      ),
      part(capsule(0.012, 0.12), "#f4f7fb", [-0.06, 0.8, 0.228]),
      part(capsule(0.012, 0.12), "#f4f7fb", [0.06, 0.8, 0.228]),
    ],
  }),
  cameraStrap: (l) => ({
    body: [
      rod([-0.2, 0.93, 0.15], [0, 0.7, 0.236], 0.022, l.accent),
      rod([0, 0.7, 0.236], [0.21, 0.46, 0.16], 0.022, l.accent),
    ],
  }),
  plushCharm: (l) => ({
    body: [
      part(sphere(0.085, 12, 8), l.accent, [-0.21, 0.42, 0.18]),
      part(sphere(0.05, 10, 6), l.accent, [-0.21, 0.52, 0.17]),
      part(
        new ConeGeometry(0.02, 0.05, 6),
        "#f2c65d",
        [-0.21, 0.51, 0.22],
        [HALF, 0, 0],
      ),
      rod([-0.21, 0.57, 0.17], [-0.2, 0.66, 0.16], 0.01, "#f2c65d"),
    ],
  }),
  bucketHat: (l) => ({
    head: [
      part(
        new CylinderGeometry(0.31, 0.37, 0.24, 20),
        l.accent,
        [0, 0.66, -0.02],
      ),
      part(
        cylinder(0.58, 0.03, 26),
        shade(l.accent, 0.88),
        [0, 0.55, 0],
        [-0.08, 0, 0],
      ),
      part(sphere(0.045, 8, 6), "#e2574c", [0.3, 0.66, 0.12]),
    ],
  }),
  headset: (l) => ({
    head: [
      part(ring(0.46, 0.02, Math.PI), l.accent, [0, 0.3, 0]),
      part(cylinder(0.09, 0.07), l.accent, [-0.45, 0.29, 0], [0, 0, HALF]),
      rod([-0.44, 0.25, 0.06], [-0.22, 0.15, 0.35], 0.016, l.accent),
      part(sphere(0.042, 8, 6), DARK, [-0.21, 0.15, 0.36]),
    ],
  }),
  chefHat: (l) => ({
    head: [
      part(cylinder(0.37, 0.16, 22), l.accent, [0, 0.66, -0.01]),
      part(
        sphere(0.3, 16, 10),
        l.accent,
        [0, 0.9, -0.01],
        [0, 0, 0],
        [1.15, 0.78, 1.15],
      ),
      part(sphere(0.19, 12, 8), l.accent, [-0.17, 0.86, 0.06]),
      part(sphere(0.19, 12, 8), l.accent, [0.17, 0.86, 0.06]),
    ],
  }),
  // Rosalie: a red-panda hood with round ears, after a summoner who wears
  // her companion's ears. Original design; no copied character art.
  pandaHood: (l) => ({
    head: [
      part(
        dome(0.475, 0.52, 20, 10),
        l.accent,
        [0, 0.33, -0.02],
        [-0.16, 0, 0],
        [1.03, 0.97, 1.05],
      ),
      part(
        ring(0.43, 0.06),
        CREAM,
        [0, 0.42, -0.01],
        [HALF, 0, 0],
        [1.03, 1.05, 1],
      ),
      ...[-1, 1].flatMap((side) => [
        part(
          sphere(0.135, 12, 8),
          l.accent,
          [side * 0.3, 0.73, -0.05],
          [0, 0, side * -0.3],
          [1, 1, 0.55],
        ),
        part(
          sphere(0.08, 10, 6),
          CREAM,
          [side * 0.3, 0.72, 0.0],
          [0, 0, side * -0.3],
          [1, 1, 0.45],
        ),
        part(sphere(0.034, 8, 6), "#2b1a14", [side * 0.12, 0.62, 0.36]),
      ]),
      part(
        sphere(0.06, 10, 6),
        CREAM,
        [0, 0.55, 0.39],
        [0, 0, 0],
        [1.4, 0.9, 0.6],
      ),
    ],
  }),
  beret: (l) => ({
    head: [
      part(
        sphere(0.42, 18, 10),
        l.accent,
        [0.07, 0.7, -0.02],
        [0, 0, -0.22],
        [1.12, 0.3, 1.06],
      ),
      part(capsule(0.02, 0.04), l.accent, [0.02, 0.84, -0.02]),
    ],
  }),
  beanie: (l) => ({
    head: [
      part(
        dome(0.465, 0.5),
        l.accent,
        [0, 0.38, 0],
        [-0.1, 0, 0],
        [1.02, 0.95, 1.03],
      ),
      part(
        ring(0.43, 0.065),
        "#fff6ec",
        [0, 0.42, 0],
        [HALF, 0, 0],
        [1.04, 1.05, 1],
      ),
      part(sphere(0.12, 12, 8), "#fff6ec", [0, 0.85, -0.03]),
    ],
  }),
  scarf: (l) => ({
    body: [
      part(
        new TorusGeometry(0.2, 0.075, 8, 18),
        l.accent,
        [0, 0.95, 0.02],
        [HALF, 0, 0],
        [1.1, 1, 1],
      ),
      part(
        box(0.11, 0.3, 0.05, 0.02),
        l.accent,
        [0.12, 0.78, 0.235],
        [-0.08, 0, 0.12],
      ),
      part(
        box(0.11, 0.05, 0.055, 0.01),
        shade(l.accent, 0.8),
        [0.135, 0.66, 0.245],
        [-0.08, 0, 0.12],
      ),
    ],
  }),
  bowtie: (l) => ({
    body: [
      part(
        new ConeGeometry(0.065, 0.13, 4),
        l.accent,
        [-0.065, 0.88, 0.235],
        [0, 0, -HALF],
      ),
      part(
        new ConeGeometry(0.065, 0.13, 4),
        l.accent,
        [0.065, 0.88, 0.235],
        [0, 0, HALF],
      ),
      part(sphere(0.03, 8, 6), shade(l.accent, 0.8), [0, 0.88, 0.245]),
    ],
  }),
  jacket: (l) => ({
    body: [
      part(box(0.22, 0.42, 0.035, 0.012), "#f4eadc", [0, 0.66, 0.226]),
      part(
        box(0.13, 0.31, 0.04, 0.012),
        shade(l.shirt, 0.78),
        [-0.1, 0.75, 0.25],
        [-0.08, 0, -0.28],
      ),
      part(
        box(0.13, 0.31, 0.04, 0.012),
        shade(l.shirt, 0.78),
        [0.1, 0.75, 0.25],
        [-0.08, 0, 0.28],
      ),
      part(box(0.016, 0.39, 0.022, 0.005), l.accent, [0, 0.63, 0.27]),
    ],
    armL: [part(cylinder(0.078, 0.055), l.accent, [0, -0.25, 0])],
    armR: [part(cylinder(0.078, 0.055), l.accent, [0, -0.25, 0])],
  }),
  leatherJacket: (l) => ({
    body: [
      part(
        box(0.17, 0.34, 0.045, 0.015),
        shade(l.shirt, 1.35),
        [-0.085, 0.73, 0.235],
        [-0.08, 0, -0.2],
      ),
      part(
        box(0.17, 0.34, 0.045, 0.015),
        shade(l.shirt, 1.35),
        [0.085, 0.73, 0.235],
        [-0.08, 0, 0.2],
      ),
      part(box(0.018, 0.42, 0.025, 0.006), "#d7c2a5", [0, 0.66, 0.262]),
      part(
        box(0.13, 0.018, 0.024, 0.005),
        l.accent,
        [-0.13, 0.58, 0.255],
        [0, 0, -0.2],
      ),
      part(
        box(0.13, 0.018, 0.024, 0.005),
        l.accent,
        [0.13, 0.58, 0.255],
        [0, 0, 0.2],
      ),
    ],
    armL: [part(cylinder(0.082, 0.065), l.accent, [0, -0.25, 0])],
    armR: [part(cylinder(0.082, 0.065), l.accent, [0, -0.25, 0])],
  }),
  // Thin rectangular metal frames: four bars a lens, bridge, hinge tabs.
  slimGlasses: () => ({
    face: [
      ...[-1, 1].flatMap((side) => [
        ...[-1, 1].map((v) =>
          part(
            new RoundedBoxGeometry(0.215, 0.014, 0.014, 1, 0.005),
            INK,
            [side * 0.15, 0.3 + v * 0.062, 0.402 - v * 0.007],
            [-0.12, 0, 0],
          ),
        ),
        ...[-1, 1].map((h) =>
          part(
            new RoundedBoxGeometry(0.014, 0.135, 0.014, 1, 0.005),
            INK,
            [side * 0.15 + h * 0.1, 0.3, 0.402],
            [-0.12, 0, 0],
          ),
        ),
        part(new RoundedBoxGeometry(0.05, 0.02, 0.014, 1, 0.005), INK, [side * 0.27, 0.34, 0.39]),
      ]),
      part(new RoundedBoxGeometry(0.09, 0.014, 0.014, 1, 0.005), INK, [0, 0.33, 0.408]),
    ],
  }),
};

/** Hats that cover the crown; the fringe would poke through them. */
const CROWN_COVERS: ReadonlySet<FeatureName> = new Set([
  "capBack",
  "bucketHat",
  "chefHat",
  "pandaHood",
  "beanie",
]);

/**
 * Hair styles, in head space. Every style starts from the same cap;
 * `bangs` is false under a hat that covers the crown.
 */
const HAIR: Record<
  HairStyle,
  (l: FighterLook, bangs: boolean) => BufferGeometry[]
> = {
  swept: (l, bangs) => [...cap(l), ...fringe(l, bangs)],
  sides: (l, bangs) => [
    ...cap(l),
    ...fringe(l, bangs),
    ...[-1, 1].map((side) =>
      part(
        sphere(0.14, 12, 8),
        l.hair,
        [side * 0.39, 0.3, -0.04],
        [0, 0, side * 0.12],
        [0.55, 1.55, 1.45],
      ),
    ),
  ],
  medium: (l, bangs) => [
    ...cap(l),
    ...fringe(l, bangs),
    ...[-1, 1].map((side) =>
      part(
        sphere(0.17, 12, 8),
        l.hair,
        [side * 0.37, 0.2, -0.05],
        [0, 0, side * 0.08],
        [0.72, 1.55, 1.2],
      ),
    ),
  ],
  shoulder: (l, bangs) => [
    ...cap(l),
    ...fringe(l, bangs),
    part(box(0.75, 0.48, 0.26, 0.13), l.hair, [0, 0.08, -0.2]),
    ...[-1, 1].map((side) =>
      part(
        capsule(0.105, 0.28),
        l.hair,
        [side * 0.36, 0.02, -0.02],
        [0, 0, side * 0.08],
      ),
    ),
  ],
  wavyShoulder: (l, bangs) => [
    ...cap(l),
    ...fringe(l, bangs),
    part(box(0.68, 0.4, 0.22, 0.11), l.hair, [0, 0.06, -0.2]),
    ...[-1, 1].flatMap((side) =>
      [0, 1, 2].map((k) =>
        part(
          sphere(0.14, 12, 8),
          l.hair,
          [side * (0.35 + (k % 2) * 0.035), 0.27 - k * 0.18, -0.01],
          [0, 0, side * (k % 2 ? -0.16 : 0.16)],
          [0.72, 1.05, 0.88],
        ),
      ),
    ),
  ],
  middlePart: (l) => [
    ...cap(l),
    ...[-1, 1].map((side) =>
      part(
        sphere(0.21, 14, 8),
        l.hair,
        [side * 0.14, 0.59, 0.2],
        [0.3, 0, side * 0.38],
        [1.2, 0.42, 0.78],
      ),
    ),
  ],
  sidePart: (l) => [
    ...cap(l),
    part(
      sphere(0.24, 14, 8),
      l.hair,
      [0.1, 0.59, 0.2],
      [0.32, 0, 0.52],
      [1.6, 0.42, 0.8],
    ),
    part(
      sphere(0.13, 12, 8),
      l.hair,
      [-0.27, 0.48, 0.13],
      [0.25, 0, -0.2],
      [1, 0.5, 0.78],
    ),
  ],
  bowl: (l) => [
    ...cap(l),
    part(
      sphere(0.29, 16, 10),
      l.hair,
      [0, 0.57, 0.11],
      [0.2, 0, 0],
      [1.35, 0.46, 1],
    ),
    ...[-1, 1].map((side) =>
      part(
        sphere(0.15, 12, 8),
        l.hair,
        [side * 0.36, 0.34, -0.02],
        [0, 0, side * 0.08],
        [0.65, 1.25, 1],
      ),
    ),
  ],
  shaved: (l) => [
    part(
      dome(0.43, 0.34, 18, 8),
      l.hair,
      [0, 0.3, -0.015],
      [0, 0, 0],
      [1.01, 1, 1],
    ),
  ],
  spiky: (l) => {
    const c = l.hair;
    const parts = cap(l);
    for (let i = 0; i < 6; i++) {
      const a = -0.8 + i * 0.32;
      parts.push(
        part(
          new ConeGeometry(0.075, 0.24, 8),
          c,
          [Math.sin(a) * 0.33, 0.56, Math.cos(a) * 0.27],
          [1.75, a, 0],
        ),
      );
    }
    for (let i = 0; i < 3; i++)
      parts.push(
        part(
          new ConeGeometry(0.08, 0.2, 8),
          c,
          [(i - 1) * 0.16, 0.75, -0.08],
          [-0.35, 0, (i - 1) * -0.4],
        ),
      );
    return parts;
  },
  braids: (l, bangs) => [
    ...cap(l),
    ...fringe(l, bangs),
    ...[-1, 1].flatMap((side) =>
      [0, 1, 2, 3].map((k) =>
        part(sphere(0.085 - k * 0.008, 10, 8), l.hair, [
          side * (0.36 + k * 0.01),
          0.12 - k * 0.13,
          0.08 + k * 0.03,
        ]),
      ),
    ),
    ...[-1, 1].map((side) =>
      part(sphere(0.04, 8, 6), "#fbe8d3", [side * 0.4, -0.36, 0.18]),
    ),
  ],
  ponytail: (l, bangs) => [
    ...cap(l),
    ...fringe(l, bangs),
    part(sphere(0.06, 8, 6), l.collar, [0, 0.5, -0.4]),
    rod([0, 0.48, -0.44], [0, 0.05, -0.56], 0.09, l.hair),
  ],
  long: (l, bangs) => [
    ...cap(l),
    ...fringe(l, bangs),
    part(box(0.82, 0.62, 0.3, 0.14), l.hair, [0, 0.1, -0.2]),
  ],
  bun: (l, bangs) => [
    ...cap(l),
    ...fringe(l, bangs),
    part(sphere(0.17, 14, 8), l.hair, [0, 0.66, -0.3]),
  ],
  // Messy waves piled on the crown, with loose curls falling over the brow.
  wavyTop: (l, bangs) => [
    ...cap(l),
    ...fringe(l, bangs),
    ...(
      [
        [-0.23, 0.67, 0.12, 0.5],
        [0.01, 0.74, 0.1, -0.4],
        [0.24, 0.66, 0.11, 0.45],
        [-0.31, 0.57, -0.08, -0.5],
        [0.31, 0.58, -0.09, 0.55],
        [-0.11, 0.72, -0.15, 0.35],
        [0.15, 0.7, -0.17, -0.45],
      ] as const
    ).map(([x, y, z, tilt]) =>
      part(
        sphere(0.14, 10, 6),
        l.hair,
        [x, y, z],
        [0.2, tilt, tilt * 0.6],
        [1.15, 0.6, 0.85],
      ),
    ),
    ...(bangs
      ? (
          [
            [-0.25, 0.49, 0.27, 0.7],
            [0.21, 0.51, 0.29, -0.6],
            [0.04, 0.55, 0.335, 0.5],
            [-0.35, 0.42, 0.16, 0.9],
            [0.35, 0.43, 0.16, -0.9],
          ] as const
        ).map(([x, y, z, curl]) =>
          part(
            sphere(0.085, 8, 5),
            l.hair,
            [x, y, z],
            [0.4, 0, curl],
            [1.3, 0.7, 0.7],
          ),
        )
      : []),
  ],
};
function cap(l: FighterLook) {
  return [
    part(
      dome(0.448, 0.53, 18, 10),
      l.hair,
      [0, 0.3, -0.01],
      [-0.34, 0, 0],
      [1.03, 1, 1],
    ),
  ];
}
function fringe(l: FighterLook, bangs: boolean) {
  const s = l.sweep;
  if (!bangs) return [];
  return [
    part(
      sphere(0.2, 14, 8),
      l.hair,
      [s * 0.12, 0.6, 0.25],
      [0.35, 0, s * 0.5],
      [1.55, 0.42, 0.8],
    ),
    part(
      sphere(0.16, 12, 8),
      l.hair,
      [-s * 0.18, 0.62, 0.2],
      [0.3, 0, -s * 0.4],
      [1.2, 0.4, 0.8],
    ),
  ];
}

/**
 * Held props. Hand space: the hand is at the origin and the arm hangs along
 * -y, so +y points back up the arm and +z points ahead of the palm. A prop
 * with `slot: "body"` is worn instead (Ethan's guitar).
 */
const PROPS: Record<
  PropName,
  { slot: "armR" | "body"; build: () => BufferGeometry[] }
> = {
  clipboard: {
    slot: "armR",
    build: () =>
      place(
        [
          part(box(0.3, 0.4, 0.035), "#fff3cf"),
          part(box(0.12, 0.06, 0.05), "#f2c65d", [0, 0.19, 0.01]),
          part(box(0.18, 0.02, 0.012, 0.005), "#315e94", [0, 0.07, 0.022]),
          part(box(0.18, 0.02, 0.012, 0.005), "#315e94", [0, 0, 0.022]),
          part(
            box(0.11, 0.02, 0.012, 0.005),
            "#315e94",
            [-0.035, -0.07, 0.022],
          ),
        ],
        [0.04, -0.14, 0.08],
        [0.15, -0.35, 0],
      ),
  },
  keys: {
    slot: "armR",
    build: () =>
      place(
        [
          part(new TorusGeometry(0.065, 0.02, 6, 16), "#ffdc76"),
          part(
            box(0.035, 0.17, 0.02, 0.008),
            "#ffdc76",
            [0.03, -0.13, 0],
            [0, 0, 0.3],
          ),
          part(
            box(0.06, 0.03, 0.02, 0.008),
            "#ffdc76",
            [0.07, -0.2, 0],
            [0, 0, 0.3],
          ),
          part(
            box(0.035, 0.15, 0.02, 0.008),
            "#e9c45c",
            [-0.04, -0.12, 0.01],
            [0, 0, -0.35],
          ),
        ],
        [0, -0.06, 0.06],
      ),
  },
  camera: {
    slot: "armR",
    build: () =>
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
  },
  cookie: {
    slot: "armR",
    build: () =>
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
  },
  speaker: {
    slot: "armR",
    build: () =>
      place(
        [
          part(box(0.26, 0.42, 0.2, 0.04), "#244348"),
          part(cylinder(0.055, 0.03), "#f9bd82", [0, 0.11, 0.1], [HALF, 0, 0]),
          part(cylinder(0.088, 0.03), "#f9bd82", [0, -0.07, 0.1], [HALF, 0, 0]),
          part(
            cylinder(0.035, 0.035),
            "#244348",
            [0, -0.07, 0.11],
            [HALF, 0, 0],
          ),
        ],
        [0.05, -0.2, 0.06],
        [0, -0.35, 0],
      ),
  },
  laptop: {
    slot: "armR",
    build: () =>
      place(
        [
          part(box(0.4, 0.27, 0.025, 0.012), "#244348"),
          part(
            box(0.07, 0.016, 0.01, 0.004),
            "#79e5ba",
            [-0.07, 0.025, 0.017],
            [0, 0, 0.7],
          ),
          part(
            box(0.07, 0.016, 0.01, 0.004),
            "#79e5ba",
            [-0.07, -0.025, 0.017],
            [0, 0, -0.7],
          ),
          part(
            box(0.07, 0.016, 0.01, 0.004),
            "#79e5ba",
            [0.07, 0.025, 0.017],
            [0, 0, -0.7],
          ),
          part(
            box(0.07, 0.016, 0.01, 0.004),
            "#79e5ba",
            [0.07, -0.025, 0.017],
            [0, 0, 0.7],
          ),
          part(box(0.4, 0.025, 0.24, 0.012), "#1b3236", [0, -0.14, -0.12]),
        ],
        [0.06, -0.13, 0.12],
        [0.15, -0.4, 0],
      ),
  },
  guitar: {
    slot: "body",
    build: () =>
      place(
        [
          part(
            sphere(0.2, 18, 10),
            "#d89c51",
            [0, 0, 0],
            [0, 0, 0],
            [1, 1, 0.35],
          ),
          part(
            sphere(0.15, 18, 10),
            "#d89c51",
            [0, 0.2, 0],
            [0, 0, 0],
            [1, 1, 0.35],
          ),
          part(cylinder(0.055, 0.02), "#473b44", [0, 0.06, 0.07], [HALF, 0, 0]),
          part(box(0.055, 0.44, 0.035, 0.01), "#b77b3e", [0, 0.52, 0.02]),
          part(box(0.09, 0.11, 0.04, 0.015), "#473b44", [0, 0.77, 0.02]),
          part(box(0.012, 0.6, 0.012, 0.004), "#fff0cb", [0, 0.35, 0.065]),
        ],
        [-0.05, 0.42, 0.29],
        [0, 0, -0.85],
      ),
  },
  microphone: {
    slot: "armR",
    build: () => [
      part(capsule(0.035, 0.25), "#2f3540", [0, 0.04, 0.04]),
      part(
        sphere(0.09, 12, 8),
        "#69717f",
        [0, 0.25, 0.04],
        [0, 0, 0],
        [1, 1.15, 1],
      ),
      part(ring(0.07, 0.012), "#f2c65d", [0, 0.24, 0.04], [HALF, 0, 0]),
    ],
  },
  rod: {
    slot: "armR",
    build: () => [
      rod([0, -0.02, 0.02], [0, 0.3, 0.84], 0.022, "#7a5230"),
      part(cylinder(0.05, 0.05), DARK, [0.05, 0.04, 0.12], [0, 0, HALF]),
      rod([0, 0.3, 0.84], [0, -0.06, 0.62], 0.006, "#f4f7fb"),
      part(sphere(0.045, 10, 6), "#e2574c", [0, -0.08, 0.61]),
    ],
  },
  stapler: {
    slot: "armR",
    build: () =>
      place(
        [
          part(box(0.3, 0.06, 0.11, 0.02), DARK),
          part(
            box(0.29, 0.07, 0.1, 0.025),
            "#d84b4b",
            [0.005, 0.07, 0],
            [0, 0, 0.08],
          ),
        ],
        [0.04, -0.08, 0.1],
        [0, -0.4, HALF],
      ),
  },
  ladle: {
    slot: "armR",
    build: () => [
      rod([0, 0.06, 0], [0, -0.12, 0.5], 0.022, "#c9ced6"),
      part(
        sphere(0.11, 12, 8),
        "#c9ced6",
        [0, -0.17, 0.56],
        [0, 0, 0],
        [1, 0.62, 1],
      ),
    ],
  },
  wheel: {
    slot: "armR",
    build: () =>
      place(
        [
          part(new TorusGeometry(0.17, 0.032, 8, 22), DARK),
          part(box(0.34, 0.03, 0.03, 0.01), DARK),
          part(box(0.03, 0.17, 0.03, 0.01), DARK, [0, -0.085, 0]),
          part(cylinder(0.05, 0.05), "#ffb300", [0, 0, 0], [HALF, 0, 0]),
        ],
        [0.02, -0.1, 0.14],
        [0.9, 0, 0],
      ),
  },
  phone: {
    slot: "armR",
    build: () =>
      place(
        [
          part(box(0.13, 0.24, 0.025, 0.02), DARK),
          part(box(0.105, 0.19, 0.01, 0.01), "#7fd3ff", [0, 0.01, 0.015]),
        ],
        [0.03, -0.1, 0.09],
        [0.25, -0.3, 0],
      ),
  },
  envelope: {
    slot: "armR",
    build: () =>
      place(
        [
          part(box(0.28, 0.18, 0.02, 0.008), "#fff8ee"),
          part(
            box(0.17, 0.012, 0.012, 0.004),
            "#c7b8a4",
            [-0.06, 0.04, 0.013],
            [0, 0, -0.55],
          ),
          part(
            box(0.17, 0.012, 0.012, 0.004),
            "#c7b8a4",
            [0.06, 0.04, 0.013],
            [0, 0, 0.55],
          ),
          part(
            sphere(0.03, 8, 6),
            "#d63a3a",
            [0, 0, 0.02],
            [0, 0, 0],
            [1, 1, 0.5],
          ),
        ],
        [0.04, -0.12, 0.08],
        [0.15, -0.35, 0],
      ),
  },
  book: {
    slot: "armR",
    build: () =>
      place(
        [
          part(box(0.24, 0.3, 0.07, 0.015), "#5b3fa3"),
          part(box(0.22, 0.28, 0.055, 0.01), "#fff6e6", [0.012, 0, 0.003]),
          part(box(0.03, 0.12, 0.075, 0.005), "#f2c65d", [-0.04, 0.02, 0]),
        ],
        [0.04, -0.12, 0.08],
        [0.15, -0.35, 0],
      ),
  },
  lantern: {
    slot: "armR",
    build: () => [
      part(new TorusGeometry(0.05, 0.012, 6, 12), DARK, [0, -0.02, 0.03]),
      part(new ConeGeometry(0.1, 0.07, 10), DARK, [0, -0.1, 0.03]),
      part(cylinder(0.08, 0.17, 12), "#ffe28a", [0, -0.22, 0.03]),
      part(cylinder(0.1, 0.035, 12), DARK, [0, -0.32, 0.03]),
    ],
  },
  calculator: {
    slot: "armR",
    build: () =>
      place(
        [
          part(box(0.2, 0.28, 0.04, 0.02), "#2f3540"),
          part(box(0.16, 0.06, 0.012, 0.005), "#a8e6a3", [0, 0.08, 0.022]),
          ...[-1, 0, 1].flatMap((i) =>
            [-1, 0].map((j) =>
              part(box(0.04, 0.04, 0.012, 0.008), "#e9edf2", [
                i * 0.055,
                j * 0.06 - 0.02,
                0.022,
              ]),
            ),
          ),
        ],
        [0.04, -0.12, 0.08],
        [0.15, -0.35, 0],
      ),
  },
  // A fanned hand of three meal cards, the front one face out.
  mealCard: {
    slot: "armR",
    build: () =>
      place(
        [
          ...[-1, 0, 1].map((i) =>
            part(
              box(0.15, 0.23, 0.012, 0.01),
              i ? "#f4f7fb" : "#2d6fc0",
              [i * 0.07, 0.1 - Math.abs(i) * 0.012, i ? -0.014 : 0],
              [0, 0, -i * 0.38],
            ),
          ),
          part(box(0.15, 0.04, 0.008, 0.004), "#ffd24a", [0, 0.185, 0.008]),
          part(box(0.06, 0.07, 0.008, 0.004), "#f4f7fb", [-0.03, 0.1, 0.008]),
        ],
        [0.03, -0.1, 0.1],
        [0.2, -0.3, 0],
      ),
  },
};

/**
 * Companions stand or float beside the fighter, in body space from the
 * feet. `float` companions bob above the shoulder; others stay grounded.
 */
const COMPANIONS: Record<
  CompanionName,
  { anchor: V3; float: boolean; build: (l: FighterLook) => BufferGeometry[] }
> = {
  note: {
    anchor: [0.5, 1.6, 0.05],
    float: true,
    build: (l) => [
      part(sphere(0.06, 12, 8), l.shirt, [0, 0, 0], [0, 0, 0.4], [1.3, 1, 0.6]),
      part(box(0.022, 0.19, 0.022, 0.008), l.shirt, [0.065, 0.1, 0]),
      part(box(0.09, 0.03, 0.022, 0.01), l.shirt, [0.1, 0.18, 0], [0, 0, -0.4]),
    ],
  },
  dove: {
    anchor: [0.55, 1.5, 0.05],
    float: true,
    build: () => [
      part(
        sphere(0.1, 12, 8),
        "#fbfbf7",
        [0, 0, 0],
        [0, 0, 0],
        [1.45, 0.95, 0.95],
      ),
      part(sphere(0.065, 10, 8), "#fbfbf7", [0.13, 0.07, 0]),
      part(
        new ConeGeometry(0.022, 0.06, 6),
        "#f2a33a",
        [0.2, 0.065, 0],
        [0, 0, -HALF],
      ),
      part(sphere(0.012, 6, 4), INK, [0.16, 0.09, 0.05]),
      part(
        sphere(0.09, 10, 6),
        "#eceee8",
        [-0.03, 0.06, 0.08],
        [0.5, 0, -0.3],
        [1.5, 0.35, 0.8],
      ),
      part(
        sphere(0.09, 10, 6),
        "#eceee8",
        [-0.03, 0.06, -0.08],
        [-0.5, 0, -0.3],
        [1.5, 0.35, 0.8],
      ),
      part(
        box(0.12, 0.02, 0.09, 0.01),
        "#eceee8",
        [-0.17, 0.01, 0],
        [0, 0, 0.25],
      ),
    ],
  },
  // Rosalie's red panda: a fluffy, round, giant-plush take on a real red
  // panda (rust fur, cream face markings, dark legs, ringed tail). Original
  // geometry; it is not a copy of any film or game character model.
  panda: {
    anchor: [0.68, 0, 0.22],
    float: false,
    build: () => {
      const fur = "#c8442a",
        dark = "#4a2418";
      return [
        part(
          sphere(0.21, 14, 10),
          fur,
          [0, 0.24, 0],
          [0, 0, 0],
          [1, 0.9, 1.12],
        ),
        part(sphere(0.18, 14, 10), fur, [0, 0.47, 0.12]),
        part(
          sphere(0.075, 10, 8),
          CREAM,
          [0, 0.43, 0.28],
          [0, 0, 0],
          [1.3, 0.85, 0.8],
        ),
        part(sphere(0.022, 6, 4), INK, [0, 0.46, 0.34]),
        ...[-1, 1].flatMap((side) => [
          part(sphere(0.055, 8, 6), CREAM, [side * 0.09, 0.53, 0.24]),
          part(sphere(0.022, 6, 4), INK, [side * 0.075, 0.5, 0.29]),
          part(
            sphere(0.07, 10, 6),
            fur,
            [side * 0.13, 0.62, 0.06],
            [0, 0, side * -0.3],
            [1, 1, 0.55],
          ),
          part(
            sphere(0.04, 8, 6),
            CREAM,
            [side * 0.13, 0.62, 0.09],
            [0, 0, side * -0.3],
            [1, 1, 0.4],
          ),
          part(capsule(0.05, 0.08), dark, [side * 0.11, 0.07, 0.1]),
          part(capsule(0.05, 0.08), dark, [side * 0.11, 0.07, -0.1]),
        ]),
        ...[0, 1, 2, 3].map((k) =>
          part(sphere(0.085 - k * 0.006, 10, 8), k % 2 ? CREAM : fur, [
            0,
            0.2 + k * 0.07,
            -0.24 - k * 0.07,
          ]),
        ),
      ];
    },
  },
};

export interface FighterParts {
  /** Torso, collar, worn features and props; legs too unless separated. */
  body: BufferGeometry;
  /** Optional legs in body space so the arena rig can hinge them at the hips. */
  legL?: BufferGeometry;
  legR?: BufferGeometry;
  /** Head, hair and hats; origin at the neck pivot. */
  head: BufferGeometry;
  /** Eyes, smile, glasses in head space; no outline. */
  face: BufferGeometry;
  /** Arms; origin at each shoulder pivot. */
  armL: BufferGeometry;
  armR: BufferGeometry;
  /** Companion beside the fighter, placed at `anchor` in body space. */
  companion?: { geometry: BufferGeometry; anchor: V3; float: boolean };
  /** Highest point of the model at rest (hats raise it), for name plates. */
  top: number;
}

export const NECK_Y = 0.98;
export const SHOULDER: V3 = [0.29, 0.86, 0];
export const HIP_Y = 0.34;
export const HIP_X = 0.12;

function arm(l: FighterLook): BufferGeometry[] {
  const shoulder = l.build === "muscular" ? 0.13 : 0.1;
  const upperArm = l.build === "muscular" ? 0.085 : 0.068;
  return [
    part(sphere(shoulder, 12, 8), l.shirt, [0, -0.02, 0]),
    part(capsule(upperArm, 0.16), l.skin, [0, -0.18, 0]),
    part(sphere(0.075, 12, 8), l.skin, [0, -0.33, 0]),
  ];
}

function head(l: FighterLook): BufferGeometry[] {
  return [
    part(sphere(0.42, 20, 14), l.skin, [0, 0.3, 0], [0, 0, 0], [1, 0.95, 0.92]),
    part(
      sphere(0.075, 10, 8),
      l.skin,
      [-0.42, 0.28, 0],
      [0, 0, 0],
      [0.6, 1, 1],
    ),
    part(sphere(0.075, 10, 8), l.skin, [0.42, 0.28, 0], [0, 0, 0], [0.6, 1, 1]),
    ...HAIR[l.hairStyle](l, !l.features.some((f) => CROWN_COVERS.has(f))),
  ];
}

/** Eyes and smile: drawn without the outline pass, which would blot them. */
function face(): BufferGeometry[] {
  return [
    part(capsule(0.032, 0.045), INK, [-0.145, 0.3, 0.378], [-0.15, 0, 0]),
    part(capsule(0.032, 0.045), INK, [0.145, 0.3, 0.378], [-0.15, 0, 0]),
    part(
      new TorusGeometry(0.055, 0.012, 6, 14, Math.PI),
      INK,
      [0, 0.175, 0.37],
      [-0.3, 0, Math.PI],
    ),
  ];
}

function leg(l: FighterLook, side: -1 | 1): BufferGeometry[] {
  const pants = l.pants ?? PANTS;
  return [
    part(capsule(0.085, 0.14), pants, [side * HIP_X, 0.2, 0]),
    part(box(0.19, 0.11, 0.28, 0.05), SHOE, [side * HIP_X, 0.055, 0.04]),
  ];
}

function body(l: FighterLook, withLegs: boolean): BufferGeometry[] {
  const torso = l.build === "muscular" ? 0.32 : 0.27;
  return [
    ...(withLegs ? [...leg(l, -1), ...leg(l, 1)] : []),
    part(
      capsule(torso, 0.16),
      l.shirt,
      [0, 0.62, 0],
      [0, 0, 0],
      [1.05, 1, 0.82],
    ),
    part(
      box(0.14, 0.026, 0.02, 0.01),
      l.collar,
      [-0.05, 0.86, 0.215],
      [-0.3, 0, -0.6],
    ),
    part(
      box(0.14, 0.026, 0.02, 0.01),
      l.collar,
      [0.05, 0.86, 0.215],
      [-0.3, 0, 0.6],
    ),
  ];
}

/** Hand position in arm space, where held props attach. */
const HAND: V3 = [0, -0.36, 0.02];

/** Collect every piece of a look onto its rig slot. */
function pieces(
  l: FighterLook,
  withLegs: boolean,
): Record<Slot, BufferGeometry[]> {
  const out: Record<Slot, BufferGeometry[]> = {
    body: body(l, withLegs),
    head: head(l),
    face: face(),
    armR: arm(l),
    armL: arm(l),
  };
  for (const name of l.features)
    for (const [slot, list] of Object.entries(FEATURES[name](l)))
      out[slot as Slot].push(...list!);
  if (l.prop) {
    const prop = PROPS[l.prop];
    out[prop.slot].push(
      ...(prop.slot === "armR" ? place(prop.build(), HAND) : prop.build()),
    );
  }
  return out;
}

const topOf = (g: BufferGeometry, y = 0) => {
  g.computeBoundingBox();
  return y + (g.boundingBox?.max.y ?? 0);
};

export function buildFighter(
  id: FighterId,
  opts: { separateLegs?: boolean } = {},
): FighterParts {
  const l = LOOKS[id];
  const separate = !!opts.separateLegs;
  const p = pieces(l, !separate);
  const parts: FighterParts = {
    body: merge(p.body),
    legL: separate ? merge(leg(l, -1)) : undefined,
    legR: separate ? merge(leg(l, 1)) : undefined,
    head: merge(p.head),
    face: merge(p.face),
    armL: merge(p.armL),
    armR: merge(p.armR),
    top: 0,
  };
  parts.top = Math.max(topOf(parts.body), topOf(parts.head, NECK_Y));
  if (l.companion) {
    const c = COMPANIONS[l.companion];
    parts.companion = {
      geometry: merge(c.build(l)),
      anchor: c.anchor,
      float: c.float,
    };
  }
  return parts;
}

export function disposeFighter(p: FighterParts) {
  p.body.dispose();
  p.legL?.dispose();
  p.legR?.dispose();
  p.head.dispose();
  p.face.dispose();
  p.armL.dispose();
  p.armR.dispose();
  p.companion?.geometry.dispose();
}
