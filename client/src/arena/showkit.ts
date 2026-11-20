import {
  AdditiveBlending,
  CanvasTexture,
  Color,
  CustomBlending,
  DynamicDrawUsage,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  LinearFilter,
  LinearMipmapLinearFilter,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  NormalBlending,
  OneMinusDstColorFactor,
  PlaneGeometry,
  Quaternion,
  SRGBColorSpace,
  ShaderMaterial,
  Vector3,
  ZeroFactor,
  type Object3D,
  type PerspectiveCamera,
} from "three";
import type { Vec } from "../../../shared/definitions";
import type { Match } from "../../../shared/types";
import { preferences } from "../audio";
import { uiPrefs } from "../ui/core/feedback";
import type { ActionClip } from "./fighters";
import type { Effects } from "./fx";
import type { ArenaMaterials } from "./materials";

/**
 * The shared showcase kit (arena presentation, performance standard §3,
 * §6): one sprite atlas, two instanced draws of camera-facing quads, a
 * fixed particle pool and the screen takeovers a fighter show uses. Brandon
 * Nguyen's show (`swiper.ts`) and the roster show (`roster.ts`) both extend
 * `SpriteShow`; neither copies it.
 *
 * Nothing here reads input or changes gameplay. Screen takeovers (darken,
 * wash, speed lines, impact frame, zoom punch, hit-stop) play only for the
 * viewer whose camera is on the fighter they belong to. Reduced motion
 * drops the flashes, zoom, hit-stop and shake and halves particle bursts.
 */

// ---------------------------------------------------------------- atlas

export interface Rect {
  u: number;
  v: number;
  du: number;
  dv: number;
  aspect: number;
}
export type Draw = (g: CanvasRenderingContext2D, w: number, h: number) => void;
export type AddSprite = (name: string, w: number, h: number, draw: Draw) => void;

export const INK = "rgba(11, 14, 20, 0.96)";
export const FONT = (px: number) =>
  `900 ${px}px 'Barlow Condensed', 'Arial Narrow', sans-serif`;

