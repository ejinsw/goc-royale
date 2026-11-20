import {
  AnimationClip,
  AnimationMixer,
  Bone,
  Float32BufferAttribute,
  Group,
  PropertyBinding,
  Skeleton,
  SkinnedMesh,
  Sphere,
  Uint16BufferAttribute,
  Vector3,
  type AnimationAction,
  type BufferGeometry,
  type Material,
  type Mesh,
  type MeshToonMaterial,
  type Object3D,
} from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { clone as cloneSkinned } from "three/addons/utils/SkeletonUtils.js";
import { clamp, type FighterId, type Vec } from "../../../shared/definitions";
import {
  HIP_X,
  HIP_Y,
  LOOKS,
  NECK_Y,
  SHOULDER,
  buildFighter,
} from "../ui/scene/fighterModels";
import type { ArenaMaterials } from "./materials";
import {
  B,
  BONE_COUNT,
  MOTION,
  OVERHAND,
  POSE_SIZE,
  ROOT_Y,
  SQUASH,
  TAU,
  TORSO_SQUASH,
  ease,
  easeOut,
  lerp,
  set,
  type Hold,
  type StyledClip,
} from "./motion";

/**
 * Arena presentation layer (performance standard §3, §7): fighter models and
 * their animation. Nothing here reads or writes gameplay state; it is fed
 * drawn positions, aim and a few flags each frame, plus one-shot triggers
 * from the presentation event stream.
 *
 * One animation graph drives every fighter. It speaks the clip names of the
 * asset manifest (`client/public/art3d/<fighter>/manifest.json`), and two
 * rigs play it:
 *
 * - `GlbRig`: a validated skinned GLB with authored clips (Brandon, the
 *   standard §7.3 integration mule).
 * - `ProceduralRig`: the menu's procedural models from the shared look table,
 *   merged into one rigidly skinned mesh per fighter, with the same clip set
 *   authored as code. Used for every fighter without an approved asset.
 *
 * Swapping a fighter onto a real asset is a table entry in GLB_ASSETS.
 */

/**
 * Every fighter is drawn this tall in world units. Larger than the 0.42
 * collision radius suggests, like the 2D portraits were, so a fighter reads
 * at gameplay distance; it projects to about the old 1.5-unit portrait height.
 */
export const FIGHTER_HEIGHT = 2.35;
/** Height of the menu's procedural models at scale 1. */
const PROCEDURAL_HEIGHT = 1.75;
const PROCEDURAL_SCALE = FIGHTER_HEIGHT / PROCEDURAL_HEIGHT;
/** Ink outline thickness in world units. */
const OUTLINE_WORLD = 0.032;

/** The gameplay clip set (standard §7.1), named as in the asset manifest. */
export const CLIPS = [
  "idle",
  "run_forward",
  "run_backward",
  "strafe_left",
  "strafe_right",
  "basic_attack",
  "super",
  "ball_shot",
  "hit",
  "carry_ball",
  "stunned",
  "eliminated",
  "respawn",
  "victory",
  "defeat",
] as const;
type AssetClipName = (typeof CLIPS)[number];
/** Item actions have procedural profiles; authored assets fall back to basic attack. */
export type ClipName = AssetClipName | "item_sweep" | "item_throw";
const LOOPING: ReadonlySet<ClipName> = new Set<ClipName>([
  "idle",
  "run_forward",
  "run_backward",
  "strafe_left",
  "strafe_right",
  "carry_ball",
  "stunned",
]);
const LOCO = [
  "idle",
  "run_forward",
  "run_backward",
  "strafe_left",
  "strafe_right",
] as const;
type UpperShot =
  | "basic_attack"
  | "super"
  | "ball_shot"
  | "hit"
  | "item_sweep"
  | "item_throw";
type FullShot = "eliminated" | "respawn" | "victory" | "defeat";
/** One-shot clips the arena can trigger. */
export type ActionClip = UpperShot | FullShot;
const FULL_SHOTS: ReadonlySet<ClipName> = new Set<ClipName>([
  "eliminated",
  "respawn",
  "victory",
  "defeat",
]);

/**
 * Which part of the body a clip contributes to. Locomotion drives both
 * halves; attacks, Supers, shots, hit reactions and the ball carry override
 * only the upper body, so legs keep running under them; knockouts, respawns,
 * stuns and goal reactions take the whole body.
 */
type Layer = "upper" | "lower" | "full";
interface Channel {
  clip: ClipName;
  layer: Layer;
  time: number;
  weight: number;
}

const FADE_IN = 0.06;
const FADE_OUT = 0.12;
/** Speed (world units/s) at which locomotion is a full run. */
const RUN_FULL = 1.6;
/** Run cycles per world unit, so cadence follows speed and slows with Welcome slow. */
const CYCLES_PER_UNIT = 0.42;
const smoothK = (dt: number, tau: number) => 1 - Math.exp(-dt / tau);

interface Shot {
  clip: ActionClip;
  start: number;
}

/**
 * The runtime animation graph (standard §7.2). Locomotion blends idle and
 * four directional runs by speed and travel direction relative to facing.
 * One-shots crossfade over it and are only ever started by `trigger`, which
 * the arena calls once per presentation event id or predicted local input;
 * snapshots and reconciliation move the fighter but never restart a clip.
 */
