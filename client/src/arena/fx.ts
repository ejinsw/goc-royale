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
  type FighterId,
  type Vec,
} from "../../../shared/definitions";
import type { Area, Item } from "../../../shared/types";
import { merge, part } from "../ui/scene/geometry";
import type { AimIntent, AimShape } from "./aimPreview";
import type { ArenaMaterials } from "./materials";

/**
 * Arena presentation layer (performance standard §3, §5.2, §6): pooled,
 * per-entity and transient visuals. Everything here is allocated once per
 * match and reused; per frame only transforms, counts and colors change.
 *
 * - `Billboards`: names, health bars, damage numbers and stun stars as one
 *   instanced draw from a single canvas atlas.
 * - `Markers`: blob shadows and ground rings, two instanced draws.
 * - `Effects`: rings, cones, Super rectangles and release streaks.
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

type FxKind =
  | "ring"
  | "disc"
  | "cone"
  | "sweep"
  | "meleeSweep"
  | "sweepEdge"
  | "meleeEdge"
  | "rect"
  | "streak";
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

/** Unit cone: tip at the origin, base across z = 1 from x = -1 to 1. */
function coneGeometry() {
  const g = new BufferGeometry();
  g.setAttribute(
    "position",
    new BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 1, -1, 0, 1]), 3),
  );
  g.setAttribute(
    "normal",
    new BufferAttribute(new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0]), 3),
  );
  return g;
}

