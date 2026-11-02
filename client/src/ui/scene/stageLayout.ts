/**
 * Pure stage layout: where each fighter stands for a stage mode and frame
 * aspect. No Three.js here, so it is cheap to reason about and test.
 *
 * World units: x right, z toward the camera, fighters are ~1.75 tall at
 * scale 1 and stand on y = 0 (or on a podium block).
 */
export type StageMode = "solo" | "party" | "teams" | "podium";

export interface StageEntry {
  key: string;
  team?: 0 | 1;
  /** 1-based finishing place for podium mode. */
  rank?: number;
  /** Winning side in team podiums. */
  winner?: boolean;
  self?: boolean;
}

export interface Slot {
  key: string;
  x: number;
  z: number;
  /** Podium block height under the fighter. */
  block: number;
  scale: number;
  facing: number;
}

export interface StageLayout {
  slots: Slot[];
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  /** Highest point including name plate room. */
  top: number;
}

const COL = 1.25;
/** Row depth; deep enough that back-row plates clear front-row heads. */
const ROW = 1.45;
export const FIGHTER_HEIGHT = 1.75;
/** Extra height reserved above heads for name plates. */
const PLATE_ROOM = 0.55;

/** Columns that make the group largest inside a frame of this aspect. */
function bestColumns(n: number, aspect: number, maxCols: number) {
  let best = 1,
    bestScale = 0;
  for (let c = 1; c <= Math.min(n, maxCols); c++) {
    const rows = Math.ceil(n / c);
    const w = c * COL + 0.4;
    const h = FIGHTER_HEIGHT + PLATE_ROOM + (rows - 1) * 0.9;
    const s = Math.min(aspect / w, 1 / h);
    if (s > bestScale + 1e-6) {
      bestScale = s;
      best = c;
    }
  }
  return best;
}

/** Order x offsets center-out so the first entry gets the middle spot. */
function centerOut(count: number): number[] {
  const xs = Array.from({ length: count }, (_, i) => (i - (count - 1) / 2) * COL);
  return xs.sort((a, b) => Math.abs(a) - Math.abs(b) || a - b);
}

/** Rows of fighters, front row first, front row centered on the first entry. */
function grid(entries: StageEntry[], cols: number, z0: number, scale: number): Slot[] {
  const slots: Slot[] = [];
  // Rows step back and the camera looks down, so back rows read above front rows.
  for (let start = 0, row = 0; start < entries.length; start += cols, row++) {
    const rowEntries = entries.slice(start, start + cols);
    const xs = centerOut(rowEntries.length);
    // A back row with the same parity as the front row would stand directly
    // behind it; shift it half a column so every fighter stays visible.
    const stagger = row % 2 === 1 && rowEntries.length % 2 === cols % 2 ? COL * 0.5 : 0;
    rowEntries.forEach((e, i) =>
      slots.push({
        key: e.key,
        x: (xs[i] + stagger) * scale,
        z: z0 - row * ROW * scale,
        block: 0,
        scale,
        facing: 0,
      }),
    );
  }
  return slots;
}

const groupScale = (n: number) => (n <= 1 ? 1.45 : n <= 3 ? 1.15 : n <= 6 ? 1 : 0.9);

function party(entries: StageEntry[], aspect: number): Slot[] {
  const ordered = [...entries].sort((a, b) => Number(!!b.self) - Number(!!a.self));
  const scale = groupScale(entries.length);
  return grid(ordered, bestColumns(entries.length, aspect, 5), 0, scale);
}

