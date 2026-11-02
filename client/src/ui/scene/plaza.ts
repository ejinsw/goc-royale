import {
  BoxGeometry,
  BufferGeometry,
  CircleGeometry,
  CylinderGeometry,
  IcosahedronGeometry,
} from "three";
import { flip, merge, part, place, type V3 } from "./geometry";

/**
 * The menu backdrop: a stylized low-poly courtyard in the spirit of the UCLA
 * Broad Art Center plaza. Built from primitives as an original
 * interpretation; no photo texture, traced geometry or scanned asset.
 *
 * Composition, as seen from the menu camera (which looks down -z from +z at
 * roughly eye level, with the fighters standing at the origin):
 *
 *   left        the arcade building, running away from the camera behind a
 *               white colonnade under a big tilted glass canopy; a long
 *               staircase climbs high alongside it to an open platform, and
 *               the building's upper floors continue past the top of frame
 *   middle      the brick path, which is where the fighters stand, with a
 *               taller building standing well back behind it
 *   right       a grass lawn, with the rusted steel vessels in front of it
 *               and trees beyond
 *
 * Distances are tight on purpose: at the menu camera's distance only about
 * 13 m of world is visible across the frame at the fighters' depth, so
 * scenery that reads as "just off to one side" sits only a few meters out.
 */

/** Concrete for podium blocks, matching the plaza paving. */
export const PODIUM_CONCRETE = "#cfc8bd";

const C = {
  concrete: "#cdc9c2",
  concreteLight: "#d6d2cb",
  concreteDark: "#b5b0a8",
  brick: "#a9705c",
  brickPath: "#b07763",
  brickJoint: "#c6a596",
  brickDark: "#8f5e4d",
  white: "#eceef0",
  whiteWarm: "#e4e1db",
  glass: "#6e8298",
  glassDark: "#566a80",
  steel: "#6c737b",
  rail: "#c9cdd1",
  rust: "#7b3b26",
  rustInner: "#4e2419",
  bark: "#7b6b5b",
  leaf: "#4f7b3c",
  leafLight: "#628d47",
  leafDark: "#3f6832",
  grass: "#6f9a4e",
  grassDark: "#5d8641",
  curb: "#4a443f",
  flower: "#d63b2c",
  canopy: "#eef3f7",
  canopyLine: "#b9c2cb",
};

const box = (w: number, h: number, d: number) => new BoxGeometry(w, h, d);
/** A painted box whose position is its center. */
const slab = (hex: string, size: V3, at: V3, rot: V3 = [0, 0, 0]) =>
  part(box(...size), hex, at, rot);

/**
 * The staircase: it belongs to the left building and climbs high, away from
 * the camera, to an open platform.
 */
const STAIR = {
  cx: -5.4,
  width: 6.4,
  steps: 16,
  rise: 0.4,
  run: 0.62,
  /** z of the bottom nosing. */
  z0: -5,
};
const UPPER = STAIR.steps * STAIR.rise;
const STAIR_TOP_Z = STAIR.z0 - STAIR.steps * STAIR.run;
const STAIR_SLOPE = Math.atan2(STAIR.rise, STAIR.run);
const STAIR_L = STAIR.cx - STAIR.width / 2;
const STAIR_R = STAIR.cx + STAIR.width / 2;

/** The arcade building: its colonnade plane, depth, and extent along z. */
// zFront stops short of the camera so the nearest column does not loom.
const LEFT = { faceX: -11, backX: -34, zFront: 2, zBack: -38 };

/** The open platform at the top of the stairs. */
const DECK = { x0: STAIR_L - 0.9, x1: -1.8, zFront: STAIR_TOP_Z, zBack: -26 };

/** The brick path the fighters stand on, and the lawn to its right. */
const PATH = { x0: -2, x1: 3.4 };
const LAWN = { x0: 5.4, x1: 34, zFront: -20, zBack: -46, top: 0.14 };

