import {
  BufferAttribute,
  BufferGeometry,
  Color,
  Euler,
  Matrix4,
  Quaternion,
  Vector3,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

/**
 * Shared low-poly building blocks for everything on the 3D menu stage
 * (fighters and the plaza). Every part is a primitive, transformed and
 * painted with vertex colors, so whole groups merge into one mesh that
 * shares a single material.
 */
export type V3 = [number, number, number];

const color = new Color();
const matrix = new Matrix4();

/** Transform and paint one primitive. */
export function part(
  source: BufferGeometry,
  hex: string,
  at: V3 = [0, 0, 0],
  rot: V3 = [0, 0, 0],
  scale: V3 = [1, 1, 1],
): BufferGeometry {
  // Merging needs one layout: RoundedBoxGeometry is non-indexed while the
  // other primitives are indexed, so every part is made non-indexed.
  const geo = source.index ? source.toNonIndexed() : source;
  if (geo !== source) source.dispose();
  geo.deleteAttribute("uv");
  matrix.compose(
    new Vector3(...at),
    new Quaternion().setFromEuler(new Euler(...rot)),
    new Vector3(...scale),
  );
  geo.applyMatrix4(matrix);
  color.set(hex);
  const n = geo.attributes.position.count;
  const c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    c[i * 3] = color.r;
    c[i * 3 + 1] = color.g;
    c[i * 3 + 2] = color.b;
  }
  geo.setAttribute("color", new BufferAttribute(c, 3));
  return geo;
}

/** Apply one transform to a group of already-built parts. */
export function place(parts: BufferGeometry[], at: V3, rot: V3 = [0, 0, 0]) {
  matrix.compose(new Vector3(...at), new Quaternion().setFromEuler(new Euler(...rot)), new Vector3(1, 1, 1));
  for (const p of parts) p.applyMatrix4(matrix);
  return parts;
}

/**
 * Turn a painted part inside out: reverse each triangle and its normals so
 * the back of a thin open surface (a curved wall) renders with a one-sided
 * material.
 */
export function flip(geo: BufferGeometry): BufferGeometry {
  const pos = geo.attributes.position as BufferAttribute;
  const nor = geo.attributes.normal as BufferAttribute;
  const col = geo.attributes.color as BufferAttribute | undefined;
  for (let i = 0; i < pos.count; i += 3) {
    for (const attr of [pos, nor, col]) {
      if (!attr) continue;
      for (let k = 0; k < attr.itemSize; k++) {
        const a = attr.getComponent(i + 1, k);
        attr.setComponent(i + 1, k, attr.getComponent(i + 2, k));
        attr.setComponent(i + 2, k, a);
      }
    }
  }
  for (let i = 0; i < nor.count; i++) nor.setXYZ(i, -nor.getX(i), -nor.getY(i), -nor.getZ(i));
  return geo;
}

export function merge(parts: BufferGeometry[]): BufferGeometry {
  const g = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  if (!g) throw new Error("stage geometry merge failed");
  g.computeBoundingSphere();
  return g;
}
