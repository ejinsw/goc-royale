import type { FighterId } from "../../../shared/definitions";

/**
 * Arena presentation layer (performance standard §3, §7): the procedural
 * rig's pose layout and every fighter's one-shot clip styles.
 *
 * The clip set is the same for everyone (standard §7.1); how each clip
 * moves is a per-fighter choice from one style library, made in `MOTION`.
 * Adding a fighter is a table row, not new clip code. Styles never read
 * gameplay state: they map clip time to a pose, nothing else.
 *
 * Signs: negative x rotation swings a limb forward, positive x leans the
 * torso forward, the prop arm is armR, positive z lifts armR out to the
 * side and negative z lifts armL. ROOT_Y lifts the whole body, SQUASH
 * stretches it (negative squats), TORSO_SQUASH puffs the chest.
 */

export const B = {
  root: 0,
  hips: 1,
  torso: 2,
  head: 3,
  armL: 4,
  armR: 5,
  legL: 6,
  legR: 7,
  extra: 8,
} as const;
export const BONE_COUNT = 9;
/** Pose layout: three Euler angles per bone, then three scalars. */
export const ROOT_Y = BONE_COUNT * 3;
export const SQUASH = ROOT_Y + 1;
export const TORSO_SQUASH = ROOT_Y + 2;
export const POSE_SIZE = ROOT_Y + 3;

export type Hold = { x: number; z: number };
/** A clip style: writes a pose over the rest pose at time `t` of `d`. */
export type ClipFn = (t: number, p: Float32Array, hold: Hold, d: number) => void;

export const TAU = Math.PI * 2;
export const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
export const ease = (t: number) =>
  t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
export const easeOut = (t: number) => 1 - (1 - t) ** 3;
const easeIn = (t: number) => t * t * t;
/** 0..1 progress of `n` through the span [a, b]. */
const seg = (n: number, a: number, b: number) =>
  Math.max(0, Math.min(1, (n - a) / (b - a)));
/** A bump that rises over [a, peak] and settles by b. */
const bump = (n: number, a: number, peak: number, b: number) =>
  n < peak ? easeOut(seg(n, a, peak)) : 1 - ease(seg(n, peak, b));
/** A damped wobble starting at `a` (for landings and recoils). */
const wobble = (n: number, a: number, rate = 26, decay = 9) =>
  n < a ? 0 : Math.exp(-(n - a) * decay) * Math.sin((n - a) * rate);

export const set = (
  p: Float32Array,
  bone: number,
  x: number,
  y: number,
  z: number,
) => {
  p[bone * 3] = x;
  p[bone * 3 + 1] = y;
  p[bone * 3 + 2] = z;
};
const add = (p: Float32Array, bone: number, x: number, y: number, z: number) => {
  p[bone * 3] += x;
  p[bone * 3 + 1] += y;
  p[bone * 3 + 2] += z;
};
/** Prop arm: blend from the carry pose toward (x, z). */
const armR = (p: Float32Array, hold: Hold, x: number, z: number, k: number, y = 0) =>
  set(p, B.armR, lerp(hold.x, x, k), y * k, lerp(hold.z, z, k));
const armL = (p: Float32Array, x: number, z: number, k: number, y = 0) =>
  set(p, B.armL, x * k, y * k, lerp(-0.22, z, k));
/** Three-beat shape: anticipation to `a`, release to `b`, recovery after. */
const beats = (n: number, a: number, b: number) => ({
  wind: n < a ? ease(n / a) : n < b ? 1 - easeOut(seg(n, a, b)) : 0,
  hit: n < a ? 0 : n < b ? easeOut(seg(n, a, b)) : 1 - ease(seg(n, b, 1)),
});

// ------------------------------------------------------------------ attacks