function ground(): BufferGeometry[] {
  const parts = [
    slab(C.concrete, [120, 0.5, 100], [0, -0.25, -18]),
    // A shallow step down at the front, mostly below the frame.
    slab(C.concreteLight, [120, 0.5, 16], [0, -0.62, 40]),
  ];
  // The brick path, laid in large panels with pale joints.
  const pw = PATH.x1 - PATH.x0,
    pcx = (PATH.x0 + PATH.x1) / 2;
  parts.push(slab(C.brickPath, [pw, 0.03, 60], [pcx, 0.015, -14]));
  for (let z = 10; z > -42; z -= 5)
    parts.push(slab(C.brickJoint, [pw, 0.01, 0.16], [pcx, 0.032, z]));
  parts.push(
    slab(C.brickJoint, [0.16, 0.01, 60], [PATH.x0 + 0.08, 0.032, -14]),
    slab(C.brickJoint, [0.16, 0.01, 60], [PATH.x1 - 0.08, 0.032, -14]),
  );
  // Joint lines across the concrete fields on either side.
  for (let z = 8; z > -30; z -= 6) {
    parts.push(slab(C.concreteDark, [8, 0.01, 0.1], [-5.6, 0.021, z]));
    parts.push(slab(C.concreteDark, [2, 0.01, 0.1], [4.4, 0.021, z]));
  }
  // The lawn on the right, raised behind a dark curb.
  const lw = LAWN.x1 - LAWN.x0,
    lcx = (LAWN.x0 + LAWN.x1) / 2,
    ll = LAWN.zFront - LAWN.zBack,
    lcz = (LAWN.zFront + LAWN.zBack) / 2;
  parts.push(
    slab(C.curb, [lw + 0.5, LAWN.top + 0.1, ll + 0.5], [lcx, (LAWN.top - 0.1) / 2, lcz]),
    slab(C.grass, [lw, LAWN.top + 0.12, ll], [lcx, LAWN.top / 2, lcz]),
    // A mown-looking band so the lawn is not one flat color.
    slab(C.grassDark, [lw, 0.02, 4], [lcx, LAWN.top + 0.01, lcz - 5]),
  );
  return parts;
}

/** Treads, cheek walls and handrails. */
function staircase(): BufferGeometry[] {
  const parts: BufferGeometry[] = [];
  for (let i = 0; i < STAIR.steps; i++) {
    const top = (i + 1) * STAIR.rise;
    const z = STAIR.z0 - i * STAIR.run - STAIR.run / 2;
    // Each tread is a full-height box up from the plaza, so there are no
    // gaps between steps at any camera angle.
    parts.push(
      slab(C.concreteLight, [STAIR.width, top, STAIR.run], [STAIR.cx, top / 2, z]),
      slab(C.concreteDark, [STAIR.width, 0.02, 0.08], [STAIR.cx, top + 0.005, z + STAIR.run / 2 - 0.045]),
    );
  }
  const midY = UPPER / 2,
    midZ = (STAIR.z0 + STAIR_TOP_Z) / 2,
    slope = Math.hypot(STAIR.steps * STAIR.run, UPPER);
  for (const x of [STAIR_L - 0.35, STAIR_R + 0.35]) {
    // Sloping cheek wall with a handrail above it.
    parts.push(
      slab(C.concrete, [0.7, 0.95, slope], [x, midY + 0.28, midZ], [STAIR_SLOPE, 0, 0]),
      slab(C.rail, [0.08, 0.08, slope], [x, midY + 1.4, midZ], [STAIR_SLOPE, 0, 0]),
    );
    for (const t of [0.1, 0.37, 0.64, 0.9]) {
      const y = t * UPPER;
      parts.push(slab(C.rail, [0.06, 1, 0.06], [x, y + 0.98, STAIR.z0 - t * STAIR.steps * STAIR.run]));
    }
  }
  // One rail splitting the run, as the reference stair has.
  parts.push(slab(C.rail, [0.08, 0.08, slope], [STAIR.cx, midY + 1.05, midZ], [STAIR_SLOPE, 0, 0]));
  for (const t of [0.1, 0.37, 0.64, 0.9]) {
    const y = t * UPPER;
    parts.push(slab(C.rail, [0.06, 1.05, 0.06], [STAIR.cx, y + 0.52, STAIR.z0 - t * STAIR.steps * STAIR.run]));
  }
  return parts;
}

/**
 * The arcade building along the left of the stairs: a brick wall behind a
 * white colonnade, a balcony above it, and the signature tilted glass canopy
 * projecting over the walkway. Its mass keeps rising past the top of the
 * frame, so no upper floor is ever resolved.
 */