export class AnimationGraph {
  private phase = 0;
  private clock = 0;
  private loco = [1, 0, 0, 0, 0];
  private upper: Shot | null = null;
  private fading: { shot: Shot; weight: number } | null = null;
  private full: Shot | null = null;
  private stun = 0;
  private carry = 0;
  readonly channels: Channel[] = Array.from({ length: 16 }, () => ({
    clip: "idle" as ClipName,
    layer: "full" as Layer,
    time: 0,
    weight: 0,
  }));
  count = 0;
  constructor(public duration: (clip: ClipName) => number) {}

  get knockedOut() {
    return this.full?.clip === "eliminated";
  }
  /** An upper-body one-shot (attack, Super, shot) is playing. */
  get acting() {
    return !!this.upper && this.upper.clip !== "hit";
  }

  /** Start a one-shot. Returns false when the graph ignored it. */
  trigger(clip: ActionClip, now: number): boolean {
    if (FULL_SHOTS.has(clip)) {
      if (this.full?.clip === clip && clip !== "respawn") return false;
      // Nothing but a respawn replaces a knockout.
      if (this.knockedOut && clip !== "respawn") return false;
      this.full = { clip, start: now };
      if (clip === "eliminated" || clip === "respawn") {
        this.upper = null;
        this.fading = null;
      }
      return true;
    }
    if (this.knockedOut) return false;
    // A hit reaction never interrupts an attack, Super or shot in progress.
    if (clip === "hit" && this.acting) return false;
    if (this.upper)
      this.fading = {
        shot: this.upper,
        weight: this.envelope(this.upper, now, false),
      };
    this.upper = { clip, start: now };
    return true;
  }

  /** Let go of held goal reactions when play resumes. */
  releaseHeld() {
    if (
      this.full &&
      (this.full.clip === "victory" || this.full.clip === "defeat")
    )
      this.full = null;
  }

  reset() {
    this.upper = this.fading = this.full = null;
    this.stun = this.carry = 0;
  }

  private envelope(shot: Shot, now: number, hold: boolean) {
    const d = this.duration(shot.clip),
      age = now - shot.start;
    const fadeIn = shot.clip === "respawn" ? 1 : Math.min(1, age / FADE_IN);
    if (hold) return fadeIn;
    const out = Math.min(FADE_OUT, d / 2);
    return Math.max(0, Math.min(fadeIn, (d - age) / out));
  }

  private push(clip: ClipName, layer: Layer, time: number, weight: number) {
    if (weight <= 0.001 || this.count >= this.channels.length) return;
    const c = this.channels[this.count++];
    c.clip = clip;
    c.layer = layer;
    c.time = time;
    c.weight = weight;
  }

  /**
   * Advance one rendered frame. `fwd`/`right` are the travel direction in
   * the fighter's own frame (unit length when moving).
   */
  update(
    dt: number,
    now: number,
    m: {
      speed: number;
      fwd: number;
      right: number;
      stunned: boolean;
      carrying: boolean;
    },
  ) {
    const run = clamp(m.speed / RUN_FULL, 0, 1);
    const f = Math.max(0, m.fwd),
      b = Math.max(0, -m.fwd),
      r = Math.max(0, m.right),
      l = Math.max(0, -m.right);
    const sum = f + b + r + l;
    const k = smoothK(dt, 0.08);
    const targets =
      sum > 0
        ? [
            1 - run,
            (run * f) / sum,
            (run * b) / sum,
            (run * l) / sum,
            (run * r) / sum,
          ]
        : [1, 0, 0, 0, 0];
    for (let i = 0; i < 5; i++) this.loco[i] += (targets[i] - this.loco[i]) * k;
    this.phase = (this.phase + dt * m.speed * CYCLES_PER_UNIT) % 1;
    this.clock += dt;
    this.stun += ((m.stunned ? 1 : 0) - this.stun) * k;
    this.carry += ((m.carrying ? 1 : 0) - this.carry) * k;

    let U = 0;
    if (this.upper) {
      if (now - this.upper.start >= this.duration(this.upper.clip))
        this.upper = null;
      else U = this.envelope(this.upper, now, false);
    }
    if (this.fading) {
      this.fading.weight -= dt / FADE_OUT;
      if (this.fading.weight <= 0) this.fading = null;
    }
    let F = 0;
    if (this.full) {
      const hold = this.full.clip !== "respawn";
      if (!hold && now - this.full.start >= this.duration(this.full.clip))
        this.full = null;
      else F = this.envelope(this.full, now, hold);
    }
    const S = this.stun * (1 - F);
    const body = 1 - (F + S);
    const fade = this.fading ? this.fading.weight * (1 - U) : 0;
    const C = this.carry * Math.max(0, 1 - U - fade);
    const override = Math.min(1, U + fade + C);

    // Standing still, a one-shot takes the legs too (a crouch, a lunge, a
    // braced stance); on the run the legs keep running under it.
    const still = this.loco[0];
    const legs = Math.min(1, (U + fade) * still);
    this.count = 0;
    for (let i = 0; i < 5; i++) {
      const w = this.loco[i];
      if (w < 0.001) continue;
      const clip = LOCO[i];
      const time =
        i === 0
          ? this.clock % this.duration(clip)
          : this.phase * this.duration(clip);
      this.push(clip, "lower", time, w * (1 - legs) * body);
      this.push(clip, "upper", time, w * (1 - override) * body);
    }
    const at = (s: Shot) => Math.min(now - s.start, this.duration(s.clip));
    if (this.upper) {
      this.push(this.upper.clip, "upper", at(this.upper), U * body);
      this.push(this.upper.clip, "lower", at(this.upper), U * still * body);
    }
    if (this.fading) {
      this.push(
        this.fading.shot.clip,
        "upper",
        at(this.fading.shot),
        fade * body,
      );
      this.push(
        this.fading.shot.clip,
        "lower",
        at(this.fading.shot),
        fade * still * body,
      );
    }
    this.push(
      "carry_ball",
      "upper",
      this.clock % this.duration("carry_ball"),
      C * body,
    );
    if (this.full) this.push(this.full.clip, "full", at(this.full), F);
    this.push("stunned", "full", this.clock % this.duration("stunned"), S);
  }
}