/** `roundRect` does not exist before Safari 16; arcs draw the same shape. */
export function rounded(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  if (typeof g.roundRect === "function") return g.roundRect(x, y, w, h, r);
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/**
 * A packed sprite atlas built in two passes: sprites are recorded, laid out
 * in rows, and only then drawn into a canvas just tall enough (a power of
 * two, at most `width`), so a match pays only for what it uses.
 */
export class Atlas {
  private jobs: { name: string; w: number; h: number; draw: Draw }[] = [];
  constructor(readonly width = 2048) {}
  add: AddSprite = (name, w, h, draw) => {
    this.jobs.push({ name, w: Math.ceil(w), h: Math.ceil(h), draw });
  };
  /** White text with an ink outline, optionally on a rounded plate. */
  text(name: string, str: string, px: number, plate = false) {
    const probe = document.createElement("canvas").getContext("2d")!;
    probe.font = FONT(px);
    const w = Math.min(this.width - 8, Math.ceil(probe.measureText(str).width) + px * 0.5);
    const h = Math.ceil(px * 1.32);
    this.add(name, w, h, (g) => {
      g.font = FONT(px);
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.lineJoin = "round";
      if (plate) {
        g.lineWidth = px * 0.09;
        g.strokeStyle = "#fff";
        g.beginPath();
        rounded(g, px * 0.07, px * 0.07, w - px * 0.14, h - px * 0.14, px * 0.16);
        g.stroke();
      }
      g.lineWidth = px * 0.13;
      g.strokeStyle = INK;
      g.fillStyle = "#fff";
      g.strokeText(str, w / 2, h / 2 + px * 0.04, w - px * 0.2);
      g.fillText(str, w / 2, h / 2 + px * 0.04, w - px * 0.2);
    });
  }
  build() {
    const rects = new Map<string, Rect>();
    const place: { x: number; y: number }[] = [];
    let x = 2,
      y = 2,
      row = 0;
    for (const j of this.jobs) {
      if (x + j.w + 2 > this.width) {
        x = 2;
        y += row + 4;
        row = 0;
      }
      place.push({ x, y });
      x += j.w + 4;
      row = Math.max(row, j.h);
    }
    const used = y + row + 2;
    let height = 256;
    while (height < used && height < this.width) height *= 2;
    const canvas = document.createElement("canvas");
    canvas.width = this.width;
    canvas.height = height;
    const g = canvas.getContext("2d")!;
    this.jobs.forEach((j, i) => {
      const at = place[i];
      if (at.y + j.h > height) return;
      g.save();
      g.translate(at.x, at.y);
      g.beginPath();
      g.rect(0, 0, j.w, j.h);
      g.clip();
      j.draw(g, j.w, j.h);
      g.restore();
      rects.set(j.name, {
        u: at.x / this.width,
        v: 1 - (at.y + j.h) / height,
        du: j.w / this.width,
        dv: j.h / height,
        aspect: j.w / j.h,
      });
    });
    return { canvas, rects };
  }
}

const radialDraw =
  (stops: [number, number][]): Draw =>
  (g, w) => {
    const grad = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    for (const [at, a] of stops) grad.addColorStop(at, `rgba(255,255,255,${a})`);
    g.fillStyle = grad;
    g.fillRect(0, 0, w, w);
  };

/**
 * Sprites every show needs: `px` (solid), `dot` (soft glow), `vign`,
 * `spot` (a spotlight hole), `star`, `flare`, `lines` (speed lines),
 * `rays` and `ringS` (a soft ring).
 */
export function basicSprites(add: AddSprite) {
  add("px", 8, 8, (g, w, h) => {
    g.fillStyle = "#fff";
    g.fillRect(0, 0, w, h);
  });
  add("dot", 64, 64, radialDraw([[0, 1], [0.35, 0.55], [1, 0]]));
  add("vign", 128, 128, radialDraw([[0, 0], [0.55, 0], [1, 1]]));
  add("spot", 256, 256, radialDraw([[0, 0], [0.09, 0], [0.24, 1], [1, 1]]));
  add("ringS", 256, 256, radialDraw([[0, 0], [0.74, 0], [0.86, 1], [0.93, 0.5], [1, 0]]));
  add("star", 64, 64, (g) => {
    g.fillStyle = "#fff";
    g.translate(32, 32);
    g.beginPath();
    for (let i = 0; i < 8; i++) {
      const r = i % 2 ? 5 : 31,
        a = (i * Math.PI) / 4;
      g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    g.fill();
  });
  add("flare", 256, 32, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0, "rgba(255,255,255,0)");
    grad.addColorStop(0.5, "rgba(255,255,255,1)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.beginPath();
    g.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
    g.fill();
  });
  add("lines", 256, 256, (g) => {
    g.fillStyle = "#fff";
    g.translate(128, 128);
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) % 1000) / 1000;
    for (let i = 0; i < 46; i++) {
      g.save();
      g.rotate((i / 46) * Math.PI * 2 + rnd() * 0.1);
      const r0 = 66 + rnd() * 44,
        half = 1.5 + rnd() * 3.5;
      g.beginPath();
      g.moveTo(r0, 0);
      g.lineTo(190, -half);
      g.lineTo(190, half);
      g.fill();
      g.restore();
    }
  });
  add("rays", 256, 256, (g) => {
    g.translate(128, 128);
    for (let i = 0; i < 14; i++) {
      g.save();
      g.rotate((i / 14) * Math.PI * 2);
      const grad = g.createLinearGradient(0, 0, 128, 0);
      grad.addColorStop(0, "rgba(255,255,255,0.9)");
      grad.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = grad;
      const half = i % 2 ? 9 : 17;
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(128, -half);
      g.lineTo(128, half);
      g.fill();
      g.restore();
    }
  });
}

// ---------------------------------------------------------------- sprite draw

