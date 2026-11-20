import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  DynamicDrawUsage,
  Group,
  IcosahedronGeometry,
  InstancedBufferAttribute,
  InstancedMesh,
  LinearFilter,
  LinearMipmapLinearFilter,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  NormalBlending,
  NotEqualStencilFunc,
  ReplaceStencilOp,
  PlaneGeometry,
  Quaternion,
  RingGeometry,
  SRGBColorSpace,
  ShaderMaterial,
  SphereGeometry,
  TorusGeometry,
  Vector3,
  type Camera,
  type Material,
  type Object3D,
} from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import {
  FIGHTERS,
  IDS,
  ITEMS,
  shotPoint,
  type FighterId,
  type Vec,
} from "../../../shared/definitions";
import type { Area, Item } from "../../../shared/types";
import { merge, part } from "../ui/scene/geometry";
import type { AimIntent, AimShape } from "../../../shared/footprints";
import { itemModel, projectileModel } from "./attackModels";
import type { ArenaMaterials } from "./materials";

/**
 * Arena presentation layer (performance standard §3, §5.2, §6): pooled,
 * per-entity and transient visuals. Everything here is allocated once per
 * match and reused; per frame only transforms, counts and colors change.
 *
 * - `Billboards`: names, health bars, damage numbers and stun stars as one
 *   instanced draw from a single canvas atlas.
 * - `Markers`: blob shadows and ground rings, two instanced draws.
 * - `Effects`: ground rings, flash discs and release streaks.
 * - `Strikes`: the attacks themselves in 3D (waves, swings, beams, light
 *   volumes, wavefronts, blast domes) instead of flat floor highlights.
 * - `Projectiles`, `Areas`, `Ball`, `Vans`, `AimArrow`: gameplay objects drawn
 *   from the snapshot, never simulated here.
 */

const _m = new Matrix4();
const _q = new Quaternion();
const _qRoll = new Quaternion();
const _p = new Vector3();
const _s = new Vector3();
const _c = new Color();
const Z = new Vector3(0, 0, 1);
const Y = new Vector3(0, 1, 0);
const X = new Vector3(1, 0, 0);
const _white = new Color(0xffffff);
const flatRot = new Quaternion().setFromAxisAngle(
  new Vector3(1, 0, 0),
  -Math.PI / 2,
);

// ---------------------------------------------------------------- billboards

const ATLAS_W = 1024;
const ATLAS_H = 512;
const GLYPHS = "0123456789+★";
const GLYPH_TOP = 8;
const GLYPH_H = 76;
const SLOT_TOP = 92;
const SLOT_H = 52;
const SLOT_W = 512;
const NAME_FONT = "800 36px 'Barlow Condensed', 'Arial Narrow', sans-serif";
const GLYPH_FONT = "900 62px 'Barlow Condensed', 'Arial Narrow', sans-serif";
/** Capital height as a fraction of the slot / glyph cell, for sizing text by its visible height. */
const NAME_CAP = 26 / SLOT_H;
const GLYPH_CAP = 44 / GLYPH_H;
const INK = "rgba(11, 14, 20, 0.96)";

export interface AtlasRect {
  u: number;
  v: number;
  du: number;
  dv: number;
  /** Width / height of the drawn content. */
  aspect: number;
}
const rectOf = (x: number, y: number, w: number, h: number): AtlasRect => ({
  u: x / ATLAS_W,
  v: 1 - (y + h) / ATLAS_H,
  du: w / ATLAS_W,
  dv: h / ATLAS_H,
  aspect: w / h,
});

const BILLBOARD_VERTEX = /* glsl */ `
attribute vec4 aRect;
attribute vec4 aColor;
varying vec2 vUv;
varying vec4 vColor;
void main() {
  vUv = aRect.xy + uv * aRect.zw;
  vColor = aColor;
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
}`;
const BILLBOARD_FRAGMENT = /* glsl */ `
uniform sampler2D map;
varying vec2 vUv;
varying vec4 vColor;
void main() {
  vec4 t = texture2D(map, vUv);
  gl_FragColor = vec4(t.rgb * vColor.rgb, t.a * vColor.a);
  if (gl_FragColor.a < 0.004) discard;
  #include <colorspace_fragment>
}`;

interface Slot {
  x: number;
  y: number;
  key: string;
  text: string;
  rect: AtlasRect;
  used: number;
}

/**
 * Screen-facing quads drawn in one call, always on top of the world. Text is
 * rasterized into the atlas only when it changes (a player joins, goes
 * offline); digits are drawn once and composed per number.
 */
export class Billboards {
  readonly mesh: InstancedMesh;
  /** World units per CSS pixel at the followed fighter's depth. */
  px = 0.02;
  private canvas = document.createElement("canvas");
  private ctx: CanvasRenderingContext2D;
  private texture: CanvasTexture;
  private aRect: InstancedBufferAttribute;
  private aColor: InstancedBufferAttribute;
  private n = 0;
  private slots: Slot[] = [];
  private byKey = new Map<string, Slot>();
  private glyphs = new Map<string, AtlasRect>();
  private white = rectOf(2, 2, 4, 4);
  private right = new Vector3();
  private up = new Vector3();
  private cam = new Quaternion();
  private frame = 0;
  constructor(
    mats: ArenaMaterials,
    private capacity = 320,
  ) {
    this.canvas.width = ATLAS_W;
    this.canvas.height = ATLAS_H;
    this.ctx = this.canvas.getContext("2d")!;
    this.texture = mats.track(new CanvasTexture(this.canvas));
    this.texture.colorSpace = SRGBColorSpace;
    // Text is rasterized large and shown smaller; mipmaps keep it clean.
    this.texture.minFilter = LinearMipmapLinearFilter;
    this.texture.magFilter = LinearFilter;
    this.texture.anisotropy = 4;
    for (let row = 0; SLOT_TOP + (row + 1) * SLOT_H <= ATLAS_H; row++)
      for (let col = 0; col < ATLAS_W / SLOT_W; col++)
        this.slots.push({
          x: col * SLOT_W,
          y: SLOT_TOP + row * SLOT_H,
          key: "",
          text: "",
          rect: rectOf(0, 0, 1, 1),
          used: -1,
        });
    this.drawStatic();
    // Fonts are normally loaded by the menu already; redraw once if not.
    void document.fonts?.load(NAME_FONT).then(() => {
      this.drawStatic();
      for (const s of this.slots) if (s.key) this.drawSlot(s, s.text);
    });
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
    const material = mats.track(
      new ShaderMaterial({
        uniforms: { map: { value: this.texture } },
        vertexShader: BILLBOARD_VERTEX,
        fragmentShader: BILLBOARD_FRAGMENT,
        transparent: true,
        depthTest: false,
        depthWrite: false,
      }),
    );
    this.mesh = new InstancedMesh(geometry, material, capacity);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 20;
    this.mesh.count = 0;
  }

  private drawStatic() {
    const g = this.ctx;
    g.clearRect(0, 0, ATLAS_W, SLOT_TOP);
    g.fillStyle = "#fff";
    g.fillRect(0, 0, 8, 8);
    g.font = GLYPH_FONT;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.lineJoin = "round";
    g.lineWidth = 7;
    g.strokeStyle = INK;
    let x = 12;
    for (const ch of GLYPHS) {
      const w = Math.ceil(g.measureText(ch).width) + 14;
      g.strokeText(ch, x + w / 2, GLYPH_TOP + GLYPH_H / 2 + 2);
      g.fillText(ch, x + w / 2, GLYPH_TOP + GLYPH_H / 2 + 2);
      this.glyphs.set(ch, rectOf(x, GLYPH_TOP, w, GLYPH_H));
      x += w + 6;
    }
    this.texture.needsUpdate = true;
  }