/** A playable fighter body: one of the two rigs below. */
interface Rig {
  readonly root: Object3D;
  readonly kind: "procedural" | "glb";
  duration(clip: ClipName): number;
  apply(channels: readonly Channel[], count: number): void;
  dispose(): void;
}

// ---------------------------------------------------------------- procedural

const LOWER_INDICES = [B.root, B.hips, B.legL, B.legR]
  .flatMap((b) => [b * 3, b * 3 + 1, b * 3 + 2])
  .concat([ROOT_Y, SQUASH]);
const UPPER_INDICES = [B.torso, B.head, B.armL, B.armR, B.extra]
  .flatMap((b) => [b * 3, b * 3 + 1, b * 3 + 2])
  .concat([TORSO_SQUASH]);
const EXTRA_AT: [number, number, number] = [0.5, 1.6, 0.05];

const PROCEDURAL_DURATION: Record<ClipName, number> = {
  idle: 3,
  run_forward: 0.8,
  run_backward: 0.8,
  strafe_left: 0.8,
  strafe_right: 0.8,
  basic_attack: 0.36,
  item_sweep: 0.46,
  item_throw: 0.36,
  super: 0.8,
  ball_shot: 0.36,
  hit: 0.24,
  carry_ball: 0.8,
  stunned: 1.6,
  eliminated: 0.6,
  respawn: 0.6,
  victory: 1.6,
  defeat: 1.4,
};

function restPose(p: Float32Array, hold: Hold) {
  p.fill(0);
  p[B.armL * 3 + 2] = -0.22;
  p[B.armR * 3] = hold.x;
  p[B.armR * 3 + 2] = hold.z;
}

/**
 * The clip set as code, for fighters without an authored asset. Each writes
 * a whole pose over the rest pose; the layer mask decides which bones are
 * used. Signs: negative x rotation swings a limb forward, positive x leans
 * the torso forward, the prop arm is armR (+x). The one-shots every fighter
 * performs differently (attack, Super, hit, knockout, landing, victory) are
 * per-fighter styles in `MOTION` (./motion.ts); these are shared.
 */
const PROCEDURAL_CLIPS: Record<
  Exclude<ClipName, StyledClip>,
  (t: number, p: Float32Array, hold: Hold) => void
