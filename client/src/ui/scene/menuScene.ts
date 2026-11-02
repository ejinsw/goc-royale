import {
  AmbientLight,
  BackSide,
  BufferAttribute,
  CanvasTexture,
  CircleGeometry,
  Color,
  DataTexture,
  DirectionalLight,
  Fog,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  MeshToonMaterial,
  NearestFilter,
  PerspectiveCamera,
  RedFormat,
  RingGeometry,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
  WebGLRenderer,
  type BufferGeometry,
} from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import type { FighterId } from "../../../../shared/definitions";
import { COLOR } from "../core/tokens";
import { uiPrefs } from "../core/feedback";
import { part } from "./geometry";
import { PODIUM_CONCRETE, buildPlaza } from "./plaza";
import { PLAZA_FOG, PLAZA_SKY } from "./plazaPalette";
import {
  LOOKS,
  NECK_Y,
  SHOULDER,
  buildFighter,
  disposeFighter,
  type FighterParts,
} from "./fighterModels";
import {
  FIGHTER_HEIGHT,
  layoutStage,
  type Slot,
  type StageEntry,
  type StageLayout,
  type StageMode,
} from "./stageLayout";

/**
 * The 3D menu backdrop (docs/CODE-PRACTICES.md §7). One renderer, created
 * when menus mount and fully disposed before the match renderer mounts.
 * Screens describe what to show with `set(state)`; nothing outside this file
 * touches Three.js objects. Name plates are DOM elements the scene positions
 * each frame by writing transforms directly.
 */
export type Pose = "idle" | "ready" | "victory" | "sad";

export interface StageFighter extends StageEntry {
  fighter: FighterId;
  pose: Pose;
  ring?: "blue" | "grey";
}