const VERTEX = /* glsl */ `
attribute vec4 aRect;
attribute vec4 aColor;
varying vec2 vUv;
varying vec4 vColor;
void main() {
  vUv = aRect.xy + uv * aRect.zw;
  vColor = aColor;
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
}`;
const FRAGMENT = /* glsl */ `
uniform sampler2D map;
varying vec2 vUv;
varying vec4 vColor;
void main() {
  vec4 t = texture2D(map, vUv);
  gl_FragColor = vec4(t.rgb * vColor.rgb, t.a * vColor.a);
  if (gl_FragColor.a < 0.004) discard;
  #include <colorspace_fragment>
}`;

const _m = new Matrix4();
const _q = new Quaternion();
const _roll = new Quaternion();
const _p = new Vector3();
const _s = new Vector3();
export const _v = new Vector3();
export const _c = new Color();
const Z = new Vector3(0, 0, 1);

/** One instanced draw of atlas quads. */
export class Layer {
  readonly mesh: InstancedMesh;
  private aRect: InstancedBufferAttribute;
  private aColor: InstancedBufferAttribute;
  n = 0;
  constructor(
    mats: ArenaMaterials,
    texture: CanvasTexture,
    private capacity: number,
    additive: boolean,
  ) {
    const geometry = mats.track(new PlaneGeometry(1, 1));
    this.aRect = new InstancedBufferAttribute(
      new Float32Array(capacity * 4),
      4,
    ).setUsage(DynamicDrawUsage);
    this.aColor = new InstancedBufferAttribute(
      new Float32Array(capacity * 4),
      4,
    ).setUsage(DynamicDrawUsage);
    geometry.setAttribute("aRect", this.aRect);
    geometry.setAttribute("aColor", this.aColor);
    this.mesh = new InstancedMesh(
      geometry,
      mats.track(
        new ShaderMaterial({
          uniforms: { map: { value: texture } },
          vertexShader: VERTEX,
          fragmentShader: FRAGMENT,
          transparent: true,
          depthWrite: false,
          blending: additive ? AdditiveBlending : NormalBlending,
        }),
      ),
      capacity,
    );
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = additive ? 31 : 30;
    this.mesh.count = 0;
  }
  push(
    matrix: Matrix4,
    rect: Rect,
    crop: number,
    r: number,
    g: number,
    b: number,
    a: number,
  ) {
    if (this.n >= this.capacity || a <= 0.004) return;
    const i = this.n++;
    this.mesh.setMatrixAt(i, matrix);
    // `crop` keeps the top share of the sprite, for paper that unrolls.
    this.aRect.setXYZW(
      i,
      rect.u,
      rect.v + rect.dv * (1 - crop),
      rect.du,
      rect.dv * crop,
    );
    this.aColor.setXYZW(i, r, g, b, a);
  }
  end() {
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.aRect.needsUpdate = true;
    this.aColor.needsUpdate = true;
    this.n = 0;
  }
}

// ------------------------------------------------------------------ particles

export interface Particle {
  on: boolean;
  t: number;
  life: number;
  delay: number;
  rect: Rect;
  /** World position, or screen position in -1..1 when `screen`. */
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  gravity: number;
  drag: number;
  /** Offset along the screen axes, so pieces move together (world units). */
  ox: number;
  oy: number;
  vox: number;
  voy: number;
  /** Size in world units, or as a share of screen height when `screen`. */
  w: number;
  h: number;
  /** Scale reached at the end of life. */
  grow: number;
  /** Slam in: scale from `pop0` to 1 over `pop` seconds, with overshoot. */
  pop: number;
  pop0: number;
  /** Slide in from (sx, sy) over `slide` seconds, with overshoot. */
  slide: number;
  sx: number;
  sy: number;
  /** Seconds to unroll from the top edge (receipts). */
  unroll: number;
  roll: number;
  spin: number;
  r: number;
  g: number;
  b: number;
  a: number;
  /** Share of life after which it fades out. */
  fade: number;
  add: boolean;
  screen: boolean;
  flicker: boolean;
  /** Restitution on the ground; 0 falls through. */
  bounce: number;
  sparkle: boolean;
  /** Leaf-like side to side drift. */
  sway: number;
  /** Spiral around (cx, cz). */
  swirl: boolean;
  cx: number;
  cz: number;
  rad: number;
  radV: number;
  ang: number;
  angV: number;
  /** Flies back to this fighter after `homeAt` seconds. */
  home: string | null;
  homeAt: number;
  /** What it leaves behind when its life ends; 0 is nothing (see `onDie`). */
  die: number;
}

