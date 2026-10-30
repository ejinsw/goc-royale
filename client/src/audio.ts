let context: AudioContext | undefined;
export const preferences = { sound: 0.35, music: 0, shake: true };
export function unlockAudio() {
  context ??= new AudioContext();
  void context.resume();
}
export function sound(kind: string, fighterIndex = 0) {
  if (!context || preferences.sound <= 0) return;
  const c = context,
    o = c.createOscillator(),
    g = c.createGain();
  o.type = kind === "goal" ? "sine" : "triangle";
  o.frequency.setValueAtTime(
    kind === "heal"
      ? 620
      : kind === "goal"
        ? 440
        : kind === "attack"
          ? 240 + fighterIndex * 75
          : 130,
    c.currentTime,
  );
  o.frequency.exponentialRampToValueAtTime(
    kind === "goal" ? 880 : 80,
    c.currentTime + 0.12,
  );
  g.gain.setValueAtTime(preferences.sound * 0.065, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.16);
  o.connect(g);
  g.connect(c.destination);
  o.start();
  o.stop(c.currentTime + 0.17);
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
