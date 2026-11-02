let context: AudioContext | undefined;
export const preferences = { sound: 0.35, music: 0, shake: true };
export function unlockAudio() {
  context ??= new AudioContext();
  void context.resume();
}

/** One synthesized tone: a pitch sweep with a fast exponential decay. */
interface Tone {
  wave: OscillatorType;
  from: number;
  to: number;
  /** Start offset (s) within the cue. */
  at?: number;
  /** Sweep and decay length (s). */
  dur?: number;
  /** Relative loudness, 1 = gameplay cue level. */
  gain?: number;
}

/**
 * Every sound is a named entry in this table (docs/CODE-PRACTICES.md §1.3).
 * Gameplay cues keep their original values; `ui_*` cues are the interface
 * categories from the art direction (soft clicks and short pitched chimes).
 */
const CUES: Record<string, Tone[]> = {
  default: [{ wave: "triangle", from: 130, to: 80 }],
  attack: [{ wave: "triangle", from: 240, to: 80 }],
  heal: [{ wave: "triangle", from: 620, to: 80 }],
  goal: [{ wave: "sine", from: 440, to: 880 }],
  // super_cue rises (anticipation); release falls (a soft whoosh).
  super_cue: [{ wave: "triangle", from: 330, to: 990 }],
  release: [{ wave: "sine", from: 520, to: 220 }],
  ui_tap: [{ wave: "sine", from: 720, to: 560, dur: 0.05, gain: 0.45 }],
  ui_press: [{ wave: "triangle", from: 320, to: 190, dur: 0.06, gain: 0.8 }],
  ui_thump: [{ wave: "triangle", from: 190, to: 85, dur: 0.09, gain: 1 }],
  ui_confirm: [
    { wave: "sine", from: 660, to: 660, dur: 0.07, gain: 0.6 },
    { wave: "sine", from: 990, to: 990, at: 0.06, dur: 0.11, gain: 0.6 },
  ],
  ui_deny: [
    { wave: "triangle", from: 210, to: 150, dur: 0.07, gain: 0.8 },
    { wave: "triangle", from: 180, to: 120, at: 0.08, dur: 0.09, gain: 0.8 },
  ],
  ui_tick: [{ wave: "sine", from: 1100, to: 1000, dur: 0.025, gain: 0.25 }],
  ui_toggle: [{ wave: "sine", from: 520, to: 780, dur: 0.06, gain: 0.5 }],
  ui_ready: [
    { wave: "sine", from: 520, to: 520, dur: 0.08, gain: 0.6 },
    { wave: "sine", from: 780, to: 780, at: 0.07, dur: 0.08, gain: 0.6 },
    { wave: "sine", from: 1040, to: 1040, at: 0.14, dur: 0.14, gain: 0.6 },
  ],
  ui_pop: [{ wave: "sine", from: 420, to: 760, dur: 0.07, gain: 0.5 }],
  ui_count: [{ wave: "triangle", from: 880, to: 860, dur: 0.09, gain: 0.7 }],
};

function play(tones: Tone[], pitch: number) {
  if (!context || preferences.sound <= 0) return;
  const c = context;
  for (const t of tones) {
    const start = c.currentTime + (t.at ?? 0),
      dur = t.dur ?? 0.12,
      o = c.createOscillator(),
      g = c.createGain();
    o.type = t.wave;
    o.frequency.setValueAtTime(t.from * pitch, start);
    o.frequency.exponentialRampToValueAtTime(t.to * pitch, start + dur);
    g.gain.setValueAtTime(preferences.sound * 0.065 * (t.gain ?? 1), start);
    g.gain.exponentialRampToValueAtTime(0.001, start + dur + 0.04);
    o.connect(g);
    g.connect(c.destination);
    o.start(start);
    o.stop(start + dur + 0.05);
  }
}

/** Gameplay cue by effect kind. Attack pitch varies by fighter slot. */
export function sound(kind: string, fighterIndex = 0) {
  if (kind === "attack") {
    play([{ wave: "triangle", from: 240 + fighterIndex * 75, to: 80 }], 1);
    return;
  }
  play(CUES[kind] ?? CUES.default, 1);
}

const lastCueAt: Record<string, number> = {};
/**
 * Interface cue. Repeated cues inside `minGapMs` are dropped so sliders and
 * typing never stack into noise.
 */
export function uiCue(kind: string, pitch = 1, minGapMs = 0) {
  const now = performance.now();
  if (minGapMs && now - (lastCueAt[kind] ?? -Infinity) < minGapMs) return;
  lastCueAt[kind] = now;
  play(CUES[kind] ?? CUES.ui_tap, pitch);
}

let musicTimer: ReturnType<typeof setInterval> | null = null,
  note = 0;
export function setMusic(volume: number) {
  preferences.music = volume;
  if (musicTimer) clearInterval(musicTimer);
  musicTimer = null;
  if (!volume) return;
  musicTimer = setInterval(() => {
    if (!context || context.state !== "running") return;
    const c = context,
      o = c.createOscillator(),
      g = c.createGain();
    const notes = [130.81, 164.81, 196, 164.81, 146.83, 174.61, 220, 174.61];
    o.type = "sine";
    o.frequency.value = notes[note++ % notes.length];
    g.gain.setValueAtTime(volume * 0.035, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.4);
    o.connect(g);
    g.connect(c.destination);
    o.start();
    o.stop(c.currentTime + 0.42);
  }, 450);
}