export const blank = (rect: Rect): Particle => ({
  on: false,
  t: 0,
  life: 1,
  delay: 0,
  rect,
  x: 0,
  y: 0,
  z: 0,
  vx: 0,
  vy: 0,
  vz: 0,
  gravity: 0,
  drag: 0,
  ox: 0,
  oy: 0,
  vox: 0,
  voy: 0,
  w: 0.3,
  h: 0.3,
  grow: 1,
  pop: 0,
  pop0: 1,
  slide: 0,
  sx: 0,
  sy: 0,
  unroll: 0,
  roll: 0,
  spin: 0,
  r: 1,
  g: 1,
  b: 1,
  a: 1,
  fade: 0.6,
  add: false,
  screen: false,
  flicker: false,
  bounce: 0,
  sparkle: false,
  sway: 0,
  swirl: false,
  cx: 0,
  cz: 0,
  rad: 0,
  radV: 0,
  ang: 0,
  angV: 0,
  home: null,
  homeAt: 0,
  die: 0,
});

export const rand = (a: number, b: number) => a + Math.random() * (b - a);
export const outBack = (k: number) => {
  const c = 1.9,
    t = Math.min(1, k) - 1;
  return 1 + (c + 1) * t * t * t + c * t * t;
};
export const sat = (x: number) => Math.max(0, Math.min(1, x));

// ----------------------------------------------------------------------- show

/** A fighter a show reads each frame; `FighterActor` satisfies it. */
export interface ShowActor {
  readonly at: Vec;
  readonly group: Object3D;
  yaw: number;
  speed: number;
  shown: boolean;
  trigger(clip: ActionClip, now: number): boolean;
}

export interface ShowFrame {
  now: number;
  dt: number;
  match: Match;
  localId: string;
  /** The fighter the camera follows. */
  focusId: string | null;
  actors: ReadonlyMap<string, ShowActor>;
}

interface Timed {
  at: number;
  run: () => void;
}

/**
 * The base of every fighter show. Subclasses build an atlas (which must
 * include `basicSprites`), decide what plays in `update`, and call the
 * building blocks below; the base draws everything once per frame.
 */
export abstract class SpriteShow {
  readonly group = new Group();
  /** The view holds the frame until this time (hit-stop, presentation only). */
  freezeUntil = 0;
  protected rects: Map<string, Rect>;
  protected sprites: Layer;
  protected glow: Layer;
  private invert: Mesh;
  private invertUntil = 0;
  private pool: Particle[] = [];
  private defaults!: Particle;
  /** Screen particles, drawn after the world and the screen overlays. */
  private onScreen: Particle[] = [];
  protected vignette = 0;
  protected vignetteColor = 0xff4d5e;
  protected sparkleHex = 0xffd24a;
  private cursor = 0;
  private timeline: Timed[] = [];
  protected dark = { start: 0, in: 0.2, end: 0, out: 0.3, alpha: 0, id: "" };
  protected tint = { start: 0, end: 0, color: 0, alpha: 0 };
  protected lines = { start: 0, end: 0 };
  private punch = { start: 0, dur: 1, amount: 0 };
  private lastFreeze = 0;
  protected now = 0;
  protected calm = false;
  protected focus: string | null = null;
  protected local = "";
  protected actors: ReadonlyMap<string, ShowActor> = new Map();
  protected right = new Vector3();
  protected up = new Vector3();
  protected center = new Vector3();
  protected halfH = 1;
  protected halfW = 1;