/** Sector used by Tovya's melee attack. */
function sweepGeometry(half: number) {
  const points: number[] = [];
  const steps = 24;
  for (let i = 0; i < steps; i++) {
    const a = -half + (i / steps) * (2 * half);
    const b = -half + ((i + 1) / steps) * (2 * half);
    points.push(
      0,
      0,
      0,
      Math.sin(a),
      0,
      Math.cos(a),
      Math.sin(b),
      0,
      Math.cos(b),
    );
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array(points), 3));
  g.computeVertexNormals();
  return g;
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
      cone: mats.track(coneGeometry()),
      sweep: mats.track(
        new PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, 0, 0.5),
      ),
      meleeSweep: mats.track(
        sweepGeometry(
          (FIGHTERS.tovya.abilities.attack as { halfAngle: number }).halfAngle,
        ),
      ),
      sweepEdge: mats.track(new PlaneGeometry(1, 1).rotateX(-Math.PI / 2)),
      meleeEdge: mats.track(
        new PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, 0, 0.5),
      ),
      rect: mats.track(
        new PlaneGeometry(2, 1).rotateX(-Math.PI / 2).translate(0, 0, 0.5),
      ),
      streak: mats.track(
        new PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, 0, 0.5),
      ),
    };
    const sizes: Record<FxKind, number> = {
      ring: 40,
      disc: 10,
      cone: 8,
      sweep: 8,
      meleeSweep: 8,
      sweepEdge: 8,
      meleeEdge: 8,
      rect: 8,
      streak: 20,
    };
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
  /** Flat cone from `at` along `dir`, `range` long and `half` wide at the end. */
  cone(
    at: Vec,
    dir: Vec,
    range: number,
    half: number,
    color: number,
    dur: number,
    now: number,
    alpha = 0.32,
  ) {
    const fx = this.take("cone", now, dur, color, alpha);
    fx.mesh.position.set(at.x, 0.07, at.y);
    fx.mesh.rotation.y = Math.atan2(dir.x, dir.y);
    fx.mesh.scale.set(half, 1, range);
    return fx;
  }
  /** The sweep footprint uses the same angle and radius as the hit test. */
  sweep(
    at: Vec,
    dir: Vec,
    range: number,
    color: number,
    now: number,
    melee = false,
  ) {
    const half = (FIGHTERS.tovya.abilities.attack as { halfAngle: number })
      .halfAngle;
    const fx = this.take(melee ? "meleeSweep" : "sweep", now, 0.32, color, 0.4);
    fx.mesh.position.set(at.x, 0.08, at.y);
    fx.mesh.rotation.y = Math.atan2(dir.x, dir.y);
    fx.mesh.scale.set(melee ? range : ITEMS.golden_broom.width, 1, range);
    const edge = this.take(
      melee ? "meleeEdge" : "sweepEdge",
      now,
      0.32,
      0xfff4bf,
      0.85,
    );
    edge.r0 = Math.atan2(dir.x, dir.y);
    edge.r1 = range;
    edge.x0 = at.x;
    edge.z0 = at.y;
    edge.mesh.position.set(at.x, 0.1, at.y);
    edge.mesh.rotation.y = melee ? edge.r0 - half : edge.r0;
    edge.mesh.scale.set(
      melee ? 0.18 : ITEMS.golden_broom.width,
      1,
      melee ? range : 0.18,
    );
    return fx;
  }
  /** Flat rectangle from `at` along `dir`. */
  rect(
    at: Vec,
    dir: Vec,
    range: number,
    half: number,
    color: number,
    dur: number,
    now: number,
    alpha = 0.3,
  ) {
    const fx = this.take("rect", now, dur, color, alpha);
    fx.mesh.position.set(at.x, 0.07, at.y);
    fx.mesh.rotation.y = Math.atan2(dir.x, dir.y);
    fx.mesh.scale.set(half, 1, range);
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
        } else if (fx.kind === "sweepEdge" || fx.kind === "meleeEdge") {
          if (fx.kind === "meleeEdge") {
            const half = (
              FIGHTERS.tovya.abilities.attack as { halfAngle: number }
            ).halfAngle;
            fx.mesh.rotation.y = fx.r0 + (2 * out - 1) * half;
          } else {
            fx.mesh.position.x = fx.x0 + Math.sin(fx.r0) * fx.r1 * out;
            fx.mesh.position.z = fx.z0 + Math.cos(fx.r0) * fx.r1 * out;
          }
          fx.material.opacity = fx.alpha * (1 - k);
        } else if (fx.kind === "streak") {
          fx.mesh.scale.z = Math.max(0.01, fx.r1 * out);
          fx.material.opacity = fx.alpha * (1 - k);
        } else fx.material.opacity = fx.alpha * (1 - k * k);
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
    const broomGeometry = merge([
      part(
        new CylinderGeometry(0.045, 0.045, 1.25, 8),
        "#e3a924",
        [0, 0, 0],
        [Math.PI / 2, 0, 0],
      ),
      part(
        new RoundedBoxGeometry(0.52, 0.11, 0.35, 1, 0.04),
        "#ffd85b",
        [0, 0, 0.67],
      ),
      part(
        new RoundedBoxGeometry(0.43, 0.12, 0.07, 1, 0.02),
        "#a96e12",
        [0, 0.01, 0.52],
      ),
    ]);
    const flyerGeometry = merge([
      part(new RoundedBoxGeometry(0.52, 0.045, 0.7, 1, 0.02), "#f4f7ff"),
      part(
        new RoundedBoxGeometry(0.38, 0.05, 0.1, 1, 0.01),
        "#387dce",
        [0, 0.01, -0.2],
      ),
      part(
        new RoundedBoxGeometry(0.3, 0.05, 0.035, 1, 0.01),
        "#7a92ae",
        [0, 0.01, 0.04],
      ),
    ]);
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

const PROJECTILE_Y = 0.85;
/** Presentation-only readability scale; authoritative shot widths are unchanged. */
const PROJECTILE_VISUAL_SCALE = 1.6;
type ShotKind = FighterId;

