/**
 * Colors of the menu backdrop place (the plaza in plaza.ts). Kept apart from
 * the geometry so the page can paint the same sky before Three.js loads and
 * when WebGL cannot start, without pulling Three.js into the main bundle.
 */
export const PLAZA_SKY = {
  top: "#4b82d6",
  mid: "#93b9ea",
  horizon: "#e6edf5",
  ground: "#cdc6ba",
} as const;

export const PLAZA_FOG = { color: "#e3eaf2", near: 65, far: 230 } as const;

/** CSS gradient matching the 3D sky dome. */
export const PLAZA_BACKDROP_CSS = `linear-gradient(${PLAZA_SKY.top} 0%, ${PLAZA_SKY.mid} 38%, ${PLAZA_SKY.horizon} 58%, ${PLAZA_SKY.ground} 100%)`;
