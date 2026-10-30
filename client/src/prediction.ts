import { MAPS, RULES, distance, length, type Vec } from "../../shared/definitions";
import type { Match } from "../../shared/types";

/**
 * Local movement prediction and reconciliation (standard §4.3).
 *
 * Kept free of Phaser/DOM so the same code runs in the arena renderer and in
 * the scripted latency/loss harness (tests/netsim.ts).
 *
 * The client keeps its own input timeline (each sent move and the client
 * clock time it became active). The authority applies that timeline in order
 * and reports `ackTime`, the point up to which it has applied movement. On a
 * fresh snapshot the client starts from the authoritative position and
 * replays its timeline from `ackTime` to now.
 */

/**
 * Advance a position by one move input for `dt` seconds, mirroring the
 * engine's substepped movement and wall/bounds validity (Engine.move/valid).
 */
export function stepMove(
  match: Match,
  from: Vec,
  move: Vec,
  slow: number,
  speed: number,
  dt: number,
): Vec {
  const out = { ...from };
  if (dt <= 0) return out;
  const len = length(move);
  if (len === 0) return out;
  const m = len > 1 ? { x: move.x / len, y: move.y / len } : move;
  const map = MAPS[match.mode];
  const r = RULES.radius;
  const valid = (x: number, y: number) =>
    x >= r &&
    y >= r &&
    x <= map.w - r &&
    y <= map.h - r &&
    !match.walls.some(
      (w) =>
        x + r > w.x && x - r < w.x + w.w && y + r > w.y && y - r < w.y + w.h,
    );
  const dx = m.x * speed * (1 - slow) * dt,
    dy = m.y * speed * (1 - slow) * dt;
  const n = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 0.18));
  for (let i = 0; i < n; i++) {
    if (valid(out.x + dx / n, out.y)) out.x += dx / n;
    if (valid(out.x, out.y + dy / n)) out.y += dy / n;
  }
  return out;
}

/** A sent move input and the client time (s) it became active. */
export interface PendingInput {
  seq: number;
  move: Vec;
  slow: number;
  t: number;
}

export interface FrameResult {
  /** Position to draw: predicted position plus the decaying visual offset. */
  pos: Vec;
  /**
   * On a fresh snapshot, how far reconciliation moved the prediction from
   * where this frame would otherwise have been (authority divergence), else
   * null. This is the standard §4.2 "local correction error" metric.
   */
  correction: number | null;
}

/** Visual correction blend time constant (s). */
const CORRECTION_TAU = 0.1;
/** Longest frame step applied to local prediction (s), e.g. after a stall. */
const MAX_FRAME = 0.25;

export class LocalPredictor {
  pending: PendingInput[] = [];
  /** Reconciled predicted position (the simulation-consistent estimate). */
  pos: Vec | null = null;
  /**
   * Visual-only offset that absorbs a correction and decays to zero over
   * ~CORRECTION_TAU, so small corrections never appear as a snap.
   */
  offset: Vec = { x: 0, y: 0 };
  private lastAck = -1;
  private lastSample = -1;
  private lastNow: number | null = null;

  /** Record an input at the moment it is sent, at client time `t` (s). */
  record(seq: number, move: Vec, slow: number, t: number) {
    this.pending.push({ seq, move: { ...move }, slow, t });
    if (this.pending.length > 300) this.pending.shift();
  }

  /** Drop prediction state (e.g. the local fighter died or left the match). */
  reset() {
    this.pos = null;
    this.offset = { x: 0, y: 0 };
    this.lastAck = -1;
    this.lastSample = -1;
  }

  /** Replay the local timeline over [from, now] starting at `base`. */
  private replay(match: Match, base: Vec, from: number, now: number, speed: number) {
    let pos = { ...base };
    for (let i = 0; i < this.pending.length; i++) {
      const seg = this.pending[i];
      const start = Math.max(seg.t, from);
      const end = Math.min(i + 1 < this.pending.length ? this.pending[i + 1].t : now, now);
      if (end > start) pos = stepMove(match, pos, seg.move, seg.slow, speed, end - start);
    }
    return pos;
  }

  /**
   * Advance one rendered frame at client time `now` (s, same clock as the
   * `t` sent with inputs).
   */
  frame(
    match: Match,
    auth: Vec,
    speed: number,
    slow: number,
    liveMove: Vec,
    now: number,
    canPredict: boolean,
  ): FrameResult {
    const dt =
      this.lastNow === null ? 0 : Math.min(MAX_FRAME, Math.max(0, now - this.lastNow));
    this.lastNow = now;
    if (this.pos === null) this.pos = { ...auth };
    const decay = Math.exp(-dt / CORRECTION_TAU);
    this.offset = { x: this.offset.x * decay, y: this.offset.y * decay };
    const draw = (): Vec => ({
      x: this.pos!.x + this.offset.x,
      y: this.pos!.y + this.offset.y,
    });
    const fresh =
      match.ackSeq !== this.lastAck || match.sampleTime !== this.lastSample;
    if (fresh) {
      this.lastAck = match.ackSeq;
      this.lastSample = match.sampleTime;
      // Keep the segment containing ackTime; earlier ones are fully applied.
      while (this.pending.length > 1 && this.pending[1].t <= match.ackTime)
        this.pending.shift();
      if (!canPredict || match.ackTime <= 0) {
        // Server-forced state (countdown, stun, knockback) or no applied
        // timeline yet: follow authority.
        this.pos = { ...auth };
        this.offset = { x: 0, y: 0 };
        return { pos: draw(), correction: null };
      }
      const base = this.replay(match, auth, match.ackTime, now, speed);
      // Where this frame would have been without the correction; the
      // difference is authority divergence, not ordinary movement.
      const expected = stepMove(match, this.pos, liveMove, slow, speed, dt);
      const correction = distance(expected, base);
      if (correction > 3) {
        // Teleport-scale divergence (respawn, dash): accept authority.
        this.pos = { ...auth };
        this.offset = { x: 0, y: 0 };
      } else {
        // Adopt the reconciled position but keep drawing where the player
        // was, letting the offset decay: corrections read as a short glide.
        this.offset = {
          x: this.offset.x + expected.x - base.x,
          y: this.offset.y + expected.y - base.y,
        };
        this.pos = base;
      }
      return { pos: draw(), correction };
    }
    if (canPredict) this.pos = stepMove(match, this.pos, liveMove, slow, speed, dt);
    else {
      // Server-forced movement: ease toward authority between snapshots.
      const blend = Math.min(1, (dt * 1000) / 60);
      this.pos =
        distance(this.pos, auth) > 3
          ? { ...auth }
          : {
              x: this.pos.x + (auth.x - this.pos.x) * blend,
              y: this.pos.y + (auth.y - this.pos.y) * blend,
            };
    }
    return { pos: draw(), correction: null };
  }
}