const ATTACK: Record<string, ClipFn> = {
  /** The original overhand throw. */
  overhand(t, p, hold, d) {
    const n = t / d;
    if (n < 0.3) {
      const k = ease(n / 0.3);
      set(p, B.armR, lerp(hold.x, 0.9, k), 0, lerp(hold.z, 0.5, k));
      p[B.torso * 3 + 1] = 0.35 * k;
    } else if (n < 0.55) {
      const k = easeOut((n - 0.3) / 0.25);
      set(p, B.armR, lerp(0.9, -1.9, k), 0, lerp(0.5, 0.15, k));
      p[B.torso * 3 + 1] = lerp(0.35, -0.3, k);
      p[B.armL * 3] = 0.35 * k;
    } else {
      const k = ease((n - 0.55) / 0.45);
      set(p, B.armR, lerp(-1.9, hold.x, k), 0, lerp(0.15, hold.z, k));
      p[B.torso * 3 + 1] = lerp(-0.3, 0, k);
      p[B.armL * 3] = lerp(0.35, 0, k);
    }
  },
  /** A backhand frisbee flick: across the chest, then out wide. */
  frisbee(t, p, hold, d) {
    const n = t / d,
      { wind, hit } = beats(n, 0.38, 0.6);
    p[B.torso * 3 + 1] = 0.7 * wind - 0.55 * hit;
    p[B.head * 3 + 1] = -0.3 * wind + 0.2 * hit;
    armR(p, hold, -1.2 * wind - 1.35 * hit, -0.55 * wind + 1.5 * hit, Math.max(wind, hit));
    armL(p, 0.4 * hit, -0.7, Math.max(wind, hit));
    p[SQUASH] = -0.05 * wind + 0.03 * hit;
  },
  /** Jingle the keys twice, then fling them. */
  fling(t, p, hold, d) {
    const n = t / d;
    const shake = n < 0.35 ? Math.sin(n * 60) * 0.25 * seg(n, 0, 0.1) : 0;
    const { wind, hit } = beats(n, 0.42, 0.62);
    armR(p, hold, -1.5 * wind + shake - 1.9 * hit, 0.4 * wind + 0.2 * hit, Math.max(wind, hit, n < 0.42 ? 1 : 0));
    p[B.torso * 3 + 1] = 0.3 * wind - 0.35 * hit;
    p[B.torso * 3] = 0.25 * hit;
    p[B.head * 3 + 2] = shake * 0.4;
  },
  /** Raise the camera to the eye, hold focus, a flash kicks it up. */
  aim(t, p, hold, d) {
    const n = t / d;
    const up = n < 0.25 ? easeOut(n / 0.25) : n < 0.8 ? 1 : 1 - ease(seg(n, 0.8, 1));
    const kick = bump(n, 0.4, 0.46, 0.7);
    armR(p, hold, -1.55 - 0.45 * kick, 0.12, up);
    armL(p, -1.35 - 0.3 * kick, 0.45, up);
    p[B.head * 3] = 0.08 * up - 0.25 * kick;
    p[B.torso * 3] = 0.12 * up - 0.22 * kick;
    p[B.torso * 3 + 1] = -0.15 * up;
    p[SQUASH] = -0.04 * up + 0.04 * kick;
  },
  /** Crouch and lob underhand, a little hop on the release. */
  underhand(t, p, hold, d) {
    const n = t / d,
      { wind, hit } = beats(n, 0.4, 0.62);
    armR(p, hold, 1.0 * wind - 2.3 * hit, 0.25, Math.max(wind, hit));
    armL(p, -0.6 * hit + 0.3 * wind, -0.5, Math.max(wind, hit));
    p[B.torso * 3] = 0.35 * wind - 0.2 * hit;
    p[B.head * 3] = -0.15 * hit;
    p[SQUASH] = -0.12 * wind + 0.06 * hit;
    p[ROOT_Y] = 0.1 * bump(n, 0.45, 0.58, 0.85);
    set(p, B.legL, -0.35 * wind, 0, 0);
    set(p, B.legR, 0.25 * wind, 0, 0);
  },
  /** Lean back and breathe in, then thrust the speaker forward with a shout. */
  shout(t, p, hold, d) {
    const n = t / d,
      { wind, hit } = beats(n, 0.35, 0.55);
    const buzz = n > 0.35 && n < 0.8 ? Math.sin(n * 140) * 0.05 : 0;
    p[B.torso * 3] = -0.32 * wind + 0.38 * hit + buzz;
    p[B.head * 3] = -0.35 * wind + 0.2 * hit;
    p[TORSO_SQUASH] = 0.1 * wind - 0.08 * hit;
    armR(p, hold, -0.5 * wind - 1.55 * hit, 0.3, Math.max(wind, hit));
    armL(p, -0.3 * hit, -0.4 * wind - 1.25 * hit, Math.max(wind, hit));
    p[SQUASH] = 0.04 * wind - 0.06 * hit;
  },
  /** Hammer the enter key, then shove the bug out of the laptop. */
  type(t, p, hold, d) {
    const n = t / d;
    const tap = n < 0.4 ? Math.abs(Math.sin(n * 40)) : 0;
    const { hit } = beats(n, 0.4, 0.58);
    const on = n < 0.85 ? seg(n, 0, 0.12) : 1 - seg(n, 0.85, 1);
    armR(p, hold, -1.05 - 0.6 * hit, 0.2, on);
    armL(p, -1.0 + 0.35 * tap - 0.5 * hit, 0.35, on);
    p[B.head * 3] = 0.3 * on - 0.25 * hit;
    p[B.torso * 3] = 0.15 * on + 0.15 * hit;
    p[B.head * 3 + 2] = 0.12 * Math.sin(n * 70) * hit;
  },
  /** Two hard down-strokes on the guitar, head banging. */
  strum(t, p, hold, d) {
    const n = t / d;
    const s1 = bump(n, 0.15, 0.25, 0.45),
      s2 = bump(n, 0.4, 0.5, 0.75);
    const on = n < 0.85 ? seg(n, 0, 0.12) : 1 - seg(n, 0.85, 1);
    armR(p, hold, -0.7 + 0.25 * (s1 + s2), -0.6 + 0.9 * (s1 + s2), on);
    armL(p, -0.95, -0.95, on);
    p[B.head * 3] = 0.3 * (s1 + s2) - 0.1 * on;
    p[B.torso * 3] = -0.15 * on + 0.12 * (s1 + s2);
    p[B.torso * 3 + 1] = 0.2 * on;
    p[SQUASH] = -0.05 * (s1 + s2);
  },
  /** Mic to the lips, chest up, free arm opens on the high note. */
  sing(t, p, hold, d) {
    const n = t / d;
    const up = n < 0.2 ? easeOut(n / 0.2) : n < 0.8 ? 1 : 1 - ease(seg(n, 0.8, 1));
    const belt = bump(n, 0.3, 0.5, 0.85);
    const vib = Math.sin(n * 90) * 0.04 * belt;
    armR(p, hold, -1.75, 0.65, up);
    armL(p, -0.7 * belt, -0.4 - 1.1 * belt, up);
    p[B.head * 3] = -0.3 * belt + vib;
    p[TORSO_SQUASH] = 0.09 * belt;
    p[B.torso * 3] = -0.15 * belt;
    p[SQUASH] = 0.04 * belt;
  },
  /** An overhead fishing cast: rod back over the shoulder, then whip. */
  cast(t, p, hold, d) {
    const n = t / d,
      { wind, hit } = beats(n, 0.45, 0.6);
    armR(p, hold, -2.75 * wind - 0.75 * hit, 0.25, Math.max(wind, hit));
    armL(p, -0.9 * Math.max(wind, hit), -0.3, 1);
    p[B.torso * 3] = -0.22 * wind + 0.32 * hit;
    p[B.torso * 3 + 1] = 0.25 * wind - 0.15 * hit;
    p[SQUASH] = -0.04 * hit;
    set(p, B.legL, -0.3 * hit, 0, 0);
  },
  /** Three stapler punches with a recoil each. */
  staple(t, p, hold, d) {
    const n = t / d;
    const on = n < 0.8 ? seg(n, 0, 0.15) : 1 - seg(n, 0.8, 1);
    let kick = 0;
    for (const at of [0.18, 0.38, 0.58]) kick += bump(n, at, at + 0.04, at + 0.16);
    armR(p, hold, -1.55 + 0.35 * kick, 0.15, on);
    armL(p, -1.3 + 0.2 * kick, 0.4, on);
    p[B.torso * 3] = 0.12 * on - 0.08 * kick;
    p[B.head * 3] = 0.1 * on;
    p[SQUASH] = -0.04 * on;
  },
  /** The ladle: a big momentum sweep with the legs planted. */
  sweep(t, p, hold, d) {
    const n = Math.min(1, t / d);
    const twist =
      n < 0.32
        ? lerp(0, 1.1, ease(n / 0.32))
        : n < 0.62
          ? lerp(1.1, -1.25, easeOut((n - 0.32) / 0.3))
          : lerp(-1.25, 0, ease((n - 0.62) / 0.38));
    const arc = Math.sin(Math.PI * n);
    p[B.torso * 3 + 1] = twist;
    p[B.head * 3 + 1] = -twist * 0.3;
    p[B.torso * 3] = 0.22 * arc;
    set(p, B.armR, lerp(hold.x, -1.1, arc), -twist * 0.35, lerp(hold.z, 1.0, arc));
    set(p, B.armL, -0.75 * arc, 0, -0.22 - 0.4 * arc);
    p[SQUASH] = -0.1 * arc;
    set(p, B.legL, -0.35 * arc, 0, -0.1 * arc);
    set(p, B.legR, 0.3 * arc, 0, 0.1 * arc);
  },
  /** Arms open wide, then roll a welcome wave forward. */
  wave(t, p, hold, d) {
    const n = t / d,
      { wind, hit } = beats(n, 0.35, 0.6);
    const k = Math.max(wind, hit);
    armR(p, hold, 0.35 * wind - 1.45 * hit, 1.35 * wind + 0.35 * hit, k);
    armL(p, 0.35 * wind - 1.45 * hit, -1.35 * wind - 0.35 * hit, k);
    p[B.torso * 3] = -0.15 * wind + 0.25 * hit;
    p[B.head * 3 + 2] = 0.2 * wind;
    p[TORSO_SQUASH] = 0.07 * wind;
  },
  /** A full-body sidearm spin throw. */
  sidearm(t, p, hold, d) {
    const n = t / d,
      { wind, hit } = beats(n, 0.38, 0.6);
    p[B.torso * 3 + 1] = 1.05 * wind - 1.25 * hit;
    p[B.head * 3 + 1] = -0.4 * wind + 0.3 * hit;
    armR(p, hold, -0.55, 1.45, Math.max(wind, hit), -0.4 * hit);
    armL(p, 0, -0.9, Math.max(wind, hit));
    p[SQUASH] = -0.07 * wind;
    p[B.root * 3 + 1] = 0.25 * hit;
  },
  /** Thumb-tap the phone twice, then flick it up to post. */
  post(t, p, hold, d) {
    const n = t / d;
    const on = n < 0.85 ? seg(n, 0, 0.15) : 1 - seg(n, 0.85, 1);
    const tap = n < 0.45 ? Math.abs(Math.sin(n * 34)) : 0;
    const flick = bump(n, 0.45, 0.58, 0.9);
    armR(p, hold, -1.3 - 1.1 * flick, 0.3 + 0.2 * flick, on);
    armL(p, -1.1 + 0.25 * tap, 0.35, on * (1 - flick));
    p[B.head * 3] = 0.25 * on * (1 - flick) - 0.3 * flick;
    p[B.torso * 3] = -0.1 * flick;
    p[SQUASH] = 0.05 * flick;
  },
  /** A light paper-plane dart: hand by the ear, then a soft extension. */
  dart(t, p, hold, d) {
    const n = t / d,
      { wind, hit } = beats(n, 0.4, 0.62);
    armR(p, hold, -2.5 * wind - 1.45 * hit, 0.35, Math.max(wind, hit));
    armL(p, -0.6 * wind, -0.6, Math.max(wind, hit));
    p[B.torso * 3] = -0.12 * wind + 0.2 * hit;
    p[B.head * 3] = -0.1 * hit;
    p[SQUASH] = 0.03 * hit;
    set(p, B.legR, 0.35 * hit, 0, 0);
  },
  /** Cupped hands open upward and set the dove free. */
  release(t, p, hold, d) {
    const n = t / d;
    const cup = n < 0.35 ? easeOut(n / 0.35) : 1 - seg(n, 0.45, 0.6);
    const open = bump(n, 0.4, 0.58, 1);
    armR(p, hold, -1.15 * cup - 2.2 * open, 0.12 * cup + 0.9 * open, Math.max(cup, open));
    armL(p, -1.15 * cup - 2.2 * open, -0.12 * cup - 0.9 * open, Math.max(cup, open));
    p[B.head * 3] = 0.2 * cup - 0.35 * open;
    p[ROOT_Y] = 0.06 * open;
    p[SQUASH] = 0.04 * open;
  },
  /** Lantern overhead, then light radiates out: arms burst open. */
  radiate(t, p, hold, d) {
    const n = t / d;
    const lift = n < 0.35 ? easeOut(n / 0.35) : 1 - ease(seg(n, 0.7, 1));
    const flare = bump(n, 0.35, 0.45, 0.8);
    armR(p, hold, -2.65, 0.3 + 0.6 * flare, lift);
    armL(p, -0.4 * flare, -0.6 - 1.2 * flare, lift);
    p[TORSO_SQUASH] = 0.12 * flare;
    p[SQUASH] = 0.05 * flare - 0.04 * (lift - flare);
    p[B.head * 3] = -0.3 * lift;
  },
  /** Thumb-flick a coin, then point after it. */
  flip(t, p, hold, d) {
    const n = t / d;
    const flick = bump(n, 0.25, 0.32, 0.5);
    const point = bump(n, 0.42, 0.55, 1);
    const on = Math.max(seg(n, 0, 0.2) * (1 - seg(n, 0.42, 0.55)), point);
    armR(p, hold, -1.0 - 0.6 * flick - 0.65 * point, 0.15, on);
    p[B.head * 3] = -0.3 * flick;
    p[B.torso * 3 + 1] = -0.25 * point;
    p[SQUASH] = 0.04 * flick;
  },
};

