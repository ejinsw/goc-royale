import type { HostMessage, Match } from "./types";

/**
 * Lossless structural delta codec for match snapshots (standard §4.2: prefer
 * deltas and omission of unchanged data over full-state JSON).
 *
 * Wire format of a delta value:
 * - primitive (number/string/boolean/null): replace with this value
 * - `{ "=": v }`: replace with the object/array `v`
 * - `{ "#": [[id, delta]...], "x"?: [ids], "o"?: [ids] }`: keyed entity
 *   array (every element has a unique `id`): changed/added entries, removed
 *   ids, and an explicit order only when it differs from the default
 * - any other object: nested object diff, with `"-"` listing deleted keys
 *   and `"~"` giving the full key order only when it would otherwise differ
 *
 * Invariant (tested): applying `diff(a, b)` to `JSON(a)` yields `JSON(b)`.
 * Snapshot objects must not use the marker keys "=", "#", "-" or "~".
 *
 * Deltas are taken against the previous snapshot sent on the same
 * connection. That is safe because the data channel is reliable and ordered;
 * each message carries `n`/`base` so a gap is detected and a keyframe is
 * requested. Moving snapshots to an unreliable channel would require
 * acknowledgement-based baselines instead.
 */

export const NONE: unique symbol = Symbol("unchanged");
type Diff = unknown;
type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const idOf = (v: unknown) =>
  isObj(v) && (typeof v.id === "string" || typeof v.id === "number")
    ? (v.id as string | number)
    : undefined;
const keyed = (arr: unknown[]) => {
  const seen = new Set<string | number>();
  for (const e of arr) {
    const id = idOf(e);
    if (id === undefined || seen.has(id)) return false;
    seen.add(id);
  }
  return true;
};
const jsonEqual = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);

export function diff(a: unknown, b: unknown): Diff | typeof NONE {
  if (Object.is(a, b)) return NONE;
  if (b === null || typeof b !== "object") return b;
  if (Array.isArray(b)) {
    if (Array.isArray(a)) {
      if (keyed(a) && keyed(b)) return diffKeyed(a as Obj[], b as Obj[]);
      if (jsonEqual(a, b)) return NONE;
    }
    return { "=": b };
  }
  if (!isObj(a)) return { "=": b };
  const next = b as Obj;
  const out: Obj = {};
  let changed = false;
  for (const k of Object.keys(next)) {
    if (next[k] === undefined) continue;
    const d = diff(a[k], next[k]);
    if (d !== NONE) {
      out[k] = d;
      changed = true;
    }
  }
  const removed = Object.keys(a).filter(
    (k) => a[k] !== undefined && next[k] === undefined,
  );
  if (removed.length) {
    out["-"] = removed;
    changed = true;
  }
  // Key order after apply is: surviving old keys, then added keys. Send the
  // order only when that differs, so reconstruction is byte-identical.
  const live = (o: Obj) => Object.keys(o).filter((k) => o[k] !== undefined);
  const want = live(next);
  const kept = live(a).filter((k) => next[k] !== undefined);
  const expected = [...kept, ...want.filter((k) => !kept.includes(k))];
  if (want.some((k, i) => k !== expected[i])) {
    out["~"] = want;
    changed = true;
  }
  return changed ? out : NONE;
}

function diffKeyed(a: Obj[], b: Obj[]): Diff | typeof NONE {
  const prev = new Map(a.map((e) => [idOf(e)!, e]));
  const nextIds = new Set(b.map((e) => idOf(e)!));
  const entries: [string | number, Diff][] = [];
  for (const e of b) {
    const id = idOf(e)!;
    const d = diff(prev.get(id), e);
    if (d !== NONE) entries.push([id, d]);
  }
  const removed = a.map((e) => idOf(e)!).filter((id) => !nextIds.has(id));
  // Default order after apply: survivors in old order, then new ids in order.
  const expected = [
    ...a.map((e) => idOf(e)!).filter((id) => nextIds.has(id)),
    ...b.map((e) => idOf(e)!).filter((id) => !prev.has(id)),
  ];
  const order = b.map((e) => idOf(e)!);
  const reordered = order.some((id, i) => id !== expected[i]);
  if (!entries.length && !removed.length && !reordered) return NONE;
  const out: Obj = { "#": entries };
  if (removed.length) out.x = removed;
  if (reordered) out.o = order;
  return out;
}

/** Apply a delta without mutating `base` (unchanged branches are shared). */
export function apply(base: unknown, d: Diff): unknown {
  if (d === null || typeof d !== "object") return d;
  const o = d as Obj;
  if ("=" in o) return o["="];
  if ("#" in o) {
    const arr = Array.isArray(base) ? (base as Obj[]) : [];
    const map = new Map(arr.map((e) => [idOf(e)!, e as unknown]));
    const order = arr.map((e) => idOf(e)!);
    for (const [id, ed] of o["#"] as [string | number, Diff][]) {
      if (!map.has(id)) order.push(id);
      map.set(id, apply(map.get(id), ed));
    }
    const removed = new Set((o.x as (string | number)[] | undefined) ?? []);
    const final =
      (o.o as (string | number)[] | undefined) ??
      order.filter((id) => !removed.has(id));
    return final.map((id) => map.get(id));
  }
  const out: Obj = isObj(base) ? { ...base } : {};
  for (const k of Object.keys(o))
    if (k !== "-" && k !== "~") out[k] = apply(out[k], o[k]);
  for (const k of (o["-"] as string[] | undefined) ?? []) delete out[k];
  const order = o["~"] as string[] | undefined;
  if (!order) return out;
  const ordered: Obj = {};
  for (const k of order) ordered[k] = out[k];
  return ordered;
}

/** Per-connection encoder on the host. */
export class SnapshotEncoder {
  private base: Match | null = null;
  private n = 0;
  private sinceKeyframe = 0;
  /** A periodic keyframe bounds the impact of any undetected divergence. */
  constructor(private keyframeEvery = 180) {}
  encode(match: Match): HostMessage {
    this.n++;
    if (!this.base || ++this.sinceKeyframe >= this.keyframeEvery) {
      this.base = match;
      this.sinceKeyframe = 0;
      return { type: "snapshot", match, n: this.n };
    }
    const d = diff(this.base, match);
    this.base = match;
    return { type: "delta", n: this.n, base: this.n - 1, diff: d === NONE ? {} : d };
  }
  /** Force the next snapshot to be a keyframe (new connection or resync). */
  reset() {
    this.base = null;
  }
}

/** Per-connection decoder on the guest. Returns null when a resync is needed. */
export class SnapshotDecoder {
  private base: Match | null = null;
  private n = -1;
  accept(m: HostMessage): Match | null {
    if (m.type === "snapshot") {
      this.base = m.match;
      this.n = m.n ?? -1;
      return m.match;
    }
    if (m.type !== "delta") return null;
    if (!this.base || m.base !== this.n) {
      this.base = null;
      return null;
    }
    this.base = apply(this.base, m.diff) as Match;
    this.n = m.n;
    return this.base;
  }
  reset() {
    this.base = null;
    this.n = -1;
  }
}