function leftBuilding(): BufferGeometry[] {
  const { faceX, backX, zFront, zBack } = LEFT;
  const len = zFront - zBack,
    midZ = (zFront + zBack) / 2;
  const parts: BufferGeometry[] = [
    // Ground-floor brick wall facing the plaza, and the floor band above it.
    slab(C.brick, [0.5, 4.6, len], [faceX, 2.3, midZ]),
    slab(C.white, [3.6, 0.4, len], [faceX + 1.4, 4.65, midZ]),
    // The mass behind, set back from the colonnade and tall enough to leave
    // the frame, so the floors above are never in view.
    slab(C.brickDark, [0.5, 14, len], [faceX - 0.6, 11.9, midZ]),
    slab("#d9dbdd", [faceX - 0.9 - backX, 14, len], [(backX + faceX - 0.9) / 2, 11.9, midZ]),
    // Balcony rails along the walkway above the colonnade.
    slab(C.rail, [0.09, 0.09, len], [faceX + 3.1, 5.5, midZ]),
    slab(C.rail, [0.05, 0.05, len], [faceX + 3.1, 5.15, midZ]),
    slab(C.rail, [0.05, 0.05, len], [faceX + 3.1, 4.85, midZ]),
  ];
  for (let z = zBack; z <= zFront; z += 2)
    parts.push(slab(C.rail, [0.06, 1, 0.06], [faceX + 3.1, 5.05, z]));
  // White columns carrying the walkway, standing out from the brick.
  for (let z = zBack + 1.4; z <= zFront - 1; z += 3.2)
    parts.push(slab(C.white, [0.55, 4.6, 0.55], [faceX + 1.3, 2.3, z]));
  // Glazed bays at ground level and windows on the floor above.
  for (let z = zBack + 2.6; z <= zFront - 2; z += 4.2)
    parts.push(slab(C.glassDark, [0.08, 3, 2.4], [faceX + 0.28, 1.5, z]));
  for (let z = zBack + 3; z <= zFront - 3; z += 5)
    parts.push(slab(C.glass, [0.08, 2.1, 2.6], [faceX - 0.88, 7.2, z]));
  // Tilted glass canopy projecting over the walkway on raking columns. It
  // rises away from the building, as the reference canopy does.
  for (let i = 0; i < 9; i++) {
    const z = zBack + 3 + i * 4.6;
    if (z > zFront - 1) break;
    const panel = [
      slab(C.canopy, [5.4, 0.12, 4.3], [0, 0, 0]),
      slab(C.white, [0.26, 0.26, 4.4], [2.7, 0, 0]),
      slab(C.white, [5.4, 0.22, 0.26], [0, 0, -2.15]),
      ...[-1.8, -0.6, 0.6, 1.8].map((dx) => slab(C.canopyLine, [0.06, 0.14, 4.1], [dx, 0.03, 0])),
      ...[-1.1, 1.1].map((dz) => slab(C.canopyLine, [5.2, 0.14, 0.06], [0, 0.03, dz])),
    ];
    parts.push(...place(panel, [faceX + 3.4, 7.4, z], [0, 0, 0.26]));
    parts.push(
      slab(C.white, [0.3, 8.4, 0.3], [faceX + 5.9, 4.2, z], [0, 0, -0.06]),
      slab(C.white, [2.4, 0.18, 0.18], [faceX + 4.8, 7.3, z], [0, 0, 0.55]),
    );
  }
  return parts;
}

/**
 * The platform at the top of the stairs: an open deck with a parapet along
 * the plaza side, so the stairs read as climbing to a level you cannot see
 * onto.
 */
function platform(): BufferGeometry[] {
  const w = DECK.x1 - DECK.x0,
    cx = (DECK.x0 + DECK.x1) / 2,
    len = DECK.zFront - DECK.zBack,
    midZ = (DECK.zFront + DECK.zBack) / 2;
  const parts: BufferGeometry[] = [
    slab(C.concreteLight, [w, 0.5, len], [cx, UPPER - 0.25, midZ]),
    // Retaining wall and parapet on the open plaza side.
    slab(C.concreteDark, [0.5, UPPER, len], [DECK.x1, UPPER / 2, midZ]),
    slab(C.concrete, [0.5, 1.1, len], [DECK.x1, UPPER + 0.55, midZ]),
    slab(C.concreteDark, [0.62, 0.08, len], [DECK.x1, UPPER + 1.14, midZ]),
  ];
  // Short returns of the parapet beside where the stairs arrive.
  for (const [x0, x1] of [
    [DECK.x0, STAIR_L - 0.7],
    [STAIR_R + 0.7, DECK.x1],
  ] as const)
    if (x1 > x0 + 0.05)
      parts.push(
        slab(C.concrete, [x1 - x0, 1.1, 0.5], [(x0 + x1) / 2, UPPER + 0.55, DECK.zFront]),
        slab(C.concreteDark, [x1 - x0, 0.08, 0.62], [(x0 + x1) / 2, UPPER + 1.14, DECK.zFront]),
      );
  return parts;
}

