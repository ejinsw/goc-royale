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
  // Ministry-leader Super cues (one entry per new effect kind).
  burst: [
    { wave: "triangle", from: 180, to: 70, dur: 0.16 },
    { wave: "sine", from: 660, to: 330, at: 0.02, dur: 0.12, gain: 0.5 },
  ],
  marker: [{ wave: "sine", from: 420, to: 900, dur: 0.18, gain: 0.6 }],
  leap: [{ wave: "triangle", from: 260, to: 620, dur: 0.2, gain: 0.8 }],
  // Attack-kind cues: a post going viral, a beam tell/flash, a lob's
  // throw and its landing.
  split: [
    { wave: "square", from: 900, to: 700, dur: 0.04, gain: 0.35 },
    { wave: "square", from: 1100, to: 800, at: 0.05, dur: 0.05, gain: 0.35 },
    { wave: "square", from: 1300, to: 900, at: 0.1, dur: 0.05, gain: 0.3 },
  ],
  beam: [
    { wave: "sine", from: 1800, to: 2600, dur: 0.06, gain: 0.35 },
    { wave: "sawtooth", from: 3000, to: 400, at: 0.04, dur: 0.12, gain: 0.25 },
  ],
  lob: [{ wave: "sine", from: 300, to: 700, dur: 0.22, gain: 0.55 }],
  splash: [
    { wave: "triangle", from: 160, to: 60, dur: 0.18, gain: 0.95 },
    { wave: "sawtooth", from: 900, to: 300, at: 0.01, dur: 0.08, gain: 0.25 },
  ],
  // Fishers of Men: a reel's ratchet, a splash, and a rising "got one".
  caught: [
    ...[0, 0.04, 0.08, 0.12].map((at) => ({
      wave: "square" as const,
      from: 1300,
      to: 900,
      at,
      dur: 0.025,
      gain: 0.22,
    })),
    { wave: "triangle", from: 200, to: 70, at: 0.16, dur: 0.2, gain: 0.9 },
    { wave: "sine", from: 520, to: 1040, at: 0.22, dur: 0.18, gain: 0.45 },
  ],
  swap: [
    { wave: "sine", from: 500, to: 500, dur: 0.06, gain: 0.6 },
    { wave: "sine", from: 750, to: 750, at: 0.06, dur: 0.08, gain: 0.6 },
  ],
  panda: [{ wave: "sawtooth", from: 150, to: 90, dur: 0.12, gain: 0.45 }],
  mixed_voice: [
    { wave: "sine", from: 360, to: 180, dur: 0.14, gain: 0.7 },
    { wave: "triangle", from: 540, to: 270, dur: 0.14, gain: 0.45 },
  ],
  harmony: [
    { wave: "sine", from: 660, to: 660, dur: 0.11, gain: 0.55 },
    { wave: "sine", from: 990, to: 990, at: 0.02, dur: 0.11, gain: 0.45 },
  ],
  gaze: [{ wave: "triangle", from: 250, to: 110, dur: 0.16, gain: 0.65 }],
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
  // The UCLA Swiper showcase (client/src/arena/swiper.ts): card-reader
  // beeps, a register ka-ching, and the rest of his fanfare.
  swiper_beep: [{ wave: "square", from: 1760, to: 1760, dur: 0.05, gain: 0.3 }],
  swiper_beep3: [0, 0.09, 0.18].map((at) => ({
    wave: "square" as const,
    from: 1760,
    to: 1760,
    at,
    dur: 0.045,
    gain: 0.3,
  })),
  swiper_slash: [
    { wave: "sawtooth", from: 1500, to: 320, dur: 0.07, gain: 0.3 },
    { wave: "sine", from: 2600, to: 1200, dur: 0.05, gain: 0.25 },
  ],
  swiper_stamp: [
    { wave: "triangle", from: 230, to: 90, dur: 0.07, gain: 0.9 },
    { wave: "square", from: 880, to: 880, at: 0.03, dur: 0.04, gain: 0.2 },
  ],
  swiper_boom: [
    { wave: "sine", from: 140, to: 38, dur: 0.32, gain: 1.3 },
    { wave: "triangle", from: 90, to: 40, dur: 0.25, gain: 0.8 },
  ],
  swiper_kaching: [
    { wave: "square", from: 1318, to: 1318, dur: 0.05, gain: 0.28 },
    { wave: "sine", from: 1976, to: 1976, at: 0.07, dur: 0.18, gain: 0.5 },
    { wave: "sine", from: 2637, to: 2637, at: 0.07, dur: 0.22, gain: 0.3 },
  ],
  swiper_ting: [
    { wave: "sine", from: 3136, to: 3136, dur: 0.22, gain: 0.35 },
    { wave: "sine", from: 4186, to: 4186, at: 0.03, dur: 0.2, gain: 0.2 },
  ],
  swiper_declined: [
    { wave: "square", from: 196, to: 185, dur: 0.11, gain: 0.4 },
    { wave: "square", from: 147, to: 139, at: 0.13, dur: 0.16, gain: 0.4 },
  ],
  swiper_heart: [
    { wave: "sine", from: 70, to: 45, dur: 0.09, gain: 1.1 },
    { wave: "sine", from: 62, to: 40, at: 0.2, dur: 0.09, gain: 0.8 },
  ],
  swiper_fanfare: [523, 659, 784, 1047].map((hz, i) => ({
    wave: "triangle" as const,
    from: hz,
    to: hz,
    at: i * 0.09,
    dur: i === 3 ? 0.32 : 0.09,
    gain: 0.6,
  })),
  swiper_sad: [
    { wave: "triangle", from: 392, to: 370, dur: 0.22, gain: 0.6 },
    { wave: "triangle", from: 349, to: 330, at: 0.25, dur: 0.22, gain: 0.6 },
    { wave: "triangle", from: 311, to: 233, at: 0.5, dur: 0.45, gain: 0.6 },
  ],
  swiper_charge: [{ wave: "sawtooth", from: 180, to: 1400, dur: 0.45, gain: 0.3 }],
  swiper_print: [0, 0.05, 0.1, 0.15, 0.2].map((at) => ({
    wave: "square" as const,
    from: 2200,
    to: 2200,
    at,
    dur: 0.015,
    gain: 0.15,
  })),
  swiper_shing: [
    { wave: "sine", from: 1800, to: 5200, dur: 0.16, gain: 0.4 },
    { wave: "square", from: 3000, to: 6000, dur: 0.08, gain: 0.12 },
  ],
  // The cutscene's charge-up: one second of rising whine.
  swiper_whine: [
    { wave: "sawtooth", from: 110, to: 1700, dur: 1, gain: 0.28 },
    { wave: "sine", from: 220, to: 3400, dur: 1, gain: 0.2 },
  ],
  swiper_pop: [{ wave: "sine", from: 500, to: 900, dur: 0.05, gain: 0.35 }],
  // The roster showcase (client/src/arena/roster.ts): one shared vocabulary
  // that every fighter's theme picks from by name, with a pitch per fighter.
  show_pop: [{ wave: "sine", from: 480, to: 960, dur: 0.06, gain: 0.4 }],
  show_whoosh: [
    { wave: "sawtooth", from: 900, to: 180, dur: 0.14, gain: 0.18 },
    { wave: "sine", from: 600, to: 200, dur: 0.12, gain: 0.25 },
  ],
  show_thud: [
    { wave: "sine", from: 120, to: 40, dur: 0.2, gain: 1.2 },
    { wave: "triangle", from: 300, to: 90, dur: 0.06, gain: 0.5 },
  ],
  show_boom: [
    { wave: "sine", from: 150, to: 35, dur: 0.36, gain: 1.3 },
    { wave: "sawtooth", from: 400, to: 60, dur: 0.18, gain: 0.3 },
  ],
  show_chime: [
    { wave: "sine", from: 1318, to: 1318, dur: 0.16, gain: 0.4 },
    { wave: "sine", from: 1976, to: 1976, at: 0.05, dur: 0.22, gain: 0.3 },
  ],
  show_sparkle: [0, 0.04, 0.08].map((at, i) => ({
    wave: "sine" as const,
    from: 2400 + i * 500,
    to: 2600 + i * 500,
    at,
    dur: 0.08,
    gain: 0.22,
  })),
  show_rise: [{ wave: "sawtooth", from: 200, to: 1200, dur: 0.4, gain: 0.25 }],
  show_sad: [
    { wave: "triangle", from: 440, to: 415, dur: 0.18, gain: 0.55 },
    { wave: "triangle", from: 392, to: 370, at: 0.2, dur: 0.18, gain: 0.55 },
    { wave: "triangle", from: 330, to: 247, at: 0.4, dur: 0.4, gain: 0.55 },
  ],
  show_fanfare: [392, 523, 659, 784].map((hz, i) => ({
    wave: "triangle" as const,
    from: hz,
    to: hz,
    at: i * 0.08,
    dur: i === 3 ? 0.3 : 0.08,
    gain: 0.55,
  })),
  show_honk: [
    { wave: "square", from: 330, to: 320, dur: 0.12, gain: 0.35 },
    { wave: "square", from: 415, to: 405, dur: 0.12, gain: 0.25 },
    { wave: "square", from: 330, to: 320, at: 0.16, dur: 0.18, gain: 0.35 },
    { wave: "square", from: 415, to: 405, at: 0.16, dur: 0.18, gain: 0.25 },
  ],
  show_jingle: [0, 0.03, 0.07, 0.1].map((at, i) => ({
    wave: "triangle" as const,
    from: 2600 + (i % 2) * 700,
    to: 2400 + (i % 2) * 700,
    at,
    dur: 0.05,
    gain: 0.2,
  })),
  show_shutter: [
    { wave: "square", from: 2200, to: 1800, dur: 0.02, gain: 0.35 },
    { wave: "square", from: 1400, to: 900, at: 0.05, dur: 0.03, gain: 0.35 },
  ],
  show_flash: [{ wave: "sine", from: 1200, to: 5200, dur: 0.18, gain: 0.3 }],
  show_crunch: [0, 0.03, 0.06, 0.1].map((at, i) => ({
    wave: "sawtooth" as const,
    from: 700 - i * 90,
    to: 160,
    at,
    dur: 0.03,
    gain: 0.3,
  })),
  show_feedback: [
    { wave: "square", from: 2900, to: 3100, dur: 0.22, gain: 0.12 },
    { wave: "sawtooth", from: 90, to: 60, dur: 0.22, gain: 0.5 },
  ],
  show_glitch: [0, 0.03, 0.05, 0.09].map((at, i) => ({
    wave: "square" as const,
    from: [880, 220, 1760, 440][i],
    to: [880, 220, 1760, 440][i],
    at,
    dur: 0.025,
    gain: 0.22,
  })),
  show_rewind: [{ wave: "sawtooth", from: 1600, to: 200, dur: 0.35, gain: 0.25 }],
  show_strum: [196, 247, 294, 392].map((hz, i) => ({
    wave: "triangle" as const,
    from: hz,
    to: hz * 0.99,
    at: i * 0.018,
    dur: 0.35,
    gain: 0.4,
  })),
  show_hum: [
    { wave: "sine", from: 392, to: 400, dur: 0.3, gain: 0.45 },
    { wave: "sine", from: 588, to: 594, dur: 0.3, gain: 0.3 },
  ],
  show_reel: [0, 0.04, 0.08, 0.12, 0.16].map((at) => ({
    wave: "square" as const,
    from: 1300,
    to: 1100,
    at,
    dur: 0.02,
    gain: 0.15,
  })),
  show_splash: [
    { wave: "sawtooth", from: 1800, to: 200, dur: 0.2, gain: 0.2 },
    { wave: "sine", from: 260, to: 90, dur: 0.18, gain: 0.6 },
  ],
  show_clack: [0, 0.09, 0.18].map((at) => ({
    wave: "square" as const,
    from: 700,
    to: 250,
    at,
    dur: 0.03,
    gain: 0.35,
  })),
  show_bonk: [
    { wave: "triangle", from: 520, to: 180, dur: 0.1, gain: 0.9 },
    { wave: "sine", from: 1400, to: 900, dur: 0.06, gain: 0.25 },
  ],
  show_ding: [
    { wave: "sine", from: 1568, to: 1568, dur: 0.12, gain: 0.35 },
    { wave: "sine", from: 2093, to: 2093, at: 0.08, dur: 0.18, gain: 0.3 },
  ],
  show_flutter: [0, 0.05, 0.1, 0.15].map((at) => ({
    wave: "sine" as const,
    from: 900,
    to: 600,
    at,
    dur: 0.035,
    gain: 0.2,
  })),
  show_choir: [262, 330, 392].map((hz) => ({
    wave: "sine" as const,
    from: hz,
    to: hz * 1.01,
    dur: 0.55,
    gain: 0.35,
  })),
  show_coin: [
    { wave: "square", from: 988, to: 988, dur: 0.06, gain: 0.25 },
    { wave: "square", from: 1319, to: 1319, at: 0.06, dur: 0.2, gain: 0.25 },
  ],
  show_whistle: [{ wave: "sine", from: 1400, to: 2100, dur: 0.16, gain: 0.3 }],
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

/**
 * Gameplay cue by effect kind. Attack pitch varies by fighter slot: the
 * first seven keep their original pitches, later slots cycle through the
 * same range offset by a third step so the cue never climbs into a squeal.
 */
export function sound(kind: string, fighterIndex = 0) {
  if (kind === "attack") {
    const pitch = 240 + (fighterIndex % 7) * 75 + Math.floor(fighterIndex / 7) * 25;
    play([{ wave: "triangle", from: pitch, to: 80 }], 1);
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