  constructor(
    mats: ArenaMaterials,
    protected camera: PerspectiveCamera,
    protected fx: Effects,
    private shakeView: (ms: number, intensity: number, now: number) => void,
    atlas: { canvas: HTMLCanvasElement; rects: Map<string, Rect> },
    private cap: number,
  ) {
    this.rects = atlas.rects;
    const texture = mats.track(new CanvasTexture(atlas.canvas));
    texture.colorSpace = SRGBColorSpace;
    texture.minFilter = LinearMipmapLinearFilter;
    texture.magFilter = LinearFilter;
    this.sprites = new Layer(mats, texture, cap + 160, false);
    this.glow = new Layer(mats, texture, cap, true);
    const dot = this.rect("dot");
    this.defaults = blank(dot);
    for (let i = 0; i < cap; i++) this.pool.push(blank(dot));

    // One quad that inverts whatever is already drawn: the impact frame.
    this.invert = new Mesh(
      mats.track(new PlaneGeometry(1, 1)),
      mats.track(
        new MeshBasicMaterial({
          color: 0xffffff,
          blending: CustomBlending,
          blendSrc: OneMinusDstColorFactor,
          blendDst: ZeroFactor,
          depthTest: false,
          depthWrite: false,
          fog: false,
        }),
      ),
    );
    this.invert.frustumCulled = false;
    this.invert.renderOrder = 32;
    this.invert.visible = false;
    this.group.add(this.sprites.mesh, this.glow.mesh, this.invert);
  }

  protected rect(name: string) {
    return this.rects.get(name)!;
  }
  protected isFocus(id: string) {
    return this.focus === id;
  }
  /** The fighter's own screen, even after the camera has left a fallen fighter. */
  protected isMine(id: string) {
    return this.focus === id || this.local === id;
  }
  protected shake(ms: number, intensity: number) {
    if (!preferences.shake || this.calm) return;
    this.shakeView(ms, intensity, this.now);
  }
  /** Hit-stop for the viewer following `id`; never the simulation. */
  protected freeze(ms: number, id: string) {
    if (this.calm || !this.isFocus(id) || this.now < this.lastFreeze + 0.3)
      return;
    this.lastFreeze = this.now;
    this.freezeUntil = this.now + ms / 1000;
  }
  protected zoom(amount: number, dur: number, id: string) {
    if (this.calm || !preferences.shake || !this.isFocus(id)) return;
    this.punch.start = this.now;
    this.punch.dur = dur;
    this.punch.amount = amount;
  }
  /** Camera distance multiplier: a fast punch in, then an eased return. */
  zoomAt(now: number) {
    const k = (now - this.punch.start) / this.punch.dur;
    if (k < 0 || k >= 1) return 1;
    const shape = k < 0.12 ? k / 0.12 : (1 - (k - 0.12) / 0.88) ** 3;
    return 1 - this.punch.amount * shape;
  }
  /** Squash-and-stretch height multiplier for one fighter. */
  squashOf(_id: string, _now: number) {
    return 1;
  }
  /** The fighter every camera should hold on, if the show owns the view. */
  leadId(): string | null {
    return null;
  }
  protected after(delay: number, run: () => void) {
    this.timeline.push({ at: this.now + delay, run });
  }
  protected count(n: number) {
    return this.calm ? Math.ceil(n / 2) : n;
  }
  /** Forget scheduled beats (a rematch). */
  protected clearTimeline() {
    this.timeline.length = 0;
  }
  protected runTimeline(now: number) {
    for (let i = this.timeline.length - 1; i >= 0; i--)
      if (now >= this.timeline[i].at) this.timeline.splice(i, 1)[0].run();
  }

  /** A pooled particle. A full pool recycles the next slot in the ring. */
  protected spawn(name: string, x: number, y: number, z: number): Particle {
    let p = this.pool[this.cursor];
    for (let i = 0; i < 24 && p.on; i++) {
      this.cursor = (this.cursor + 1) % this.cap;
      p = this.pool[this.cursor];
    }
    this.cursor = (this.cursor + 1) % this.cap;
    Object.assign(p, this.defaults);
    p.rect = this.rect(name) ?? this.defaults.rect;
    p.on = true;
    p.x = x;
    p.y = y;
    p.z = z;
    p.w = p.h * p.rect.aspect;
    return p;
  }
  protected size(p: Particle, h: number) {
    p.h = h;
    p.w = h * p.rect.aspect;
    return p;
  }
  protected color(p: Particle, hex: number) {
    _c.setHex(hex);
    p.r = _c.r;
    p.g = _c.g;
    p.b = _c.b;
    return p;
  }
  protected hue(p: Particle, h: number, light = 0.6) {
    _c.setHSL(((h % 1) + 1) % 1, 1, light);
    p.r = _c.r;
    p.g = _c.g;
    p.b = _c.b;
    return p;
  }