// ------------------------------------------------------------------- supers

const SUPER: Record<string, ClipFn> = {
  /** The original: arms up, then thrust down and forward. */
  raise(t, p, hold, d) {
    const n = t / d;
    if (n < 0.4) {
      const k = ease(n / 0.4);
      set(p, B.armL, 0, 0, lerp(-0.22, -2.7, k));
      set(p, B.armR, lerp(hold.x, -0.15, k), 0, lerp(hold.z, 2.7, k));
      p[TORSO_SQUASH] = 0.08 * k;
      p[B.head * 3] = -0.3 * k;
    } else if (n < 0.6) {
      const k = easeOut((n - 0.4) / 0.2);
      set(p, B.armL, -1.5 * k, 0, lerp(-2.7, -0.5, k));
      set(p, B.armR, lerp(-0.15, -1.5, k), 0, lerp(2.7, 0.5, k));
      p[TORSO_SQUASH] = lerp(0.08, -0.12, k);
      p[B.torso * 3] = 0.3 * k;
      p[B.head * 3] = lerp(-0.3, 0.1, k);
    } else {
      const k = ease((n - 0.6) / 0.4);
      set(p, B.armL, lerp(-1.5, 0, k), 0, lerp(-0.5, -0.22, k));
      set(p, B.armR, lerp(-1.5, hold.x, k), 0, lerp(0.5, hold.z, k));
      p[TORSO_SQUASH] = lerp(-0.12, 0, k);
      p[B.torso * 3] = lerp(0.3, 0, k);
      p[B.head * 3] = lerp(0.1, 0, k);
    }
  },
  /** Arms thrown wide in welcome, then a gesture to the spot. */
  welcome(t, p, hold, d) {
    const n = t / d;
    const open = bump(n, 0, 0.35, 0.65);
    const point = bump(n, 0.5, 0.65, 1);
    armL(p, -0.3 * open, -1.7 * open - 0.3, Math.max(open, point));
    armR(p, hold, -0.3 * open - 1.5 * point, 1.7 * open + 0.1 * point, Math.max(open, point));
    p[B.head * 3 + 2] = 0.25 * open;
    p[TORSO_SQUASH] = 0.1 * open;
    p[ROOT_Y] = 0.12 * bump(n, 0.15, 0.3, 0.5);
    p[B.torso * 3] = 0.2 * point;
  },
  /** Grip the wheel, lean in and floor it. */
  charge(t, p, hold, d) {
    const n = t / d;
    const grip = n < 0.3 ? easeOut(n / 0.3) : n < 0.85 ? 1 : 1 - seg(n, 0.85, 1);
    const shake = Math.sin(n * 80) * 0.04 * seg(n, 0.3, 0.4);
    armR(p, hold, -1.35, 0.35, grip);
    armL(p, -1.35, -0.35, grip);
    p[B.torso * 3] = 0.42 * grip + shake;
    p[B.head * 3] = -0.2 * grip;
    p[SQUASH] = -0.14 * grip;
    set(p, B.legL, -0.6 * grip, 0, 0);
    set(p, B.legR, 0.35 * grip, 0, 0);
  },
  /** Frame the shot with both hands, then click. */
  frame(t, p, hold, d) {
    const n = t / d;
    const frame = n < 0.3 ? easeOut(n / 0.3) : 1 - seg(n, 0.45, 0.6);
    const shoot = bump(n, 0.45, 0.6, 1);
    const click = bump(n, 0.62, 0.66, 0.8);
    armL(p, -1.6 * frame - 1.5 * shoot, -0.7 * frame + 0.4 * shoot, Math.max(frame, shoot));
    armR(p, hold, -1.6 * frame - 1.55 * shoot - 0.4 * click, 0.7 * frame + 0.1 * shoot, Math.max(frame, shoot));
    p[B.head * 3 + 2] = 0.25 * frame;
    p[B.torso * 3] = 0.2 * frame - 0.2 * click;
    p[SQUASH] = -0.1 * frame + 0.05 * click;
  },
  /** Heave something heavy down in front: a table, a barrier. */
  setup(t, p, hold, d) {
    const n = t / d;
    const lift = bump(n, 0, 0.35, 0.6);
    const drop = bump(n, 0.45, 0.6, 1);
    armL(p, -1.3 * lift - 0.7 * drop, 0.3, Math.max(lift, drop));
    armR(p, hold, -1.3 * lift - 0.7 * drop, -0.3, Math.max(lift, drop));
    p[B.torso * 3] = -0.15 * lift + 0.5 * drop;
    p[SQUASH] = 0.05 * lift - 0.2 * drop;
    p[ROOT_Y] = 0.1 * lift;
    set(p, B.legL, -0.5 * drop, 0, 0);
    set(p, B.legR, 0.3 * drop, 0, 0);
  },
  /** Wind all the way back, then blast with both arms; braced legs. */
  blast(t, p, hold, d) {
    const n = t / d;
    const back = n < 0.4 ? ease(n / 0.4) : 1 - easeOut(seg(n, 0.4, 0.55));
    const out = n < 0.4 ? 0 : n < 0.55 ? easeOut(seg(n, 0.4, 0.55)) : 1 - ease(seg(n, 0.7, 1));
    const buzz = Math.sin(n * 160) * 0.06 * out;
    p[B.torso * 3] = -0.4 * back + 0.35 * out + buzz;
    p[B.head * 3] = -0.4 * back + 0.25 * out;
    armR(p, hold, 0.6 * back - 1.6 * out, 0.5, Math.max(back, out));
    armL(p, 0.6 * back - 1.6 * out, -0.5, Math.max(back, out));
    p[TORSO_SQUASH] = 0.14 * back - 0.1 * out;
    p[SQUASH] = -0.12 * out;
    set(p, B.legL, -0.55 * out, 0, -0.15 * out);
    set(p, B.legR, 0.4 * out, 0, 0.15 * out);
  },
  /** Arms wind backward in circles while the body spins in reverse. */
  rewind(t, p, hold, d) {
    const n = t / d;
    const on = n < 0.85 ? seg(n, 0, 0.1) : 1 - seg(n, 0.85, 1);
    const turn = -TAU * easeOut(seg(n, 0.05, 0.75));
    p[B.root * 3 + 1] = turn;
    const wind = n * TAU * 3;
    set(p, B.armL, Math.sin(wind) * 1.5 * on, 0, -0.9 * on);
    set(p, B.armR, Math.sin(wind + Math.PI) * 1.5 * on, 0, 0.9 * on);
    p[B.head * 3 + 2] = Math.sin(n * 60) * 0.1 * on;
    p[ROOT_Y] = 0.15 * bump(n, 0.1, 0.4, 0.8);
  },
  /** Guitar raised overhead: the aura gathers. */
  aura(t, p, hold, d) {
    const n = t / d;
    const up = n < 0.35 ? easeOut(n / 0.35) : 1 - ease(seg(n, 0.75, 1));
    const shred = Math.sin(n * 70) * 0.15 * seg(n, 0.35, 0.45) * up;
    armR(p, hold, -2.6, 0.3 + shred, up);
    armL(p, -2.6, -0.3, up);
    p[B.head * 3] = -0.45 * up;
    p[TORSO_SQUASH] = 0.12 * up;
    p[ROOT_Y] = 0.2 * up;
    p[SQUASH] = 0.06 * up;
  },
  /** Arms crossed, a slow lean, then the head snaps sideways. */
  glare(t, p, hold, d) {
    const n = t / d;
    const cross = n < 0.25 ? easeOut(n / 0.25) : 1 - ease(seg(n, 0.8, 1));
    const snap = n < 0.4 ? 0 : n < 0.47 ? easeOut(seg(n, 0.4, 0.47)) : 1 - ease(seg(n, 0.8, 1));
    set(p, B.armL, -1.25 * cross, 0, lerp(-0.22, 0.85, cross));
    set(p, B.armR, lerp(hold.x, -1.25, cross), 0, lerp(hold.z, -0.85, cross));
    p[B.head * 3 + 1] = 0.85 * snap;
    p[B.head * 3] = 0.12 * snap;
    p[B.torso * 3 + 1] = -0.2 * cross + 0.15 * snap;
    p[B.root * 3 + 2] = 0.08 * cross;
  },
  /** Spin up and throw the net overhead with both hands. */
  net(t, p, hold, d) {
    const n = t / d;
    const spin = n < 0.45 ? ease(n / 0.45) : 1 - easeOut(seg(n, 0.45, 0.6));
    const toss = bump(n, 0.45, 0.6, 1);
    p[B.torso * 3 + 1] = 1.2 * spin - 0.4 * toss;
    armR(p, hold, -2.4 * spin - 1.2 * toss, 0.6, Math.max(spin, toss));
    armL(p, -2.4 * spin - 1.2 * toss, -0.6, Math.max(spin, toss));
    p[B.torso * 3] = -0.2 * spin + 0.35 * toss;
    p[SQUASH] = -0.08 * spin + 0.04 * toss;
  },
  /** Kneel and sweep both arms up from the ground: something big arrives. */
  summon(t, p, hold, d) {
    const n = t / d;
    const low = n < 0.3 ? easeOut(n / 0.3) : 1 - ease(seg(n, 0.3, 0.6));
    const rise = bump(n, 0.3, 0.6, 1);
    armL(p, 0.7 * low - 2.5 * rise, -0.4 - 0.8 * rise, Math.max(low, rise));
    armR(p, hold, 0.7 * low - 2.5 * rise, 0.4 + 0.8 * rise, Math.max(low, rise));
    p[B.torso * 3] = 0.45 * low - 0.15 * rise;
    p[B.head * 3] = 0.3 * low - 0.4 * rise;
    p[SQUASH] = -0.22 * low + 0.06 * rise;
    p[ROOT_Y] = 0.12 * rise;
    set(p, B.legL, -0.9 * low, 0, 0);
  },
  /** A dramatic point forward, the other hand on the hip. */
  point(t, p, hold, d) {
    const n = t / d;
    const k = n < 0.25 ? easeOut(n / 0.25) : 1 - ease(seg(n, 0.75, 1));
    const jab = wobble(n, 0.25, 40, 10) * 0.15;
    armR(p, hold, -1.6 + jab, 0.05, k);
    set(p, B.armL, 0.3 * k, 0, lerp(-0.22, -0.95, k));
    p[B.torso * 3] = 0.2 * k;
    p[B.torso * 3 + 1] = -0.35 * k;
    p[B.head * 3 + 1] = -0.2 * k;
  },
  /** Two-handed overhead heave. */
  heave(t, p, hold, d) {
    const n = t / d,
      { wind, hit } = beats(n, 0.42, 0.62);
    armR(p, hold, -2.8 * wind - 1.2 * hit, 0.3, Math.max(wind, hit));
    armL(p, -2.8 * wind - 1.2 * hit, -0.3, Math.max(wind, hit));
    p[B.torso * 3] = -0.3 * wind + 0.4 * hit;
    p[SQUASH] = -0.08 * wind + 0.08 * hit;
    p[ROOT_Y] = 0.15 * bump(n, 0.45, 0.6, 0.85);
  },
  /** Hands clasped at the heart, then thrown wide and high. */
  hug(t, p, hold, d) {
    const n = t / d;
    const clasp = n < 0.3 ? easeOut(n / 0.3) : 1 - seg(n, 0.4, 0.55);
    const wide = bump(n, 0.4, 0.6, 1);
    armL(p, -1.2 * clasp - 0.4 * wide, -0.1 * clasp - 2.2 * wide, Math.max(clasp, wide));
    armR(p, hold, -1.2 * clasp - 0.4 * wide, 0.1 * clasp + 2.2 * wide, Math.max(clasp, wide));
    p[B.head * 3] = 0.2 * clasp - 0.35 * wide;
    p[TORSO_SQUASH] = -0.06 * clasp + 0.1 * wide;
    p[ROOT_Y] = 0.15 * wide;
  },
  /** Hands pressed together, head bowed; then palms push out: be still. */
  still(t, p, hold, d) {
    const n = t / d;
    const pray = n < 0.3 ? easeOut(n / 0.3) : 1 - seg(n, 0.45, 0.6);
    const push = bump(n, 0.45, 0.6, 1);
    armL(p, -1.3 * pray - 1.5 * push, 0.28 * pray - 1.0 * push, Math.max(pray, push));
    armR(p, hold, -1.3 * pray - 1.5 * push, -0.28 * pray + 1.0 * push, Math.max(pray, push));
    p[B.head * 3] = 0.4 * pray - 0.1 * push;
    p[B.torso * 3] = 0.15 * pray;
    p[SQUASH] = -0.05 * pray + 0.03 * push;
  },
  /** Bow in prayer, then raise the lantern and spread a covering. */
  cover(t, p, hold, d) {
    const n = t / d;
    const pray = n < 0.3 ? easeOut(n / 0.3) : 1 - seg(n, 0.4, 0.55);
    const lift = bump(n, 0.4, 0.6, 1);
    armL(p, -1.3 * pray - 0.5 * lift, 0.25 * pray - 1.9 * lift, Math.max(pray, lift));
    armR(p, hold, -1.3 * pray - 2.6 * lift, -0.25 * pray + 0.4 * lift, Math.max(pray, lift));
    p[B.head * 3] = 0.4 * pray - 0.35 * lift;
    p[TORSO_SQUASH] = 0.12 * lift;
    p[ROOT_Y] = 0.12 * lift;
  },
  /** Scissor both arms down: budget cuts. */
  cuts(t, p, hold, d) {
    const n = t / d,
      { wind, hit } = beats(n, 0.4, 0.55);
    armL(p, -2.6 * wind + 0.3 * hit, -0.5 * wind + 0.7 * hit, Math.max(wind, hit));
    armR(p, hold, -2.6 * wind + 0.3 * hit, 0.5 * wind - 0.7 * hit, Math.max(wind, hit));
    p[B.torso * 3] = -0.2 * wind + 0.4 * hit;
    p[SQUASH] = 0.05 * wind - 0.15 * hit;
    p[B.head * 3] = 0.2 * hit;
  },
  /** Crouch, spring up with the ladle overhead, and slam down. */
  slam(t, p, hold, d) {
    const n = t / d;
    const crouch = n < 0.15 ? easeOut(n / 0.15) : 1 - seg(n, 0.15, 0.25);
    const air = seg(n, 0.15, 0.8) > 0 && n < 0.8 ? 1 : 0;
    const smash = n < 0.8 ? 0 : 1 - ease(seg(n, 0.8, 1));
    const up = air ? easeOut(seg(n, 0.15, 0.4)) : 0;
    armR(p, hold, -2.8 * up - 0.4 * smash, 0.2, Math.max(up, smash));
    armL(p, -2.6 * up - 0.4 * smash, -0.3, Math.max(up, smash));
    p[B.torso * 3] = -0.25 * up + 0.6 * smash;
    p[SQUASH] = -0.2 * crouch + 0.1 * up - 0.25 * smash;
    set(p, B.legL, -0.7 * up - 0.5 * smash, 0, 0);
    set(p, B.legR, -0.3 * up + 0.3 * smash, 0, 0);
  },
};