  private drawSlot(slot: Slot, text: string) {
    const g = this.ctx;
    g.clearRect(slot.x, slot.y, SLOT_W, SLOT_H);
    g.font = NAME_FONT;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.lineJoin = "round";
    // Thin enough that narrow letters stay white when mipmapped down.
    g.lineWidth = 4.5;
    g.strokeStyle = INK;
    g.fillStyle = "#fff";
    const w = Math.min(SLOT_W - 4, Math.ceil(g.measureText(text).width) + 16);
    const cx = slot.x + SLOT_W / 2,
      cy = slot.y + SLOT_H / 2 + 1;
    g.strokeText(text, cx, cy, SLOT_W - 20);
    g.fillText(text, cx, cy, SLOT_W - 20);
    slot.text = text;
    slot.rect = rectOf(cx - w / 2, slot.y, w, SLOT_H);
    this.texture.needsUpdate = true;
  }

  /** The atlas rectangle holding `text` for `key`, redrawn only on change. */
  text(key: string, text: string): AtlasRect {
    let slot = this.byKey.get(key);
    if (!slot) {
      slot =
        this.slots.find((s) => !s.key) ??
        this.slots.reduce((a, b) => (a.used <= b.used ? a : b));
      if (slot.key) this.byKey.delete(slot.key);
      slot.key = key;
      slot.text = "\u0000";
      this.byKey.set(key, slot);
    }
    if (slot.text !== text) this.drawSlot(slot, text);
    slot.used = this.frame;
    return slot.rect;
  }

  begin(camera: Camera) {
    this.n = 0;
    this.frame++;
    this.cam.copy(camera.quaternion);
    this.right.set(1, 0, 0).applyQuaternion(this.cam);
    this.up.set(0, 1, 0).applyQuaternion(this.cam);
  }

  /**
   * One quad centered at a world anchor, offset by (dx, dy) CSS pixels along
   * the screen axes, `w` x `h` CSS pixels in size.
   */
  quad(
    at: Vector3,
    dx: number,
    dy: number,
    w: number,
    h: number,
    rect: AtlasRect,
    color: Color | number,
    alpha = 1,
    roll = 0,
  ) {
    if (this.n >= this.capacity) return;
    const px = this.px;
    _p.copy(at)
      .addScaledVector(this.right, dx * px)
      .addScaledVector(this.up, dy * px);
    _q.copy(this.cam);
    if (roll) _q.multiply(_qRoll.setFromAxisAngle(Z, roll));
    _s.set(w * px, h * px, 1);
    _m.compose(_p, _q, _s);
    const i = this.n++;
    this.mesh.setMatrixAt(i, _m);
    const c = typeof color === "number" ? _c.setHex(color) : color;
    this.aRect.setXYZW(i, rect.u, rect.v, rect.du, rect.dv);
    this.aColor.setXYZW(i, c.r, c.g, c.b, alpha);
  }

  /** A solid bar whose left edge is at `dx` pixels from the anchor. */
  bar(
    at: Vector3,
    dx: number,
    dy: number,
    w: number,
    h: number,
    color: Color | number,
    alpha = 1,
  ) {
    if (w <= 0) return;
    this.quad(at, dx + w / 2, dy, w, h, this.white, color, alpha);
  }

  /** A text slot whose capitals are `cap` pixels tall, centered on the anchor offset. */
  label(
    at: Vector3,
    dy: number,
    rect: AtlasRect,
    cap: number,
    color: Color | number = 0xffffff,
    alpha = 1,
  ) {
    const h = cap / NAME_CAP;
    this.quad(at, 0, dy, h * rect.aspect, h, rect, color, alpha);
  }

  /** A number (with optional prefix glyph) whose digits are `cap` pixels tall. */
  number(
    at: Vector3,
    dy: number,
    text: string,
    cap: number,
    color: Color | number,
    alpha = 1,
  ) {
    const h = cap / GLYPH_CAP;
    let total = 0;
    for (const ch of text)
      total += (this.glyphs.get(ch)?.aspect ?? 0) * h * 0.82;
    let x = -total / 2;
    for (const ch of text) {
      const r = this.glyphs.get(ch);
      if (!r) continue;
      const w = r.aspect * h;
      this.quad(at, x + (w * 0.82) / 2, dy, w, h, r, color, alpha);
      x += w * 0.82;
    }
  }

  glyph(ch: string) {
    return this.glyphs.get(ch)!;
  }

  end() {
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.aRect.needsUpdate = true;
    this.aColor.needsUpdate = true;
  }
}

// ------------------------------------------------------------------ markers

/** Blob shadows and ground rings under fighters, the ball and tables. */
export class Markers {
  readonly shadows: InstancedMesh;
  readonly rings: InstancedMesh;
  private ns = 0;
  private nr = 0;
  constructor(mats: ArenaMaterials) {
    this.shadows = new InstancedMesh(
      mats.track(new CircleGeometry(1, 24)),
      mats.shadow,
      32,
    );
    this.rings = new InstancedMesh(
      mats.track(new RingGeometry(0.86, 1, 40)),
      mats.track(
        new MeshBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 0.92,
          depthWrite: false,
          fog: false,
        }),
      ),
      48,
    );
    for (const m of [this.shadows, this.rings]) {
      m.instanceMatrix.setUsage(DynamicDrawUsage);
      m.frustumCulled = false;
      m.count = 0;
    }
    this.shadows.renderOrder = 1;
    this.rings.renderOrder = 4;
    this.rings.setColorAt(0, _c.setHex(0xffffff));
  }
  begin() {
    this.ns = this.nr = 0;
  }
  shadow(x: number, z: number, r: number) {
    if (this.ns >= 32) return;
    _m.compose(_p.set(x, 0.02, z), flatRot, _s.set(r, r, 1));
    this.shadows.setMatrixAt(this.ns++, _m);
  }
  ring(x: number, z: number, r: number, color: number | Color, y = 0.04) {
    if (this.nr >= 48) return;
    _m.compose(_p.set(x, y, z), flatRot, _s.set(r, r, 1));
    this.rings.setMatrixAt(this.nr, _m);
    this.rings.setColorAt(
      this.nr++,
      typeof color === "number" ? _c.setHex(color) : color,
    );
  }
  end() {
    this.shadows.count = this.ns;
    this.rings.count = this.nr;
    this.shadows.instanceMatrix.needsUpdate = true;
    this.rings.instanceMatrix.needsUpdate = true;
    if (this.rings.instanceColor) this.rings.instanceColor.needsUpdate = true;
  }
}

// ------------------------------------------------------------------ effects

type FxKind = "ring" | "disc" | "streak";
interface Fx {
  kind: FxKind;
  mesh: Mesh;
  material: MeshBasicMaterial;
  start: number;
  dur: number;
  alpha: number;
  r0: number;
  r1: number;
  x0: number;
  z0: number;
  active: boolean;
}

/**
 * Short-lived effect meshes in fixed pools (standard §5.2). A pool that runs
 * dry recycles its oldest effect instead of allocating.
 */