  // ------------------------------------------------------------ building blocks

  /** Text or a stamp that slams in above a point in the world. */
  protected stamp(
    name: string,
    at: Vec,
    y: number,
    h: number,
    hex: number,
    life = 0.9,
    roll = 0,
  ) {
    const p = this.size(this.spawn(name, at.x, y, at.y), h);
    this.color(p, hex);
    p.life = life;
    p.pop = 0.13;
    p.pop0 = 2.6;
    p.roll = roll;
    p.fade = 0.75;
    return p;
  }
  /** Screen text that slams in, with red and cyan ghosts for a split second. */
  protected slam(
    name: string,
    x: number,
    y: number,
    h: number,
    life: number,
    hex = 0xffffff,
    chroma = true,
  ) {
    h = Math.min(h, (0.94 * this.camera.aspect) / this.rect(name).aspect);
    const make = (dx: number, tint: number, add: boolean) => {
      const p = this.size(this.spawn(name, x + dx, y, 0), h);
      this.color(p, tint);
      p.screen = true;
      p.life = add ? Math.min(0.32, life) : life;
      p.pop = 0.14;
      p.pop0 = 3;
      p.fade = add ? 0.2 : 0.8;
      p.add = add;
      p.a = add ? 0.8 : 1;
      return p;
    };
    if (chroma && !this.calm) {
      make(-0.012, 0xff2a4d, true);
      make(0.012, 0x2ad4ff, true);
    }
    return make(0, hex, false);
  }
  protected sparkle(x: number, y: number, z: number, hex = this.sparkleHex, h = 0.22) {
    const p = this.size(this.spawn("star", x, y, z), h);
    this.color(p, hex);
    p.add = true;
    p.life = rand(0.25, 0.5);
    p.spin = rand(-6, 6);
    p.grow = 0.2;
    p.vy = rand(0.3, 1.2);
    return p;
  }
  protected darken(
    id: string,
    alpha: number,
    seconds: number,
    fadeIn = 0.22,
    fadeOut = 0.35,
  ) {
    if (this.calm || !this.isFocus(id)) return;
    Object.assign(this.dark, {
      start: this.now,
      in: fadeIn,
      end: this.now + seconds,
      out: fadeOut,
      alpha,
      id,
    });
  }
  protected wash(id: string, color: number, alpha: number, seconds: number) {
    if (this.calm || !this.isFocus(id)) return;
    Object.assign(this.tint, {
      start: this.now,
      end: this.now + seconds,
      color,
      alpha,
    });
  }
  protected speedLines(id: string, seconds: number) {
    if (this.calm || !this.isFocus(id)) return;
    this.lines.start = this.now;
    this.lines.end = this.now + seconds;
  }
  protected impactFrame(id: string, seconds = 0.08) {
    if (this.calm || !this.isFocus(id)) return;
    this.invertUntil = this.now + seconds;
  }

  // ------------------------------------------------------------------ drawing