> = {
  idle(t, p) {
    const b = Math.sin((TAU * t) / 1.5);
    p[SQUASH] = 0.012 * b;
    p[B.torso * 3 + 1] = 0.05 * Math.sin((TAU * t) / 3);
    p[B.head * 3 + 2] = 0.05 * Math.sin((TAU * t) / 3 + 1);
    p[B.armL * 3 + 2] = -0.22 - 0.03 * b;
    p[B.extra * 3 + 2] = 0.25 * Math.sin((TAU * t) / 3);
  },
  run_forward(t, p, hold) {
    const s = Math.sin((TAU * t) / 0.8);
    set(p, B.legL, -0.8 * s, 0, 0);
    set(p, B.legR, 0.8 * s, 0, 0);
    set(p, B.armL, 0.7 * s, 0, -0.2);
    set(p, B.armR, hold.x - 0.35 * s, 0, hold.z);
    set(p, B.torso, 0.16, -0.1 * s, 0);
    set(p, B.head, -0.1, 0, 0);
    p[ROOT_Y] = 0.06 * (1 - Math.cos((2 * TAU * t) / 0.8)) * 0.5;
  },
  run_backward(t, p, hold) {
    const s = Math.sin((TAU * t) / 0.8);
    set(p, B.legL, 0.65 * s, 0, 0);
    set(p, B.legR, -0.65 * s, 0, 0);
    set(p, B.armL, -0.5 * s, 0, -0.2);
    set(p, B.armR, hold.x + 0.25 * s, 0, hold.z);
    set(p, B.torso, -0.08, 0, 0);
    p[ROOT_Y] = 0.05 * (1 - Math.cos((2 * TAU * t) / 0.8)) * 0.5;
  },
  strafe_left(t, p, hold) {
    const s = Math.sin((TAU * t) / 0.8);
    set(p, B.legL, -0.35 * s, 0, 0);
    set(p, B.legR, 0.35 * s, 0, 0);
    set(p, B.armL, 0.35 * s, 0, -0.22);
    set(p, B.armR, hold.x - 0.2 * s, 0, hold.z);
    set(p, B.root, 0, 0, -0.12);
    set(p, B.torso, 0.06, 0.2, 0);
    p[ROOT_Y] = 0.05 * (1 - Math.cos((2 * TAU * t) / 0.8)) * 0.5;
  },
  strafe_right(t, p, hold) {
    const s = Math.sin((TAU * t) / 0.8);
    set(p, B.legL, -0.35 * s, 0, 0);
    set(p, B.legR, 0.35 * s, 0, 0);
    set(p, B.armL, 0.35 * s, 0, -0.22);
    set(p, B.armR, hold.x - 0.2 * s, 0, hold.z);
    set(p, B.root, 0, 0, 0.12);
    set(p, B.torso, 0.06, -0.2, 0);
    p[ROOT_Y] = 0.05 * (1 - Math.cos((2 * TAU * t) / 0.8)) * 0.5;
  },
  item_sweep(t, p, hold) {
    const n = Math.min(1, t / PROCEDURAL_DURATION.item_sweep);
    // Wind up across the body, accelerate through a wide arc, then follow through.
    const twist =
      n < 0.32
        ? lerp(0, 0.95, ease(n / 0.32))
        : n < 0.65
          ? lerp(0.95, -1.05, easeOut((n - 0.32) / 0.33))
          : lerp(-1.05, 0, ease((n - 0.65) / 0.35));
    p[B.torso * 3 + 1] = twist;
    p[B.head * 3 + 1] = -twist * 0.3;
    p[B.torso * 3] = 0.16 * Math.sin(Math.PI * n);
    set(
      p,
      B.armR,
      lerp(hold.x, -1.05, Math.sin(Math.PI * n)),
      -twist * 0.35,
      lerp(hold.z, 0.9, Math.sin(Math.PI * n)),
    );
    set(
      p,
      B.armL,
      -0.65 * Math.sin(Math.PI * n),
      0,
      -0.22 - 0.35 * Math.sin(Math.PI * n),
    );
  },
  item_throw(t, p, hold) {
    OVERHAND(t, p, hold, PROCEDURAL_DURATION.item_throw);
  },
  ball_shot(t, p, hold) {
    const n = t / PROCEDURAL_DURATION.ball_shot;
    let x: number, torso: number;
    if (n < 0.35) {
      const k = ease(n / 0.35);
      x = lerp(-1.1, 0.5, k);
      torso = -0.1 * k;
    } else if (n < 0.6) {
      const k = easeOut((n - 0.35) / 0.25);
      x = lerp(0.5, -1.7, k);
      torso = lerp(-0.1, 0.25, k);
    } else {
      const k = ease((n - 0.6) / 0.4);
      x = lerp(-1.7, -0.6, k);
      torso = lerp(0.25, 0, k);
    }
    set(p, B.armL, x, 0, 0.15);
    set(p, B.armR, Math.min(x, hold.x), 0, -0.15);
    p[B.torso * 3] = torso;
  },
  carry_ball(t, p) {
    const w = 0.05 * Math.sin((TAU * t) / 0.8);
    set(p, B.armL, -1.15 + w, 0, 0.18);
    set(p, B.armR, -1.15 + w, 0, -0.18);
    p[B.torso * 3] = 0.08;
  },
  stunned(t, p) {
    const w = Math.sin((TAU * t) / 0.8);
    set(p, B.head, 0.18, 0, 0.28 * w);
    set(p, B.torso, 0.12, 0, 0.1 * w);
    set(p, B.armL, 0, 0, -0.1);
    set(p, B.armR, 0.05, 0, 0.1);
    set(p, B.legL, 0, 0, 0.05);
    set(p, B.legR, 0, 0, -0.05);
    p[B.root * 3 + 2] = 0.05 * w;
  },
  defeat(t, p, hold) {
    const k = ease(Math.min(1, t / 0.5));
    p[B.head * 3] = 0.5 * k;
    p[B.torso * 3] = 0.22 * k;
    set(p, B.armL, 0, 0, lerp(-0.22, -0.05, k));
    set(p, B.armR, lerp(hold.x, 0.1, k), 0, lerp(hold.z, 0.05, k));
    p[SQUASH] = -0.04 * k;
  },
};

/** Per-fighter merged geometry, built once per arena and shared by duplicates. */
export interface ProceduralAsset {
  fighter: FighterId;
  skin: BufferGeometry;
  shell: BufferGeometry;
  hold: Hold;
  extraAt: readonly [number, number, number];
}

function rigid(
  geometry: BufferGeometry,
  bone: number,
  offset?: readonly [number, number, number],
) {
  if (offset) geometry.translate(offset[0], offset[1], offset[2]);
  const n = geometry.attributes.position.count;
  const index = new Uint16Array(n * 4),
    weight = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    index[i * 4] = bone;
    weight[i * 4] = 1;
  }
  geometry.setAttribute("skinIndex", new Uint16BufferAttribute(index, 4));
  geometry.setAttribute("skinWeight", new Float32BufferAttribute(weight, 4));
  return geometry;
}

export function buildProceduralAsset(id: FighterId): ProceduralAsset {
  const p = buildFighter(id, { separateLegs: true });
  const neck = [0, NECK_Y, 0] as const;
  const extraAt = p.companion?.anchor ?? EXTRA_AT;
  const shell = [
    rigid(p.body, B.torso),
    rigid(p.legL!, B.legL),
    rigid(p.legR!, B.legR),
    rigid(p.head, B.head, neck),
    rigid(p.armL, B.armL, [-SHOULDER[0], SHOULDER[1], SHOULDER[2]]),
    rigid(p.armR, B.armR, SHOULDER),
    ...(p.companion ? [rigid(p.companion.geometry, B.extra, extraAt)] : []),
  ];
  const face = rigid(p.face, B.head, neck);
  const skin = mergeGeometries([...shell, face], false);
  const outline = mergeGeometries(shell, false);
  for (const g of [...shell, face]) g.dispose();
  if (!skin || !outline)
    throw new Error(`fighter geometry merge failed: ${id}`);
  return { fighter: id, skin, shell: outline, hold: LOOKS[id].hold, extraAt };
}