// --------------------------------------------------------------------- hits

const HIT: Record<string, ClipFn> = {
  /** The original flinch. */
  flinch(t, p, hold, d) {
    const k = Math.sin(Math.PI * Math.min(1, t / d));
    p[B.torso * 3] = -0.38 * k;
    p[B.head * 3] = -0.28 * k;
    p[B.armL * 3 + 2] = -0.22 - 0.45 * k;
    set(p, B.armR, hold.x * (1 - k), 0, hold.z + 0.45 * k);
    p[TORSO_SQUASH] = -0.07 * k;
  },
  /** Knocked back a step, arms flailing. */
  stagger(t, p, hold, d) {
    const n = Math.min(1, t / d);
    const k = n < 0.25 ? easeOut(n / 0.25) : 1 - ease(seg(n, 0.25, 1));
    p[B.root * 3] = -0.18 * k;
    p[B.torso * 3] = -0.45 * k;
    p[B.head * 3] = -0.35 * k;
    set(p, B.armL, -0.8 * k, 0, -0.22 - 1.0 * k);
    set(p, B.armR, hold.x * (1 - k) - 0.6 * k, 0, hold.z + 0.9 * k);
    set(p, B.legL, -0.45 * k, 0, 0);
    set(p, B.legR, 0.2 * k, 0, 0);
    p[SQUASH] = -0.05 * k;
  },
  /** Spun half around by the blow. */
  spin(t, p, hold, d) {
    const n = Math.min(1, t / d);
    const k = n < 0.3 ? easeOut(n / 0.3) : 1 - ease(seg(n, 0.3, 1));
    p[B.torso * 3 + 1] = 0.9 * k;
    p[B.head * 3 + 1] = 0.4 * k;
    p[B.torso * 3] = -0.2 * k;
    set(p, B.armL, 0, 0, -0.22 - 0.9 * k);
    set(p, B.armR, hold.x * (1 - k), 0, hold.z + 0.9 * k);
  },
  /** Doubled over, then straightens. */
  crumple(t, p, hold, d) {
    const n = Math.min(1, t / d);
    const k = n < 0.3 ? easeOut(n / 0.3) : 1 - ease(seg(n, 0.3, 1));
    p[B.torso * 3] = 0.5 * k;
    p[B.head * 3] = 0.3 * k;
    p[SQUASH] = -0.16 * k;
    set(p, B.armL, -0.8 * k, 0, 0.3 * k - 0.22);
    set(p, B.armR, lerp(hold.x, -0.8, k), 0, lerp(hold.z, -0.2, k));
  },
  /** A glitchy jolt: the whole body jitters for a moment. */
  jolt(t, p, hold, d) {
    const n = Math.min(1, t / d);
    const k = 1 - n;
    const j = Math.sin(n * 95) * k,
      j2 = Math.sin(n * 61 + 1) * k;
    p[B.torso * 3 + 2] = 0.25 * j;
    p[B.head * 3 + 1] = 0.4 * j2;
    p[B.torso * 3] = -0.2 * k;
    set(p, B.armL, 0.3 * j2, 0, -0.22 - 0.5 * k);
    set(p, B.armR, hold.x + 0.3 * j, 0, hold.z + 0.5 * k);
    p[SQUASH] = 0.06 * j;
  },
  /** A tank barely budges: a short, heavy grunt. */
  tank(t, p, hold, d) {
    const k = Math.sin(Math.PI * Math.min(1, t / d));
    p[B.torso * 3] = -0.18 * k;
    p[B.head * 3] = -0.12 * k;
    p[SQUASH] = -0.07 * k;
    p[B.armL * 3 + 2] = -0.22 - 0.15 * k;
    set(p, B.armR, hold.x, 0, hold.z + 0.15 * k);
  },
};