  /** An immediate world quad, facing the camera. */
  protected quad(
    name: string,
    x: number,
    y: number,
    z: number,
    h: number,
    roll: number,
    hex: number,
    alpha: number,
    add: boolean,
  ) {
    const rect = this.rect(name);
    if (!rect) return;
    _c.setHex(hex);
    this.emit(add ? this.glow : this.sprites, rect, _p.set(x, y, z), h * rect.aspect, h, roll, 1, _c.r, _c.g, _c.b, alpha);
  }
  /** An immediate screen quad; x, y in -1..1, h as a share of screen height. */
  protected screenQuad(
    name: string,
    x: number,
    y: number,
    h: number,
    hex: number,
    alpha: number,
    add: boolean,
    w = 0,
    roll = 0,
  ) {
    const rect = this.rect(name);
    _c.setHex(hex);
    this.toScreen(_p, x, y);
    const unit = 2 * this.halfH;
    this.emit(add ? this.glow : this.sprites, rect, _p, (w || h * rect.aspect) * unit, h * unit, roll, 1, _c.r, _c.g, _c.b, alpha);
  }
  protected toScreen(out: Vector3, x: number, y: number) {
    return out
      .copy(this.center)
      .addScaledVector(this.right, x * this.halfW)
      .addScaledVector(this.up, y * this.halfH);
  }
  private emit(
    layer: Layer,
    rect: Rect,
    at: Vector3,
    w: number,
    h: number,
    roll: number,
    crop: number,
    r: number,
    g: number,
    b: number,
    a: number,
  ) {
    _q.copy(this.camera.quaternion);
    if (roll) _q.multiply(_roll.setFromAxisAngle(Z, roll));
    _m.compose(at, _q, _s.set(w, h * crop, 1));
    layer.push(_m, rect, crop, r, g, b, a);
  }

  /** What a particle with a `die` value leaves behind. */
  protected onDie(_p: Particle) {}

  private particles(dt: number) {
    for (const p of this.pool) {
      if (!p.on) continue;
      if (p.delay > 0) {
        p.delay -= dt;
        if (p.delay > 0) continue;
      }
      p.t += dt;
      if (p.t >= p.life) {
        p.on = false;
        if (p.die) this.onDie(p);
        continue;
      }
      if (p.swirl) {
        p.ang += p.angV * dt;
        p.rad = Math.max(0.05, p.rad + p.radV * dt);
        p.y += p.vy * dt;
        p.x = p.cx + Math.cos(p.ang) * p.rad;
        p.z = p.cz + Math.sin(p.ang) * p.rad;
      } else if (p.home && p.t > p.homeAt) {
        const to = this.actors.get(p.home);
        if (!to) p.on = false;
        else {
          const k = 1 - Math.exp(-dt * 11);
          p.x += (to.at.x - p.x) * k;
          p.y += (1.15 - p.y) * k;
          p.z += (to.at.y - p.z) * k;
          if (Math.hypot(to.at.x - p.x, to.at.y - p.z) < 0.25) p.on = false;
        }
        if (!p.on) continue;
      } else {
        p.vy += p.gravity * dt;
        if (p.drag) {
          const keep = Math.exp(-p.drag * dt);
          p.vx *= keep;
          p.vz *= keep;
        }
        p.x += p.vx * dt + (p.sway ? Math.cos(p.t * 2.6) * p.sway * dt : 0);
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        if (p.bounce && !p.screen && p.y < p.h / 2 && p.vy < 0) {
          p.y = p.h / 2;
          if (p.sparkle && p.vy < -2.5) this.sparkle(p.x, p.y, p.z, this.sparkleHex, 0.2);
          p.vy = -p.vy * p.bounce;
          p.vx *= 0.7;
          p.vz *= 0.7;
        }
      }
      p.ox += p.vox * dt;
      p.oy += p.voy * dt;
      p.roll += p.spin * dt;
      if (p.sway) p.roll = Math.sin(p.t * 2.6) * 0.6;

      if (p.screen) this.onScreen.push(p);
      else this.draw(p);
    }
  }