function teams(entries: StageEntry[], aspect: number): Slot[] {
  const a = entries.filter((e) => (e.team ?? 0) === 0);
  const b = entries.filter((e) => e.team === 1);
  const scale = groupScale(Math.max(a.length, b.length) * 2);
  const sideBySide = aspect >= 0.9;
  if (!sideBySide) {
    const cols = Math.max(1, Math.min(3, Math.max(a.length, b.length)));
    const front = grid(a, cols, 0, scale);
    const rowsA = Math.ceil(a.length / cols) || 1;
    // Same stagger rule as rows inside one group, applied between teams.
    const shift = rowsA % 2 === 1 && b.length % 2 === cols % 2 ? COL * 0.5 * scale : 0;
    const back = grid(b, cols, -(rowsA * ROW + 0.3) * scale, scale).map((s) => ({ ...s, x: s.x + shift }));
    return [...front, ...back];
  }
  const cols = (n: number) => Math.max(1, Math.min(3, n));
  const left = grid(a, cols(a.length), 0, scale);
  const right = grid(b, cols(b.length), 0, scale);
  const half = (s: Slot[]) => (s.length ? Math.max(...s.map((x) => Math.abs(x.x))) : 0);
  const gap = 0.75 * scale;
  const shiftL = -(half(left) + gap + COL * 0.5 * scale);
  const shiftR = half(right) + gap + COL * 0.5 * scale;
  return [
    ...left.map((s) => ({ ...s, x: s.x + shiftL, facing: 0.22 })),
    ...right.map((s) => ({ ...s, x: s.x + shiftR, facing: -0.22 })),
  ];
}

function podium(entries: StageEntry[], aspect: number): Slot[] {
  const teamMode = entries.some((e) => e.winner !== undefined);
  if (teamMode) {
    const win = entries.filter((e) => e.winner);
    const lose = entries.filter((e) => !e.winner);
    const scale = groupScale(Math.max(win.length, lose.length) * 2);
    const front = grid(win, Math.max(1, Math.min(4, win.length)), 0, scale);
    // Losers stand behind, shifted half a column when they would line up
    // directly behind a winner.
    const shift = lose.length % 2 === Math.min(4, win.length) % 2 ? COL * 0.5 * scale : 0;
    const back = grid(lose, Math.max(1, Math.min(5, lose.length)), -1.6 * scale, scale * 0.85).map(
      (s) => ({ ...s, x: s.x + shift }),
    );
    return [...front, ...back];
  }
  const ranked = [...entries].sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99));
  const top = ranked.slice(0, 3);
  const rest = ranked.slice(3);
  // The podium steps up toward the middle; #1 also stands forward so its
  // plate clears #2 and #3.
  const blocks = [0.6, 0.32, 0.14];
  const xs = [0, -1.5, 1.5];
  const zs = [0.5, 0, 0];
  const scale = 1.05;
  const slots: Slot[] = top.map((e, i) => ({
    key: e.key,
    x: xs[i],
    z: zs[i],
    block: blocks[i],
    scale,
    facing: -xs[i] * 0.08,
  }));
  // Everyone else stands behind the podium in the gaps between the three
  // spots, so no one hides directly behind a winner. Your own fighter takes
  // the first gap.
  const gaps: [number, number][] = [
    [0.75, -1.5],
    [-0.75, -1.5],
    [2.25, -1.5],
    [-2.25, -1.5],
    [1.5, -2.7],
    [-1.5, -2.7],
    [0, -2.7],
  ];
  const back = [...rest].sort((a, b) => Number(!!b.self) - Number(!!a.self));
  back.forEach((e, i) => {
    const [x, z] = gaps[i] ?? [(i - 6) * 0.9, -3.6];
    slots.push({ key: e.key, x, z, block: 0, scale: 0.75, facing: -x * 0.05 });
  });
  void aspect;
  return slots;
}

export function layoutStage(
  mode: StageMode,
  entries: StageEntry[],
  aspect: number,
): StageLayout {
  const slots =
    mode === "solo"
      ? entries.slice(0, 1).map((e) => ({ key: e.key, x: 0, z: 0, block: 0, scale: 1.45, facing: 0 }))
      : mode === "teams"
        ? teams(entries, aspect)
        : mode === "podium"
          ? podium(entries, aspect)
          : party(entries, aspect);
  for (const s of slots) if (!s.facing) s.facing = -s.x * 0.05;
  if (!slots.length)
    return { slots, minX: -1, maxX: 1, minZ: -0.5, maxZ: 0.5, top: FIGHTER_HEIGHT };
  const half = (s: Slot) => 0.55 * s.scale;
  return {
    slots,
    minX: Math.min(...slots.map((s) => s.x - half(s))),
    maxX: Math.max(...slots.map((s) => s.x + half(s))),
    minZ: Math.min(...slots.map((s) => s.z - 0.4)),
    maxZ: Math.max(...slots.map((s) => s.z + 0.4)),
    top: Math.max(...slots.map((s) => s.block + (FIGHTER_HEIGHT + PLATE_ROOM) * s.scale)),
  };
}