// --------------------------------------------------------------- knockouts

const DOWN: Record<string, ClipFn> = {
  /** The original: topple onto the back. */
  fallBack(t, p, hold, d) {
    const k = Math.min(1, t / d) ** 2;
    set(p, B.root, -1.45 * k, 0, 0);
    p[ROOT_Y] = -0.04 * k;
    set(p, B.armL, 0, 0, -0.22 - 1.1 * k);
    set(p, B.armR, hold.x * (1 - k), 0, hold.z + 1.1 * k);
    p[B.head * 3] = -0.35 * k;
    set(p, B.legL, -0.3 * k, 0, 0);
    set(p, B.legR, -0.2 * k, 0, 0);
  },
  /** Flat on the face, arms stretched out ahead. */
  faceplant(t, p, hold, d) {
    const n = Math.min(1, t / d);
    const k = easeIn(seg(n, 0.1, 0.75));
    const lean = 0.15 * bump(n, 0, 0.1, 0.2);
    set(p, B.root, -lean + 1.45 * k, 0, 0);
    set(p, B.armL, -2.8 * k, 0, -0.3);
    set(p, B.armR, lerp(hold.x, -2.8, k), 0, lerp(hold.z, 0.3, k));
    p[B.head * 3] = -0.4 * k;
    set(p, B.legL, 0.2 * k, 0, 0);
    set(p, B.legR, 0.35 * k, 0, 0);
    p[SQUASH] = -0.15 * wobble(n, 0.75, 30, 12);
  },
  /** Spun around twice, then down on the back. */
  spinFall(t, p, hold, d) {
    const n = Math.min(1, t / d);
    p[B.root * 3 + 1] = TAU * 2 * easeOut(seg(n, 0, 0.6));
    const k = easeIn(seg(n, 0.45, 1));
    p[B.root * 3] = -1.45 * k;
    set(p, B.armL, 0, 0, -1.4 + 0.3 * k);
    set(p, B.armR, hold.x * (1 - k), 0, 1.4);
    p[B.head * 3] = -0.3 * k;
    p[ROOT_Y] = 0.15 * bump(n, 0, 0.25, 0.5);
  },
  /** Down to the knees, a beat, then over sideways. */
  kneel(t, p, hold, d) {
    const n = Math.min(1, t / d);
    const knees = easeOut(seg(n, 0, 0.3));
    const topple = easeIn(seg(n, 0.55, 1));
    set(p, B.legL, -1.5 * knees, 0, 0);
    set(p, B.legR, -1.5 * knees, 0, 0);
    p[ROOT_Y] = -0.55 * knees;
    p[B.torso * 3] = 0.35 * knees;
    p[B.head * 3] = 0.45 * knees;
    set(p, B.armL, 0, 0, -0.1);
    set(p, B.armR, hold.x * (1 - knees), 0, 0.1);
    p[B.root * 3 + 2] = 1.35 * topple;
  },
  /** A dramatic swoon: back of the hand to the brow, then a slow fall. */
  faint(t, p, hold, d) {
    const n = Math.min(1, t / d);
    const swoon = easeOut(seg(n, 0, 0.35));
    const fall = easeIn(seg(n, 0.4, 1));
    set(p, B.armR, lerp(hold.x, -2.5, swoon), 0, lerp(hold.z, 1.4, swoon) - 0.6 * fall);
    set(p, B.armL, 0, 0, -0.22 - 1.2 * fall);
    p[B.head * 3] = -0.45 * swoon;
    p[B.torso * 3] = -0.25 * swoon;
    p[B.root * 3] = -1.45 * fall;
    p[B.root * 3 + 2] = 0.25 * fall;
    set(p, B.legL, -0.4 * swoon, 0, 0);
    p[SQUASH] = -0.08 * swoon * (1 - fall);
  },
  /** Launched up and back, limbs everywhere. */
  launch(t, p, hold, d) {
    const n = Math.min(1, t / d);
    p[ROOT_Y] = 1.1 * Math.sin(Math.PI * seg(n, 0, 0.75));
    p[B.root * 3] = -1.45 * easeOut(seg(n, 0, 0.7));
    set(p, B.armL, -1, 0, -1.8);
    set(p, B.armR, -1, 0, 1.8);
    set(p, B.legL, -0.6, 0, -0.2);
    set(p, B.legR, 0.3, 0, 0.2);
    p[SQUASH] = -0.12 * wobble(n, 0.75, 28, 10);
  },
  /** Glitches out: jitters, then crunches flat. */
  melt(t, p, hold, d) {
    const n = Math.min(1, t / d);
    const j = Math.sin(n * 120) * (1 - seg(n, 0.6, 0.8));
    p[B.root * 3 + 2] = 0.2 * j;
    p[B.head * 3 + 1] = 0.6 * Math.sin(n * 77);
    set(p, B.armL, 0.4 * j, 0, -1.2);
    set(p, B.armR, -0.4 * j, 0, 1.2);
    p[SQUASH] = -0.75 * easeIn(seg(n, 0.5, 1));
    p[ROOT_Y] = -0.1 * seg(n, 0.5, 1);
  },
  /** Rises gently, arms open, then settles onto the back. */
  float(t, p, hold, d) {
    const n = Math.min(1, t / d);
    const up = Math.sin(Math.PI * seg(n, 0, 0.7));
    const lie = easeOut(seg(n, 0.5, 1));
    p[ROOT_Y] = 0.45 * up;
    set(p, B.armL, -0.3 * up, 0, -0.22 - 1.4 * Math.max(up, lie));
    set(p, B.armR, hold.x * (1 - lie), 0, hold.z + 1.3 * Math.max(up, lie));
    p[B.head * 3] = -0.4 * up;
    p[B.root * 3] = -1.45 * lie;
    set(p, B.legL, 0.2 * up, 0, 0);
  },
};