  private draw(p: Particle) {
    const k = p.t / p.life;
    let alpha = p.a * (k < p.fade ? 1 : 1 - (k - p.fade) / (1 - p.fade || 1));
    if (p.flicker && p.t < 0.5) alpha *= Math.sin(p.t * 60) > 0 ? 1 : 0.25;
    let scale =
      p.pop && p.t < p.pop
        ? p.pop0 + (1 - p.pop0) * outBack(p.t / p.pop)
        : 1 + (p.grow - 1) * k;
    scale = Math.max(0.01, scale);
    let dx = 0,
      dy = 0;
    if (p.slide && p.t < p.slide) {
      const e = 1 - outBack(p.t / p.slide);
      dx = p.sx * e;
      dy = p.sy * e;
    }
    const crop = p.unroll ? Math.min(1, p.t / p.unroll) : 1;
    const layer = p.add ? this.glow : this.sprites;
    if (p.screen) {
      this.toScreen(_p, p.x + dx, p.y + dy);
      const unit = 2 * this.halfH;
      _p.addScaledVector(this.up, (p.h * unit * (1 - crop)) / 2);
      this.emit(layer, p.rect, _p, p.w * unit * scale, p.h * unit * scale, p.roll, crop, p.r, p.g, p.b, alpha);
    } else {
      _p.set(p.x + dx, p.y + dy, p.z)
        .addScaledVector(this.right, p.ox)
        .addScaledVector(this.up, p.oy + (p.h * (1 - crop)) / 2);
      this.emit(layer, p.rect, _p, p.w * scale, p.h * scale, p.roll, crop, p.r, p.g, p.b, alpha);
    }
  }

  /** Steady screen layers drawn under the dimming (a cutscene's letterbox). */
  protected underlays(_now: number) {}

  /** Screen takeovers, drawn under the banners. Only for the focused viewer. */
  private overlays(now: number) {
    this.underlays(now);
    const d = this.dark;
    if (now < d.end) {
      const a =
        d.alpha *
        Math.min(1, (now - d.start) / d.in) *
        Math.min(1, (d.end - now) / d.out);
      const who = this.actors.get(d.id);
      if (who) {
        // A spotlight: the dark has a hole that follows the fighter.
        _v.set(who.at.x, 1.3, who.at.y).project(this.camera);
        this.screenQuad("spot", _v.x, _v.y, 5, 0x05070c, a, false, 5);
      } else this.screenQuad("px", 0, 0, 2.2, 0x05070c, a, false, 6);
    }
    const w = this.tint;
    if (now < w.end) {
      const k = (now - w.start) / (w.end - w.start);
      this.screenQuad("px", 0, 0, 2.2, w.color, w.alpha * Math.sin(Math.PI * Math.min(1, k)) ** 0.5, true, 6);
    }
    if (this.vignette > 0 && !this.calm)
      this.screenQuad("vign", 0, 0, 1.06, this.vignetteColor, this.vignette, false, 1.06 * this.camera.aspect);
    this.vignette = 0;
    if (now < this.lines.end) {
      const k = (now - this.lines.start) / (this.lines.end - this.lines.start);
      const size = 2.6 + 0.25 * Math.sin(now * 70);
      this.screenQuad("lines", 0, 0, size, 0xffffff, 0.75 * (1 - k), false, size * this.camera.aspect);
    }
  }

  /** The show's own logic for one frame: what to start and what to draw. */
  protected abstract update(f: ShowFrame): void;
  /** World objects that are not sprites (props), after the particles. */
  protected props(_now: number) {}

  frame(f: ShowFrame) {
    const cam = this.camera;
    this.now = f.now;
    this.calm = uiPrefs.reducedMotion;
    this.focus = f.focusId;
    this.local = f.localId;
    this.actors = f.actors;
    this.right.set(1, 0, 0).applyQuaternion(cam.quaternion);
    this.up.set(0, 1, 0).applyQuaternion(cam.quaternion);
    const depth = 2;
    this.halfH = depth * Math.tan((cam.fov * Math.PI) / 360);
    this.halfW = this.halfH * cam.aspect;
    this.center
      .set(0, 0, -depth)
      .applyQuaternion(cam.quaternion)
      .add(cam.position);

    this.update(f);
    this.onScreen.length = 0;
    this.particles(f.dt);
    this.props(f.now);
    this.overlays(f.now);
    for (const p of this.onScreen) this.draw(p);
    this.sprites.end();
    this.glow.end();

    this.invert.visible = f.now < this.invertUntil;
    if (this.invert.visible) {
      this.invert.position.copy(this.center);
      this.invert.quaternion.copy(cam.quaternion);
      this.invert.scale.set(this.halfW * 2.2, this.halfH * 2.2, 1);
    }
  }
}