function projectileGeometry(kind: ShotKind): BufferGeometry {
  switch (kind) {
    case "brandon":
      return merge([
        part(new RoundedBoxGeometry(0.44, 0.05, 0.3, 1, 0.02), "#fff3cf"),
        part(
          new RoundedBoxGeometry(0.44, 0.06, 0.09, 1, 0.02),
          "#417bc2",
          [0, 0.005, -0.105],
        ),
        part(
          new RoundedBoxGeometry(0.24, 0.06, 0.03, 1, 0.01),
          "#315e94",
          [0, 0.01, 0.04],
        ),
      ]);
    case "daniel":
      return merge([
        part(
          new TorusGeometry(0.11, 0.035, 6, 14),
          "#ffdc76",
          [0, 0, 0],
          [Math.PI / 2, 0, 0],
        ),
        part(
          new RoundedBoxGeometry(0.06, 0.04, 0.26, 1, 0.015),
          "#e9c45c",
          [0, 0, 0.2],
        ),
        part(
          new RoundedBoxGeometry(0.1, 0.04, 0.05, 1, 0.015),
          "#e9c45c",
          [0.03, 0, 0.3],
        ),
      ]);
    case "rich":
      return merge([
        part(new IcosahedronGeometry(0.13, 1), "#f5f0ff"),
        part(
          new IcosahedronGeometry(0.2, 1),
          "#b9a3ee",
          [0, 0, -0.05],
          [0, 0, 0],
          [0.8, 0.8, 1.4],
        ),
      ]);
    case "samuel":
      return merge([
        part(new CylinderGeometry(0.22, 0.22, 0.07, 18), "#d8994c"),
        part(new SphereGeometry(0.04, 8, 6), "#624534", [0.08, 0.04, 0.05]),
        part(new SphereGeometry(0.035, 8, 6), "#624534", [-0.07, 0.04, -0.06]),
        part(new SphereGeometry(0.035, 8, 6), "#624534", [-0.04, 0.04, 0.1]),
      ]);
    case "elijah":
      return merge([
        part(
          new SphereGeometry(0.15, 12, 8),
          "#77d5b9",
          [0, 0, 0],
          [0, 0, 0],
          [1, 0.7, 1.35],
        ),
        part(new SphereGeometry(0.09, 10, 8), "#1f3a37", [0, 0.02, 0.18]),
        part(new SphereGeometry(0.04, 6, 4), "#1f3a37", [0.07, 0.09, -0.02]),
        part(new SphereGeometry(0.04, 6, 4), "#1f3a37", [-0.06, 0.09, -0.08]),
        ...[-1, 1].flatMap((s) =>
          [-0.08, 0, 0.08].map((z) =>
            part(
              new RoundedBoxGeometry(0.26, 0.02, 0.02, 1, 0.005),
              "#1f3a37",
              [0, -0.03, z],
              [0, 0, s * 0.3],
            ),
          ),
        ),
      ]);
    case "ethan":
      return merge([
        part(
          new SphereGeometry(0.12, 12, 8),
          "#df83c8",
          [0, 0, 0],
          [0, 0, 0],
          [1.25, 0.6, 1],
        ),
        part(
          new RoundedBoxGeometry(0.04, 0.42, 0.04, 1, 0.015),
          "#df83c8",
          [0.11, 0.2, 0],
        ),
        part(
          new RoundedBoxGeometry(0.18, 0.05, 0.04, 1, 0.015),
          "#df83c8",
          [0.18, 0.38, 0],
          [0, 0, -0.5],
        ),
      ]);
    case "david":
      return merge([
        part(
          new TorusGeometry(0.13, 0.035, 6, 18, Math.PI * 1.45),
          "#f2c65d",
          [-0.07, 0, 0],
          [Math.PI / 2, 0, 0.35],
        ),
        part(
          new TorusGeometry(0.13, 0.035, 6, 18, Math.PI * 1.45),
          "#4f7fd1",
          [0.07, 0, 0],
          [Math.PI / 2, 0, -0.35],
        ),
        part(new SphereGeometry(0.055, 10, 7), "#fff8d7"),
      ]);
    case "dylan":
      return merge([
        part(
          new TorusGeometry(0.18, 0.035, 6, 18, Math.PI * 1.4),
          "#c9b98a",
          [0, 0, 0],
          [Math.PI / 2, 0, 0.4],
        ),
        part(
          new RoundedBoxGeometry(0.05, 0.04, 0.22, 1, 0.015),
          "#6e8795",
          [0.13, 0, 0.15],
          [0, 0, 0.5],
        ),
      ]);
    case "isaac":
      return merge([
        part(new RoundedBoxGeometry(0.28, 0.05, 0.05, 1, 0.012), "#d7dde4"),
        part(
          new RoundedBoxGeometry(0.05, 0.05, 0.22, 1, 0.012),
          "#8b939d",
          [-0.12, 0, 0.08],
        ),
        part(
          new RoundedBoxGeometry(0.05, 0.05, 0.22, 1, 0.012),
          "#8b939d",
          [0.12, 0, 0.08],
        ),
      ]);
    case "rosalie":
      return merge([
        part(
          new TorusGeometry(0.3, 0.055, 8, 24, Math.PI),
          "#fbe8d3",
          [0, 0, 0],
          [Math.PI / 2, 0, 0],
        ),
        part(
          new TorusGeometry(0.2, 0.04, 8, 20, Math.PI),
          "#e8553a",
          [0, 0.02, 0.02],
          [Math.PI / 2, 0, 0],
        ),
      ]);
    case "joelle":
      return merge([
        part(
          new RoundedBoxGeometry(0.32, 0.055, 0.09, 1, 0.02),
          "#ffb300",
          [-0.1, 0, 0],
          [0, 0, 0.55],
        ),
        part(
          new RoundedBoxGeometry(0.32, 0.055, 0.09, 1, 0.02),
          "#ffcf55",
          [0.1, 0, 0],
          [0, 0, -0.55],
        ),
      ]);
    case "susannah":
      return merge([
        part(new RoundedBoxGeometry(0.34, 0.055, 0.28, 1, 0.025), "#fff6fa"),
        part(
          new RoundedBoxGeometry(0.25, 0.06, 0.055, 1, 0.012),
          "#ff6f91",
          [0, 0.01, -0.07],
        ),
        part(new SphereGeometry(0.025, 6, 4), "#3b3f63", [-0.09, 0.04, 0.06]),
      ]);
    case "joyce":
      return merge([
        part(
          new RoundedBoxGeometry(0.38, 0.035, 0.16, 1, 0.01),
          "#fffdf4",
          [0, 0, 0],
          [0, 0, 0.22],
        ),
        part(
          new RoundedBoxGeometry(0.2, 0.04, 0.06, 1, 0.01),
          "#2e9e5b",
          [-0.02, 0.02, -0.08],
          [0, 0, -0.45],
        ),
      ]);
    case "miriam":
      return merge([
        part(
          new SphereGeometry(0.12, 12, 8),
          "#fbfbf7",
          [0, 0, 0],
          [0, 0, 0],
          [1.5, 0.75, 0.8],
        ),
        part(new SphereGeometry(0.07, 10, 8), "#fbfbf7", [0, 0.03, 0.14]),
        part(
          new RoundedBoxGeometry(0.26, 0.025, 0.08, 1, 0.01),
          "#e3e6df",
          [0, 0.04, -0.02],
        ),
      ]);
    case "russell":
      return merge([
        part(new CylinderGeometry(0.18, 0.18, 0.055, 20), "#f3c26b"),
        part(
          new TorusGeometry(0.12, 0.018, 6, 20),
          "#8a6827",
          [0, 0.03, 0],
          [Math.PI / 2, 0, 0],
        ),
      ]);
    case "brandon_n":
      return merge([
        part(new RoundedBoxGeometry(0.4, 0.035, 0.26, 1, 0.015), "#2d6fc0"),
        part(
          new RoundedBoxGeometry(0.4, 0.045, 0.06, 1, 0.012),
          "#ffd24a",
          [0, 0.004, -0.09],
        ),
        part(
          new RoundedBoxGeometry(0.11, 0.045, 0.1, 1, 0.012),
          "#f4f7fb",
          [-0.1, 0.004, 0.04],
        ),
      ]);
    case "josh":
    case "tovya":
    case "jemuel":
      return new SphereGeometry(0.01, 4, 2);
  }
}