const PROCEDURAL_BOUNDS = new Sphere(new Vector3(0, 0.9, 0), 1.5);

class ProceduralRig implements Rig {
  readonly kind = "procedural" as const;
  readonly root = new Group();
  private bones: Bone[];
  private skeleton: Skeleton;
  private pose = new Float32Array(POSE_SIZE);
  private acc = new Float32Array(POSE_SIZE);
  private tmp = new Float32Array(POSE_SIZE);
  /** This fighter's attack, Super, hit, knockout, landing and victory. */
  private styles: (typeof MOTION)[FighterId];
  constructor(
    private asset: ProceduralAsset,
    material: Material,
    outline: Material,
  ) {
    this.styles = MOTION[asset.fighter];
    this.bones = Array.from({ length: BONE_COUNT }, () => new Bone());
    const [root, hips, torso, head, armL, armR, legL, legR, extra] = this.bones;
    root.add(hips, extra);
    hips.add(torso, legL, legR);
    torso.add(head, armL, armR);
    hips.position.set(0, HIP_Y, 0);
    head.position.set(0, NECK_Y - HIP_Y, 0);
    armL.position.set(-SHOULDER[0], SHOULDER[1] - HIP_Y, SHOULDER[2]);
    armR.position.set(SHOULDER[0], SHOULDER[1] - HIP_Y, SHOULDER[2]);
    legL.position.set(-HIP_X, 0, 0);
    legR.position.set(HIP_X, 0, 0);
    extra.position.set(...this.asset.extraAt);
    const mesh = new SkinnedMesh(asset.skin, material);
    mesh.add(root);
    this.skeleton = new Skeleton(this.bones);
    mesh.bind(this.skeleton);
    const shell = new SkinnedMesh(asset.shell, outline);
    shell.bind(this.skeleton, mesh.bindMatrix);
    mesh.boundingSphere = PROCEDURAL_BOUNDS.clone();
    shell.boundingSphere = PROCEDURAL_BOUNDS.clone();
    this.root.add(mesh, shell);
    this.root.scale.setScalar(PROCEDURAL_SCALE);
  }
  duration(clip: ClipName) {
    const styled = this.styles[clip as StyledClip];
    return styled ? styled[1] : PROCEDURAL_DURATION[clip];
  }
  apply(channels: readonly Channel[], count: number) {
    const { acc, tmp, pose } = this;
    const hold = this.asset.hold;
    acc.fill(0);
    let lower = 0,
      upper = 0;
    for (let i = 0; i < count; i++) {
      const c = channels[i];
      restPose(tmp, hold);
      const styled = this.styles[c.clip as StyledClip];
      if (styled) styled[0](c.time, tmp, hold, styled[1]);
      else PROCEDURAL_CLIPS[c.clip as Exclude<ClipName, StyledClip>](c.time, tmp, hold);
      if (c.layer !== "upper") {
        for (const j of LOWER_INDICES) acc[j] += tmp[j] * c.weight;
        lower += c.weight;
      }
      if (c.layer !== "lower") {
        for (const j of UPPER_INDICES) acc[j] += tmp[j] * c.weight;
        upper += c.weight;
      }
    }
    // Missing weight falls back to the rest pose, as the GLB mixer does.
    restPose(tmp, hold);
    for (const j of LOWER_INDICES)
      pose[j] = (acc[j] + tmp[j] * Math.max(0, 1 - lower)) / Math.max(1, lower);
    for (const j of UPPER_INDICES)
      pose[j] = (acc[j] + tmp[j] * Math.max(0, 1 - upper)) / Math.max(1, upper);
    for (let b = 0; b < BONE_COUNT; b++)
      this.bones[b].rotation.set(pose[b * 3], pose[b * 3 + 1], pose[b * 3 + 2]);
    const root = this.bones[B.root],
      torso = this.bones[B.torso];
    root.position.y = pose[ROOT_Y];
    root.scale.set(
      1 - pose[SQUASH] * 0.5,
      1 + pose[SQUASH],
      1 - pose[SQUASH] * 0.5,
    );
    torso.scale.set(
      1 - pose[TORSO_SQUASH] * 0.5,
      1 + pose[TORSO_SQUASH],
      1 - pose[TORSO_SQUASH] * 0.5,
    );
  }
  dispose() {
    this.skeleton.dispose();
  }
}

// ----------------------------------------------------------------------- GLB

/**
 * Fighters with an approved runtime asset. A fighter missing here, or whose
 * asset fails validation, uses the procedural rig instead.
 */
const GLB_ASSETS: Partial<
  Record<FighterId, { glb: string; manifest: string }>
> = {
  // Runtime assets are opt-in only after art, animation, and device review.
  // Redacted legacy GLB studies intentionally have no entries here. Brandon
  // uses the shared procedural LOOKS model with the rest of the roster; see
  // docs/BRANDON-3D-REDACTED.md.
};
/** Standard §7.3 runtime limits, enforced when an asset is imported. */
const RUNTIME_BUDGET = {
  triangles: 25000,
  bones: 40,
  materials: 2,
  skinnedMeshes: 2,
};