// ---------------------------------------------------------------- landings

/** The first `fall` share of every landing drops in from `height`. */
const drop = (n: number, fall: number, height: number) => {
  const k = 1 - Math.min(1, n / fall);
  return height * k * k;
};

const LAND: Record<string, ClipFn> = {
  /** The original: drop in and squash. */
  drop(t, p, hold, d) {
    const n = t / d;
    if (n < 0.65) {
      const fall = 1 - n / 0.65;
      p[ROOT_Y] = 1.8 * fall * fall;
      p[SQUASH] = 0.06;
      set(p, B.armL, 0, 0, -0.22 - 1 * fall);
      set(p, B.armR, hold.x, 0, hold.z + 1 * fall);
    } else p[SQUASH] = -0.2 * Math.sin(Math.PI * ((n - 0.65) / 0.35));
  },
  /** A superhero landing: one knee and a fist down, then stand. */
  hero(t, p, hold, d) {
    const n = t / d;
    p[ROOT_Y] = drop(n, 0.35, 2.4);
    const kneel = n < 0.35 ? 0 : n < 0.75 ? 1 : 1 - ease(seg(n, 0.75, 1));
    const air = 1 - seg(n, 0, 0.35);
    p[ROOT_Y] -= 0.45 * kneel;
    set(p, B.legL, -1.5 * kneel - 0.4 * air, 0, 0);
    set(p, B.legR, 0.7 * kneel + 0.3 * air, 0, 0);
    p[B.torso * 3] = 0.45 * kneel;
    p[B.head * 3] = -0.3 * kneel;
    armR(p, hold, 0.2, 0.3, kneel);
    set(p, B.armL, -0.6 * kneel, 0, -0.22 - 1.3 * air);
    p[SQUASH] = 0.08 * air - 0.12 * wobble(n, 0.35, 30, 12);
  },
  /** A front flip in. */
  flip(t, p, hold, d) {
    const n = t / d;
    p[ROOT_Y] = drop(n, 0.6, 2.2) + 0.6 * Math.sin(Math.PI * seg(n, 0, 0.6));
    p[B.root * 3] = TAU * easeOut(seg(n, 0, 0.6));
    const tuck = Math.sin(Math.PI * seg(n, 0, 0.6));
    set(p, B.legL, -1.2 * tuck, 0, 0);
    set(p, B.legR, -1.2 * tuck, 0, 0);
    set(p, B.armL, -1 * tuck, 0, -0.22 - 0.6 * seg(n, 0.6, 0.8));
    armR(p, hold, -1, hold.z + 0.6, tuck);
    p[SQUASH] = -0.2 * Math.sin(Math.PI * seg(n, 0.6, 1));
  },
  /** Spins in like a top, arms out. */
  spinDrop(t, p, hold, d) {
    const n = t / d;
    p[ROOT_Y] = drop(n, 0.65, 2);
    p[B.root * 3 + 1] = -TAU * 2 * easeOut(seg(n, 0, 0.7));
    const out = 1 - seg(n, 0.6, 1);
    set(p, B.armL, 0, 0, -0.22 - 1.3 * out);
    armR(p, hold, 0, 1.5, out);
    p[SQUASH] = -0.18 * Math.sin(Math.PI * seg(n, 0.65, 1));
  },
  /** Rises out of the floor, overshoots, arms up. */
  rise(t, p, hold, d) {
    const n = t / d;
    const k = seg(n, 0, 0.55);
    p[SQUASH] = n < 0.55 ? -0.9 * (1 - easeOut(k)) : 0.14 * wobble(n, 0.55, 22, 7);
    const arms = bump(n, 0.45, 0.7, 1);
    set(p, B.armL, 0, 0, -0.22 - 2.2 * arms);
    armR(p, hold, -0.2, 2.4, arms);
    p[B.head * 3] = -0.3 * arms;
  },
  /** Drops in and bounces twice. */
  bounce(t, p, hold, d) {
    const n = t / d;
    const b1 = Math.sin(Math.PI * seg(n, 0.4, 0.68));
    const b2 = Math.sin(Math.PI * seg(n, 0.68, 0.86));
    p[ROOT_Y] = drop(n, 0.4, 2) + 0.55 * b1 + 0.2 * b2;
    const hit = (a: number) => Math.exp(-Math.abs(n - a) * 40);
    p[SQUASH] = -0.25 * (hit(0.4) + hit(0.68) * 0.7 + hit(0.86) * 0.5) + 0.06 * (b1 + b2);
    set(p, B.armL, 0, 0, -0.22 - 0.8 * (b1 + b2));
    armR(p, hold, 0, hold.z + 0.8, b1 + b2);
  },
};