/**
 * The taller building standing well back behind the open middle: stacked
 * balcony bands with louvered soffits, plus a blank concrete shaft beside it.
 */
function backBuilding(): BufferGeometry[] {
  const parts: BufferGeometry[] = [];
  // The camera tilts slightly down through a narrow lens, so very little sky
  // is in frame and this building's top is always cropped. It therefore has
  // to read from its base: columns, slabs and glazing rather than height.
  const cx = 8,
    front = -46,
    w = 30;
  parts.push(slab("#d2cdc5", [w, 26, 14], [cx, 13, front - 7]));
  // Ground floor: recessed glazing behind white columns.
  parts.push(slab(C.glassDark, [w - 2, 3.4, 0.1], [cx, 1.7, front + 0.15]));
  for (let x = cx - w / 2 + 2; x <= cx + w / 2 - 2; x += 4)
    parts.push(slab(C.white, [0.6, 3.6, 0.6], [x, 1.8, front + 0.7]));
  // Balcony bands: a white slab, a shaded soffit, glazing and a thin rail.
  for (let floor = 1; floor <= 6; floor++) {
    const y = 3.8 + floor * 3.4;
    parts.push(
      slab(C.white, [w + 1.2, 0.48, 1.8], [cx, y, front + 0.9]),
      slab("#8d6e52", [w - 0.6, 0.55, 0.34], [cx, y + 0.5, front + 0.15]),
      slab(C.glass, [w - 1, 1.7, 0.1], [cx, y + 1.6, front - 0.1]),
      slab(C.rail, [w + 1.2, 0.08, 0.08], [cx, y + 1.3, front + 1.75]),
      slab(C.rail, [w + 1.2, 0.05, 0.05], [cx, y + 0.95, front + 1.75]),
    );
    // Vertical mullions so the glazing is not one flat sheet.
    for (let x = cx - w / 2 + 2; x <= cx + w / 2 - 2; x += 3)
      parts.push(slab(C.white, [0.22, 1.7, 0.14], [x, y + 1.6, front - 0.02]));
  }
  parts.push(slab(C.whiteWarm, [w + 0.6, 0.8, 14.4], [cx, 24.4, front - 7]));
  // The concrete shaft on its right, and a lower wing on its left.
  parts.push(slab("#cfcbc4", [8, 27, 13], [cx + w / 2 + 4.5, 13.5, front - 6]));
  for (let y = 5; y < 25; y += 4.6)
    parts.push(slab("#bdb8b1", [0.5, 2.6, 0.2], [cx + w / 2 + 1, y, front - 0.4]));
  parts.push(slab(C.whiteWarm, [9, 11, 12], [cx - w / 2 - 4, 5.5, front - 6]));
  return parts;
}

/**
 * The rusted steel vessels in front of the lawn: tapered open cylinders,
 * drawn inside and out with a dark interior.
 */
function vessels(): BufferGeometry[] {
  const one = (at: V3, rTop: number, rBot: number, h: number, lean: number) => {
    const shell = () => new CylinderGeometry(rTop, rBot, h, 26, 1, true);
    const mid: V3 = [at[0], at[1] + h / 2, at[2]];
    return [
      part(shell(), C.rust, mid, [0, 0, lean]),
      flip(part(shell(), C.rustInner, mid, [0, 0, lean])),
      // The interior floor, set below the rim so the vessel reads as open.
      part(new CircleGeometry(rTop * 0.93, 24), C.rustInner, [at[0], at[1] + h - 0.55, at[2]], [-Math.PI / 2, 0, 0]),
    ];
  };
  return [
    ...one([7, 0, -17.5], 1.85, 1.25, 3, 0.02),
    ...one([10.6, 0, -21], 1.5, 1, 2.5, -0.03),
  ];
}