export interface ProjectileView {
  fighter: FighterId;
  pos: Vec;
  dir: Vec;
}

/** One instanced draw per projectile type, plus one for all glow trails. */
export class Projectiles {
  readonly group = new Group();
  private meshes = new Map<ShotKind, InstancedMesh>();
  private counts = new Map<ShotKind, number>();
  private trails: InstancedMesh;
  private nt = 0;
  constructor(mats: ArenaMaterials) {
    for (const kind of IDS.filter(
      (id) => FIGHTERS[id].abilities.attack.kind === "shot",
    )) {
      const mesh = new InstancedMesh(
        mats.track(projectileGeometry(kind)),
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
      // Spinning throwables tumble; the flash and bug fly nose-first.
      const spin = [
        "brandon",
        "samuel",
        "joelle",
        "russell",
        "brandon_n",
      ].includes(
        q.fighter,
      )
        ? time * 14
        : q.fighter === "daniel"
          ? time * 9
          : 0;
      _q.setFromAxisAngle(Y, yaw + spin);
      if (q.fighter === "ethan")
        _q.multiply(_qRoll.setFromAxisAngle(Z, Math.sin(time * 12) * 0.3));
      _m.compose(
        _p.set(q.pos.x, PROJECTILE_Y, q.pos.y),
        _q,
        _s.setScalar(PROJECTILE_VISUAL_SCALE),
      );
      mesh.setMatrixAt(i, _m);
      this.counts.set(q.fighter, i + 1);
      if (this.nt < 64) {
        _q.setFromAxisAngle(Y, yaw);
        const len = q.fighter === "rich" ? 1.6 : 0.9;
        _m.compose(
          _p.set(q.pos.x, PROJECTILE_Y - 0.02, q.pos.y),
          _q,
          _s.set(q.fighter === "rich" ? 0.16 : 0.22, 1, len),
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
export class AimGuide {
  readonly group = new Group();
  private aimMaterial: MeshBasicMaterial;
  private coreMaterial: MeshBasicMaterial;
  private lane: Mesh;
  private cone: Mesh;
  private circle: Mesh;
  private bar: Mesh;
  private core: Mesh;
  private moveDisc: Mesh;
  private moveRing: Mesh;
  private white = new Color(0xffffff);

  constructor(mats: ArenaMaterials) {
    this.aimMaterial = mats.flat(0xffffff, {
      opacity: 0.2,
      doubleSided: true,
    });
    this.coreMaterial = mats.flat(0xffffff, {
      opacity: 0.48,
      doubleSided: true,
    });
    const laneGeo = mats.track(
      new PlaneGeometry(2, 1).rotateX(-Math.PI / 2).translate(0, 0, 0.5),
    );
    this.lane = new Mesh(laneGeo, this.aimMaterial);
    this.core = new Mesh(laneGeo, this.coreMaterial);
    this.cone = new Mesh(mats.track(coneGeometry()), this.aimMaterial);
    this.circle = new Mesh(
      mats.track(new CircleGeometry(1, 48).rotateX(-Math.PI / 2)),
      this.aimMaterial,
    );
    this.bar = new Mesh(
      mats.track(new PlaneGeometry(2, 1).rotateX(-Math.PI / 2)),
      this.aimMaterial,
    );
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
      this.core,
      this.cone,
      this.circle,
      this.bar,
      this.moveDisc,
      this.moveRing,
    ]) {
      mesh.visible = false;
      mesh.renderOrder = 5;
      this.group.add(mesh);
    }
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
    this.core.visible = false;
    this.cone.visible = false;
    this.circle.visible = false;
    this.bar.visible = false;

    const moving = Math.hypot(move.x, move.y);
    this.moveDisc.visible = this.moveRing.visible = moving > 0.08;
    if (moving > 0.08) {
      const distance = 0.85 + Math.min(1, moving) * 0.35;
      const x = at.x + (move.x / moving) * distance;
      const y = at.y + (move.y / moving) * distance;
      this.moveDisc.position.set(x, 0.09, y);
      this.moveRing.position.set(x, 0.085, y);
    }

    if (!intent || !shape) return;
    this.aimMaterial.color.setHex(color).lerp(this.white, 0.55);
    this.aimMaterial.opacity = intent === "super" ? 0.28 : 0.3;
    this.coreMaterial.color.setHex(intent === "super" ? 0xfff2a8 : 0xffffff);
    const angle = Math.atan2(dir.x, dir.y);
    if (shape.kind === "lane") {
      this.lane.visible = true;
      this.lane.position.set(at.x, 0.065, at.y);
      this.lane.rotation.y = angle;
      this.lane.scale.set(shape.width / 2, 1, shape.range);
      if (shape.coreWidth) {
        this.core.visible = true;
        this.core.position.set(at.x, 0.072, at.y);
        this.core.rotation.y = angle;
        this.core.scale.set(shape.coreWidth / 2, 1, shape.range);
      }
      return;
    }
    if (shape.kind === "cone") {
      this.cone.visible = true;
      this.cone.position.set(at.x, 0.065, at.y);
      this.cone.rotation.y = angle;
      this.cone.scale.set(shape.halfWidth, 1, shape.range);
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