// ---------------------------------------------------------------- victories

const WIN: Record<string, ClipFn> = {
  /** The original: arms up, bouncing. */
  cheer(t, p, _hold, d) {
    const n = Math.min(1, t / d);
    const b = Math.abs(Math.sin(TAU * n * 2));
    p[ROOT_Y] = 0.2 * b;
    set(p, B.armL, 0, 0, -2.6);
    set(p, B.armR, -0.1, 0, 2.6);
    p[B.head * 3] = -0.25;
    p[TORSO_SQUASH] = 0.04 * b;
  },
  /** A twirl with one arm high. */
  spin(t, p, hold, d) {
    const n = Math.min(1, t / d);
    p[B.root * 3 + 1] = TAU * easeOut(seg(n, 0, 0.6));
    set(p, B.armL, 0, 0, -1.4);
    armR(p, hold, -0.2, 2.6, 1);
    p[ROOT_Y] = 0.12 * Math.sin(Math.PI * seg(n, 0, 0.6));
    p[B.head * 3] = -0.2;
  },
  /** Both arms flexed, a puffed chest. */
  flex(t, p, _hold, d) {
    const n = Math.min(1, t / d);
    const k = easeOut(seg(n, 0, 0.25));
    const pump = 0.1 * Math.sin(n * TAU * 3) * k;
    set(p, B.armL, -0.3, 0, -1.6 * k + pump);
    set(p, B.armR, -0.3, 0, 1.6 * k - pump);
    p[TORSO_SQUASH] = 0.14 * k;
    p[B.head * 3] = -0.15 * k;
    p[SQUASH] = -0.05 * k;
  },
  /** A side-to-side shimmy. */
  dance(t, p, hold, d) {
    const n = Math.min(1, t / d);
    const s = Math.sin(n * TAU * 3);
    p[B.root * 3 + 2] = 0.15 * s;
    p[B.torso * 3 + 2] = -0.2 * s;
    p[B.head * 3 + 2] = 0.15 * s;
    set(p, B.armL, -0.4, 0, -1.3 + 0.4 * s);
    armR(p, hold, -0.4, 1.3 + 0.4 * s, 1);
    p[ROOT_Y] = 0.08 * Math.abs(s);
  },
};