/** Normalized rectangle of the viewport the group should fill. */
export interface StageFrame {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface StageState {
  mode: StageMode;
  fighters: StageFighter[];
  frame: StageFrame;
}

export interface MenuScene {
  readonly live: boolean;
  set(state: StageState): void;
  react(key: string, action: "hop" | "cheer"): void;
  attachLabel(key: string, el: HTMLElement | null): void;
  dispose(): void;
}

interface Rig {
  key: string;
  fighter: FighterId;
  root: Group;
  body: Group;
  head: Group;
  armL: Group;
  armR: Group;
  /** Companion beside the fighter (Ethan's note, Rosalie's red panda). */
  companion?: { group: Group; anchor: [number, number, number]; float: boolean };
  /** Model height at rest; name plates sit above it. */
  top: number;
  ring: Mesh;
  block?: Mesh;
  blockHeight: number;
  slot: Slot;
  pose: Pose;
  phase: number;
  /** Smoothed placement, kept apart from per-frame offsets. */
  base: { x: number; y: number; z: number; yaw: number; size: number };
  enter: number;
  exit: number;
  hop: number;
  cheer: number;
  label?: HTMLElement;
  lx: number;
  ly: number;
  shown: boolean;
}

/**
 * Camera framing. A low elevation keeps the view near eye level so the plaza
 * architecture rises behind the fighters instead of the shot being mostly
 * paving.
 */
const ELEVATION = 0.17;
/**
 * A longish lens held well back. Standing close with a wide lens makes the
 * courtyard read as oversized props right next to the fighters; backing off
 * and narrowing the field keeps the fighters the same size on screen while
 * the architecture behind them compresses to a believable scale.
 */
const FOV = 24;
/** Fraction of the screen's free frame the fighter group may fill. */
const GROUP_FILL = { w: 0.82, h: 0.58 };
/** Never dolly closer than this, so the backdrop always reads as a place. */
const MIN_DISTANCE = 18;
const stub: MenuScene = {
  live: false,
  set: () => {},
  react: () => {},
  attachLabel: () => {},
  dispose: () => {},
};

const easeOut = (t: number) => 1 - (1 - t) ** 3;
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

/**
 * Start the scene inside `container`.
 *
 * The scene creates and owns its own canvas: `dispose()` calls
 * `forceContextLoss()`, and a canvas that has lost its context that way can
 * never get another one. Taking a canvas from the caller would therefore
 * break the next `createMenuScene` on the same element (module reload,
 * remount, or a second menu visit) with a null WebGL context.
 */
export function createMenuScene(
  container: HTMLElement,
  opts: { onLost?: () => void } = {},
): MenuScene {
  const canvas = document.createElement("canvas");
  canvas.className = "stage-canvas";
  canvas.setAttribute("aria-hidden", "true");
  container.prepend(canvas);
  const giveUp = () => {
    canvas.remove();
    return stub;
  };
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  } catch {
    return giveUp();
  }
  // A failed context makes Three.js throw on first use rather than here.
  if (!renderer.getContext()) {
    renderer.dispose();
    return giveUp();
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(PLAZA_SKY.horizon);

  const scene = new Scene();
  scene.fog = new Fog(new Color(PLAZA_FOG.color), PLAZA_FOG.near, PLAZA_FOG.far);
  const camera = new PerspectiveCamera(FOV, 1, 0.1, 220);

  // Shared materials: every fighter, block, and floor uses one toon material.
  const ramp = new DataTexture(new Uint8Array([70, 150, 255]), 3, 1, RedFormat);
  ramp.minFilter = ramp.magFilter = NearestFilter;
  ramp.needsUpdate = true;
  const toon = new MeshToonMaterial({ vertexColors: true, gradientMap: ramp });
  const outline = new ShaderMaterial({
    uniforms: { thickness: { value: 0.022 }, tint: { value: new Color(COLOR.ink) } },
    vertexShader:
      "uniform float thickness; void main() { vec3 n = normalize(normalMatrix * normal); vec4 p = modelViewMatrix * vec4(position, 1.0); p.xyz += n * thickness; gl_Position = projectionMatrix * p; }",
    fragmentShader: "uniform vec3 tint; void main() { gl_FragColor = vec4(tint, 1.0); }",
    side: BackSide,
  });
  const ringBlue = new MeshBasicMaterial({ color: COLOR.blue, fog: false });
  const ringGrey = new MeshBasicMaterial({ color: COLOR.mist, fog: false });
  const shadowTex = (() => {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d")!;
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, "rgba(0,0,0,0.55)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    return new CanvasTexture(c);
  })();
  const shadowMat = new MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, fog: false });
  const shared: { dispose(): void }[] = [ramp, toon, outline, ringBlue, ringGrey, shadowTex, shadowMat];

  // Daylight: soft sky fill plus a warm sun from the upper left, as in the
  // reference plaza.
  scene.add(new HemisphereLight(0xe8f0ff, 0xb9b0a3, 1.35));
  scene.add(new AmbientLight(0xffffff, 0.2));
  const sun = new DirectionalLight(0xfff4e2, 2.4);
  sun.position.set(-6, 10, 7);
  scene.add(sun);

  // Sky dome: blue overhead to a pale horizon, warm concrete tone below.
  const dome = new SphereGeometry(180, 32, 16);
  {
    const pos = dome.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const top = new Color(PLAZA_SKY.top),
      mid = new Color(PLAZA_SKY.mid),
      horizon = new Color(PLAZA_SKY.horizon),
      below = new Color(PLAZA_SKY.ground),
      c = new Color();
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i) / 180;
      if (y >= 0.25) c.copy(mid).lerp(top, Math.min(1, (y - 0.25) / 0.6));
      else if (y >= 0) c.copy(horizon).lerp(mid, y / 0.25);
      else c.copy(horizon).lerp(below, Math.min(1, -y * 4));
      colors.set([c.r, c.g, c.b], i * 3);
    }
    dome.setAttribute("color", new BufferAttribute(colors, 3));
  }
  const domeMat = new MeshBasicMaterial({ vertexColors: true, side: BackSide, depthWrite: false, fog: false });
  scene.add(new Mesh(dome, domeMat));
  shared.push(dome, domeMat);

  // The plaza (docs/CODE-PRACTICES.md §7): one static mesh, a swaying tree
  // crown, and slow clouds. It never receives React state.
  const plaza = buildPlaza();
  scene.add(new Mesh(plaza.base, toon));
  const crown = new Mesh(plaza.crown, toon);
  crown.position.set(...plaza.crownPivot);
  scene.add(crown);
  const clouds = new Mesh(plaza.clouds, toon);
  scene.add(clouds);
  shared.push(plaza.base, plaza.crown, plaza.clouds);

  const ringGeo = new RingGeometry(0.42, 0.53, 40);
  const shadowGeo = new CircleGeometry(0.62, 24);
  shared.push(ringGeo, shadowGeo);

  // Fighter geometry is built once per fighter and shared by duplicates.
  const cache = new Map<FighterId, FighterParts>();
  const partsFor = (id: FighterId) => {
    let p = cache.get(id);
    if (!p) {
      p = buildFighter(id);
      cache.set(id, p);
    }
    return p;
  };
  const addMesh = (g: Group, geo: BufferGeometry) => {
    g.add(new Mesh(geo, toon), new Mesh(geo, outline));
  };

  const rigs = new Map<string, Rig>();
  const labels = new Map<string, HTMLElement>();
  let layout: StageLayout = layoutStage("solo", [], 1);
  let state: StageState = { mode: "solo", fighters: [], frame: { x0: 0, y0: 0, x1: 1, y1: 1 } };
  let W = 1,
    H = 1;

  function makeRig(f: StageFighter, slot: Slot): Rig {
    const parts = partsFor(f.fighter);
    const root = new Group();
    const body = new Group();
    root.add(body);
    addMesh(body, parts.body);
    const head = new Group();
    head.position.set(0, NECK_Y, 0);
    addMesh(head, parts.head);
    head.add(new Mesh(parts.face, toon));
    const armL = new Group();
    armL.position.set(-SHOULDER[0], SHOULDER[1], SHOULDER[2]);
    addMesh(armL, parts.armL);
    const armR = new Group();
    armR.position.set(SHOULDER[0], SHOULDER[1], SHOULDER[2]);
    addMesh(armR, parts.armR);
    body.add(head, armL, armR);
    let companion: Rig["companion"];
    if (parts.companion) {
      const group = new Group();
      addMesh(group, parts.companion.geometry);
      group.position.set(...parts.companion.anchor);
      root.add(group);
      companion = { group, anchor: parts.companion.anchor, float: parts.companion.float };
    }
    const shadow = new Mesh(shadowGeo, shadowMat);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.006;
    const ring = new Mesh(ringGeo, ringBlue);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.01;
    root.add(shadow, ring);
    root.position.set(slot.x, slot.block, slot.z);
    root.scale.setScalar(slot.scale);
    root.rotation.y = slot.facing;
    scene.add(root);
    const rig: Rig = {
      key: f.key,
      fighter: f.fighter,
      root,
      body,
      head,
      armL,
      armR,
      companion,
      top: Math.max(FIGHTER_HEIGHT, parts.top),
      ring,
      blockHeight: 0,
      slot,
      pose: f.pose,
      phase: Math.random() * 6.28,
      base: { x: slot.x, y: slot.block, z: slot.z, yaw: slot.facing, size: slot.scale },
      enter: uiPrefs.reducedMotion ? 1 : 0,
      exit: 0,
      hop: 1,
      cheer: 1,
      label: labels.get(f.key),
      lx: NaN,
      ly: NaN,
      shown: false,
    };
    applyArms(rig, 1);
    return rig;
  }

  function setBlock(rig: Rig, height: number) {
    if (rig.blockHeight === height) return;
    if (rig.block) {
      rig.root.remove(rig.block);
      rig.block.geometry.dispose();
      rig.block = undefined;
    }
    rig.blockHeight = height;
    if (height <= 0) return;
    // Lives under the fighter root; update() cancels the root scale so the
    // block keeps its world size while the fighter scales.
    const geo = part(new RoundedBoxGeometry(1.1, height, 1.1, 2, 0.06), PODIUM_CONCRETE, [0, -height / 2, 0]);
    rig.block = new Mesh(geo, toon);
    rig.root.add(rig.block);
  }

  function removeRig(rig: Rig) {
    scene.remove(rig.root);
    rig.block?.geometry.dispose();
    rigs.delete(rig.key);
  }

  /** Target arm and head angles for a pose. */
  function applyArms(rig: Rig, k: number) {
    const look = LOOKS[rig.fighter];
    let lz = -0.22,
      rx = look.hold.x,
      rz = look.hold.z,
      hx = 0;
    if (rig.pose === "ready") {
      rx = -0.25;
      rz = 2.45;
      lz = -0.45;
    } else if (rig.pose === "victory") {
      rx = -0.2;
      rz = 2.7;
      lz = -2.7;
    } else if (rig.pose === "sad") {
      rx = 0;
      rz = 0.08;
      lz = -0.08;
      hx = 0.4;
    }
    if (rig.cheer < 1) rz += Math.sin(rig.cheer * Math.PI) * 1.2;
    rig.armL.rotation.z = lerp(rig.armL.rotation.z, lz, k);
    rig.armR.rotation.x = lerp(rig.armR.rotation.x, rx, k);
    rig.armR.rotation.z = lerp(rig.armR.rotation.z, rz, k);
    rig.head.rotation.x = lerp(rig.head.rotation.x, hx, k);
  }

  function frameRect() {
    const f = state.frame;
    return {
      x: f.x0 * W,
      y: f.y0 * H,
      w: Math.max(40, (f.x1 - f.x0) * W),
      h: Math.max(40, (f.y1 - f.y0) * H),
    };
  }

  const cam = { tx: 0, ty: 1, tz: 0, dist: 8, offX: 0, offY: 0 };
  const camGoal = { ...cam };
  let camSnap = true;

  function relayout() {
    const fr = frameRect();
    layout = layoutStage(state.mode, state.fighters, fr.w / fr.h);
    for (const s of layout.slots) {
      const rig = rigs.get(s.key);
      if (!rig) continue;
      rig.slot = s;
      setBlock(rig, s.block);
    }
    // Exact fit: project the group's bounding box (feet to plate room) and
    // search for the closest camera distance that fits the screen's free
    // frame, then shift the view so the box is centered in that frame.
    // Runs on layout changes and resizes only, never per frame.
    const tx = (layout.minX + layout.maxX) / 2,
      ty = layout.top * 0.5,
      tz = (layout.minZ + layout.maxZ) / 2;
    const corners: Vector3[] = [];
    for (const x of [layout.minX, layout.maxX])
      for (const y of [0, layout.top])
        for (const z of [layout.minZ, layout.maxZ]) corners.push(new Vector3(x, y, z));
    const p = new Vector3();
    const measure = (dist: number) => {
      camera.position.set(tx, ty + dist * Math.sin(ELEVATION), tz + dist * Math.cos(ELEVATION));
      camera.lookAt(tx, ty, tz);
      camera.clearViewOffset();
      camera.updateMatrixWorld();
      let x0 = Infinity,
        x1 = -Infinity,
        y0 = Infinity,
        y1 = -Infinity;
      for (const c of corners) {
        p.copy(c).project(camera);
        const px = (p.x * 0.5 + 0.5) * W,
          py = (-p.y * 0.5 + 0.5) * H;
        x0 = Math.min(x0, px);
        x1 = Math.max(x1, px);
        y0 = Math.min(y0, py);
        y1 = Math.max(y1, py);
      }
      return { w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
    };
    // The fighters fill only part of the free frame, so the plaza behind them
    // stays visible; a small party does not zoom in until the backdrop is
    // just paving. A wide party is still bounded by the frame's width.
    let lo = MIN_DISTANCE,
      hi = 140;
    for (let i = 0; i < 26; i++) {
      const mid = (lo + hi) / 2,
        m = measure(mid);
      if (m.w <= fr.w * GROUP_FILL.w && m.h <= fr.h * GROUP_FILL.h) hi = mid;
      else lo = mid;
    }
    const fit = measure(hi);
    camGoal.tx = tx;
    camGoal.ty = ty;
    camGoal.tz = tz;
    camGoal.dist = hi;
    camGoal.offX = fit.cx - (fr.x + fr.w / 2);
    camGoal.offY = fit.cy - (fr.y + fr.h / 2);
    if (camSnap) {
      Object.assign(cam, camGoal);
      camSnap = false;
    }
  }

  function resize() {
    const w = canvas.clientWidth || 1,
      h = canvas.clientHeight || 1;
    if (w === W && h === H) return;
    W = w;
    H = h;
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    relayout();
    for (const rig of rigs.values()) rig.lx = rig.ly = NaN;
  }

  const head = new Vector3();
  function updateCamera(dt: number, t: number, reduced: boolean) {
    const kc = 1 - Math.exp(-dt * 5);
    cam.tx = lerp(cam.tx, camGoal.tx, kc);
    cam.ty = lerp(cam.ty, camGoal.ty, kc);
    cam.tz = lerp(cam.tz, camGoal.tz, kc);
    cam.dist = lerp(cam.dist, camGoal.dist, kc);
    cam.offX = lerp(cam.offX, camGoal.offX, kc);
    cam.offY = lerp(cam.offY, camGoal.offY, kc);
    const sway = reduced ? 0 : Math.sin(t * 0.25) * 0.05;
    camera.position.set(
      cam.tx + Math.sin(sway) * cam.dist * Math.cos(ELEVATION),
      cam.ty + cam.dist * Math.sin(ELEVATION),
      cam.tz + Math.cos(sway) * cam.dist * Math.cos(ELEVATION),
    );
    camera.lookAt(cam.tx, cam.ty, cam.tz);
    camera.setViewOffset(W, H, cam.offX, cam.offY, W, H);
    camera.updateMatrixWorld();
  }

  function update(dt: number, t: number) {
    const k = 1 - Math.exp(-dt * 7);
    const reduced = uiPrefs.reducedMotion;
    // Camera first, so plates project with this frame's view.
    updateCamera(dt, t, reduced);
    for (const rig of [...rigs.values()]) {
      const s = rig.slot;
      if (rig.enter < 1) rig.enter = Math.min(1, rig.enter + dt / 0.6);
      if (rig.exit > 0) {
        rig.exit = Math.min(1, rig.exit + dt / 0.3);
        if (rig.exit >= 1) {
          removeRig(rig);
          continue;
        }
      }
      if (rig.hop < 1) rig.hop = Math.min(1, rig.hop + dt / 0.6);
      if (rig.cheer < 1) rig.cheer = Math.min(1, rig.cheer + dt / 0.7);
      const fall = rig.enter < 0.7 ? 2.6 * (1 - rig.enter / 0.7) ** 2 : 0;
      const land = rig.enter >= 0.7 && rig.enter < 1 ? Math.sin(((rig.enter - 0.7) / 0.3) * Math.PI) * 0.2 : 0;
      const hopUp = rig.hop < 1 ? Math.sin(rig.hop * Math.PI) * 0.5 : 0;
      const spin = rig.hop < 1 ? easeInOut(rig.hop) * Math.PI * 2 : 0;
      let bounce = 0;
      if (!reduced) {
        if (rig.pose === "victory") bounce = Math.abs(Math.sin(t * 4.2 + rig.phase)) * 0.24;
        else if (rig.pose === "ready") bounce = Math.abs(Math.sin(t * 5 + rig.phase)) * 0.05;
        if (rig.cheer < 1) bounce += Math.sin(rig.cheer * Math.PI) * 0.18;
      }
      const b = rig.base;
      b.x = lerp(b.x, s.x, k);
      b.y = lerp(b.y, s.block, k);
      b.z = lerp(b.z, s.z, k);
      b.yaw = lerp(b.yaw, s.facing, k);
      b.size = lerp(b.size, s.scale, k);
      const size = Math.max(0.001, b.size * (rig.exit > 0 ? 1 - easeOut(rig.exit) : 1));
      rig.root.position.set(b.x, b.y + fall, b.z);
      rig.root.scale.setScalar(size);
      rig.root.rotation.y = b.yaw + spin;
      if (rig.block) rig.block.scale.setScalar(1 / size);
      const bob = reduced ? 0 : Math.sin(t * 2.2 + rig.phase) * 0.02;
      const breathe = reduced ? 0 : Math.sin(t * 2.2 + rig.phase) * 0.012;
      rig.body.position.y = bob + hopUp + bounce;
      const squash = land + (rig.hop < 0.12 ? Math.sin((rig.hop / 0.12) * Math.PI) * 0.12 : 0);
      rig.body.scale.set(1 + squash * 0.5 - breathe * 0.5, (rig.pose === "sad" ? 0.97 : 1) - squash + breathe, 1 + squash * 0.5);
      rig.head.rotation.z = reduced ? 0 : Math.sin(t * 1.3 + rig.phase) * 0.06;
      applyArms(rig, 1 - Math.exp(-dt * 10));
      if (rig.companion) {
        const c = rig.companion;
        if (c.float) {
          // Floating companions bob and sway above the shoulder.
          c.group.position.y = c.anchor[1] + 0.02 + (reduced ? 0 : Math.sin(t * 2 + rig.phase) * 0.07) + rig.body.position.y;
          c.group.rotation.z = reduced ? 0 : Math.sin(t * 1.5 + rig.phase) * 0.25;
        } else {
          // Grounded companions hop along with their fighter and breathe.
          c.group.position.y = c.anchor[1] + Math.max(0, rig.body.position.y);
          c.group.scale.y = 1 + (reduced ? 0 : Math.sin(t * 3.1 + rig.phase) * 0.03);
          c.group.rotation.y = reduced ? 0 : Math.sin(t * 0.9 + rig.phase) * 0.18;
        }
      }
      // Name plates: transform-only writes, skipped when the plate did not move.
      if (rig.label) {
        head.set(
          rig.root.position.x,
          rig.root.position.y + (rig.body.position.y + rig.top + 0.12) * rig.root.scale.x,
          rig.root.position.z,
        );
        head.project(camera);
        const x = (head.x * 0.5 + 0.5) * W,
          y = (-head.y * 0.5 + 0.5) * H;
        if (!(Math.abs(x - rig.lx) < 0.5 && Math.abs(y - rig.ly) < 0.5)) {
          rig.lx = x;
          rig.ly = y;
          rig.label.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -100%)`;
        }
        const shown = rig.enter >= 0.7 && rig.exit === 0;
        if (shown !== rig.shown) {
          rig.shown = shown;
          if (shown) rig.label.dataset.shown = "";
          else delete rig.label.dataset.shown;
        }
      }
    }
    if (!reduced) {
      crown.rotation.z = Math.sin(t * 0.7) * 0.025;
      crown.rotation.x = Math.sin(t * 0.53 + 1) * 0.015;
      clouds.position.x = Math.sin(t * 0.02) * 8;
    }
  }

  let raf = 0,
    running = false,
    disposed = false,
    last = 0,
    time = 0;
  const loop = (now: number) => {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    time += dt;
    resize();
    update(dt, time);
    renderer.render(scene, camera);
  };
  const start = () => {
    if (running || disposed) return;
    running = true;
    last = performance.now();
    raf = requestAnimationFrame(loop);
  };
  const stop = () => {
    running = false;
    cancelAnimationFrame(raf);
  };
  const onVisibility = () => (document.hidden ? stop() : start());
  const onLost = (e: Event) => {
    e.preventDefault();
    stop();
    opts.onLost?.();
  };
  document.addEventListener("visibilitychange", onVisibility);
  canvas.addEventListener("webglcontextlost", onLost);
  resize();
  start();

  return {
    live: true,
    set(next) {
      state = next;
      const keep = new Set<string>();
      const fr = frameRect();
      const planned = layoutStage(next.mode, next.fighters, fr.w / fr.h);
      for (const f of next.fighters) {
        keep.add(f.key);
        const slot = planned.slots.find((s) => s.key === f.key)!;
        let rig = rigs.get(f.key);
        if (rig && rig.fighter !== f.fighter) {
          // New fighter for the same player: rebuild in place, then hop.
          const old = rig;
          rig = makeRig(f, slot);
          rig.base = { ...old.base };
          rig.enter = 1;
          rig.hop = uiPrefs.reducedMotion ? 1 : 0;
          removeRig(old);
          rigs.set(f.key, rig);
        }
        if (!rig) {
          rig = makeRig(f, slot);
          rigs.set(f.key, rig);
        }
        rig.exit = 0;
        if (rig.pose !== f.pose) {
          if (f.pose === "ready" && !uiPrefs.reducedMotion) rig.cheer = 0;
          rig.pose = f.pose;
        }
        rig.ring.visible = !!f.ring;
        rig.ring.material = f.ring === "grey" ? ringGrey : ringBlue;
      }
      for (const rig of rigs.values()) if (!keep.has(rig.key) && rig.exit === 0) rig.exit = 0.0001;
      relayout();
    },
    react(key, action) {
      const rig = rigs.get(key);
      if (!rig || uiPrefs.reducedMotion) return;
      if (action === "hop") rig.hop = 0;
      else rig.cheer = 0;
    },
    attachLabel(key, el) {
      if (el) labels.set(key, el);
      else labels.delete(key);
      const rig = rigs.get(key);
      if (rig) {
        rig.label = el ?? undefined;
        rig.lx = rig.ly = NaN;
        rig.shown = false;
      }
    },
    dispose() {
      disposed = true;
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
      canvas.removeEventListener("webglcontextlost", onLost);
      for (const rig of [...rigs.values()]) removeRig(rig);
      for (const p of cache.values()) disposeFighter(p);
      cache.clear();
      for (const s of shared) s.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      // The canvas is unusable after forceContextLoss; drop it so the next
      // scene starts from a fresh one.
      canvas.remove();
    },
  };
}
