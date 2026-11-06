/**
 * Scripted latency/loss harness (standard §4.4).
 *
 * Runs the real Room/Engine authority against a simulated guest that uses the
 * renderer's own LocalPredictor and input-send policy, over a modeled network
 * link. The link is ordered and reliable like the PeerJS data channel in use,
 * so packet loss shows up as retransmission delay and head-of-line blocking,
 * not as missing messages.
 *
 * Limits: the retransmit model (~1 RTT + 20 ms) is optimistic compared with
 * real SCTP retransmission timers; frames run at an ideal 60 Hz; there is no
 * browser, renderer, or physical device in the loop.
 */
import { Room } from "../shared/room";
import { FIGHTERS, type Vec } from "../shared/definitions";
import type { HostMessage, Input, Match } from "../shared/types";
import { LocalPredictor, stepMove } from "../client/src/prediction";
import { SnapshotDecoder, SnapshotEncoder } from "../shared/delta";

export interface Scenario {
  name: string;
  rttMs: number;
  /** Probability a message needs one retransmission. */
  loss: number;
  /** Extra random one-way delay, 0..jitterMs. */
  jitterMs: number;
  /** Link down in both directions during [start, end) ms. */
  outage?: { start: number; end: number };
  durationMs?: number;
  seed?: number;
}

export interface Result {
  name: string;
  corrections: { n: number; p50: number; p95: number; max: number };
  /**
   * Largest per-frame deviation of the drawn local position from smooth
   * motion (drawn step minus the input-implied step), in world units.
   */
  visibleJumpMax: number;
  staleAgeMs: { p50: number; p95: number; max: number };
  /** Frames between a movement input and the predicted position changing. */
  responseFrames: { p95: number; max: number };
  attacksSent: number;
  attacksPresented: number;
  /**
   * Times an already-presented event id arrived again in a later snapshot
   * (rolling window / retransmit). Dedupe by id must absorb all of them.
   */
  repeatDeliveries: number;
  maxPendingInputs: number;
}

const percentile = (values: number[], p: number) => {
  if (!values.length) return NaN;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
};

/** Deterministic PRNG (mulberry32) so runs are reproducible. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Ordered, reliable link with latency, jitter, retransmission and outages. */
class Link<T> {
  private queue: { at: number; msg: T }[] = [];
  private lastAt = 0;
  constructor(
    private cfg: Scenario,
    private random: () => number,
  ) {}
  send(msg: T, now: number) {
    const oneWay = this.cfg.rttMs / 2;
    let at = now + oneWay + this.random() * this.cfg.jitterMs;
    if (this.random() < this.cfg.loss) at += this.cfg.rttMs + 20;
    const o = this.cfg.outage;
    if (o && at >= o.start && now < o.end) at = Math.max(at, o.end + oneWay);
    at = Math.max(at, this.lastAt); // ordered delivery: no overtaking
    this.lastAt = at;
    this.queue.push({ at, msg: structuredClone(msg) });
  }
  take(now: number) {
    const out: T[] = [];
    while (this.queue.length && this.queue[0].at <= now)
      out.push(this.queue.shift()!.msg);
    return out;
  }
}

const DIRS: Vec[] = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
  { x: Math.SQRT1_2, y: Math.SQRT1_2 },
  { x: -Math.SQRT1_2, y: Math.SQRT1_2 },
  { x: Math.SQRT1_2, y: -Math.SQRT1_2 },
  { x: -Math.SQRT1_2, y: -Math.SQRT1_2 },
];