/** The plain overhand throw, shared by item throws. */
export const OVERHAND = ATTACK.overhand;

// ------------------------------------------------------------------- table

/** One-shot clips a fighter can restyle. */
export type StyledClip =
  | "basic_attack"
  | "super"
  | "hit"
  | "eliminated"
  | "respawn"
  | "victory";
type Pick = readonly [ClipFn, number];

/**
 * Each fighter's one-shot styles and durations (s). Attack durations sit
 * near the 0.32 s attack interval so rapid fire crossfades, and Supers
 * cover their windups. Landing (`respawn`) also plays at the match start.
 */
export const MOTION: Record<FighterId, Record<StyledClip, Pick>> = {
  brandon: {
    basic_attack: [ATTACK.frisbee, 0.34],
    super: [SUPER.welcome, 0.8],
    hit: [HIT.flinch, 0.24],
    eliminated: [DOWN.fallBack, 0.6],
    respawn: [LAND.drop, 0.6],
    victory: [WIN.cheer, 1.6],
  },
  daniel: {
    basic_attack: [ATTACK.fling, 0.36],
    super: [SUPER.charge, 0.75],
    hit: [HIT.tank, 0.2],
    eliminated: [DOWN.faceplant, 0.7],
    respawn: [LAND.hero, 0.85],
    victory: [WIN.flex, 1.6],
  },
  rich: {
    basic_attack: [ATTACK.aim, 0.5],
    super: [SUPER.frame, 0.75],
    hit: [HIT.stagger, 0.32],
    eliminated: [DOWN.faint, 1],
    respawn: [LAND.flip, 0.75],
    victory: [WIN.spin, 1.6],
  },
  samuel: {
    basic_attack: [ATTACK.underhand, 0.42],
    super: [SUPER.setup, 0.8],
    hit: [HIT.crumple, 0.3],
    eliminated: [DOWN.kneel, 1],
    respawn: [LAND.bounce, 0.85],
    victory: [WIN.dance, 1.6],
  },
  josh: {
    basic_attack: [ATTACK.shout, 0.4],
    super: [SUPER.blast, 0.8],
    hit: [HIT.stagger, 0.32],
    eliminated: [DOWN.launch, 0.75],
    respawn: [LAND.hero, 0.85],
    victory: [WIN.flex, 1.6],
  },
  elijah: {
    basic_attack: [ATTACK.type, 0.36],
    super: [SUPER.rewind, 0.8],
    hit: [HIT.jolt, 0.28],
    eliminated: [DOWN.melt, 0.8],
    respawn: [LAND.rise, 0.7],
    victory: [WIN.dance, 1.6],
  },
  ethan: {
    basic_attack: [ATTACK.strum, 0.4],
    super: [SUPER.aura, 0.9],
    hit: [HIT.spin, 0.3],
    eliminated: [DOWN.faint, 1],
    respawn: [LAND.spinDrop, 0.75],
    victory: [WIN.spin, 1.6],
  },
  david: {
    basic_attack: [ATTACK.sing, 0.4],
    super: [SUPER.glare, 0.8],
    hit: [HIT.flinch, 0.24],
    eliminated: [DOWN.faint, 1],
    respawn: [LAND.rise, 0.7],
    victory: [WIN.cheer, 1.6],
  },
  dylan: {
    basic_attack: [ATTACK.cast, 0.42],
    super: [SUPER.net, 0.85],
    hit: [HIT.stagger, 0.32],
    eliminated: [DOWN.faceplant, 0.7],
    respawn: [LAND.flip, 0.75],
    victory: [WIN.flex, 1.6],
  },
  isaac: {
    basic_attack: [ATTACK.staple, 0.42],
    super: [SUPER.setup, 0.8],
    hit: [HIT.crumple, 0.3],
    eliminated: [DOWN.kneel, 1],
    respawn: [LAND.drop, 0.6],
    victory: [WIN.cheer, 1.6],
  },
  tovya: {
    basic_attack: [ATTACK.sweep, 0.46],
    super: [SUPER.slam, 0.62],
    hit: [HIT.tank, 0.2],
    eliminated: [DOWN.faceplant, 0.7],
    respawn: [LAND.hero, 0.85],
    victory: [WIN.flex, 1.6],
  },
  rosalie: {
    basic_attack: [ATTACK.wave, 0.4],
    super: [SUPER.summon, 0.85],
    hit: [HIT.spin, 0.3],
    eliminated: [DOWN.spinFall, 0.9],
    respawn: [LAND.bounce, 0.85],
    victory: [WIN.dance, 1.6],
  },
  joelle: {
    basic_attack: [ATTACK.sidearm, 0.38],
    super: [SUPER.point, 0.7],
    hit: [HIT.spin, 0.3],
    eliminated: [DOWN.spinFall, 0.9],
    respawn: [LAND.spinDrop, 0.75],
    victory: [WIN.spin, 1.6],
  },
  susannah: {
    basic_attack: [ATTACK.post, 0.38],
    super: [SUPER.heave, 0.8],
    hit: [HIT.stagger, 0.32],
    eliminated: [DOWN.faint, 1],
    respawn: [LAND.flip, 0.75],
    victory: [WIN.dance, 1.6],
  },
  joyce: {
    basic_attack: [ATTACK.dart, 0.38],
    super: [SUPER.hug, 0.85],
    hit: [HIT.flinch, 0.24],
    eliminated: [DOWN.float, 1],
    respawn: [LAND.rise, 0.7],
    victory: [WIN.cheer, 1.6],
  },
  miriam: {
    basic_attack: [ATTACK.release, 0.42],
    super: [SUPER.still, 0.85],
    hit: [HIT.flinch, 0.24],
    eliminated: [DOWN.float, 1],
    respawn: [LAND.rise, 0.7],
    victory: [WIN.cheer, 1.6],
  },
  jemuel: {
    basic_attack: [ATTACK.radiate, 0.42],
    super: [SUPER.cover, 0.85],
    hit: [HIT.tank, 0.2],
    eliminated: [DOWN.float, 1],
    respawn: [LAND.hero, 0.85],
    victory: [WIN.flex, 1.6],
  },
  russell: {
    basic_attack: [ATTACK.flip, 0.36],
    super: [SUPER.cuts, 0.75],
    hit: [HIT.crumple, 0.3],
    eliminated: [DOWN.kneel, 1],
    respawn: [LAND.drop, 0.6],
    victory: [WIN.dance, 1.6],
  },
  brandon_n: {
    basic_attack: [ATTACK.frisbee, 0.36],
    super: [SUPER.raise, 0.8],
    hit: [HIT.flinch, 0.24],
    eliminated: [DOWN.fallBack, 0.6],
    respawn: [LAND.drop, 0.6],
    victory: [WIN.cheer, 1.6],
  },
};