export class Effects {
  readonly group = new Group();
  private pools = new Map<FxKind, Fx[]>();
  constructor(mats: ArenaMaterials) {
    const geo: Record<FxKind, BufferGeometry> = {
      ring: mats.track(new RingGeometry(0.84, 1, 56).rotateX(-Math.PI / 2)),
      disc: mats.track(new CircleGeometry(1, 40).rotateX(-Math.PI / 2)),
      streak: mats.track(
        new PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, 0, 0.5),
      ),
    };
    const sizes: Record<FxKind, number> = { ring: 40, disc: 10, streak: 20 };
    for (const kind of Object.keys(sizes) as FxKind[]) {
      const pool: Fx[] = [];
      for (let i = 0; i < sizes[kind]; i++) {
        const material = mats.track(
          new MeshBasicMaterial({
            transparent: true,
            depthWrite: false,
            side: DoubleSide,
            fog: false,
          }),
        );
        const mesh = new Mesh(geo[kind], material);
        mesh.visible = false;
        mesh.renderOrder = 5;
        this.group.add(mesh);
        pool.push({
          kind,
          mesh,
          material,
          start: 0,
          dur: 1,
          alpha: 1,
          r0: 1,
          r1: 1,
          x0: 0,
          z0: 0,
          active: false,
        });
      }
      this.pools.set(kind, pool);
    }
  }
  private take(
    kind: FxKind,
    now: number,
    dur: number,
    color: number,
    alpha: number,
  ) {
    const pool = this.pools.get(kind)!;
    const fx =
      pool.find((f) => !f.active) ??
      pool.reduce((a, b) => (a.start <= b.start ? a : b));
    fx.active = true;
    fx.start = now;
    fx.dur = Math.max(0.05, dur);
    fx.alpha = alpha;
    fx.material.color.setHex(color);
    fx.material.blending = NormalBlending;
    fx.mesh.visible = true;
    fx.mesh.rotation.set(0, 0, 0);
    return fx;
  }
  /** Expanding ring from r0 to r1. */
  ring(
    at: Vec,
    r0: number,
    r1: number,
    color: number,
    dur: number,
    now: number,
    alpha = 0.95,
    y = 0.06,
  ) {
    const fx = this.take("ring", now, dur, color, alpha);
    fx.r0 = r0;
    fx.r1 = r1;
    fx.mesh.position.set(at.x, y, at.y);
    return fx;
  }
  disc(
    at: Vec,
    r0: number,
    r1: number,
    color: number,
    dur: number,
    now: number,
    alpha = 0.5,
    y = 0.05,
  ) {
    const fx = this.take("disc", now, dur, color, alpha);
    fx.r0 = r0;
    fx.r1 = r1;
    fx.mesh.position.set(at.x, y, at.y);
    return fx;
  }
  /** A streak along `dir` starting `from` units out, growing to `length`. */
  streak(
    at: Vec,
    dir: Vec,
    from: number,
    length: number,
    width: number,
    color: number,
    dur: number,
    now: number,
    y = 0.85,
  ) {
    const fx = this.take("streak", now, dur, color, 0.9);
    fx.material.blending = AdditiveBlending;
    fx.r0 = from;
    fx.r1 = length;
    fx.mesh.position.set(at.x + dir.x * from, y, at.y + dir.y * from);
    fx.mesh.rotation.y = Math.atan2(dir.x, dir.y);
    fx.mesh.scale.set(width, 1, 0.01);
    return fx;
  }
  update(now: number) {
    for (const pool of this.pools.values())
      for (const fx of pool) {
        if (!fx.active) continue;
        const k = (now - fx.start) / fx.dur;
        if (k >= 1) {
          fx.active = false;
          fx.mesh.visible = false;
          continue;
        }
        const out = 1 - (1 - k) ** 3;
        if (fx.kind === "ring" || fx.kind === "disc") {
          const r = fx.r0 + (fx.r1 - fx.r0) * out;
          fx.mesh.scale.set(r, 1, r);
          fx.material.opacity = fx.alpha * (1 - k);
        } else if (fx.kind === "streak") {
          fx.mesh.scale.z = Math.max(0.01, fx.r1 * out);
          fx.material.opacity = fx.alpha * (1 - k);
        } else fx.material.opacity = fx.alpha * (1 - k * k);
      }
  }
}

// ------------------------------------------------------------------ strikes

type StrikeKind = "arc" | "swoosh" | "beam" | "volume" | "front" | "dome";
interface Strike {
  kind: StrikeKind;
  mesh: Mesh;
  material: MeshBasicMaterial | ShaderMaterial;
  active: boolean;
  start: number;
  dur: number;
  alpha: number;
  /** Radius (arcs, domes) from r0 to r1; a front's travel from r0 to r1. */
  r0: number;
  r1: number;
  /** A beam's starting radius; a front's start point and travel direction. */
  w: number;
  x0: number;
  z0: number;
  dx: number;
  dz: number;
  /** A tell pulses instead of fading. */
  tell: boolean;
}

const SWOOSH_VERTEX = /* glsl */ `
attribute vec2 sweep;
varying vec2 vSweep;
void main() {
  vSweep = sweep;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const SWOOSH_FRAGMENT = /* glsl */ `
