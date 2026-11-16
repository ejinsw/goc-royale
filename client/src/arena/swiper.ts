import {
  AdditiveBlending,
  CanvasTexture,
  Color,
  CustomBlending,
  CylinderGeometry,
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
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { FIGHTERS, type Vec } from "../../../shared/definitions";
import type { Match, Player } from "../../../shared/types";
import type { ActionClip } from "./fighters";
import { preferences, uiCue } from "../audio";
import { uiPrefs } from "../ui/core/feedback";
import { merge, part } from "../ui/scene/geometry";
import type { Effects } from "./fx";
import type { ArenaMaterials } from "./materials";

/**
 * The UCLA Swiper's showcase: every over-the-top cue Brandon Nguyen plays.
 *
 * Arena presentation only (performance standard §3, §6). It reads the
 * snapshot and the authoritative effects the view already receives, and
 * never changes damage, timing, collision or input. Nothing here runs, and
 * no texture or buffer exists, until a match contains a `brandon_n`.
 *
 * Budget (§5.2): one 2048x2048 atlas, three instanced draws (sprites, glow,
 * a one-quad invert flash) and three small props. Particles live in a fixed
 * pool of `CAP`; a full pool recycles its oldest slot instead of growing.
 *
 * Who sees what: effects in the world (cards, stamps, food, rings) are drawn
 * for every viewer. Effects that take over the screen (darkening, banners,
 * zoom, hit-stop, the invert frame) play only for a viewer whose camera is
 * on Brandon, so he never hides another player's fight from them.
 *
 * Accessibility (§6.1): with reduced motion on, the screen flashes, invert
 * frame, zoom, hit-stop and shake are dropped and particle bursts are
 * halved; stamps and banners still appear. Shake also follows its setting.
 */

const SWIPER = "brandon_n";
const CAP = 720;
const BLUE = 0x2d6fc0;
const GOLD = 0xffd24a;
const RED = 0xff4d5e;
const GREEN = 0x4be08a;
const HALLS = ["BRUIN PLATE", "DE NEVE", "EPICURIA", "FEAST", "RENDEZVOUS"];
const FOOD = ["pizza", "boba", "burger", "rice", "smoothie", "waffle"];

interface Rect {
  u: number;
  v: number;
  du: number;
  dv: number;
  aspect: number;
}

// ---------------------------------------------------------------------- atlas

const AW = 2048;
const AH = 2048;
const INK = "rgba(11, 14, 20, 0.96)";
const FONT = (px: number) =>
  `900 ${px}px 'Barlow Condensed', 'Arial Narrow', sans-serif`;

/** Everything the show draws, rasterized once into one texture. */
function buildAtlas() {
  const canvas = document.createElement("canvas");
  canvas.width = AW;
  canvas.height = AH;
  const g = canvas.getContext("2d")!;
  // `roundRect` does not exist before Safari 16; arcs draw the same shape.
  const rounded = (x: number, y: number, w: number, h: number, r: number) => {
    if (typeof g.roundRect === "function") return g.roundRect(x, y, w, h, r);
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  };
  const rects = new Map<string, Rect>();
  let x = 2,
    y = 2,
    row = 0;
  const add = (
    name: string,
    w: number,
    h: number,
    draw: (w: number, h: number) => void,
  ) => {
    if (x + w + 2 > AW) {
      x = 2;
      y += row + 4;
      row = 0;
    }
    g.save();
    g.translate(x, y);
    g.beginPath();
    g.rect(0, 0, w, h);
    g.clip();
    draw(w, h);
    g.restore();
    rects.set(name, {
      u: x / AW,
      v: 1 - (y + h) / AH,
      du: w / AW,
      dv: h / AH,
      aspect: w / h,
    });
    x += w + 4;
    row = Math.max(row, h);
  };
  const text = (name: string, str: string, px: number, plate = false) => {
    g.font = FONT(px);
    const w = Math.ceil(g.measureText(str).width) + px * 0.5;
    const h = Math.ceil(px * 1.32);
    add(name, w, h, () => {
      g.font = FONT(px);
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.lineJoin = "round";
      if (plate) {
        g.lineWidth = px * 0.09;
        g.strokeStyle = "#fff";
        g.beginPath();
        rounded(px * 0.07, px * 0.07, w - px * 0.14, h - px * 0.14, px * 0.16);
        g.stroke();
      }
      g.lineWidth = px * 0.13;
      g.strokeStyle = INK;
      g.fillStyle = "#fff";
      g.strokeText(str, w / 2, h / 2 + px * 0.04);
      g.fillText(str, w / 2, h / 2 + px * 0.04);
    });
  };
  const radial = (name: string, size: number, stops: [number, number][]) =>
    add(name, size, size, () => {
      const grad = g.createRadialGradient(
        size / 2,
        size / 2,
        0,
        size / 2,
        size / 2,
        size / 2,
      );
      for (const [at, a] of stops) grad.addColorStop(at, `rgba(255,255,255,${a})`);
      g.fillStyle = grad;
      g.fillRect(0, 0, size, size);
    });
  const card = (w: number, h: number, body: string, stripe: string) => {
    g.fillStyle = INK;
    g.beginPath();
    rounded(0, 0, w, h, 9);
    g.fill();
    g.fillStyle = body;
    g.beginPath();
    rounded(4, 4, w - 8, h - 8, 6);
    g.fill();
    g.fillStyle = stripe;
    g.fillRect(4, 12, w - 8, 12);
    g.fillStyle = "rgba(255,255,255,0.92)";
    g.fillRect(12, 32, 22, 22);
  };
  const zigzag = (x0: number, h: number) => {
    for (let i = 0; i <= 6; i++) g.lineTo(x0 + (i % 2 ? 7 : -7), (h * i) / 6);
  };

  // Titles first: the widest sprites pack best on fresh rows.
  text("name", "BRANDON NGUYEN", 118);
  text("title", "THE UCLA SWIPER", 84);
  text("swipe", "SWIPE!", 118);
  text("crit", "CRITICAL SWIPE!!!", 104);
  text("swipedin", "SWIPED IN 😎", 96);
  text("triple", "TRIPLE SWIPE!", 76);
  text("closing", "DINING HALL CLOSING SOON", 60, true);
  text("insufficient", "INSUFFICIENT SWIPES", 70);
  text("ayce", "ALL YOU CAN EAT", 56, true);
  text("approved", "APPROVED ✓", 72, true);
  text("declined", "DECLINED ✗", 72, true);
  text("beep", "BEEP BEEP BEEP", 56);
  text("unlimited", "UNLIMITED SWIPES", 50);
  text("left", "SWIPES LEFT: 147 😏", 50, true);
  text("used", "+1 SWIPE USED", 50);
  text("ting", "✦ TING ✦", 56);
  // The Swipe You In cutscene.
  text("ult", "SWIPE YOU IN", 150);
  text("ultsub", "— BRANDON NGUYEN, THE UCLA SWIPER —", 50);
  text("legend", "★ LEGENDARY ★", 44);
  text("thanks", "+1 SWIPE USED — THANK YOU, COME AGAIN", 44);
  text("skip", "ANY KEY TO SKIP", 34);
  HALLS.forEach((hall, i) => text("hall" + i, hall, 54));
  for (const ch of "0123456789+") text("d" + ch, ch, 60);
  const emoji: [string, string][] = [
    ["pizza", "🍕"],
    ["boba", "🧋"],
    ["burger", "🍔"],
    ["rice", "🍚"],
    ["smoothie", "🥤"],
    ["waffle", "🧇"],
    ["glasses", "👓"],
  ];
  for (const [name, ch] of emoji)
    add(name, 76, 76, () => {
      g.font = "58px sans-serif";
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(ch, 38, 42);
    });

  add("px", 8, 8, (w, h) => {
    g.fillStyle = "#fff";
    g.fillRect(0, 0, w, h);
  });
  radial("dot", 64, [
    [0, 1],
    [0.35, 0.55],
    [1, 0],
  ]);
  radial("vign", 128, [
    [0, 0],
    [0.55, 0],
    [1, 1],
  ]);
  radial("spot", 256, [
    [0, 0],
    [0.09, 0],
    [0.24, 1],
    [1, 1],
  ]);
  add("star", 64, 64, () => {
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
  add("flare", 256, 32, (w, h) => {
    const grad = g.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0, "rgba(255,255,255,0)");
    grad.addColorStop(0.5, "rgba(255,255,255,1)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.beginPath();
    g.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
    g.fill();
  });
  add("scan", 128, 32, (w) => {
    g.fillStyle = "#fff";
    for (let i = 0; i < 4; i++) g.fillRect(0, 2 + i * 8, w, 4);
  });
  add("card", 96, 64, (w, h) => card(w, h, "#2d6fc0", "#ffd24a"));
  add("cardw", 96, 64, (w, h) => card(w, h, "#ffffff", "#d7dde8"));
  add("crack", 96, 64, (w, h) => {
    card(w, h, "#ffffff", "#d7dde8");
    g.strokeStyle = INK;
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(52, 0);
    for (const [px, py] of [
      [44, 16],
      [58, 30],
      [40, 44],
      [50, 64],
    ])
      g.lineTo(px, py);
    g.stroke();
  });
  for (const side of [-1, 1])
    add(side < 0 ? "cardL" : "cardR", 56, 64, (w, h) => {
      g.beginPath();
      if (side < 0) {
        g.moveTo(0, 0);
        g.lineTo(w - 9, 0);
        zigzag(w - 9, h);
        g.lineTo(0, h);
      } else {
        g.moveTo(w, 0);
        g.lineTo(9, 0);
        zigzag(9, h);
        g.lineTo(w, h);
      }
      g.closePath();
      g.clip();
      g.translate(side < 0 ? 0 : w - 96, 0);
      card(96, h, "#2d6fc0", "#ffd24a");
    });
  add("paper", 96, 128, (w, h) => {
    g.fillStyle = "#fffdf4";
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(w, 0);
    g.lineTo(w, h - 8);
    for (let i = 8; i >= 0; i--) g.lineTo((w * i) / 8, h - (i % 2 ? 0 : 8));
    g.closePath();
    g.fill();
    g.fillStyle = "rgba(20,24,34,0.28)";
    for (const [ly, lw] of [
      [10, 0.6],
      [20, 0.4],
      [92, 0.7],
      [102, 0.5],
    ])
      g.fillRect(w * 0.12, ly, w * lw, 4);
  });
  add("lines", 256, 256, () => {
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
  add("coin", 64, 64, () => {
    g.fillStyle = "#a8780c";
    g.beginPath();
    g.arc(32, 32, 30, 0, 7);
    g.fill();
    g.fillStyle = "#ffd24a";
    g.beginPath();
    g.arc(32, 32, 25, 0, 7);
    g.fill();
    g.fillStyle = "#fff3b0";
    g.beginPath();
    g.arc(23, 22, 7, 0, 7);
    g.fill();
    g.fillStyle = "#a8780c";
    g.font = FONT(34);
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText("$", 33, 35);
  });
  radial("ringS", 256, [
    [0, 0],
    [0.74, 0],
    [0.86, 1],
    [0.93, 0.5],
    [1, 0],
  ]);
  add("rays", 256, 256, () => {
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
  // A dining hall in silhouette: pediment, cornice and five arches.
  add("hall", 384, 192, (w, h) => {
    g.fillStyle = "#fff";
    g.beginPath();
    g.moveTo(20, 70);
    g.lineTo(w / 2, 8);
    g.lineTo(w - 20, 70);
    g.closePath();
    g.fill();
    g.fillRect(8, 70, w - 16, 14);
    g.fillRect(20, 84, w - 40, h - 84);
    g.globalCompositeOperation = "destination-out";
    for (let i = 0; i < 5; i++) {
      const cx = 56 + i * 68;
      g.beginPath();
      g.moveTo(cx - 20, h);
      g.lineTo(cx - 20, 128);
      g.arc(cx, 128, 20, Math.PI, 0);
      g.lineTo(cx + 20, h);
      g.fill();
    }
  });
  add("crackS", 256, 256, () => {
    g.strokeStyle = "#fff";
    g.lineJoin = "round";
    g.lineWidth = 3.5;
    g.translate(128, 128);
    let seed = 11;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) % 1000) / 1000;
    for (let i = 0; i < 9; i++) {
      let a = (i / 9) * Math.PI * 2 + rnd() * 0.4,
        r = 6;
      g.beginPath();
      g.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      while (r < 124) {
        r += 14 + rnd() * 22;
        a += (rnd() - 0.5) * 0.7;
        g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      g.stroke();
    }
  });
  // The three anime panels: his eyes, his grip on the card, and a smirk.
  const panel = (name: string, bg: string, draw: () => void) =>
    add(name, 200, 260, (w, h) => {
      g.fillStyle = bg;
      g.fillRect(0, 0, w, h);
      g.strokeStyle = "rgba(255,255,255,0.22)";
      g.lineWidth = 3;
      for (let i = 0; i < 9; i++) {
        g.beginPath();
        g.moveTo(-20, 30 + i * 30);
        g.lineTo(w + 20, i * 30 - 10);
        g.stroke();
      }
      g.lineJoin = "round";
      g.lineCap = "round";
      draw();
      g.strokeStyle = INK;
      g.lineWidth = 14;
      g.strokeRect(0, 0, w, h);
    });
  panel("eyes", "#e3b48c", () => {
    g.fillStyle = "#1f1b1e";
    for (let i = 0; i < 7; i++) {
      g.beginPath();
      g.arc(i * 34, 34 + (i % 2) * 16, 36, 0, 7);
      g.fill();
    }
    g.fillStyle = "rgba(255,255,255,0.2)";
    g.fillRect(18, 112, 74, 46);
    g.fillRect(108, 112, 74, 46);
    g.fillStyle = INK;
    for (const ex of [56, 144]) {
      g.beginPath();
      g.ellipse(ex, 138, 11, 13, 0, 0, 7);
      g.fill();
    }
    g.strokeStyle = INK;
    g.lineWidth = 9;
    g.beginPath();
    g.moveTo(24, 102);
    g.lineTo(86, 92);
    g.moveTo(176, 102);
    g.lineTo(114, 92);
    g.stroke();
    g.lineWidth = 6;
    g.beginPath();
    rounded(18, 112, 74, 46, 6);
    rounded(108, 112, 74, 46, 6);
    g.moveTo(92, 128);
    g.lineTo(108, 128);
    g.stroke();
    g.fillStyle = "#fff";
    for (const ex of [61, 149]) {
      g.beginPath();
      g.arc(ex, 133, 4, 0, 7);
      g.fill();
    }
    g.translate(170, 118);
    g.beginPath();
    for (let i = 0; i < 8; i++) {
      const r = i % 2 ? 4 : 22,
        a = (i * Math.PI) / 4;
      g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    g.fill();
  });
  panel("hand", "#2d6fc0", () => {
    g.save();
    g.translate(100, 112);
    g.rotate(-0.35);
    g.translate(-72, -80);
    g.scale(1.5, 1.5);
    card(96, 64, "#ffffff", "#ffd24a");
    g.restore();
    g.fillStyle = "#e3b48c";
    g.strokeStyle = INK;
    g.lineWidth = 7;
    g.beginPath();
    rounded(44, 132, 118, 84, 30);
    g.fill();
    g.stroke();
    g.beginPath();
    g.ellipse(64, 138, 30, 18, -0.5, 0, 7);
    g.fill();
    g.stroke();
    g.lineWidth = 5;
    for (const fx of [84, 110, 136]) {
      g.beginPath();
      g.moveTo(fx, 150);
      g.lineTo(fx - 4, 190);
      g.stroke();
    }
  });
  panel("smirk", "#e3b48c", () => {
    g.strokeStyle = INK;
    g.lineWidth = 5;
    g.beginPath();
    g.moveTo(96, 44);
    g.quadraticCurveTo(112, 76, 94, 84);
    g.stroke();
    g.lineWidth = 9;
    g.beginPath();
    g.moveTo(52, 142);
    g.quadraticCurveTo(110, 172, 158, 122);
    g.stroke();
    g.lineWidth = 5;
    g.beginPath();
    g.moveTo(162, 110);
    g.lineTo(172, 126);
    g.stroke();
    g.fillStyle = "#1b2238";
    g.beginPath();
    g.moveTo(0, 260);
    g.lineTo(0, 226);
    g.quadraticCurveTo(100, 262, 200, 226);
    g.lineTo(200, 260);
    g.fill();
  });
  return { canvas, rects };
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
const _v = new Vector3();
const _c = new Color();
const _white = new Color(0xffffff);
const Z = new Vector3(0, 0, 1);

/** One instanced draw of atlas quads. */
class Layer {
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

/**
 * What a particle leaves behind when its life ends. A card bursts into
 * smaller cards, which burst into sparkles.
 */
const Die = { None: 0, Cards: 1, Sparkles: 2, Firework: 3 } as const;
type Die = (typeof Die)[keyof typeof Die];

interface Particle {
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
  die: Die;
  /** Made by the cutscene; removed if it is skipped. */
  cine: boolean;
}

const blank = (rect: Rect): Particle => ({
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
  die: Die.None,
  cine: false,
});

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const outBack = (k: number) => {
  const c = 1.9,
    t = Math.min(1, k) - 1;
  return 1 + (c + 1) * t * t * t + c * t * t;
};

// ----------------------------------------------------------------------- show

/** A fighter the show reads each frame; `FighterActor` satisfies it. */
export interface ShowActor {
  readonly at: Vec;
  readonly group: Object3D;
  yaw: number;
  speed: number;
  shown: boolean;
  trigger(clip: ActionClip, now: number): boolean;
}

/** Beat times (cutscene seconds) for the full and the short cut. */
interface CutKeys {
  zoom: number;
  power: number;
  name: number;
  swipe: number;
  flash: number;
  stamp: number;
}
interface Cut {
  owner: string;
  /** Presentation clock value at cutscene time 0. */
  start: number;
  total: number;
  short: boolean;
  keys: CutKeys;
  beats: Timed[];
  /** When the authority resumed play; Infinity while paused. */
  resumedAt: number;
  skipped: boolean;
}
const FULL_CUT: CutKeys = {
  zoom: 0.3,
  power: 1,
  name: 2,
  swipe: 3,
  flash: 3.45,
  stamp: 3.5,
};
const SHORT_CUT: CutKeys = {
  zoom: 0.1,
  power: Infinity,
  name: 0.3,
  swipe: 0.7,
  flash: 0.95,
  stamp: 1,
};
const sat = (x: number) => Math.max(0, Math.min(1, x));

export interface ShowFrame {
  now: number;
  dt: number;
  match: Match;
  localId: string;
  /** The fighter the camera follows. */
  focusId: string | null;
  actors: ReadonlyMap<string, ShowActor>;
}

interface Star {
  id: string;
  x: number;
  z: number;
  hp: number;
  alive: boolean;
  kills: number;
  idle: number;
  trail: number;
  crumb: number;
  flourishAt: number;
  glintAt: number;
  checkAt: number;
  beepAt: number;
  combo: number;
  stampAt: number;
  stampX: number;
  stampZ: number;
  volley: number;
  squashAt: number;
  squash: number;
  windupAt: number;
}

interface Timed {
  at: number;
  run: () => void;
}

interface Prop {
  mesh: Group;
  start: number;
  end: number;
}

export class SwiperShow {
  readonly group = new Group();
  /** The view holds the frame until this time (hit-stop, presentation only). */
  freezeUntil = 0;
  private rects: Map<string, Rect>;
  private sprites: Layer;
  private glow: Layer;
  private invert: Mesh;
  private invertUntil = 0;
  private pool: Particle[] = [];
  private defaults!: Particle;
  /** Screen particles, drawn after the world and the screen overlays. */
  private onScreen: Particle[] = [];
  private vignette = 0;
  private cursor = 0;
  private stars = new Map<string, Star>();
  private buffs = new Map<string, number>();
  private shots = new Map<number, { x: number; z: number; seen: number }>();
  private frameNo = 0;
  private score: [number, number] = [0, 0];
  private matchTime = 0;
  private shed = 0;
  private timeline: Timed[] = [];
  private reader: Prop;
  private turnstile: Prop & { arms: Mesh; stopAt: number };
  private pillar: Prop;
  private dark = { start: 0, in: 0.2, end: 0, out: 0.3, alpha: 0, id: "" };
  private tint = { start: 0, end: 0, color: 0, alpha: 0 };
  private lines = { start: 0, end: 0 };
  private punch = { start: 0, dur: 1, amount: 0 };
  private lastFreeze = 0;
  private lastCrit = -9;
  private now = 0;
  private calm = false;
  private focus: string | null = null;
  private local = "";
  private actors: ReadonlyMap<string, ShowActor> = new Map();
  private right = new Vector3();
  private up = new Vector3();
  private center = new Vector3();
  private halfH = 1;
  private halfW = 1;

  constructor(
    mats: ArenaMaterials,
    private camera: PerspectiveCamera,
    private fx: Effects,
    private shakeView: (ms: number, intensity: number, now: number) => void,
  ) {
    const atlas = buildAtlas();
    this.rects = atlas.rects;
    const texture = mats.track(new CanvasTexture(atlas.canvas));
    texture.colorSpace = SRGBColorSpace;
    texture.minFilter = LinearMipmapLinearFilter;
    texture.magFilter = LinearFilter;
    this.sprites = new Layer(mats, texture, CAP + 160, false);
    this.glow = new Layer(mats, texture, CAP, true);
    const dot = this.rect("dot");
    this.defaults = blank(dot);
    for (let i = 0; i < CAP; i++) this.pool.push(blank(dot));

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

    const prop = (mesh: Group): Prop => {
      mesh.visible = false;
      return { mesh, start: 0, end: 0 };
    };
    const box = (w: number, h: number, d: number, r = 0.04) =>
      new RoundedBoxGeometry(w, h, d, 1, r);
    const readerGroup = new Group();
    readerGroup.add(
      new Mesh(
        mats.track(
          merge([
            part(box(1.5, 2.6, 1.1, 0.12), "#2b313d", [0, 1.3, 0]),
            part(box(1.2, 0.7, 0.08), "#4be08a", [0, 2, 0.56]),
            part(box(0.16, 1.1, 0.5), "#11141a", [0.5, 1, 0.42]),
            part(box(1.56, 0.16, 1.16, 0.05), "#ffd24a", [0, 2.62, 0]),
            part(box(1.56, 0.16, 1.16, 0.05), "#2d6fc0", [0, 0.08, 0]),
          ]),
        ),
        mats.toon,
      ),
    );
    this.reader = prop(readerGroup);
    const gate = new Group();
    gate.add(
      new Mesh(
        mats.track(
          merge([
            part(box(0.5, 1.5, 0.5, 0.08), "#8b939d", [0, 0.75, 0]),
            part(box(0.62, 0.16, 0.62, 0.05), "#2d6fc0", [0, 1.5, 0]),
          ]),
        ),
        mats.toon,
      ),
    );
    const arms = new Mesh(
      mats.track(
        merge(
          [0, 1, 2].map((i) =>
            part(
              box(0.12, 0.12, 1.3, 0.05),
              "#d7dde4",
              [
                Math.sin((i * Math.PI * 2) / 3) * 0.65,
                0,
                Math.cos((i * Math.PI * 2) / 3) * 0.65,
              ],
              [0, (i * Math.PI * 2) / 3, 0],
            ),
          ),
        ),
      ),
      mats.toon,
    );
    arms.position.y = 1.15;
    gate.add(arms);
    this.turnstile = { ...prop(gate), arms, stopAt: Infinity };
    const beam = new Group();
    beam.add(
      new Mesh(
        mats.track(
          new CylinderGeometry(1, 1, 1, 20, 1, true).translate(0, 0.5, 0),
        ),
        mats.flat(GOLD, { opacity: 0.4, doubleSided: true, additive: true }),
      ),
    );
    this.pillar = prop(beam);
    this.group.add(
      this.sprites.mesh,
      this.glow.mesh,
      this.invert,
      readerGroup,
      gate,
      beam,
    );
  }

  private rect(name: string) {
    return this.rects.get(name)!;
  }
  private isFocus(id: string) {
    return this.focus === id;
  }
  /** His own screen, even after the camera has left his fallen fighter. */
  private isMine(id: string) {
    return this.focus === id || this.local === id;
  }
  private sound(kind: string, gapMs = 60, pitch = 1) {
    uiCue("swiper_" + kind, pitch, gapMs);
  }
  private shake(ms: number, intensity: number) {
    if (!preferences.shake || this.calm) return;
    this.shakeView(ms, intensity, this.now);
  }
  /** Hit-stop for the viewer following Brandon; never the simulation. */
  private freeze(ms: number, id: string) {
    if (this.calm || !this.isFocus(id) || this.now < this.lastFreeze + 0.3)
      return;
    this.lastFreeze = this.now;
    this.freezeUntil = this.now + ms / 1000;
  }
  private zoom(amount: number, dur: number, id: string) {
    if (this.calm || !preferences.shake || !this.isFocus(id)) return;
    this.punch.start = this.now;
    this.punch.dur = dur;
    this.punch.amount = amount;
  }
  /** Camera distance multiplier: a fast punch in, then an eased return. */
  zoomAt(now: number) {
    const cine = this.cineZoom(now);
    const k = (now - this.punch.start) / this.punch.dur;
    if (k < 0 || k >= 1) return cine;
    const shape = k < 0.12 ? k / 0.12 : (1 - (k - 0.12) / 0.88) ** 3;
    return cine * (1 - this.punch.amount * shape);
  }
  /** Squash-and-stretch height multiplier for one fighter. */
  squashOf(id: string, now: number) {
    const star = this.stars.get(id);
    if (!star) return 1;
    const t = now - star.squashAt;
    if (t < 0 || t > 0.45) return 1;
    return 1 + star.squash * Math.exp(-t * 9) * Math.cos(t * 30);
  }
  private after(delay: number, run: () => void) {
    this.timeline.push({ at: this.now + delay, run });
  }
  private count(n: number) {
    return this.calm ? Math.ceil(n / 2) : n;
  }

  /** A pooled particle. A full pool recycles the next slot in the ring. */
  private spawn(name: string, x: number, y: number, z: number): Particle {
    let p = this.pool[this.cursor];
    for (let i = 0; i < 24 && p.on; i++) {
      this.cursor = (this.cursor + 1) % CAP;
      p = this.pool[this.cursor];
    }
    this.cursor = (this.cursor + 1) % CAP;
    Object.assign(p, this.defaults);
    p.rect = this.rect(name);
    p.cine = this.cineMode;
    p.on = true;
    p.x = x;
    p.y = y;
    p.z = z;
    p.w = p.h * p.rect.aspect;
    return p;
  }
  private size(p: Particle, h: number) {
    p.h = h;
    p.w = h * p.rect.aspect;
    return p;
  }
  private color(p: Particle, hex: number) {
    _c.setHex(hex);
    p.r = _c.r;
    p.g = _c.g;
    p.b = _c.b;
    return p;
  }
  private hue(p: Particle, h: number, light = 0.6) {
    _c.setHSL(((h % 1) + 1) % 1, 1, light);
    p.r = _c.r;
    p.g = _c.g;
    p.b = _c.b;
    return p;
  }

  // ------------------------------------------------------------ building blocks

  /** Text or a stamp that slams in above a point in the world. */
  private stamp(
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
  private slam(
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
  private sparkle(x: number, y: number, z: number, hex = GOLD, h = 0.22) {
    const p = this.size(this.spawn("star", x, y, z), h);
    this.color(p, hex);
    p.add = true;
    p.life = rand(0.25, 0.5);
    p.spin = rand(-6, 6);
    p.grow = 0.2;
    p.vy = rand(0.3, 1.2);
    return p;
  }
  /** Loose cards thrown outward. `cascade` makes each one burst again. */
  private cards(
    x: number,
    y: number,
    z: number,
    n: number,
    speed: number,
    cascade: boolean,
    rainbow = false,
  ) {
    for (let i = 0; i < this.count(n); i++) {
      const p = this.size(
        this.spawn(rainbow ? "cardw" : "card", x, y, z),
        rand(0.2, 0.34),
      );
      if (rainbow) this.hue(p, Math.random(), 0.62);
      const a = rand(0, Math.PI * 2);
      p.vx = Math.cos(a) * speed * rand(0.4, 1);
      p.vz = Math.sin(a) * speed * rand(0.4, 1);
      p.vy = rand(1.5, 4.5);
      p.gravity = -11;
      p.drag = 1.2;
      p.spin = rand(-12, 12);
      p.roll = rand(0, 6);
      p.life = cascade ? rand(0.2, 0.32) : rand(0.6, 1.1);
      p.die = cascade ? Die.Cards : Die.None;
    }
  }
  private confetti(x: number, z: number, n: number, radius: number) {
    for (let i = 0; i < this.count(n); i++) {
      const p = this.size(
        this.spawn("cardw", x + rand(-radius, radius), rand(5, 8), z + rand(-radius, radius)),
        rand(0.14, 0.26),
      );
      this.hue(p, Math.random(), 0.62);
      p.delay = rand(0, 1.6);
      p.vy = rand(-3.4, -1.8);
      p.sway = rand(0.6, 1.6);
      p.spin = rand(-9, 9);
      p.life = rand(1.6, 2.6);
    }
  }
  private glint(star: Star) {
    const eyes = this.spawn("star", star.x, 1.78, star.z + 0.35);
    this.size(eyes, 0.9);
    eyes.add = true;
    eyes.life = 0.45;
    eyes.pop = 0.1;
    eyes.pop0 = 0.1;
    eyes.spin = 5;
    eyes.grow = 0.3;
    const streak = this.size(this.spawn("flare", star.x, 1.78, star.z + 0.35), 0.22);
    streak.w = 3.4;
    streak.add = true;
    streak.life = 0.35;
    streak.grow = 1.5;
    this.stamp("ting", { x: star.x, y: star.z }, 3.15, 0.42, 0xfff3b0, 0.8);
    if (this.isFocus(star.id)) this.sound("ting", 400);
  }
  private darken(
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
  private wash(id: string, color: number, alpha: number, seconds: number) {
    if (this.calm || !this.isFocus(id)) return;
    Object.assign(this.tint, {
      start: this.now,
      end: this.now + seconds,
      color,
      alpha,
    });
  }
  private speedLines(id: string, seconds: number) {
    if (this.calm || !this.isFocus(id)) return;
    this.lines.start = this.now;
    this.lines.end = this.now + seconds;
  }
  private impactFrame(id: string, seconds = 0.08) {
    if (this.calm || !this.isFocus(id)) return;
    this.invertUntil = this.now + seconds;
  }
  private showProp(p: Prop, x: number, z: number, seconds: number, yaw = 0) {
    p.mesh.position.set(x, 0, z);
    p.mesh.rotation.y = yaw;
    p.start = this.now;
    p.end = this.now + seconds;
  }
  private gate(x: number, z: number, seconds: number, stopAfter = Infinity) {
    this.showProp(this.turnstile, x, z, seconds);
    this.turnstile.stopAt = this.now + stopAfter;
  }

  // ------------------------------------------------------------------- beats

  /** Match start (the 3 s countdown, when nobody can move) or a respawn. */
  private entrance(star: Star, full: boolean) {
    const at = { x: star.x, y: star.z };
    if (!full) {
      this.sound("beep3", 200);
      this.fx.ring(at, 0.3, 2.4, GOLD, 0.5, this.now);
      this.cards(star.x, 1.4, star.z, 18, 4, false, true);
      this.stamp("title", at, 3.2, 0.5, 0xffffff, 1.1);
      star.squashAt = this.now;
      star.squash = 0.2;
      return;
    }
    const big = this.isFocus(star.id);
    this.darken(star.id, 0.68, 2.6);
    this.sound("beep", 100);
    this.showProp(this.reader, star.x + 1.5, star.z - 0.6, 2.9, -0.35);
    this.after(0.72, () => {
      this.sound("boom", 200);
      this.sound("beep3", 200);
      this.shake(240, 0.007);
      this.fx.ring({ x: star.x + 1.5, y: star.z - 0.6 }, 0.4, 3, 0xffffff, 0.45, this.now);
      this.cards(star.x + 1.5, 0.4, star.z - 0.6, 10, 5, false);
    });
    // He cannot walk during the countdown, so the turnstile passes over him.
    this.after(0.85, () => {
      this.gate(star.x, star.z + 1.5, 1.9);
      for (let i = 0; i < this.count(8); i++) {
        const wind = this.size(
          this.spawn("flare", star.x + rand(-2, 2), rand(0.6, 2.2), star.z + rand(-1, 1)),
          0.05,
        );
        wind.w = rand(1.2, 2.4);
        wind.add = true;
        wind.a = 0.6;
        wind.vx = 9;
        wind.delay = rand(0, 0.5);
        wind.life = 0.5;
      }
    });
    this.after(1.45, () => {
      this.sound("boom", 200);
      this.shake(320, 0.011);
      this.zoom(0.1, 0.7, star.id);
      this.fx.ring(at, 0.5, 7, GOLD, 0.6, this.now);
      this.fx.ring(at, 0.3, 5, 0xffffff, 0.45, this.now);
      this.fx.disc(at, 0.3, 4, GOLD, 0.4, this.now, 0.35);
      this.cards(star.x, 1.6, star.z, 46, 7, false, true);
      this.confetti(star.x, star.z, 40, 5);
      if (big) {
        this.slam("name", 0, 0.56, 0.2, 1.5, 0xffffff);
        const flare = this.size(this.spawn("flare", 0, 0.56, 0), 0.07);
        flare.screen = true;
        flare.add = true;
        flare.w = 2.6;
        flare.life = 0.5;
        flare.grow = 1.4;
      } else this.stamp("name", at, 3.9, 0.7, 0xffffff, 1.5);
    });
    this.after(1.75, () => {
      if (big) {
        const sub = this.slam("title", 0, 0.34, 0.1, 1.2, GOLD, false);
        sub.pop = 0;
        sub.slide = 0.25;
        sub.sx = 1.4;
      } else this.stamp("title", at, 3.2, 0.45, GOLD, 1.2);
      this.sound("kaching", 200);
    });
    this.after(2.15, () => this.glint(star));
  }

  /** The swipe itself: a tight arc and one streak down each card's path. */
  swipe(id: string, from: Vec, dir: Vec, now: number) {
    this.now = now;
    const star = this.stars.get(id);
    this.sound("slash", 50, rand(0.92, 1.1));
    this.fx.cone(from, dir, 1.7, 0.42, 0xffffff, 0.14, now, 0.5);
    const yaw = Math.atan2(dir.y, dir.x);
    const spread = (FIGHTERS[SWIPER].abilities.attack as { spread?: number[] })
      .spread ?? [0];
    for (const off of spread) {
      const d = { x: Math.cos(yaw + off), y: Math.sin(yaw + off) };
      this.fx.streak(from, d, 0.5, 2.6, 0.1, GOLD, 0.16, now, 0.9);
    }
    for (let i = 0; i < this.count(5); i++) {
      const a = yaw + rand(-0.5, 0.5);
      const s = this.sparkle(from.x + Math.cos(a) * 0.8, 1, from.y + Math.sin(a) * 0.8);
      s.vx = Math.cos(a) * 5;
      s.vz = Math.sin(a) * 5;
    }
    if (star) {
      star.squashAt = now;
      star.squash = 0.07;
      star.idle = 0;
    }
  }

  /** His Super was pressed locally: the card goes up before authority answers. */
  windup(id: string, at: Vec, now: number) {
    this.now = now;
    const star = this.stars.get(id);
    if (star) star.windupAt = now;
    this.sound("charge", 300);
    this.showProp(this.pillar, at.x, at.y, 1.5);
  }

  /** One of his cards landed. Returns nothing; the view skips its own number. */
  landed(id: string, at: Vec, value: number, now: number) {
    this.now = now;
    const star = this.stars.get(id);
    this.receipt(at, value);
    this.cards(at.x, 1.1, at.y, 5, 4.5, true);
    if (!star) return;
    const fresh =
      now - star.stampAt > 0.25 ||
      Math.hypot(at.x - star.stampX, at.y - star.stampZ) > 1.2;
    if (!fresh) {
      // All three cards of one swipe on one rival: the showy "crit".
      if (++star.volley === 3) this.crit(star, at);
      return;
    }
    star.stampAt = now;
    star.stampX = at.x;
    star.stampZ = at.y;
    star.volley = 1;
    star.combo++;
    this.stamp("approved", at, 3, 0.62, GREEN, 0.85, -0.16);
    this.sound("stamp", 80);
    this.freeze(45, id);
    if (star.combo % 3 === 0) this.finisher(star, at);
  }

  /** Damage printed on a receipt that unrolls, then drops away. */
  private receipt(at: Vec, value: number) {
    const text = String(value);
    const drift = rand(-0.5, 0.5);
    const paper = this.spawn("paper", at.x, 2.75, at.y);
    paper.w = 0.3 + text.length * 0.2;
    paper.h = 0.82;
    paper.unroll = 0.16;
    const pieces = [paper];
    let ox = -((text.length - 1) * 0.2) / 2;
    for (const ch of text) {
      const d = this.size(this.spawn("d" + ch, at.x, 2.75, at.y), 0.42);
      this.color(d, 0x141822);
      d.ox = ox;
      d.oy = 0.03;
      d.delay = 0.1;
      pieces.push(d);
      ox += 0.2;
    }
    for (const p of pieces) {
      p.life = 1.25 - p.delay;
      p.vy = 0.9;
      p.gravity = -7;
      p.vox = drift;
      p.fade = 0.8;
    }
  }

  /** Every third landed swipe: a card tornado and a sonic boom. No damage. */
  private finisher(star: Star, at: Vec) {
    this.stamp("triple", at, 3.75, 0.6, GOLD, 1);
    this.sound("boom", 150);
    this.shake(280, 0.009);
    this.freeze(70, star.id);
    this.zoom(0.06, 0.5, star.id);
    this.fx.ring(at, 0.5, 5.5, 0xffffff, 0.35, this.now);
    this.fx.disc(at, 0.3, 3, 0xffffff, 0.25, this.now, 0.3);
    for (let i = 0; i < 3; i++)
      this.fx.ring(at, 0.3, 1.6, GOLD, 0.5 + i * 0.1, this.now, 0.9, 0.3 + i * 0.7);
    for (let i = 0; i < this.count(20); i++) {
      const p = this.size(this.spawn("card", at.x, rand(0.2, 0.8), at.y), 0.28);
      p.swirl = true;
      p.cx = at.x;
      p.cz = at.y;
      p.rad = rand(0.3, 0.7);
      p.radV = 1.4;
      p.ang = (i / 20) * Math.PI * 6;
      p.angV = 15;
      p.vy = rand(2.4, 3.6);
      p.spin = 14;
      p.life = 0.75;
      p.delay = i * 0.012;
    }
  }

  private crit(star: Star, at: Vec) {
    this.sound("boom", 150);
    this.sound("kaching", 150);
    this.shake(300, 0.012);
    this.fx.ring(at, 0.4, 4, GOLD, 0.4, this.now);
    this.cards(at.x, 1.3, at.y, 16, 7, true, true);
    // The full-screen version is rationed so close fights stay readable.
    if (!this.isFocus(star.id) || this.now - this.lastCrit < 2.5) {
      this.stamp("crit", at, 3.9, 0.55, GOLD, 1);
      return;
    }
    this.lastCrit = this.now;
    this.freeze(110, star.id);
    this.impactFrame(star.id);
    this.zoom(0.09, 0.55, star.id);
    this.speedLines(star.id, 0.45);
    this.slam("crit", 0, 0.42, 0.17, 1, GOLD);
    if (this.calm) return;
    // A giant card slices corner to corner, trailing a white cut.
    const blade = this.size(this.spawn("card", -1.5, -1.3, 0), 0.5);
    blade.screen = true;
    blade.vx = 9.5;
    blade.vy = 8.2;
    blade.roll = 0.7;
    blade.spin = 22;
    blade.life = 0.34;
    blade.fade = 0.9;
    const cut = this.size(this.spawn("flare", 0, 0, 0), 0.045);
    cut.screen = true;
    cut.add = true;
    cut.w = 4.2;
    cut.roll = 0.62;
    cut.life = 0.4;
    cut.delay = 0.1;
    cut.grow = 0.2;
  }

  /** He took a hit: declined, glasses off, cards everywhere, then re-collected. */
  private hurt(star: Star) {
    const at = { x: star.x, y: star.z };
    this.stamp("declined", at, 3.1, 0.55, RED, 0.75, 0.14);
    this.sound("declined", 300);
    star.squashAt = this.now;
    star.squash = -0.16;
    this.wash(star.id, RED, 0.24, 0.28);
    for (let i = 0; i < this.count(8); i++) {
      const p = this.size(this.spawn("card", star.x, 1.2, star.z), 0.26);
      const a = rand(0, Math.PI * 2);
      p.vx = Math.cos(a) * rand(3, 6);
      p.vz = Math.sin(a) * rand(3, 6);
      p.vy = rand(1, 4);
      p.gravity = -6;
      p.drag = 3;
      p.spin = rand(-10, 10);
      p.home = star.id;
      p.homeAt = rand(0.4, 0.6);
      p.life = 1.4;
      p.fade = 0.95;
    }
    const specs = this.size(this.spawn("glasses", star.x, 1.8, star.z), 0.5);
    specs.vy = 4.5;
    specs.vx = rand(-1.5, 1.5);
    specs.gravity = -9;
    specs.spin = rand(-9, 9);
    specs.home = star.id;
    specs.homeAt = 0.55;
    specs.life = 1.4;
    specs.fade = 0.95;
  }

  /** Eliminated: the card snaps, one sad card drifts down, the gate shuts. */
  private defeat(star: Star) {
    const at = { x: star.x, y: star.z };
    this.sound("sad", 500);
    this.sound("stamp", 80);
    for (const side of [-1, 1]) {
      const half = this.size(
        this.spawn(side < 0 ? "cardL" : "cardR", star.x, 2, star.z),
        0.95,
      );
      half.ox = side * 0.27;
      half.vox = side * 0.38;
      half.voy = -0.22;
      half.spin = -side * 0.7;
      half.life = 2;
      half.fade = 0.65;
    }
    const snap = this.size(this.spawn("star", star.x, 2, star.z), 1.5);
    snap.add = true;
    snap.life = 0.3;
    snap.grow = 0.2;
    const leaf = this.size(this.spawn("card", star.x, 4.4, star.z), 0.34);
    leaf.delay = 0.6;
    leaf.vy = -1.15;
    leaf.sway = 1.5;
    leaf.life = 3;
    leaf.fade = 0.85;
    this.gate(star.x, star.z + 1.1, 2.4, 0.75);
    this.after(0.75, () => this.sound("stamp", 80, 0.6));
    if (this.isMine(star.id) && !this.calm) {
      Object.assign(this.dark, {
        start: this.now,
        in: 0.22,
        end: this.now + 2.2,
        out: 0.35,
        alpha: 0.5,
        id: star.id,
      });
      this.slam("insufficient", 0, 0.3, 0.13, 2, RED);
    } else this.stamp("insufficient", at, 3.8, 0.7, RED, 1.8);
  }

  /** A goal for his side (`big`) or a knockout he scored: card fireworks. */
  private victory(star: Star, big: boolean) {
    const at = { x: star.x, y: star.z };
    this.sound("fanfare", 500);
    for (let v = 0; v < (big ? this.count(6) : 1); v++)
      this.after(v * 0.4, () => {
        const rocket = this.size(this.spawn("dot", star.x, 1.2, star.z), 0.35);
        this.color(rocket, GOLD);
        rocket.add = true;
        rocket.vx = rand(-2.5, 2.5);
        rocket.vz = rand(-2, 2);
        rocket.vy = rand(9, 11);
        rocket.gravity = -10;
        rocket.life = rand(0.45, 0.6);
        rocket.fade = 1;
        rocket.die = Die.Firework;
      });
    this.cards(star.x, 1.5, star.z, big ? 40 : 14, 6, false, true);
    this.after(0.9, () => this.glint(star));
    if (!big) {
      this.stamp("swipedin", at, 3.5, 0.55, 0xffffff, 1.2);
      this.sound("kaching", 200);
      return;
    }
    this.confetti(star.x, star.z, 50, 6);
    this.darken(star.id, 0.5, 2.6);
    if (this.isFocus(star.id)) {
      const banner = this.slam("swipedin", 0, 0.6, 0.17, 2.6, 0xffffff, false);
      banner.pop = 0;
      banner.slide = 0.55;
      banner.sy = 0.9;
    } else this.stamp("swipedin", at, 3.8, 0.7, 0xffffff, 2.4);
  }

  /**
   * Swipe You In resolved: the ring, the dining halls, the food. The heal
   * and shield were already applied by the authority; this only shows them.
   */
  payoff(id: string, at: Vec, radius: number, match: Match, now: number) {
    this.now = now;
    const star = this.stars.get(id);
    const caster = match.players.find((p) => p.id === id);
    this.sound("boom", 200);
    this.sound("beep3", 200);
    this.shake(340, 0.012);
    // After the cutscene the payoff adds a jackpot; without one (reduced to
    // a plain cast) it brings its own punch.
    const cine = this.cut?.owner === id;
    if (cine) this.jackpot(id, at);
    else {
      this.freeze(120, id);
      this.zoom(0.14, 1.3, id);
      this.wash(id, 0xffa53d, 0.2, 2.2);
    }
    this.showProp(this.pillar, at.x, at.y, 1.6);
    this.gate(at.x + 1.3, at.y - 0.4, 2.6);
    this.fx.ring(at, 0.5, radius, GOLD, 0.7, now);
    this.fx.ring(at, 0.3, radius * 1.25, 0xffffff, 0.5, now);
    this.fx.disc(at, 0.3, radius, GOLD, 0.6, now, 0.3);
    this.after(0.18, () => this.fx.ring(at, 0.5, radius, 0xfff3b0, 0.6, this.now));
    if (cine) {
      // The cutscene already said it.
    } else if (this.isFocus(id)) this.slam("swipe", 0, 0.5, 0.26, 0.9, GOLD);
    else this.stamp("swipe", at, 4, 0.9, GOLD, 0.9);
    const raised = this.size(this.spawn("card", at.x, 3.1, at.y), 0.7);
    raised.life = 1.4;
    raised.pop = 0.15;
    raised.pop0 = 0.2;
    raised.spin = 3;
    const halo = this.size(this.spawn("star", at.x, 3.1, at.y), 2.6);
    this.color(halo, GOLD);
    halo.add = true;
    halo.life = 1.4;
    halo.spin = -2.5;
    for (let i = 0; i < this.count(26); i++) {
      const s = this.sparkle(at.x, rand(0.1, 0.6), at.y);
      s.swirl = true;
      s.cx = at.x;
      s.cz = at.y;
      s.rad = rand(0.5, 1.3);
      s.radV = -0.3;
      s.ang = rand(0, 6.3);
      s.angV = rand(8, 13);
      s.vy = rand(1.8, 3.4);
      s.life = rand(0.7, 1.1);
      s.delay = rand(0, 0.5);
    }
    // The halls light up one after another around the ring.
    HALLS.forEach((_, i) => {
      const a = -Math.PI / 2 + (i - 2) * 1.05;
      const hall = this.stamp(
        "hall" + i,
        { x: at.x + Math.cos(a) * (radius + 0.5), y: at.y + Math.sin(a) * (radius + 0.5) },
        2.1,
        0.66,
        i % 2 ? 0xffffff : GOLD,
        1.7,
      );
      hall.delay = 0.12 + i * 0.11;
      hall.flicker = true;
    });
    // Food rains on everyone who was fed.
    const fed = match.players.filter(
      (p) =>
        p.alive &&
        Math.hypot(p.pos.x - at.x, p.pos.y - at.y) <= radius &&
        (p.id === id ||
          (match.mode !== "showdown" && !!caster && p.team === caster.team)),
    );
    this.after(0.25, () => this.sound("kaching", 200));
    const each = Math.max(5, Math.floor(this.count(54) / Math.max(1, fed.length)));
    for (const ally of fed) {
      this.buffs.set(ally.id, now + 4);
      for (let i = 0; i < each; i++) {
        const food = this.size(
          this.spawn(
            FOOD[Math.floor(Math.random() * FOOD.length)],
            ally.pos.x + rand(-1.1, 1.1),
            rand(6, 9),
            ally.pos.y + rand(-1.1, 1.1),
          ),
          rand(0.42, 0.6),
        );
        food.delay = 0.25 + rand(0, 1.2);
        food.vy = -3;
        food.gravity = -16;
        food.bounce = 0.5;
        food.sparkle = true;
        food.spin = rand(-5, 5);
        food.life = 2.2;
        food.fade = 0.8;
      }
    }
    if (!cine)
      this.after(1.9, () => {
        this.sound("print", 200);
      if (this.isFocus(id)) {
        const paper = this.spawn("paper", 0.6, -0.5, 0);
        paper.screen = true;
        paper.h = 0.3;
        paper.w = 0.66;
        const line = this.size(this.spawn("used", 0.6, -0.5, 0), 0.08);
        this.color(line, 0x141822);
        line.screen = true;
        line.delay = 0.3;
        for (const p of [paper, line]) {
          p.unroll = p === paper ? 0.45 : 0;
          p.life = 2 - p.delay;
          p.fade = 0.85;
        }
      } else {
        const paper = this.spawn("paper", at.x + 1.3, 2.6, at.y - 0.4);
        paper.w = 1.9;
        paper.h = 0.8;
        paper.unroll = 0.3;
        const line = this.size(this.spawn("used", at.x + 1.3, 2.62, at.y - 0.4), 0.34);
        this.color(line, 0x141822);
        line.delay = 0.2;
        for (const p of [paper, line]) {
          p.life = 1.6 - p.delay;
          p.fade = 0.8;
        }
      }
    });
    if (star) {
      star.squashAt = now;
      star.squash = 0.22;
      star.idle = 0;
    }
  }

  /** A goal: fireworks if his side scored, a sulk if it conceded. */
  private scored(team: number, match: Match) {
    for (const p of match.players) {
      const star = p.fighter === SWIPER ? this.stars.get(p.id) : undefined;
      if (!star || !p.alive) continue;
      if (p.team === team) this.victory(star, true);
      else {
        this.stamp("insufficient", { x: star.x, y: star.z }, 3.5, 0.45, RED, 1.6);
        this.sound("sad", 500);
      }
    }
  }

  // ------------------------------------------------------------------- frame

  // ---------------------------------------------------------------- cutscene

  /**
   * Swipe You In's cutscene. The authority has stopped the match clock
   * (`Match.cutscene`); this fills the pause for every viewer, then plays
   * the exit over resumed play. It decides nothing: when the pause ends, how
   * long it is and whether it was skipped all come from the snapshot.
   */
  readonly post = {
    active: false,
    /** 0..1 grayscale of the world behind the caster. */
    gray: 0,
    /** Radius (screen heights) inside which color has returned. */
    wave: 0,
    /** The caster on screen, 0..1. */
    cx: 0.5,
    cy: 0.5,
    aberration: 0,
    blur: 0,
    flash: 0,
  };
  private cut: Cut | null = null;
  private cineMode = false;

  /** The fighter every camera holds on while a cutscene owns the view. */
  leadId() {
    return this.cut?.owner ?? null;
  }
  private powerOf(id: string, now: number) {
    const cut = this.cut;
    if (!cut || cut.owner !== id || cut.short) return 0;
    const t = now - cut.start;
    if (t < cut.keys.power || t >= cut.keys.swipe) return 0;
    return sat((t - cut.keys.power) / (cut.keys.name - cut.keys.power));
  }
  private cineZoom(now: number) {
    const cut = this.cut;
    if (!cut || this.calm) return 1;
    const t = now - cut.start,
      k = cut.keys,
      since = now - cut.resumedAt;
    let z = 1;
    if (t >= k.zoom) z = 1 - 0.45 * outBack((t - k.zoom) / 0.3);
    if (t >= k.swipe) z += (0.74 - z) * sat((t - k.swipe) / 0.25);
    if (since > 0) {
      // Ease back out, overshooting a touch before it settles.
      const e = sat(since / 0.75);
      z += (1 - z) * (1 - Math.exp(-e * 6) * Math.cos(e * 9));
    }
    return z;
  }

  private begin(owner: string, total: number, elapsed: number) {
    const short = total < 2;
    this.cut = {
      owner,
      start: this.now - elapsed,
      total,
      short,
      keys: short ? SHORT_CUT : FULL_CUT,
      beats: [],
      resumedAt: Infinity,
      skipped: false,
    };
    this.script(this.cut);
    // The caster draws after the grading pass, so he alone keeps his color.
    this.actors.get(owner)?.group.traverse((o) => o.layers.set(1));
  }
  private finish(cut: Cut) {
    this.actors.get(cut.owner)?.group.traverse((o) => o.layers.set(0));
    this.cut = null;
    this.post.active = false;
  }

  private script(cut: Cut) {
    const k = cut.keys,
      id = cut.owner;
    const at = (t: number, run: () => void) => cut.beats.push({ at: t, run });
    const here = () => {
      const a = this.actors.get(id);
      return a ? { x: a.at.x, y: a.at.y } : { x: 0, y: 0 };
    };
    const act = (clip: ActionClip) => this.actors.get(id)?.trigger(clip, this.now);
    const lines = (seconds: number) => {
      if (this.calm) return;
      this.lines.start = this.now;
      this.lines.end = this.now + seconds;
    };
    const flare = (y: number, h: number, w: number, life: number) => {
      const f = this.size(this.spawn("flare", 0, y, 0), h);
      f.screen = true;
      f.add = true;
      f.w = w;
      f.life = life;
      f.grow = 1.5;
      f.fade = 0.2;
      return f;
    };

    // 1. The trigger: a shing, and the letterbox slams in (see cineDraw).
    at(0, () => {
      this.sound("shing", 100);
      flare(0, 0.05, 3.6, 0.35);
    });

    // 2. The zoom: speed lines, the glasses catch the light, three panels.
    at(k.zoom, () => {
      this.sound("stamp", 60);
      lines(0.6);
      const star = this.stars.get(id);
      if (star) this.glint(star);
      const flash = this.size(this.spawn("star", 0, 0.12, 0), 0.9);
      flash.screen = true;
      flash.add = true;
      flash.life = 0.5;
      flash.spin = 4;
      flash.grow = 0.2;
      flare(0.12, 0.09, 3.2, 0.45);
    });
    if (!cut.short)
      ["eyes", "hand", "smirk"].forEach((name, i) =>
        at(k.zoom + 0.16 + i * 0.09, () => {
          const p = this.size(this.spawn(name, (i - 1) * 0.58, 0, 0), 0.62);
          p.screen = true;
          p.roll = -0.1;
          p.slide = 0.2;
          p.sy = i % 2 ? -1.9 : 1.9;
          p.life = k.power - k.zoom - 0.12 - i * 0.09;
          p.fade = 0.82;
          this.sound("slash", 40, 1 + i * 0.15);
        }),
      );

    // 3. The power-up: the card goes up, energy spirals, the whine rises.
    if (!cut.short) {
      at(k.power, () => {
        this.sound("whine", 100);
        act("super");
        const c = here();
        this.showProp(this.pillar, c.x, c.y, k.swipe - k.power);
        for (let i = 0; i < this.count(40); i++) {
          const s = this.sparkle(c.x, rand(0.1, 0.5), c.y);
          s.swirl = true;
          s.cx = c.x;
          s.cz = c.y;
          s.rad = rand(1.2, 2.2);
          s.radV = -1.1;
          s.ang = rand(0, 6.3);
          s.angV = rand(7, 14);
          s.vy = rand(2, 4);
          s.life = rand(0.6, 1);
          s.delay = rand(0, 0.8);
        }
      });
      for (let i = 0; i < 7; i++)
        at(k.power + 0.1 + i * 0.13, () => this.shake(140, 0.002 + i * 0.0013));
    }

    // 4. The name drop.
    at(k.name, () => {
      this.sound("boom", 100);
      this.sound("kaching", 100);
      this.shake(360, 0.014);
      const title = this.slam("ult", 0, 0.3, 0.24, k.swipe - k.name + 0.15, GOLD);
      title.fade = 0.88;
      const ring = this.size(this.spawn("ringS", 0, 0.3, 0), 0.3);
      ring.screen = true;
      ring.add = true;
      ring.life = 0.55;
      ring.grow = 12;
      ring.fade = 0.2;
      if (!this.calm) {
        const crack = this.size(this.spawn("crackS", 0, 0.3, 0), 1.5);
        crack.screen = true;
        crack.a = 0.85;
        crack.life = 0.7;
        crack.fade = 0.25;
      }
      const tag = this.slam("legend", 0, 0.56, 0.06, k.swipe - k.name, GOLD, false);
      tag.flicker = true;
      for (let i = 0; i < this.count(46); i++) {
        const bit = this.size(this.spawn(i % 3 ? "dot" : "star", 0, 0.3, 0), rand(0.02, 0.05));
        this.color(bit, GOLD);
        bit.screen = true;
        bit.add = true;
        const a = rand(0, Math.PI * 2),
          v = rand(0.8, 2.6);
        bit.vx = Math.cos(a) * v;
        bit.vy = Math.sin(a) * v;
        bit.gravity = -2.5;
        bit.spin = rand(-8, 8);
        bit.life = rand(0.5, 0.95);
      }
    });
    at(k.name + (cut.short ? 0.1 : 0.25), () => {
      const sub = this.slam("ultsub", 0, 0.08, 0.055, k.swipe - k.name - 0.1, 0xffffff, false);
      sub.pop = 0;
      sub.slide = 0.25;
      sub.sx = -2.2;
    });

    // 5. The swipe: the reader lands, one slow swipe, a rainbow, then white.
    at(k.swipe, () => {
      this.sound("beep", 60);
      act("basic_attack");
      const c = here();
      this.showProp(this.reader, c.x + 1.5, c.y - 0.5, cut.total - k.swipe + 1.6, -0.35);
      const slow = this.size(this.spawn("card", -0.82, -0.08, 0), 0.36);
      slow.screen = true;
      slow.roll = -0.25;
      slow.vx = 0.55;
      slow.life = 0.25;
      slow.fade = 1;
    });
    at(k.swipe + 0.25, () => {
      this.sound("slash", 40, 0.8);
      lines(0.3);
      const fast = this.size(this.spawn("card", -0.68, -0.08, 0), 0.36);
      fast.screen = true;
      fast.roll = -0.25;
      fast.spin = -5;
      fast.vx = 11;
      fast.life = 0.2;
      fast.fade = 1;
      for (let i = 0; i < 7; i++) {
        const band = this.size(this.spawn("flare", 0, -0.08 + (i - 3) * 0.036, 0), 0.05);
        this.hue(band, i / 7);
        band.screen = true;
        band.add = true;
        band.a = 0.7;
        band.w = 3.8;
        band.pop = 0.16;
        band.pop0 = 0.05;
        band.life = 0.65;
        band.fade = 0.35;
      }
    });
    at(k.stamp, () => {
      this.sound("boom", 60);
      this.sound("beep3", 60);
      this.shake(400, 0.017);
      const stamp = this.slam("approved", 0, 0, 0.3, cut.total - k.stamp + 0.9, GREEN);
      stamp.roll = -0.1;
    });
  }

  /** The caster skipped: drop everything still queued and on screen. */
  private skip(cut: Cut) {
    cut.beats.length = 0;
    for (const p of this.pool) if (p.cine) p.on = false;
    this.reader.end = this.pillar.end = 0;
    this.lines.end = 0;
    this.sound("beep", 60);
  }

  /** The payoff's extras once color returns: coins, a slot-machine landing. */
  private jackpot(id: string, at: Vec) {
    this.actors.get(id)?.trigger("victory", this.now);
    for (let i = 0; i < this.count(54); i++) {
      const coin = this.size(this.spawn("coin", at.x, 1.4, at.y), rand(0.24, 0.36));
      const a = rand(0, Math.PI * 2);
      coin.vx = Math.cos(a) * rand(1.5, 5);
      coin.vz = Math.sin(a) * rand(1.5, 5);
      coin.vy = rand(6, 11);
      coin.gravity = -15;
      coin.bounce = 0.45;
      coin.sparkle = true;
      coin.spin = rand(-9, 9);
      coin.delay = rand(0, 0.35);
      coin.life = 2.2;
      coin.fade = 0.8;
    }
    // The halls land one by one around the screen, like reels stopping.
    const spots = [
      [-0.6, 0.6],
      [0.6, 0.6],
      [-0.7, -0.05],
      [0.7, -0.05],
      [0, 0.74],
    ];
    HALLS.forEach((_, i) => {
      const hall = this.slam("hall" + i, spots[i][0], spots[i][1], 0.075, 1.5, i % 2 ? 0xffffff : GOLD, false);
      hall.delay = 0.08 + i * 0.09;
      hall.flicker = true;
    });
    this.after(0.55, () => this.sound("pop", 40, 1.4));
    // The exit: a receipt prints across the bottom of the screen.
    this.after(0.7, () => {
      this.sound("print", 200);
      const paper = this.spawn("paper", 0, -0.7, 0);
      paper.screen = true;
      paper.h = 0.13;
      paper.w = 1.5;
      const line = this.size(this.spawn("thanks", 0, -0.69, 0), 0.055);
      this.color(line, 0x141822);
      line.screen = true;
      for (const p of [paper, line]) {
        p.slide = 0.4;
        p.sx = -2.6;
        p.life = 1.7;
        p.fade = 0.85;
      }
    });
  }

  private direct(f: ShowFrame) {
    const scene = f.match.cutscene;
    let cut = this.cut;
    // A new cast, including one straight after another.
    if (scene && (!cut || cut.owner !== scene.owner || cut.resumedAt < Infinity)) {
      if (cut) this.finish(cut);
      this.begin(scene.owner, scene.total, scene.total - scene.left);
      cut = this.cut;
    }
    if (!cut) return;
    const now = f.now,
      t = now - cut.start,
      k = cut.keys;
    if (!scene && cut.resumedAt === Infinity) cut.resumedAt = now;
    if (scene && !cut.skipped && scene.left <= 0.16 && t < cut.total - 0.5) {
      cut.skipped = true;
      this.skip(cut);
    }
    this.cineMode = true;
    while (cut.beats.length && cut.beats[0].at <= t) cut.beats.shift()!.run();
    this.cineMode = false;
    const since = now - cut.resumedAt;
    if (since > 1.5) {
      this.finish(cut);
      return;
    }
    const post = this.post;
    post.active = true;
    const who = this.actors.get(cut.owner);
    if (who) {
      _v.set(who.at.x, 1.2, who.at.y).project(this.camera);
      post.cx = _v.x * 0.5 + 0.5;
      post.cy = _v.y * 0.5 + 0.5;
    }
    const pulse = (from: number, rate: number) =>
      t >= from ? Math.exp(-(t - from) * rate) : 0;
    // Color floods back from him in a radial wave once play resumes.
    post.gray = since > 0.6 ? 0 : sat(t / 0.12);
    post.wave = since > 0 ? (since / 0.6) * 1.9 : 0;
    const loud = this.calm || cut.skipped ? 0 : 1;
    post.flash = loud * (0.5 * pulse(0, 16) + 1.15 * pulse(k.flash, 9));
    post.aberration =
      loud *
      0.05 *
      (pulse(k.name, 12) +
        pulse(k.name + 0.28, 12) +
        pulse(k.name + 0.56, 12) +
        pulse(k.stamp, 10));
    post.blur = loud * (0.16 * pulse(k.zoom, 5) + 0.1 * pulse(k.swipe + 0.25, 8));
  }

  /** The cutscene's steady layers: letterbox, dining hall, glow, skip hint. */
  private cineDraw(now: number) {
    const cut = this.cut;
    if (!cut) return;
    const t = now - cut.start,
      k = cut.keys,
      since = now - cut.resumedAt,
      aspect = this.camera.aspect;
    const power = this.powerOf(cut.owner, now);
    const who = this.actors.get(cut.owner);
    if (!cut.short && !cut.skipped && t > k.power && t < k.swipe) {
      // A glowing dining hall rises behind him, light bursting through it.
      const a = sat((t - k.power - 0.15) / 0.4) * sat((k.swipe - t) / 0.3);
      this.screenQuad("rays", this.post.cx * 2 - 1, this.post.cy * 2 - 1, 2.8, GOLD, 0.26 * a, true, 2.8, t * 0.5);
      this.screenQuad("hall", 0, 0.34, 0.62, GOLD, 0.5 * a, true);
      if (who) {
        // The raised card: gold, then brighter, then blinding.
        _c.setHex(GOLD).lerp(_white, power);
        this.quad("dot", who.at.x, 3.3, who.at.y, 1.2 + 5.5 * power, 0, _c.getHex(), 0.45 + 0.55 * power, true);
        this.quad("star", who.at.x, 3.3, who.at.y, 1 + 3 * power, t * 3, 0xffffff, 0.9, true);
        this.quad("card", who.at.x, 3.3, who.at.y, 0.7, Math.sin(t * 5) * 0.2, 0xffffff, 1, false);
      }
    }
    if (!cut.skipped && t >= k.name && t < k.swipe) {
      // Legendary glow: a hue-cycling halo behind the title.
      const h = Math.min(0.24, (0.94 * aspect) / this.rect("ult").aspect) * 1.07;
      _c.setHSL((t * 0.7) % 1, 1, 0.6);
      this.screenQuad("ult", 0, 0.3, h, _c.getHex(), 0.4 + 0.2 * Math.sin(t * 11), true);
    }
    // Letterbox: slams in at the trigger, slides away on the exit.
    const bar =
      0.12 *
      sat(outBack(t / 0.18)) *
      (since > 0.55 ? 1 - sat((since - 0.55) / 0.35) : 1);
    if (bar > 0.001) {
      this.screenQuad("px", 0, 1 - bar, bar, 0x000000, 1, false, 2 * aspect);
      this.screenQuad("px", 0, bar - 1, bar, 0x000000, 1, false, 2 * aspect);
    }
    if (cut.owner === this.local && since < 0 && t > 0.45 && !cut.skipped)
      this.screenQuad("skip", 0.7, -0.89, 0.034, 0xffffff, 0.7, false);
  }

  private star(p: Player, a: ShowActor): Star {
    let s = this.stars.get(p.id);
    if (!s) {
      s = {
        id: p.id,
        x: a.at.x,
        z: a.at.y,
        hp: p.hp,
        alive: p.alive,
        kills: p.stats.kills,
        idle: 0,
        trail: 0,
        crumb: 0,
        flourishAt: this.now + 2,
        glintAt: this.now + 3.5,
        checkAt: this.now + 7,
        beepAt: 0,
        combo: 0,
        stampAt: 0,
        stampX: 0,
        stampZ: 0,
        volley: 0,
        squashAt: -1,
        squash: 0,
        windupAt: -9,
      };
      this.stars.set(p.id, s);
    }
    return s;
  }

  private follow(f: ShowFrame, p: Player, a: ShowActor) {
    const now = f.now,
      dt = f.dt,
      playing = f.match.phase === "playing";
    const first = !this.stars.has(p.id);
    const star = this.star(p, a);
    star.x = a.at.x;
    star.z = a.at.y;
    if (first && p.alive && f.match.phase === "countdown")
      this.entrance(star, true);
    if (p.alive !== star.alive) {
      star.alive = p.alive;
      if (p.alive) this.entrance(star, false);
      else this.defeat(star);
    } else if (p.alive && star.hp - p.hp >= 80) this.hurt(star);
    star.hp = p.hp;
    if (p.stats.kills > star.kills && p.alive) this.victory(star, false);
    star.kills = p.stats.kills;
    if (!p.alive || !a.shown) return;

    const max = FIGHTERS[SWIPER].hp;
    const low = p.hp < max / 3;
    const moving = a.speed > 1.2;
    star.idle = moving ? 0 : star.idle + dt;
    const idle = star.idle > 1.2;
    const charging = now - star.windupAt < 1.2;

    // Cards orbit him like a small solar system; idle and windup add more.
    // In the cutscene they spin up into a tornado.
    const power = this.powerOf(p.id, now);
    const orbit = power ? 5 + Math.round(9 * power) : charging ? 9 : idle ? 8 : 5;
    const rate = power ? 2 + 18 * power : charging ? 9 : idle ? 3.2 : 2;
    for (let i = 0; i < orbit; i++) {
      const a0 = now * rate + (i * Math.PI * 2) / orbit;
      const r = (idle ? 1.15 : 0.95) + 0.12 * Math.sin(now * 1.7 + i);
      this.quad(
        low ? "crack" : "card",
        star.x + Math.cos(a0) * r,
        1.15 + 0.3 * Math.sin(now * 2.3 + i * 1.7),
        star.z + Math.sin(a0) * r * 0.75,
        0.3,
        now * 4 + i,
        low ? RED : 0xffffff,
        low && Math.sin(now * 31 + i) > 0.6 ? 0.35 : 1,
        false,
      );
    }
    this.quad("dot", star.x, 1.1, star.z, 2.4, 0, low ? RED : GOLD, 0.16, true);

    if (moving) {
      // Glowing card afterimages, crumbs and the odd sparkle.
      star.trail += dt;
      if (star.trail > 0.055) {
        star.trail = 0;
        const ghost = this.size(this.spawn("cardw", star.x, 1.05, star.z), 0.62);
        this.color(ghost, BLUE);
        ghost.add = true;
        ghost.a = 0.5;
        ghost.life = 0.38;
        ghost.grow = 1.35;
        ghost.fade = 0;
        ghost.roll = a.yaw;
      }
      star.crumb += dt;
      if (star.crumb > 0.09) {
        star.crumb = 0;
        const crumb = this.size(
          this.spawn("dot", star.x + rand(-0.2, 0.2), 0.9, star.z + rand(-0.2, 0.2)),
          rand(0.07, 0.12),
        );
        this.color(crumb, 0xc48a4a);
        crumb.vy = rand(0, 1.5);
        crumb.vx = rand(-0.8, 0.8);
        crumb.vz = rand(-0.8, 0.8);
        crumb.gravity = -9;
        crumb.bounce = 0.35;
        crumb.life = 0.7;
        if (Math.random() < 0.3) this.sparkle(star.x, 0.6, star.z, GOLD, 0.2);
      }
      // Thrown faster than he can run (a knockback, pull or swap).
      if (a.speed > FIGHTERS[SWIPER].speed * 1.45 && now - star.beepAt > 1) {
        star.beepAt = now;
        this.sound("beep3", 300);
        this.stamp("beep", { x: star.x, y: star.z }, 3.1, 0.45, GREEN, 0.8);
        for (let i = 0; i < 4; i++) {
          const scan = this.size(this.spawn("scan", star.x, 0.6 + i * 0.4, star.z), 0.3);
          this.color(scan, GREEN);
          scan.w = 3.4;
          scan.add = true;
          scan.life = 0.4;
          scan.grow = 1.4;
          scan.fade = 0;
          scan.delay = i * 0.03;
        }
      }
    } else if (idle && (playing || f.match.phase === "countdown")) {
      if (now > star.flourishAt) {
        star.flourishAt = now + rand(3.6, 5);
        // A Vegas fan: seven cards spread out in front of him, then return.
        for (let i = 0; i < 7; i++) {
          const fan = a.yaw + (i - 3) * 0.3;
          const card = this.size(this.spawn("card", star.x, 1.3, star.z), 0.3);
          card.vx = Math.sin(fan) * 5.5;
          card.vz = Math.cos(fan) * 5.5;
          card.vy = 1.6 - Math.abs(i - 3) * 0.3;
          card.drag = 5;
          card.spin = 9;
          card.delay = i * 0.03;
          card.home = star.id;
          card.homeAt = 0.75;
          card.life = 1.6;
          card.fade = 0.95;
        }
      }
      if (now > star.glintAt) {
        star.glintAt = now + rand(4.5, 6.5);
        this.glint(star);
      }
      if (now > star.checkAt) {
        star.checkAt = now + rand(9, 13);
        this.stamp("left", { x: star.x, y: star.z }, 3.25, 0.4, 0xffffff, 1.9);
      }
    }

    if (low) {
      // A flickering neon sign, and for his own screen a red heartbeat.
      const lit = Math.sin(now * 23) + Math.sin(now * 7.3) > -0.9 ? 1 : 0.22;
      this.quad("dot", star.x, 4.15, star.z, 3.2, 0, RED, 0.14 * lit, true);
      this.quad("closing", star.x, 4.15, star.z, 0.44, 0, 0xff8a94, lit, false);
      if (this.isFocus(p.id)) {
        const beat = (now % 0.9) / 0.9;
        const pulse =
          Math.exp(-beat * 9) + 0.6 * Math.exp(-((beat - 0.24) ** 2) * 300);
        this.vignette = 0.2 + 0.3 * pulse;
        if (p.id === this.local && beat < 0.1) this.sound("heart", 800);
      }
    }
  }

  /** Rainbow mini-cards shed by his thrown cards, and the rare golden card. */
  private projectiles(f: ShowFrame) {
    this.frameNo++;
    let live = 0;
    for (const q of f.match.projectiles) {
      if (q.fighter !== SWIPER) continue;
      live++;
      let shot = this.shots.get(q.id);
      if (!shot) this.shots.set(q.id, (shot = { x: 0, z: 0, seen: 0 }));
      shot.x = q.pos.x;
      shot.z = q.pos.y;
      shot.seen = this.frameNo;
      // Cosmetic only: a golden card looks legendary and deals the same 340.
      if (q.id % 8 === 0) {
        this.quad("dot", shot.x, 0.85, shot.z, 1.9, 0, GOLD, 0.6, true);
        this.quad("cardw", shot.x, 0.95, shot.z, 0.62, f.now * 11, GOLD, 1, false);
        this.quad("unlimited", shot.x, 1.75, shot.z, 0.3, 0, GOLD, 1, false);
      }
    }
    this.shed = Math.min(4, this.shed + f.dt * 14 * live);
    for (const [id, shot] of this.shots) {
      if (shot.seen !== this.frameNo) {
        this.cards(shot.x, 0.9, shot.z, 3, 3, true, true);
        this.shots.delete(id);
        continue;
      }
      if (this.shed < 1) continue;
      this.shed--;
      const mini = this.size(this.spawn("cardw", shot.x, 0.85, shot.z), 0.17);
      this.hue(mini, f.now * 0.9 + id * 0.21);
      mini.add = true;
      mini.vx = rand(-0.9, 0.9);
      mini.vz = rand(-0.9, 0.9);
      mini.vy = rand(-0.2, 0.9);
      mini.spin = rand(-12, 12);
      mini.life = 0.32;
      mini.fade = 0;
    }
  }

  /** Allies he fed glow gold under an "ALL YOU CAN EAT" banner. */
  private auras(f: ShowFrame) {
    for (const [id, until] of this.buffs) {
      const a = f.actors.get(id);
      const p = f.match.players.find((x) => x.id === id);
      if (f.now > until || !p?.alive || !a?.shown) {
        this.buffs.delete(id);
        continue;
      }
      const fadeOut = Math.min(1, (until - f.now) / 0.4);
      this.quad("dot", a.at.x, 0.9, a.at.y, 3, 0, GOLD, 0.34 * fadeOut, true);
      this.quad(
        "ayce",
        a.at.x,
        3.05 + 0.08 * Math.sin(f.now * 5),
        a.at.y,
        0.36,
        0.04 * Math.sin(f.now * 3),
        GOLD,
        fadeOut,
        false,
      );
      if (Math.random() < f.dt * 9) {
        const s = this.sparkle(
          a.at.x + rand(-0.6, 0.6),
          rand(0.2, 1.4),
          a.at.y + rand(-0.6, 0.6),
        );
        s.vy = rand(1.5, 2.8);
        s.life = 0.7;
      }
    }
  }

  /** An immediate world quad, facing the camera. */
  private quad(
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
    _c.setHex(hex);
    this.emit(add ? this.glow : this.sprites, rect, _p.set(x, y, z), h * rect.aspect, h, roll, 1, _c.r, _c.g, _c.b, alpha);
  }
  /** An immediate screen quad; x, y in -1..1, h as a share of screen height. */
  private screenQuad(
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
  private toScreen(out: Vector3, x: number, y: number) {
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

  private burst(p: Particle) {
    if (p.die === Die.Cards)
      for (let i = 0; i < 3; i++) {
        const c = this.spawn("cardw", p.x, p.y, p.z);
        c.w = p.w * 0.6;
        c.h = p.h * 0.6;
        this.hue(c, Math.random());
        c.vx = rand(-3, 3);
        c.vz = rand(-3, 3);
        c.vy = rand(0.5, 3.5);
        c.gravity = -10;
        c.spin = rand(-14, 14);
        c.life = rand(0.18, 0.3);
        c.die = Die.Sparkles;
      }
    else if (p.die === Die.Sparkles)
      for (let i = 0; i < 2; i++) {
        const s = this.sparkle(p.x, p.y, p.z, GOLD, 0.16);
        s.vx = rand(-1.5, 1.5);
        s.vz = rand(-1.5, 1.5);
      }
    else if (p.die === Die.Firework) {
      this.sound("pop", 90, rand(0.8, 1.3));
      const flash = this.size(this.spawn("dot", p.x, p.y, p.z), 3.2);
      flash.add = true;
      flash.life = 0.22;
      flash.fade = 0;
      const base = Math.random();
      for (let i = 0; i < this.count(28); i++) {
        const c = this.size(this.spawn("cardw", p.x, p.y, p.z), rand(0.16, 0.28));
        this.hue(c, base + rand(-0.12, 0.12), 0.62);
        const a = rand(0, Math.PI * 2),
          lift = rand(-1, 1),
          flat = Math.sqrt(1 - lift * lift) * rand(3.5, 6);
        c.vx = Math.cos(a) * flat;
        c.vz = Math.sin(a) * flat;
        c.vy = lift * 5;
        c.gravity = -5;
        c.drag = 1.6;
        c.spin = rand(-12, 12);
        c.life = rand(0.8, 1.3);
        c.add = i % 3 === 0;
      }
    }
  }

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
        if (p.die) this.burst(p);
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
          if (p.sparkle && p.vy < -2.5) this.sparkle(p.x, p.y, p.z, GOLD, 0.2);
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
    {
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
  }

  private props(now: number) {
    const life = (p: Prop) => {
      const on = now >= p.start && now < p.end;
      p.mesh.visible = on;
      return on;
    };
    if (life(this.reader)) {
      const t = now - this.reader.start,
        out = Math.min(1, (this.reader.end - now) / 0.25);
      // Falls from the sky, lands with a squash, shrinks away at the end.
      const fall = Math.min(1, t / 0.62);
      const land = t - 0.62;
      const squash = land > 0 ? 1 - 0.25 * Math.exp(-land * 9) * Math.cos(land * 26) : 1.15;
      this.reader.mesh.position.y = 13 * (1 - fall * fall);
      this.reader.mesh.scale.set(out / Math.sqrt(squash), out * squash, out / Math.sqrt(squash));
    }
    if (life(this.turnstile)) {
      const t = now - this.turnstile.start,
        out = Math.min(1, (this.turnstile.end - now) / 0.25),
        grow = outBack(t / 0.25) * out;
      this.turnstile.mesh.scale.setScalar(Math.max(0.01, grow));
      const stopped = Math.min(t, this.turnstile.stopAt - this.turnstile.start);
      this.turnstile.arms.rotation.y = stopped * 9 - stopped * stopped * 1.2;
    }
    if (life(this.pillar)) {
      const t = now - this.pillar.start,
        span = this.pillar.end - this.pillar.start,
        k = t / span;
      const width = 0.5 * outBack(t / 0.2) * (1 - k * k) + 0.02;
      this.pillar.mesh.scale.set(width, 22, width);
    }
  }

  /** Screen takeovers, drawn under the banners. Only for Brandon's viewer. */
  private overlays(now: number) {
    this.cineDraw(now);
    const d = this.dark;
    if (now < d.end) {
      const a =
        d.alpha *
        Math.min(1, (now - d.start) / d.in) *
        Math.min(1, (d.end - now) / d.out);
      const who = this.actors.get(d.id);
      if (who) {
        // A spotlight: the dark has a hole that follows him.
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
      this.screenQuad("vign", 0, 0, 1.06, RED, this.vignette, false, 1.06 * this.camera.aspect);
    this.vignette = 0;
    if (now < this.lines.end) {
      const k = (now - this.lines.start) / (this.lines.end - this.lines.start);
      const size = 2.6 + 0.25 * Math.sin(now * 70);
      this.screenQuad("lines", 0, 0, size, 0xffffff, 0.75 * (1 - k), false, size * this.camera.aspect);
    }
  }

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

    this.direct(f);
    if (f.dt > 0) {
      // A rematch can reuse this view: the match clock starts over.
      if (f.match.time < this.matchTime - 1) {
        this.stars.clear();
        this.buffs.clear();
        this.timeline.length = 0;
        this.score = [0, 0];
      }
      this.matchTime = f.match.time;
      for (let i = this.timeline.length - 1; i >= 0; i--)
        if (f.now >= this.timeline[i].at) this.timeline.splice(i, 1)[0].run();
      for (const p of f.match.players) {
        if (p.fighter !== SWIPER) continue;
        const a = f.actors.get(p.id);
        if (a) this.follow(f, p, a);
      }
      for (const id of this.stars.keys())
        if (!f.match.players.some((p) => p.id === id)) this.stars.delete(id);
      for (const team of [0, 1] as const) {
        if (f.match.score[team] > this.score[team]) this.scored(team, f.match);
        this.score[team] = f.match.score[team];
      }
      this.projectiles(f);
    }
    this.auras(f);
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

/** True when a match has a fighter the show is for. */
export const hasSwiper = (match: Match) =>
  match.players.some((p) => p.fighter === SWIPER);