interface GlbClips {
  upper: AnimationClip;
  lower: AnimationClip;
  full: AnimationClip;
}
export interface GlbAsset {
  template: Object3D;
  scale: number;
  clips: Record<AssetClipName, GlbClips>;
  report: {
    triangles: number;
    bones: number;
    materials: number;
    textures: number;
    skinnedMeshes: number;
  };
}

interface Manifest {
  triangles?: number;
  bones?: number;
  materials?: number;
  clips?: Record<string, { seconds: number; loop: boolean }>;
}

/** Bones above the hips belong to the upper-body layer. */
const UPPER_BONE = /spine|chest|neck|head|shoulder|clav|arm|hand|finger|thumb/i;

function splitClip(clip: AnimationClip): GlbClips {
  const upper = clip.tracks.filter((t) =>
    UPPER_BONE.test(PropertyBinding.parseTrackName(t.name).nodeName),
  );
  const lower = clip.tracks.filter((t) => !upper.includes(t));
  return {
    upper: new AnimationClip(`${clip.name}:upper`, clip.duration, upper),
    lower: new AnimationClip(`${clip.name}:lower`, clip.duration, lower),
    full: clip,
  };
}

/**
 * Clip manifest and budget validation (standard §7.2, §7.3). Returns the
 * problems found; an asset with any problem is not used.
 */
function validate(scene: Object3D, clips: AnimationClip[], manifest: Manifest) {
  const problems: string[] = [];
  const byName = new Map(clips.map((c) => [c.name, c]));
  for (const name of CLIPS) {
    const clip = byName.get(name);
    const entry = manifest.clips?.[name];
    if (!clip) problems.push(`clip "${name}" is missing from the GLB`);
    else if (!entry)
      problems.push(`clip "${name}" is missing from the manifest`);
    else {
      if (Math.abs(clip.duration - entry.seconds) > 0.05)
        problems.push(
          `clip "${name}" lasts ${clip.duration.toFixed(3)} s, manifest says ${entry.seconds}`,
        );
      if (entry.loop !== LOOPING.has(name))
        problems.push(
          `clip "${name}" loop is ${entry.loop}, the graph needs ${LOOPING.has(name)}`,
        );
    }
  }
  const report = {
    triangles: 0,
    bones: 0,
    materials: 0,
    textures: 0,
    skinnedMeshes: 0,
  };
  const materials = new Set<Material>();
  const textures = new Set<unknown>();
  scene.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    const g = mesh.geometry;
    report.triangles +=
      (g.index ? g.index.count : g.attributes.position.count) / 3;
    for (const m of Array.isArray(mesh.material)
      ? mesh.material
      : [mesh.material]) {
      materials.add(m);
      for (const v of Object.values(m))
        if ((v as { isTexture?: boolean } | null)?.isTexture) textures.add(v);
    }
    const skinned = o as SkinnedMesh;
    if (skinned.isSkinnedMesh) {
      report.skinnedMeshes++;
      report.bones = Math.max(report.bones, skinned.skeleton.bones.length);
    }
  });
  report.materials = materials.size;
  report.textures = textures.size;
  if (!report.skinnedMeshes) problems.push("no skinned mesh");
  if (report.triangles > RUNTIME_BUDGET.triangles)
    problems.push(
      `${report.triangles} triangles exceeds ${RUNTIME_BUDGET.triangles}`,
    );
  if (report.bones > RUNTIME_BUDGET.bones)
    problems.push(`${report.bones} bones exceeds ${RUNTIME_BUDGET.bones}`);
  if (report.materials > RUNTIME_BUDGET.materials)
    problems.push(
      `${report.materials} materials exceeds ${RUNTIME_BUDGET.materials}`,
    );
  if (report.skinnedMeshes > RUNTIME_BUDGET.skinnedMeshes)
    problems.push(
      `${report.skinnedMeshes} skinned meshes exceeds ${RUNTIME_BUDGET.skinnedMeshes}`,
    );
  if (
    manifest.triangles !== undefined &&
    Math.abs(manifest.triangles - report.triangles) > 0.5
  )
    problems.push(
      `manifest says ${manifest.triangles} triangles, GLB has ${report.triangles}`,
    );
  if (manifest.bones !== undefined && manifest.bones !== report.bones)
    problems.push(
      `manifest says ${manifest.bones} bones, GLB has ${report.bones}`,
    );
  return { problems, report };
}

async function loadGlb(
  id: FighterId,
  spec: { glb: string; manifest: string },
): Promise<GlbAsset | null> {
  const base = import.meta.env.BASE_URL;
  const [gltf, manifest] = await Promise.all([
    new GLTFLoader().loadAsync(base + spec.glb),
    fetch(base + spec.manifest).then((r) => {
      if (!r.ok) throw new Error(`manifest ${r.status}`);
      return r.json() as Promise<Manifest>;
    }),
  ]);
  const { problems, report } = validate(gltf.scene, gltf.animations, manifest);
  if (problems.length) {
    console.warn(
      `[arena] ${id} asset rejected, using the procedural model: ${problems.join("; ")}`,
    );
    return null;
  }
  let height = 0;
  gltf.scene.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry.computeBoundingBox();
    height = Math.max(height, mesh.geometry.boundingBox!.max.y);
  });
  const clips = {} as Record<AssetClipName, GlbClips>;
  for (const name of CLIPS)
    clips[name] = splitClip(gltf.animations.find((c) => c.name === name)!);
  return {
    template: gltf.scene,
    scale: FIGHTER_HEIGHT / (height || FIGHTER_HEIGHT),
    clips,
    report,
  };
}