uniform vec3 color;
uniform float head;
uniform float fade;
varying vec2 vSweep;
void main() {
  float behind = head - vSweep.x;
  float a = behind < 0.0 ? 0.0 : exp(-behind * 3.5);
  float edge = smoothstep(0.0, 0.35, vSweep.y) * (0.55 + 0.45 * smoothstep(0.6, 1.0, vSweep.y));
  gl_FragColor = vec4(color * (0.7 + 0.6 * vSweep.y), a * edge * fade);
  #include <colorspace_fragment>
}`;

/** A horizontal ring sector, `half` either side of +z; sweep.x runs +x side to -x side. */
function swooshGeometry(half: number) {
  const steps = 32,
    pos: number[] = [],
    sweep: number[] = [],
    index: number[] = [];
  for (let i = 0; i <= steps; i++) {
    const u = i / steps,
      a = half - u * half * 2;
    for (const r of [0.35, 1]) {
      pos.push(Math.sin(a) * r, 0, Math.cos(a) * r);
      sweep.push(u, r === 1 ? 1 : 0);
    }
    if (i < steps) {
      const k = i * 2;
      index.push(k, k + 1, k + 3, k, k + 3, k + 2);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute("sweep", new BufferAttribute(new Float32Array(sweep), 2));
  g.setIndex(index);
  return g;
}

/** A torus arc in the ground plane, `half` either side of +z, unit radius. */
function arcGeometry(half: number) {
  const full = half >= Math.PI * 0.99;
  return new TorusGeometry(1, 0.05, 6, full ? 64 : 28, full ? Math.PI * 2 : half * 2)
    .rotateX(-Math.PI / 2)
    .rotateY(-Math.PI / 2 - (full ? 0 : half) + (full ? 0 : 0));
}

/** A light volume from a narrow opening (`near` of the far width) out to z = 1. */
function volumeGeometry(near: number) {
  const n = near / 2,
    f = 0.5;
  const v = [
    [-n, 0, 0], [n, 0, 0], [n, 1, 0], [-n, 1, 0],
    [-f, 0, 1], [f, 0, 1], [f, 1, 1], [-f, 1, 1],
  ];
  const faces = [
    [0, 1, 5, 4], [3, 7, 6, 2], [0, 4, 7, 3], [1, 2, 6, 5], [4, 5, 6, 7],
  ];
  const pos: number[] = [];
  for (const [a, b, c, d] of faces) pos.push(...v[a], ...v[b], ...v[c], ...v[a], ...v[c], ...v[d]);
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3));
  g.computeVertexNormals();
  return g;
}

/**
 * Real attack visuals in the world, in place of flat highlights on the
 * floor (standard §6: release and impact): sound waves that roll out, a
 * weapon trail through a swing, glowing beams, a light volume for a flash,
 * moving wavefronts and blast domes. Every mesh is pooled and reused; per
 * frame only transforms, opacity and a shader uniform change (§5.2). They
 * draw what the authority already decided and never test a hit.
 */
export class Strikes {
  readonly group = new Group();
  private pools = new Map<StrikeKind, Strike[]>();
  private swooshes = new Map<number, BufferGeometry>();
  private arcs = new Map<number, BufferGeometry>();
  private volumes = new Map<number, BufferGeometry>();
  constructor(private mats: ArenaMaterials) {
    const geo: Partial<Record<StrikeKind, BufferGeometry>> = {
      beam: mats.track(
        new CylinderGeometry(1, 1, 1, 10, 1, true).rotateX(Math.PI / 2).translate(0, 0, 0.5),
      ),
      front: mats.track(new PlaneGeometry(1, 1).rotateX(-Math.PI / 2)),
      dome: mats.track(new SphereGeometry(1, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2)),
    };
    const sizes: Record<StrikeKind, number> = {
      arc: 30,
      swoosh: 8,
      beam: 16,
      volume: 4,
      front: 16,
      dome: 8,
    };
    for (const kind of Object.keys(sizes) as StrikeKind[]) {
      const pool: Strike[] = [];
      for (let i = 0; i < sizes[kind]; i++) {
        const material =
          kind === "swoosh"
            ? mats.track(
                new ShaderMaterial({
                  uniforms: {
                    color: { value: new Color() },
                    head: { value: 0 },
                    fade: { value: 1 },
                  },
                  vertexShader: SWOOSH_VERTEX,
                  fragmentShader: SWOOSH_FRAGMENT,
                  transparent: true,
                  depthWrite: false,
                  side: DoubleSide,
                  blending: AdditiveBlending,
                }),
              )
            : mats.track(
                new MeshBasicMaterial({
                  transparent: true,
                  depthWrite: false,
                  side: DoubleSide,
                  fog: false,
                }),
              );
        const mesh = new Mesh(geo[kind] ?? new BufferGeometry(), material);
        mesh.visible = false;
        mesh.frustumCulled = false;
        mesh.renderOrder = 6;
        this.group.add(mesh);
        pool.push({
          kind,
          mesh,
          material,
          active: false,
          start: 0,
          dur: 1,
          alpha: 1,
          r0: 0,
          r1: 0,
          w: 0,
          x0: 0,
          z0: 0,
          dx: 0,
          dz: 0,
          tell: false,
        });
      }
      this.pools.set(kind, pool);
    }
  }
  private cached(map: Map<number, BufferGeometry>, key: number, make: () => BufferGeometry) {
    const k = Math.round(key * 1000) / 1000;
    let g = map.get(k);
    if (!g) map.set(k, (g = this.mats.track(make())));
    return g;
  }
  private take(kind: StrikeKind, now: number, dur: number, alpha: number) {
    const pool = this.pools.get(kind)!;
    const s =
      pool.find((x) => !x.active) ??
      pool.reduce((a, b) => (a.start <= b.start ? a : b));
    s.active = true;
    s.start = now;
    s.dur = Math.max(0.05, dur);
    s.alpha = alpha;
    s.tell = false;
    s.mesh.visible = true;
    s.mesh.rotation.set(0, 0, 0);
    s.mesh.scale.set(1, 1, 1);
    const m = s.material;
    if (m instanceof MeshBasicMaterial) m.blending = AdditiveBlending;
    return s;
  }
  private tint(s: Strike, color: number, lighten = 0) {
    const m = s.material;
    const c = m instanceof ShaderMaterial ? (m.uniforms.color.value as Color) : m.color;
    c.setHex(color);
    if (lighten) c.lerp(_white, lighten);
  }

  /**
   * Sound or light rolling outward: upright stacks of torus arcs that
   * spread from the fighter to `range`, `half` radians either side of the
   * aim (a full ring when `half` is pi).
   */
  waves(at: Vec, dir: Vec, range: number, half: number, color: number, now: number, count = 3, dur = 0.32) {
    const g = this.cached(this.arcs, half, () => arcGeometry(half));
    const yaw = Math.atan2(dir.x, dir.y);
    for (let i = 0; i < count; i++)
      for (const [y, light] of [[0.55, 0.2], [1.05, 0.45], [1.55, 0.2]] as const) {
        const s = this.take("arc", now + i * 0.06, dur, 0.85 - i * 0.18);
        s.mesh.geometry = g;
        this.tint(s, color, light);
        s.r0 = 0.5;
        s.r1 = range;
        s.mesh.position.set(at.x, y, at.y);
        s.mesh.rotation.y = yaw;
      }
  }
  /** A weapon trail through a swing, at chest height, sweeping `half` either side. */
  swoosh(at: Vec, dir: Vec, range: number, half: number, color: number, now: number, dur = 0.26, y = 1) {
    const s = this.take("swoosh", now, dur, 1);
    s.mesh.geometry = this.cached(this.swooshes, half, () => swooshGeometry(half));
    this.tint(s, color, 0.35);
    s.mesh.position.set(at.x, y, at.y);
    s.mesh.rotation.set(0.12, Math.atan2(dir.x, dir.y), 0);
    s.mesh.scale.set(range, 1, range);
  }
  /**
   * A beam along `dir` at chest height. A tell is a thin pulsing line for
   * `dur`; a fired beam is a hot core and a glow that narrow as they fade.
   * `side` offsets it across the aim (twin eye beams).
   */
  beam(at: Vec, dir: Vec, length: number, color: number, now: number, dur: number, fired: boolean, radius = 0.3, y = 1.15, side = 0) {
    const yaw = Math.atan2(dir.x, dir.y);
    const ox = dir.y * side,
      oz = -dir.x * side;
    const layers: [number, number, number][] = fired
      ? [[0.12, 0xffffff, 1], [radius, color, 0.5]]
      : [[0.035, color, 0.9]];
    for (const [r, c, a] of layers) {
      const s = this.take("beam", now, dur, a);
      this.tint(s, c, fired ? 0 : 0.3);
      s.tell = !fired;
      s.w = r;
      s.mesh.position.set(at.x + dir.x * 0.4 + ox, y, at.y + dir.y * 0.4 + oz);
      s.mesh.rotation.y = yaw;
      s.mesh.scale.set(r, r, Math.max(0.05, length - 0.4));
    }
  }
  /** A light volume from the fighter: a camera flash, a glare, a blast of sound. */
  volume(at: Vec, dir: Vec, range: number, near: number, far: number, height: number, color: number, now: number, dur: number, alpha: number, tell = false) {
    const s = this.take("volume", now, dur, alpha);
    s.mesh.geometry = this.cached(this.volumes, near / far, () => volumeGeometry(near / far));
    this.tint(s, color, tell ? 0.2 : 0);
    s.tell = tell;
    s.mesh.position.set(at.x, 0.05, at.y);
    s.mesh.rotation.y = Math.atan2(dir.x, dir.y);
    s.mesh.scale.set(far, height, range);
  }
  /**
   * Moving wavefronts: bars `span` wide across `dir`, stacked at chest
   * heights, travelling `travel` along `dir` from `at`.
   */
  front(at: Vec, dir: Vec, travel: number, span: number, color: number, now: number, dur: number, heights: readonly number[] = [0.5, 1, 1.5]) {
    const yaw = Math.atan2(dir.x, dir.y);
    heights.forEach((y, i) => {
      const s = this.take("front", now, dur, i === 1 ? 0.75 : 0.5);
      const m = s.material as MeshBasicMaterial;
      m.blending = NormalBlending;
      this.tint(s, color, i === 1 ? 0.6 : 0.3);
      s.r0 = 0;
      s.r1 = travel;
      s.x0 = at.x;
      s.z0 = at.y;
      s.dx = dir.x;
      s.dz = dir.y;
      s.mesh.position.set(at.x, y, at.y);
      s.mesh.rotation.y = yaw;
      s.mesh.scale.set(span, 1, 0.35);
    });
  }
  /** A blast dome swelling to `radius`. */
  dome(at: Vec, radius: number, color: number, now: number, dur = 0.45) {
    for (const [k, a, light] of [[1, 0.42, 0], [0.7, 0.35, 0.6]] as const) {
      const s = this.take("dome", now, dur, a);
      this.tint(s, color, light);
      s.r0 = 0.3;
      s.r1 = radius * k;
      s.mesh.position.set(at.x, 0.02, at.y);
    }
  }
  update(now: number) {
    for (const pool of this.pools.values())
      for (const s of pool) {
        if (!s.active) continue;
        const t = now - s.start;
        if (t < 0) {
          s.mesh.visible = false;
          continue;
        }
        const k = t / s.dur;
        if (k >= 1) {
          s.active = false;
          s.mesh.visible = false;
          continue;
        }
        s.mesh.visible = true;
        const out = 1 - (1 - k) ** 3;
        const fade = s.tell ? 0.55 + 0.45 * Math.sin(t * 40) : 1 - k * k;
        switch (s.kind) {
          case "arc": {
            const r = s.r0 + (s.r1 - s.r0) * out;
            s.mesh.scale.set(r, 1 + 0.8 * k, r);
            (s.material as MeshBasicMaterial).opacity = s.alpha * (1 - k);
            break;
          }
          case "swoosh": {
            const u = (s.material as ShaderMaterial).uniforms;
            u.head.value = Math.min(1.6, out * 1.6);
            u.fade.value = 1 - Math.max(0, (k - 0.5) / 0.5);
            break;
          }
          case "beam": {
            const r = s.tell ? s.w : s.w * (1 - 0.8 * k);
            s.mesh.scale.x = s.mesh.scale.y = Math.max(0.01, r);
            (s.material as MeshBasicMaterial).opacity = s.alpha * fade;
            break;
          }
          case "volume":
            (s.material as MeshBasicMaterial).opacity = s.alpha * fade;
            break;
          case "front": {
            const d = s.r0 + (s.r1 - s.r0) * out;
            s.mesh.position.x = s.x0 + s.dx * d;
            s.mesh.position.z = s.z0 + s.dz * d;
            (s.material as MeshBasicMaterial).opacity = s.alpha * (1 - k);
            break;
          }
          case "dome": {
            const r = s.r0 + (s.r1 - s.r0) * out;
            s.mesh.scale.set(r, r * 0.75, r);
            (s.material as MeshBasicMaterial).opacity = s.alpha * (1 - k) ** 1.5;
            break;
          }
        }
      }
  }
}

// --------------------------------------------------------------- items

/** One bounded, instanced mesh per item kind. No item objects are built per frame. */
export class Items {
  readonly group = new Group();
  private broom: InstancedMesh;
  private flyer: InstancedMesh;
  private hands = new Vector3();
  constructor(mats: ArenaMaterials) {
    const broomGeometry = itemModel("golden_broom");
    const flyerGeometry = itemModel("goc_flyer");
    this.broom = new InstancedMesh(mats.track(broomGeometry), mats.toon, 32);
    this.flyer = new InstancedMesh(mats.track(flyerGeometry), mats.toon, 32);
    for (const mesh of [this.broom, this.flyer]) {
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.count = 0;
      this.group.add(mesh);
    }
  }
  update(
    items: readonly Item[],
    time: number,
    age: number,
    carrierHands: (id: string, out: Vector3) => number | null,
  ) {
    let nb = 0,
      nf = 0;
    for (const item of items) {
      const mesh = item.kind === "golden_broom" ? this.broom : this.flyer;
      const index = item.kind === "golden_broom" ? nb++ : nf++;
      if (index >= 32) continue;
      let x = item.pos.x,
        y = 0.22,
        z = item.pos.y;
      let yaw = Math.atan2(item.dir.x, item.dir.y);
      if (item.state === "carried") {
        const carrierYaw = item.carrier
          ? carrierHands(item.carrier, this.hands)
          : null;
        if (carrierYaw === null) {
          // Hide items whose carrier is concealed or absent from this snapshot.
          _m.makeScale(0, 0, 0);
          mesh.setMatrixAt(index, _m);
          continue;
        }
        x = this.hands.x;
        y = this.hands.y;
        z = this.hands.z;
        yaw = carrierYaw;
      } else if (item.state === "flight") {
        y = 0.85;
        const d = Math.min(age * ITEMS.goc_flyer.speed, item.remaining);
        x += item.dir.x * d;
        z += item.dir.y * d;
      } else y += 0.07 * Math.sin(time * 3 + item.id);
      const spin = item.state === "flight" ? time * 12 : 0;
      _q.setFromAxisAngle(Y, yaw + spin);
      _m.compose(_p.set(x, y, z), _q, _s.setScalar(1));
      mesh.setMatrixAt(index, _m);
    }
    this.broom.count = Math.min(nb, 32);
    this.flyer.count = Math.min(nf, 32);
    this.broom.instanceMatrix.needsUpdate = true;
    this.flyer.instanceMatrix.needsUpdate = true;
  }
}

// -------------------------------------------------------------- projectiles

export const PROJECTILE_Y = 0.85;
/** Drawn height of a lob after `traveled` of `total` units: a parabola. */
export const lobHeight = (traveled: number, total: number) => {
  const k = total > 0 ? Math.max(0, Math.min(1, traveled / total)) : 1;
  return 0.6 + 4 * (1.1 + total * 0.22) * k * (1 - k);
};
/** Flat spin rate (rad/s) of each fighter's projectile; 0 flies nose-first. */
const SPIN: Record<FighterId, number> = {
  brandon: 14,
  daniel: 9,
  rich: 0,
  samuel: 0,
  josh: 0,
  elijah: 0,
  ethan: 0,
  david: 0,
  dylan: 0,
  isaac: 0,
  tovya: 0,
  rosalie: 0,
  joelle: 16,
  susannah: 6,
  joyce: 0,
  miriam: 0,
  jemuel: 0,
  russell: 14,
  brandon_n: 14,
};
/** Presentation-only readability scale; authoritative shot widths are unchanged. */
const PROJECTILE_VISUAL_SCALE = 1.6;
type ShotKind = FighterId;

export interface ProjectileView {
  fighter: FighterId;
  /** Drawn ground position: the weave applied, extrapolated past the snapshot. */
  pos: Vec;
  /** Drawn heading: along the actual (weaving) path. */
  dir: Vec;
  /** Height above the ground; a lob climbs and falls along its arc. */
  y: number;
  /** Uniform size: a share is smaller than the shot it split from. */
  size: number;
  /** Extra width across the heading: a widening wave. */
  wide: number;
  /** Lobbed: tumbles end over end instead of spinning flat. */
  lob: boolean;
}

/** One instanced draw per projectile type, plus one for all glow trails. */
export class Projectiles {
  readonly group = new Group();
  private meshes = new Map<ShotKind, InstancedMesh>();
  private counts = new Map<ShotKind, number>();
  private trails: InstancedMesh;
  private nt = 0;
  constructor(mats: ArenaMaterials) {
    for (const kind of IDS.filter((id) => {
      const attack = FIGHTERS[id].abilities.attack.kind;
      return attack === "shot" || attack === "lob";
    })) {
      const mesh = new InstancedMesh(
        mats.track(projectileModel(kind)),
        mats.toon,
        24,
      );
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.count = 0;
      this.meshes.set(kind, mesh);
      this.group.add(mesh);
    }
    const fade = document.createElement("canvas");
    fade.width = 4;
    fade.height = 64;
    const g = fade.getContext("2d")!;
    const grad = g.createLinearGradient(0, 0, 0, 64);
    // Canvas top maps to the trail's tail, the bottom to the projectile.
    grad.addColorStop(0, "rgba(255,255,255,0)");
    grad.addColorStop(1, "rgba(255,255,255,0.9)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 4, 64);
    const tex = mats.track(new CanvasTexture(fade));
    tex.colorSpace = SRGBColorSpace;
    this.trails = new InstancedMesh(
      mats.track(
        new PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, 0, -0.5),
      ),
      mats.track(
        new MeshBasicMaterial({
          map: tex,
          transparent: true,
          depthWrite: false,
          blending: AdditiveBlending,
          fog: false,
        }),
      ),
      64,
    );
    this.trails.instanceMatrix.setUsage(DynamicDrawUsage);
    this.trails.frustumCulled = false;
    this.trails.count = 0;
    this.trails.setColorAt(0, _c.setHex(0xffffff));
    this.group.add(this.trails);
  }
  update(list: readonly ProjectileView[], time: number) {
    for (const k of this.meshes.keys()) this.counts.set(k, 0);
    this.nt = 0;
    for (const q of list) {
      const mesh = this.meshes.get(q.fighter);
      if (!mesh) continue;
      const i = this.counts.get(q.fighter)!;
      if (i >= 24) continue;
      const yaw = Math.atan2(q.dir.x, q.dir.y);
      // Spinning throwables spin flat; lobs tumble end over end; the bug,
      // notes, dove and waves fly nose-first along their path.
      const spin = SPIN[q.fighter] * time;
      _q.setFromAxisAngle(Y, yaw + (q.lob ? 0 : spin));
      if (q.lob) _q.multiply(_qRoll.setFromAxisAngle(X, time * 11));
      if (q.fighter === "ethan")
        _q.multiply(_qRoll.setFromAxisAngle(Z, Math.sin(time * 12) * 0.3));
      const k = PROJECTILE_VISUAL_SCALE * q.size;
      _m.compose(_p.set(q.pos.x, q.y, q.pos.y), _q, _s.set(k * q.wide, k, k));
      mesh.setMatrixAt(i, _m);
      this.counts.set(q.fighter, i + 1);
      if (this.nt < 64 && !q.lob) {
        _q.setFromAxisAngle(Y, yaw);
        _m.compose(
          _p.set(q.pos.x, q.y - 0.02, q.pos.y),
          _q,
          _s.set(0.22 * q.size * q.wide, 1, 0.9 * q.size),
        );
        this.trails.setMatrixAt(this.nt, _m);
        // The UCLA Swiper throws cards that leave rainbow light trails.
        if (q.fighter === "brandon_n")
          _c.setHSL((time * 0.9 + this.nt * 0.17) % 1, 1, 0.6);
        else _c.set(FIGHTERS[q.fighter].color);
        this.trails.setColorAt(this.nt++, _c);
      }
    }
    for (const [k, mesh] of this.meshes) {
      mesh.count = this.counts.get(k)!;
      mesh.instanceMatrix.needsUpdate = true;
    }
    this.trails.count = this.nt;
    this.trails.instanceMatrix.needsUpdate = true;
    if (this.trails.instanceColor) this.trails.instanceColor.needsUpdate = true;
  }
}

// -------------------------------------------------------------------- areas

interface AreaView {
  kind: Area["kind"];
  group: Group;
  disc: Mesh;
  ring: Mesh;
  discMat: MeshBasicMaterial;
  ringMat: MeshBasicMaterial;
  visual?: Object3D;
  born: number;
  used: boolean;
}

/** Welcome Committee circles and snack tables, pooled by area id. */
export class Areas {
  readonly group = new Group();
  private views = new Map<number, AreaView>();
  private spare: AreaView[] = [];
  private discGeo: BufferGeometry;
  private ringGeo: BufferGeometry;
  private tableGeo: BufferGeometry;
  private pandaGeo: BufferGeometry;
  private barrierGeo: BufferGeometry;
  constructor(private mats: ArenaMaterials) {
    this.discGeo = mats.track(new CircleGeometry(1, 48).rotateX(-Math.PI / 2));
    this.ringGeo = mats.track(
      new RingGeometry(0.95, 1, 64).rotateX(-Math.PI / 2),
    );
    this.tableGeo = mats.track(
      merge([
        part(
          new RoundedBoxGeometry(1.3, 0.09, 0.7, 1, 0.03),
          "#93603c",
          [0, 0.62, 0],
        ),
        ...[-1, 1].flatMap((sx) =>
          [-1, 1].map((sz) =>
            part(new CylinderGeometry(0.04, 0.04, 0.6, 6), "#6f4630", [
              sx * 0.55,
              0.3,
              sz * 0.27,
            ]),
          ),
        ),
        part(new CylinderGeometry(0.3, 0.3, 0.05, 20), "#ffd573", [0, 0.69, 0]),
        part(
          new CylinderGeometry(0.11, 0.11, 0.04, 14),
          "#d8994c",
          [-0.08, 0.74, 0.02],
        ),
        part(
          new CylinderGeometry(0.1, 0.1, 0.04, 14),
          "#d8994c",
          [0.12, 0.74, -0.05],
        ),
        part(
          new RoundedBoxGeometry(0.24, 0.16, 0.16, 1, 0.03),
          "#f5d46e",
          [0.42, 0.74, 0.12],
        ),
      ]),
    );
    this.pandaGeo = mats.track(
      merge([
        part(new SphereGeometry(0.35, 14, 10), "#c8442a", [0, 0.38, 0]),
        part(new SphereGeometry(0.28, 14, 10), "#c8442a", [0, 0.72, 0.12]),
        part(
          new SphereGeometry(0.16, 12, 8),
          "#fbe8d3",
          [0, 0.68, 0.34],
          [0, 0, 0],
          [1.25, 0.8, 0.7],
        ),
        ...[-1, 1].map((side) =>
          part(new SphereGeometry(0.08, 8, 6), "#4a2418", [
            side * 0.13,
            0.72,
            0.43,
          ]),
        ),
      ]),
    );
    this.barrierGeo = mats.track(
      part(new RoundedBoxGeometry(2, 1.15, 0.24, 2, 0.05), "#9ead2c"),
    );
  }
  private make(kind: Area["kind"]): AreaView {
    const group = new Group();
    const discMat = this.mats.flat(kind === "welcome" ? 0x417bc2 : 0xf7d66d, {
      opacity: 0.22,
    });
    const ringMat = this.mats.flat(kind === "welcome" ? 0xf2c65d : 0xffdc69, {
      opacity: 0.9,
    });
    const disc = new Mesh(this.discGeo, discMat);
    disc.position.y = 0.045;
    const ring = new Mesh(this.ringGeo, ringMat);
    ring.position.y = 0.05;
    disc.renderOrder = ring.renderOrder = 3;
    group.add(disc, ring);
    let visual: Object3D | undefined;
    if (kind === "table") visual = new Mesh(this.tableGeo, this.mats.toon);
    else if (kind === "panda") visual = new Mesh(this.pandaGeo, this.mats.toon);
    else if (kind === "barrier")
      visual = new Mesh(this.barrierGeo, this.mats.toon);
    if (visual) group.add(visual);
    this.group.add(group);
    return {
      kind,
      group,
      disc,
      ring,
      discMat,
      ringMat,
      visual,
      born: 0,
      used: false,
    };
  }
  /** Returns the drawn areas so the caller can label tables. */
  update(list: readonly Area[], now: number, time: number) {
    for (const v of this.views.values()) v.used = false;
    for (const a of list) {
      let v = this.views.get(a.id);
      if (!v) {
        const i = this.spare.findIndex((s) => s.kind === a.kind);
        v = i >= 0 ? this.spare.splice(i, 1)[0] : this.make(a.kind);
        v.born = now;
        v.group.visible = true;
        this.views.set(a.id, v);
      }
      v.used = true;
      const grow = Math.min(1, (now - v.born) / 0.22);
      const r = a.radius * (0.55 + 0.45 * (1 - (1 - grow) ** 3));
      v.group.position.set(a.pos.x, 0, a.pos.y);
      v.group.rotation.y =
        a.kind === "barrier" ? Math.atan2(a.dir?.x ?? 0, a.dir?.y ?? 1) : 0;
      if (v.visual) {
        v.visual.scale.set(a.kind === "barrier" ? a.radius : 1, 1, 1);
        if (a.kind === "panda")
          v.visual.rotation.y = Math.atan2(a.dir?.x ?? 0, a.dir?.y ?? 1);
      }
      v.disc.scale.set(r, 1, r);
      v.ring.scale.set(r, 1, r);
      v.ringMat.opacity = 0.7 + 0.2 * Math.sin(time * 5);
    }
    for (const [id, v] of this.views)
      if (!v.used) {
        v.group.visible = false;
        this.views.delete(id);
        this.spare.push(v);
      }
  }
}

// --------------------------------------------------------------------- ball

/** The Broomball ball with a ground shadow; rolls as it travels. */
export class Ball {
  readonly mesh: Group;
  constructor(mats: ArenaMaterials) {
    this.mesh = new Group();
    const geo = mats.track(
      merge([
        part(new IcosahedronGeometry(0.3, 2), "#ffe6a5"),
        part(
          new TorusGeometry(0.3, 0.045, 6, 24),
          "#173e38",
          [0, 0, 0],
          [Math.PI / 2, 0, 0],
        ),
        part(
          new TorusGeometry(0.3, 0.035, 6, 24),
          "#173e38",
          [0, 0, 0],
          [0, 0, 0],
        ),
      ]),
    );
    const ball = new Mesh(geo, mats.toon);
    const shell = new Mesh(geo, mats.outline(0.028));
    this.mesh.add(ball, shell);
    this.mesh.visible = false;
  }
}

// --------------------------------------------------------------------- vans

/** Daniel's Full Carpool van, shown around him while the Super runs. */
export class Vans {
  readonly group = new Group();
  private geo: BufferGeometry;
  private shell: Material;
  private pool: { mesh: Object3D; owner: string; until: number; dir: Vec }[] =
    [];
  constructor(private mats: ArenaMaterials) {
    this.geo = mats.track(
      merge([
        part(
          new RoundedBoxGeometry(1.0, 0.62, 1.6, 2, 0.12),
          "#89b8eb",
          [0, 0.46, 0],
        ),
        part(
          new RoundedBoxGeometry(0.92, 0.36, 0.8, 2, 0.08),
          "#89b8eb",
          [0, 0.9, -0.2],
        ),
        part(
          new RoundedBoxGeometry(0.94, 0.26, 0.05, 1, 0.03),
          "#d9edf0",
          [0, 0.92, 0.21],
        ),
        part(
          new RoundedBoxGeometry(0.05, 0.24, 0.6, 1, 0.02),
          "#d9edf0",
          [0.47, 0.92, -0.2],
        ),
        part(
          new RoundedBoxGeometry(0.05, 0.24, 0.6, 1, 0.02),
          "#d9edf0",
          [-0.47, 0.92, -0.2],
        ),
        part(
          new RoundedBoxGeometry(1.02, 0.12, 0.1, 1, 0.04),
          "#f4f7fb",
          [0, 0.28, 0.79],
        ),
        ...[-1, 1].flatMap((sx) =>
          [-1, 1].map((sz) =>
            part(
              new CylinderGeometry(0.17, 0.17, 0.14, 12),
              "#1b2433",
              [sx * 0.48, 0.17, sz * 0.52],
              [0, 0, Math.PI / 2],
            ),
          ),
        ),
      ]),
    );
    this.shell = mats.outline(0.03);
  }
  show(owner: string, dir: Vec, until: number) {
    let v =
      this.pool.find((p) => p.owner === owner) ??
      this.pool.find((p) => p.until <= 0);
    if (!v) {
      const mesh = new Group();
      mesh.add(
        new Mesh(this.geo, this.mats.toon),
        new Mesh(this.geo, this.shell),
      );
      this.group.add(mesh);
      v = { mesh, owner, until, dir: { ...dir } };
      this.pool.push(v);
    }
    v.owner = owner;
    v.until = Math.max(v.until, until);
    v.dir = { x: dir.x, y: dir.y };
  }
  update(now: number, where: (owner: string) => Vec | null) {
    for (const v of this.pool) {
      const at = v.until > now ? where(v.owner) : null;
      v.mesh.visible = !!at;
      if (!at) {
        v.until = 0;
        continue;
      }
      v.mesh.position.set(at.x, Math.abs(Math.sin(now * 30)) * 0.04, at.y);
      v.mesh.rotation.y = Math.atan2(v.dir.x, v.dir.y);
    }
  }
}

// -------------------------------------------------------------------- aim

/**
 * Persistent, local-only action footprint and movement pip. Geometry is
 * allocated once and only transforms/visibility change per frame (§5.2).
 */
/** Triangle soup builders for footprints, in the guide's local frame (aim +z). */
type P2 = { x: number; z: number };
function pushDisc(out: number[], c: P2, r: number, steps = 20) {
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2,
      b = ((i + 1) / steps) * Math.PI * 2;
    out.push(c.x, 0, c.z, c.x + Math.sin(a) * r, 0, c.z + Math.cos(a) * r, c.x + Math.sin(b) * r, 0, c.z + Math.cos(b) * r);
  }
}
/** A polyline thickened to `half` either side, with round ends: a capsule chain. */
function pushRibbon(out: number[], pts: P2[], half: number) {
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i],
      b = pts[i + 1],
      dx = b.x - a.x,
      dz = b.z - a.z,
      l = Math.hypot(dx, dz) || 1,
      nx = (-dz / l) * half,
      nz = (dx / l) * half;
    out.push(a.x + nx, 0, a.z + nz, a.x - nx, 0, a.z - nz, b.x - nx, 0, b.z - nz);
    out.push(a.x + nx, 0, a.z + nz, b.x - nx, 0, b.z - nz, b.x + nx, 0, b.z + nz);
    // Joints and ends stay round, as a moving body reach is.
    pushDisc(out, b, half, 12);
  }
  if (pts.length) pushDisc(out, pts[0], half, 12);
}
/** A spread angle's direction in the local frame, as the authority turns it. */
const headingOf = (angle: number): P2 => ({ x: -Math.sin(angle), z: Math.cos(angle) });

function footprintGeometry(shape: AimShape): BufferGeometry {
  const out: number[] = [];
  switch (shape.kind) {
    case "fan":
      for (const a of shape.angles) {
        const h = headingOf(a);
        pushRibbon(out, [{ x: 0, z: 0 }, { x: h.x * shape.range, z: h.z * shape.range }], shape.width / 2);
      }
      break;
    case "path":
      // Sampled from the authority's own path function, aim (0, 1): map x
      // is local x and map y is local z in that frame.
      for (const path of shape.paths) {
        const dir = { x: -Math.sin(path.angle), y: Math.cos(path.angle) };
        const pts: P2[] = [];
        for (let t = 0; t <= shape.range + 1e-9; t += 0.08) {
          const at = shotPoint({ x: dir.x * t, y: dir.y * t }, dir, t, shape.weave, path.side);
          pts.push({ x: at.x, z: at.y });
        }
        pushRibbon(out, pts, shape.width / 2);
      }
      break;
    case "taper": {
      const n = shape.near / 2,
        f = shape.far / 2,
        r = shape.range;
      out.push(-n, 0, 0, n, 0, 0, f, 0, r, -n, 0, 0, f, 0, r, -f, 0, r);
      pushDisc(out, { x: 0, z: r }, f, 24);
      break;
    }
    case "lane": {
      const end = { x: 0, z: shape.range };
      for (const a of shape.tail?.angles ?? []) {
        const h = headingOf(a);
        pushRibbon(out, [end, { x: end.x + h.x * shape.tail!.range, z: end.z + h.z * shape.tail!.range }], shape.tail!.width / 2);
      }
      break;
    }
    case "sector": {
      const steps = 40;
      for (let i = 0; i < steps; i++) {
        const a = -shape.half + (i / steps) * shape.half * 2,
          b = -shape.half + ((i + 1) / steps) * shape.half * 2;
        out.push(0, 0, 0, Math.sin(a), 0, Math.cos(a), Math.sin(b), 0, Math.cos(b));
      }
      break;
    }
    default:
      break;
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array(out), 3));
  const normals = new Float32Array(out.length);
  for (let i = 1; i < normals.length; i += 3) normals[i] = 1;
  g.setAttribute("normal", new BufferAttribute(normals, 3));
  return g;
}

/**
 * The held aim footprint (aimPreview.ts) drawn on the ground: exactly the
 * area a rival's center must be in for the action to hit. Unions of lanes,
 * paths and caps are drawn through the stencil, so overlapping parts never
 * stack into darker patches.
 */
export class AimGuide {
  readonly group = new Group();
  private aimMaterial: MeshBasicMaterial;
  private unionMaterial: MeshBasicMaterial;
  private coreMaterial: MeshBasicMaterial;
  private lane: Mesh;
  private cap: Mesh;
  private circle: Mesh;
  private bar: Mesh;
  private core: Mesh;
  private shaped: Mesh;
  private moveDisc: Mesh;
  private moveRing: Mesh;
  private white = new Color(0xffffff);
  /** Built once per static footprint, or per sector angle (scaled to radius). */
  private built = new Map<unknown, BufferGeometry>();

  constructor(private mats: ArenaMaterials) {
    this.aimMaterial = mats.flat(0xffffff, {
      opacity: 0.2,
      doubleSided: true,
    });
    // Each pixel of a union is drawn once: the first fragment marks the
    // stencil and overlapping ones (fan lanes, helix paths, zigzag joints)
    // are skipped, so overlaps never stack darker.
    this.unionMaterial = mats.flat(0xffffff, { opacity: 0.2, doubleSided: true });
    this.unionMaterial.stencilWrite = true;
    this.unionMaterial.stencilRef = 1;
    this.unionMaterial.stencilFunc = NotEqualStencilFunc;
    this.unionMaterial.stencilZPass = ReplaceStencilOp;
    this.coreMaterial = mats.flat(0xffffff, {
      opacity: 0.48,
      doubleSided: true,
    });
    const laneGeo = mats.track(
      new PlaneGeometry(2, 1).rotateX(-Math.PI / 2).translate(0, 0, 0.5),
    );
    this.lane = new Mesh(laneGeo, this.aimMaterial);
    this.core = new Mesh(laneGeo, this.coreMaterial);
    // A half disc reaching forward: the rounded end of a projectile lane.
    this.cap = new Mesh(
      mats.track(new CircleGeometry(1, 24, Math.PI, Math.PI).rotateX(-Math.PI / 2)),
      this.aimMaterial,
    );
    this.circle = new Mesh(
      mats.track(new CircleGeometry(1, 48).rotateX(-Math.PI / 2)),
      this.aimMaterial,
    );
    this.bar = new Mesh(
      mats.track(new PlaneGeometry(2, 1).rotateX(-Math.PI / 2)),
      this.aimMaterial,
    );
    this.shaped = new Mesh(new BufferGeometry(), this.unionMaterial);
    this.moveDisc = new Mesh(
      mats.track(new CircleGeometry(0.1, 20).rotateX(-Math.PI / 2)),
      mats.flat(0xe8ffd0, { opacity: 0.92, doubleSided: true }),
    );
    this.moveRing = new Mesh(
      mats.track(new RingGeometry(0.13, 0.18, 24).rotateX(-Math.PI / 2)),
      mats.flat(0x78e69b, { opacity: 0.78, doubleSided: true }),
    );
    for (const mesh of [
      this.lane,
      this.cap,
      this.core,
      this.circle,
      this.bar,
      this.shaped,
      this.moveDisc,
      this.moveRing,
    ]) {
      mesh.visible = false;
      mesh.renderOrder = 5;
      this.group.add(mesh);
    }
    this.shaped.renderOrder = 4;
  }

  private geometry(shape: AimShape) {
    const key = shape.kind === "sector" ? `sector:${shape.half}` : shape;
    let g = this.built.get(key);
    if (!g) {
      const unit = shape.kind === "sector" ? { ...shape, radius: 1 } : shape;
      this.built.set(key, (g = this.mats.track(footprintGeometry(unit))));
    }
    return g;
  }

  private place(mesh: Mesh, at: Vec, angle: number, y: number) {
    mesh.visible = true;
    mesh.position.set(at.x, y, at.y);
    mesh.rotation.y = angle;
  }

  update(
    at: Vec,
    dir: Vec,
    move: Vec,
    color: number,
    intent: AimIntent | null,
    shape: AimShape | null,
  ) {
    this.lane.visible = false;
    this.cap.visible = false;
    this.core.visible = false;
    this.circle.visible = false;
    this.bar.visible = false;
    this.shaped.visible = false;

    const moving = Math.hypot(move.x, move.y);
    this.moveDisc.visible = this.moveRing.visible = moving > 0.08;
    if (moving > 0.08) {
      const distance = 0.85 + Math.min(1, moving) * 0.35;
      const x = at.x + (move.x / moving) * distance;
      const y = at.y + (move.y / moving) * distance;
      this.moveDisc.position.set(x, 0.09, y);
      this.moveRing.position.set(x, 0.085, y);
    }

    if (!intent || !shape || shape.kind === "global") return;
    this.aimMaterial.color.setHex(color).lerp(this.white, 0.55);
    this.aimMaterial.opacity = intent === "super" ? 0.28 : 0.3;
    this.unionMaterial.color.copy(this.aimMaterial.color);
    this.unionMaterial.opacity = this.aimMaterial.opacity;
    this.coreMaterial.color.setHex(intent === "super" ? 0xfff2a8 : 0xffffff);
    const angle = Math.atan2(dir.x, dir.y);
    if (shape.kind === "lane") {
      const from = shape.from ?? 0;
      this.place(this.lane, { x: at.x + dir.x * from, y: at.y + dir.y * from }, angle, 0.065);
      this.lane.scale.set(shape.width / 2, 1, shape.range - from);
      if (shape.cap) {
        this.place(this.cap, { x: at.x + dir.x * shape.range, y: at.y + dir.y * shape.range }, angle, 0.065);
        this.cap.scale.set(shape.width / 2, 1, shape.width / 2);
      }
      if (shape.coreWidth) {
        this.place(this.core, at, angle, 0.072);
        this.core.scale.set(shape.coreWidth / 2, 1, shape.range);
      }
      if (shape.tail) {
        this.shaped.geometry = this.geometry(shape);
        this.place(this.shaped, at, angle, 0.06);
        this.shaped.scale.set(1, 1, 1);
      }
      return;
    }
    if (shape.kind === "sector") {
      this.shaped.geometry = this.geometry(shape);
      this.place(this.shaped, at, angle, 0.065);
      this.shaped.scale.set(shape.radius, 1, shape.radius);
      return;
    }
    if (shape.kind === "fan" || shape.kind === "path" || shape.kind === "taper") {
      this.shaped.geometry = this.geometry(shape);
      this.place(this.shaped, at, angle, 0.065);
      this.shaped.scale.set(1, 1, 1);
      return;
    }
    const x = at.x + dir.x * shape.distance;
    const y = at.y + dir.y * shape.distance;
    if (shape.kind === "circle") {
      this.circle.visible = true;
      this.circle.position.set(x, 0.065, y);
      this.circle.scale.set(shape.radius, 1, shape.radius);
      return;
    }
    this.bar.visible = true;
    this.bar.position.set(x, 0.065, y);
    this.bar.rotation.y = angle;
    this.bar.scale.set(shape.length / 2, 1, shape.thickness);
  }

  hide() {
    for (const mesh of this.group.children) mesh.visible = false;
  }
}

/** The local fighter's dashed aim line on the ground (2.4 units, as before). */
export function aimArrow(mats: ArenaMaterials) {
  const parts: BufferGeometry[] = [];
  for (let z = 0.75; z < 2.2; z += 0.36)
    parts.push(
      part(
        new PlaneGeometry(0.07, 0.2),
        "#ffffff",
        [0, 0, z + 0.1],
        [-Math.PI / 2, 0, 0],
      ),
    );
  parts.push(
    part(
      new CircleGeometry(0.09, 16),
      "#ffffff",
      [0, 0, 2.4],
      [-Math.PI / 2, 0, 0],
    ),
  );
  const mesh = new Mesh(
    mats.track(merge(parts)),
    mats.flat(0xffffff, { opacity: 0.72 }),
  );
  mesh.renderOrder = 6;
  mesh.visible = false;
  return mesh;
}