/** Coral tree beyond the lawn; returns [static base, swaying crown]. */
function tree(): [BufferGeometry[], BufferGeometry[]] {
  const base = [part(new CylinderGeometry(0.34, 0.5, 4.2, 7), C.bark, [14.2, 2.1, -27], [0.08, 0, 0.18])];
  const branch = (at: V3, rot: V3, len: number) =>
    part(new CylinderGeometry(0.12, 0.24, len, 6), C.bark, at, rot);
  const crown: BufferGeometry[] = [
    branch([13, 5.1, -27.1], [0.1, 0, 0.75], 3),
    branch([14.3, 5.5, -27.5], [-0.35, 0, -0.15], 2.6),
    branch([15.2, 5, -26.6], [0.25, 0, -0.7], 2.8),
  ];
  const blobs: [V3, number, string][] = [
    [[11.9, 6.5, -26.8], 1.6, C.leaf],
    [[13.4, 7.4, -27.9], 1.8, C.leafDark],
    [[15, 7.5, -27], 1.7, C.leaf],
    [[16.4, 6.7, -26.4], 1.4, C.leafLight],
    [[14, 6.3, -25.6], 1.3, C.leafLight],
    [[11.1, 5.9, -28.1], 1.1, C.leafDark],
    [[17.1, 7.7, -28.2], 1.2, C.leaf],
  ];
  for (const [at, r, hex] of blobs)
    crown.push(part(new IcosahedronGeometry(r, 0), hex, at, [at[0], at[1], 0], [1.15, 0.8, 1]));
  // Red coral-tree blossoms scattered over the crown.
  for (let i = 0; i < 26; i++) {
    const [at, r] = blobs[i % blobs.length];
    const a = i * 2.4,
      b = 0.5 + (i % 3) * 0.35;
    crown.push(
      part(new IcosahedronGeometry(0.14, 0), C.flower, [
        at[0] + Math.cos(a) * r * 0.95,
        at[1] + Math.sin(b) * r * 0.55,
        at[2] + Math.sin(a) * r * 0.75 + 0.3,
      ]),
    );
  }
  return [base, crown];
}

/** Eucalyptus silhouettes along the right edge and the far skyline. */
function backTrees(): BufferGeometry[] {
  const parts: BufferGeometry[] = [];
  for (const [x, z, h] of [
    [22, -20, 14],
    [27, -28, 16],
    [19, -32, 13],
    [30, -16, 12],
  ] as const) {
    parts.push(part(new CylinderGeometry(0.25, 0.42, h, 6), "#8a7f72", [x, h / 2, z]));
    for (let k = 0; k < 3; k++)
      parts.push(
        part(
          new IcosahedronGeometry(2.6 - k * 0.4, 0),
          k % 2 ? C.leafDark : "#466a3d",
          [x + (k - 1) * 1.7, h - 1 + k * 1.5, z],
          [k, k, 0],
          [1, 1.3, 1],
        ),
      );
  }
  return parts;
}

/** Puffy low-poly clouds high above the plaza. */
function clouds(): BufferGeometry[] {
  const parts: BufferGeometry[] = [];
  const banks: [number, number, number, number][] = [
    [-30, 38, -70, 1.3],
    [-6, 44, -80, 1.6],
    [22, 40, -74, 1.2],
    [44, 46, -82, 1.5],
    [-50, 34, -66, 1],
  ];
  banks.forEach(([x, y, z, s], b) => {
    for (let k = 0; k < 5; k++) {
      const r = (2.4 + ((k * 7 + b) % 3) * 0.7) * s;
      parts.push(
        part(
          new IcosahedronGeometry(r, 1),
          k % 2 ? "#f4f7fb" : "#ffffff",
          [x + (k - 2) * 2.6 * s, y + (k % 2) * 0.9 * s, z + k * 0.4],
          [k, b, 0],
          [1.5, 0.7, 1],
        ),
      );
    }
  });
  return parts;
}

export interface PlazaGeometry {
  /** Ground, buildings, stairs, vessels, lawn: one static mesh. */
  base: BufferGeometry;
  /** The tree crown, animated separately so it can sway. */
  crown: BufferGeometry;
  /** Pivot for the crown sway (the top of the trunk). */
  crownPivot: V3;
  /** Cloud banks, drifted slowly as one mesh. */
  clouds: BufferGeometry;
}

export function buildPlaza(): PlazaGeometry {
  const [treeBase, crown] = tree();
  // The crown is built in plaza space; recenter it on its pivot so the sway
  // rotates around the trunk top.
  const pivot: V3 = [14.2, 4.2, -27];
  const crownGeo = merge(crown);
  crownGeo.translate(-pivot[0], -pivot[1], -pivot[2]);
  return {
    base: merge([
      ...ground(),
      ...staircase(),
      ...platform(),
      ...leftBuilding(),
      ...backBuilding(),
      ...vessels(),
      ...treeBase,
      ...backTrees(),
    ]),
    crown: crownGeo,
    crownPivot: pivot,
    clouds: merge(clouds()),
  };
}
