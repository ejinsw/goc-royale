/**
 * Runtime measurement for the development overlay (standard §4.3, §5.3).
 *
 * Plain mutable state with fixed-size buffers, no React and no per-frame
 * allocation beyond a ring write. Expensive measurements (payload byte
 * counting) run only while the overlay is enabled.
 */
export class Ring {
  private data: Float64Array;
  private next = 0;
  size = 0;
  constructor(capacity: number) {
    this.data = new Float64Array(capacity);
  }
  push(v: number) {
    this.data[this.next] = v;
    this.next = (this.next + 1) % this.data.length;
    if (this.size < this.data.length) this.size++;
  }
  /** p in [0, 1]; NaN when empty. */
  percentile(p: number) {
    if (!this.size) return NaN;
    const sorted = Array.from(this.data.subarray(0, this.size)).sort(
      (a, b) => a - b,
    );
    return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
  }
  count(predicate: (v: number) => boolean) {
    let n = 0;
    for (let i = 0; i < this.size; i++) if (predicate(this.data[i])) n++;
    return n;
  }
  clear() {
    this.size = 0;
    this.next = 0;
  }
}

/** Sliding-window rate counter (events or bytes per second over ~2 s). */
export class Rate {
  private samples: { t: number; n: number }[] = [];
  add(n: number, now: number) {
    this.samples.push({ t: now, n });
    this.prune(now);
  }
  perSecond(now: number) {
    this.prune(now);
    let sum = 0;
    for (const s of this.samples) sum += s.n;
    return sum / 2;
  }
  private prune(now: number) {
    while (this.samples.length && now - this.samples[0].t > 2000)
      this.samples.shift();
  }
}

export const metrics = {
  /** True while the overlay is visible; gates byte counting. */
  enabled: false,
  role: "menu" as "menu" | "host" | "guest",
  frames: new Ring(300),
  corrections: new Ring(240),
  rtt: new Ring(60),
  /** RFC 3550-style interarrival jitter estimate of RTT, in ms. */
  jitter: 0,
  pingsSent: 0,
  pongs: 0,
  /** Pings unanswered after 3 s. Reliable channels surface loss as delay. */
  late: 0,
  snapshotGaps: new Ring(120),
  lastSnapshotAt: 0,
  snapshotsIn: new Rate(),
  bytesIn: new Rate(),
  bytesOut: new Rate(),
  simTicks: new Rate(),
  snapshotsOut: new Rate(),
  /** Arena renderer counters for the last frame (copied, never computed here). */
  gpu: { calls: 0, triangles: 0, geometries: 0, textures: 0 },
  /**
   * Local fighter one-shots (standard §7.2): started on the input frame,
   * authoritative cues skipped because the prediction already played, and
   * authoritative cues that did start a local one-shot (mispredictions).
   */
  anim: { predicted: 0, skipped: 0, authoritative: 0 },
  /** The UCLA Swiper showcase this match: "", "on", or "failed: <why>". */
  showcase: "",
  /** The roster showcase this match: "", "on", or "failed: <why>". */
  roster: "",
  private: { lastRtt: NaN },

  recordFrame(deltaMs: number) {
    this.frames.push(deltaMs);
  },
  recordCorrection(units: number) {
    this.corrections.push(units);
  },
  recordRtt(ms: number) {
    this.pongs++;
    this.rtt.push(ms);
    const last = this.private.lastRtt;
    if (Number.isFinite(last)) this.jitter += (Math.abs(ms - last) - this.jitter) / 16;
    this.private.lastRtt = ms;
  },
  snapshotArrived(now: number) {
    if (this.lastSnapshotAt) this.snapshotGaps.push(now - this.lastSnapshotAt);
    this.lastSnapshotAt = now;
    this.snapshotsIn.add(1, now);
  },
  reset() {
    this.frames.clear();
    this.corrections.clear();
    this.rtt.clear();
    this.snapshotGaps.clear();
    this.jitter = 0;
    this.pingsSent = 0;
    this.pongs = 0;
    this.late = 0;
    this.lastSnapshotAt = 0;
    this.anim.predicted = this.anim.skipped = this.anim.authoritative = 0;
    this.private.lastRtt = NaN;
  },
};

/** Approximate JSON payload size; only call when metrics.enabled. */
export const payloadBytes = (value: unknown) => JSON.stringify(value).length;