const assetLoads = new Map<FighterId, Promise<GlbAsset | null>>();

/**
 * The validated runtime asset for a fighter, or null when it has none. Loads
 * once per page; the parsed template stays cached across matches, while each
 * arena owns and releases its own GPU copies.
 */
export function fighterAsset(id: FighterId): Promise<GlbAsset | null> {
  const spec = GLB_ASSETS[id];
  if (!spec) return Promise.resolve(null);
  let load = assetLoads.get(id);
  if (!load) {
    load = loadGlb(id, spec).catch((e) => {
      console.warn(
        `[arena] ${id} asset failed to load, using the procedural model:`,
        e,
      );
      assetLoads.delete(id);
      return null;
    });
    assetLoads.set(id, load);
  }
  return load;
}

/** Start loading the runtime assets a lobby will need, before the match. */
export function preloadFighterAssets(ids: readonly FighterId[]) {
  for (const id of new Set(ids)) void fighterAsset(id);
}

const GLB_BOUNDS = new Sphere(new Vector3(0, 1.6, 0), 2.6);
type LayeredActions = Record<ClipName, Partial<Record<Layer, AnimationAction>>>;

class GlbRig implements Rig {
  readonly kind = "glb" as const;
  readonly root: Object3D;
  private mixer: AnimationMixer;
  private mesh: SkinnedMesh;
  private actions = {} as LayeredActions;
  private live: AnimationAction[] = [];
  constructor(
    private asset: GlbAsset,
    material: Material,
    outline: Material,
  ) {
    this.root = cloneSkinned(asset.template);
    let found: SkinnedMesh | undefined;
    this.root.traverse((o) => {
      if (!found && (o as SkinnedMesh).isSkinnedMesh) found = o as SkinnedMesh;
    });
    if (!found) throw new Error("GLB fighter without a skinned mesh");
    const mesh = (this.mesh = found);
    mesh.material = material;
    const shell = new SkinnedMesh(mesh.geometry, outline);
    shell.bind(mesh.skeleton, mesh.bindMatrix);
    shell.position.copy(mesh.position);
    shell.quaternion.copy(mesh.quaternion);
    shell.scale.copy(mesh.scale);
    mesh.parent!.add(shell);
    mesh.boundingSphere = GLB_BOUNDS.clone();
    shell.boundingSphere = GLB_BOUNDS.clone();
    this.root.scale.setScalar(asset.scale);
    this.mixer = new AnimationMixer(this.root);
    const add = (clip: AssetClipName, layer: Layer) => {
      const action = this.mixer.clipAction(asset.clips[clip][layer]);
      action.play();
      action.weight = 0;
      (this.actions[clip] ??= {})[layer] = action;
    };
    for (const clip of LOCO) {
      add(clip, "upper");
      add(clip, "lower");
    }
    for (const clip of [
      "basic_attack",
      "super",
      "ball_shot",
      "hit",
      "carry_ball",
    ] as const)
      add(clip, "upper");
    for (const clip of [
      "eliminated",
      "respawn",
      "victory",
      "defeat",
      "stunned",
    ] as const)
      add(clip, "full");
  }
  duration(clip: ClipName) {
    const assetClip =
      clip === "item_sweep" || clip === "item_throw" ? "basic_attack" : clip;
    return this.asset.clips[assetClip].full.duration;
  }
  /** The graph owns time: each action is sampled at the time it asks for. */
  apply(channels: readonly Channel[], count: number) {
    for (const a of this.live) a.weight = 0;
    this.live.length = 0;
    for (let i = 0; i < count; i++) {
      const c = channels[i];
      const assetClip =
        c.clip === "item_sweep" || c.clip === "item_throw"
          ? "basic_attack"
          : c.clip;
      const action = this.actions[assetClip][c.layer];
      if (!action) continue;
      action.time = Math.min(c.time, action.getClip().duration);
      action.weight = c.weight;
      this.live.push(action);
    }
    this.mixer.update(0);
  }
  dispose() {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.root);
    this.mesh.skeleton.dispose();
    // The geometry is shared with the cached template. Disposing it releases
    // this renderer's GPU copy and its listener, so a finished match cannot
    // keep the old renderer alive; the next arena uploads it again.
    this.mesh.geometry.dispose();
  }
}

// --------------------------------------------------------------------- actor

export interface ActorFrame {
  /** Drawn ground position (prediction or interpolation already applied). */
  pos: Vec;
  /** Presentation aim (the local fighter uses its live input). */
  aim: Vec;
  alive: boolean;
  stunned: boolean;
  carrying: boolean;
  /** Presentation-only height above the authoritative ground position. */
  lift: number;
  /** Facing turn rate (1/s): faster for the local fighter. */
  turn: number;
}

/** A knockout stays on the field this long after its clip ends, then sinks. */
const DEATH_REST = 0.3;
const DEATH_SINK = 0.4;

/**
 * One fighter on the field. Facing follows aim (standard §7.2); a fighter
 * who has not aimed for a moment and is running faces where it runs, which
 * is how touch players move without an aim drag.
 */