export function runScenario(cfg: Scenario): Result {
  const duration = cfg.durationMs ?? 20000;
  const random = rng(cfg.seed ?? 1234);
  const down = new Link<HostMessage>(cfg, random);
  const up = new Link<Input>(cfg, random);
  let now = 0;
  let guestId = "";
  // Same delta codec as client/src/network.ts.
  const encoder = new SnapshotEncoder();
  const decoder = new SnapshotDecoder();
  const room = new Room("NETSIM", (id, msg) => {
    if (id !== guestId) return;
    down.send(msg.type === "snapshot" ? encoder.encode(msg.match) : msg, now);
  });
  const host = room.join("Host");
  const guest = room.join("Guest");
  guestId = guest.id;
  room.command(guest.id, { type: "select", fighter: "brandon" });
  room.command(host.id, { type: "ready", ready: true });
  room.command(guest.id, { type: "ready", ready: true });
  room.command(host.id, { type: "start" });

  const predictor = new LocalPredictor();
  const speed = FIGHTERS.brandon.speed;
  const frameMs = 1000 / 60,
    tickMs = 1000 / 30,
    snapshotMs = 1000 / 18;
  let nextTick = tickMs,
    nextFrame = 0,
    snapAcc = 0;
  let latest: Match | null = null;
  let lastSnapshotAt = 0;
  let seq = 0,
    lastSend = -Infinity,
    lastKey = "",
    lastAttack = -Infinity;
  let move: Vec = { x: 0, y: 0 };
  let pendingResponse: { since: number; from: Vec } | null = null;
  let lastDrawn: Vec | null = null;
  let visibleJumpMax = 0;
  const corrections: number[] = [];
  const stale: number[] = [];
  const response: number[] = [];
  const seen = new Set<number>();
  let repeatDeliveries = 0,
    attacksSent = 0,
    attacksPresented = 0,
    maxPending = 0;
  // Stop scripted attacks early enough that the last one can be presented.
  const attackUntil = duration - 1500 - cfg.rttMs * 2;

  const frame = () => {
    for (const m of down.take(now)) {
      const match = decoder.accept(m);
      if (!match) continue;
      latest = match;
      lastSnapshotAt = now;
      for (const e of match.events) {
        // Present exactly once per id, as the arena's playEvents does.
        if (seen.has(e.id)) {
          repeatDeliveries++;
          continue;
        }
        seen.add(e.id);
        if (e.type === "attack_started" && e.owner === guestId)
          attacksPresented++;
      }
    }
    if (!latest) return;
    if (latest.phase === "playing") stale.push(now - lastSnapshotAt);
    // Scripted input: new direction (or a stop) every 400 ms.
    const next = DIRS[Math.floor(rng(Math.floor(now / 400) + 77)() * DIRS.length)];
    const changedFromStop =
      move.x === 0 && move.y === 0 && (next.x !== 0 || next.y !== 0);
    move = next;
    const attack = now >= 4000 && now < attackUntil && now - lastAttack >= 1500;
    if (attack) lastAttack = now;
    const self = latest.players.find((p) => p.id === guestId);
    // Mirror the arena's sendInput (client/src/game.ts).
    const key = `${move.x},${move.y}`;
    if (key !== lastKey || attack || now - lastSend >= 1000 / 30) {
      lastKey = key;
      lastSend = now;
      const s = ++seq;
      const t = now / 1000;
      up.send({ move: { ...move }, aim: { x: 1, y: 0 }, attack, seq: s, t }, now);
      predictor.record(s, move, self?.slow ?? 0, t);
      if (attack) attacksSent++;
    }
    maxPending = Math.max(maxPending, predictor.pending.length);
    if (!self?.alive) {
      predictor.reset();
      lastDrawn = null;
      return;
    }
    const canPredict = latest.phase === "playing" && latest.time >= self.stunUntil;
    const before = predictor.pos ? { ...predictor.pos } : null;
    if (changedFromStop && canPredict && before)
      pendingResponse = { since: now, from: before };
    const r = predictor.frame(
      latest,
      self.pos,
      speed,
      self.slow,
      move,
      now / 1000,
      canPredict,
    );
    if (r.correction !== null) corrections.push(r.correction);
    if (canPredict && lastDrawn) {
      const smooth = stepMove(latest, lastDrawn, move, self.slow, speed, frameMs / 1000);
      visibleJumpMax = Math.max(
        visibleJumpMax,
        Math.hypot(r.pos.x - smooth.x, r.pos.y - smooth.y),
      );
    }
    lastDrawn = canPredict ? { ...r.pos } : null;
    if (pendingResponse) {
      const p = r.pos;
      if (p.x !== pendingResponse.from.x || p.y !== pendingResponse.from.y) {
        response.push(Math.round((now - pendingResponse.since) / frameMs));
        pendingResponse = null;
      } else if (now - pendingResponse.since > 1000) pendingResponse = null;
    }
  };

  for (; now <= duration; now++) {
    for (const input of up.take(now))
      room.command(guestId, { type: "input", input });
    let ticked = 0;
    while (now >= nextTick) {
      room.tick();
      nextTick += tickMs;
      ticked++;
    }
    if (ticked) {
      snapAcc += ticked * tickMs;
      if (snapAcc >= snapshotMs) {
        room.snapshots();
        snapAcc %= snapshotMs;
      }
    }
    if (now >= nextFrame) {
      frame();
      nextFrame += frameMs;
    }
  }

  return {
    name: cfg.name,
    corrections: {
      n: corrections.length,
      p50: percentile(corrections, 0.5),
      p95: percentile(corrections, 0.95),
      max: corrections.length ? Math.max(...corrections) : NaN,
    },
    visibleJumpMax,
    staleAgeMs: {
      p50: percentile(stale, 0.5),
      p95: percentile(stale, 0.95),
      max: stale.length ? Math.max(...stale) : NaN,
    },
    responseFrames: {
      p95: percentile(response, 0.95),
      max: response.length ? Math.max(...response) : NaN,
    },
    attacksSent,
    attacksPresented,
    repeatDeliveries,
    maxPendingInputs: maxPending,
  };
}