export class FighterActor {
  readonly group = new Group();
  readonly graph: AnimationGraph;
  readonly material: MeshToonMaterial;
  private rig: Rig;
  yaw = 0;
  speed = 0;
  /** Drawn on the field this frame. */
  shown = false;
  /** Last drawn ground position. */
  readonly at: Vec = { x: 0, y: 0 };
  private vx = 0;
  private vz = 0;
  private last: Vec | null = null;
  private aimYaw = 0;
  private aimAt = -Infinity;
  private alive: boolean | null = null;
  private deadAt = 0;
  private flash = 0;
  constructor(
    readonly fighter: FighterId,
    private mats: ArenaMaterials,
    private procedural: (id: FighterId) => ProceduralAsset,
  ) {
    this.material = mats.toonFor({ doubleSided: true });
    this.rig = this.makeProcedural();
    this.graph = new AnimationGraph((clip) => this.rig.duration(clip));
    this.group.add(this.rig.root);
    this.group.visible = false;
  }
  get kind() {
    return this.rig.kind;
  }
  private makeProcedural(): Rig {
    return new ProceduralRig(
      this.procedural(this.fighter),
      this.material,
      this.mats.outline(OUTLINE_WORLD / PROCEDURAL_SCALE),
    );
  }
  /** Swap in the validated GLB once it has loaded; the graph state carries over. */
  useAsset(asset: GlbAsset) {
    const next = new GlbRig(
      asset,
      this.material,
      this.mats.outline(OUTLINE_WORLD / asset.scale),
    );
    this.group.remove(this.rig.root);
    this.rig.dispose();
    this.rig = next;
    this.group.add(next.root);
  }
  trigger(clip: ActionClip, now: number) {
    return this.graph.trigger(clip, now);
  }
  /** Brief white flash on a confirmed hit (standard §6.1). */
  hit(strength: number) {
    this.flash = Math.max(this.flash, clamp(strength, 0.25, 1));
  }
  hide() {
    this.group.visible = false;
    this.shown = false;
    this.last = null;
  }
  /** World-space point in front of the chest, for the carried ball. */
  hands(out: Vector3) {
    return out.set(
      this.at.x + Math.sin(this.yaw) * 0.5,
      0.75,
      this.at.y + Math.cos(this.yaw) * 0.5,
    );
  }
  update(dt: number, now: number, f: ActorFrame) {
    if (this.alive === null) this.alive = f.alive;
    if (f.alive !== this.alive) {
      this.alive = f.alive;
      if (f.alive) {
        this.graph.trigger("respawn", now);
        this.last = null;
      } else {
        this.graph.trigger("eliminated", now);
        this.deadAt = now;
      }
    }
    // A knocked-out fighter stays down briefly, then sinks out of view.
    const DEATH_SHOW = Math.max(0.8, this.rig.duration("eliminated") + DEATH_REST);
    const deadFor = f.alive ? 0 : now - this.deadAt;
    if (!f.alive && deadFor > DEATH_SHOW + DEATH_SINK) {
      this.hide();
      return;
    }
    this.group.visible = true;
    this.shown = true;
    if (f.alive) {
      this.at.x = f.pos.x;
      this.at.y = f.pos.y;
    }
    // Velocity from the drawn path, lightly smoothed; teleports reset it.
    if (this.last && dt > 0) {
      const ix = (this.at.x - this.last.x) / dt,
        iz = (this.at.y - this.last.y) / dt;
      if (Math.hypot(ix, iz) > 40) this.vx = this.vz = 0;
      else {
        const k = smoothK(dt, 0.06);
        this.vx += (ix - this.vx) * k;
        this.vz += (iz - this.vz) * k;
      }
    } else this.vx = this.vz = 0;
    this.last = this.last ?? { x: 0, y: 0 };
    this.last.x = this.at.x;
    this.last.y = this.at.y;
    this.speed = f.alive ? Math.hypot(this.vx, this.vz) : 0;

    const aimYaw = Math.atan2(f.aim.x, f.aim.y);
    if (Math.abs(angleDelta(aimYaw, this.aimYaw)) > 0.02) this.aimAt = now;
    this.aimYaw = aimYaw;
    const moving = this.speed > 0.6;
    const faceAim = !moving || now - this.aimAt < 0.7 || this.graph.acting;
    const target = faceAim ? aimYaw : Math.atan2(this.vx, this.vz);
    if (!this.graph.knockedOut)
      this.yaw += angleDelta(target, this.yaw) * (1 - Math.exp(-dt * f.turn));

    // Travel direction in the fighter's frame: forward (sin, cos), right (-cos, sin).
    const s = Math.sin(this.yaw),
      c = Math.cos(this.yaw),
      inv = this.speed > 0.05 ? 1 / this.speed : 0;
    this.graph.update(dt, now, {
      speed: this.speed,
      fwd: (this.vx * s + this.vz * c) * inv,
      right: (-this.vx * c + this.vz * s) * inv,
      stunned: f.stunned && f.alive,
      carrying: f.carrying && f.alive,
    });
    this.rig.apply(this.graph.channels, this.graph.count);

    const sink =
      deadFor > DEATH_SHOW ? ((deadFor - DEATH_SHOW) / DEATH_SINK) * 0.9 : 0;
    this.group.position.set(this.at.x, f.lift - sink, this.at.y);
    this.group.rotation.y = this.yaw;
    this.flash = Math.max(0, this.flash - dt * 7);
    this.material.emissive.setScalar(this.flash * 0.85);
  }
  dispose() {
    this.rig.dispose();
  }
}

const angleDelta = (to: number, from: number) => {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
};
