import {
  Color,
  DirectionalLight,
  SRGBColorSpace,
  HemisphereLight,
  Mesh,
  PlaneGeometry,
  ShaderMaterial,
  WebGLRenderTarget,
  PerspectiveCamera,
  Plane,
  Raycaster,
  Scene,
  Vector2,
  Vector3,
  WebGLRenderer,
} from "three";
import {
  AREAS,
  FIGHTERS,
  ITEMS,
  MAPS,
  clamp,
  type FighterId,
  type Mode,
  type Vec,
} from "../../../shared/definitions";
import type { Effect, Match, Player } from "../../../shared/types";
import { metrics } from "../metrics";
import {
  FIGHTER_HEIGHT,
  FighterActor,
  buildProceduralAsset,
  fighterAsset,
  type ActionClip,
  type ProceduralAsset,
} from "./fighters";
import {
  Areas,
  AimGuide,
  Ball,
  Billboards,
  Effects,
  Items,
  Markers,
  Projectiles,
  Vans,
  aimArrow,
  type ProjectileView,
} from "./fx";
import { aimPreviewFor, itemAimPreviewFor, type AimIntent } from "./aimPreview";
import { cameraFocusId } from "./cameraFocus";
import { buildArenaMap, type ArenaMap } from "./map";
import { createArenaMaterials } from "./materials";
import { SwiperShow, hasSwiper } from "./swiper";

/**
 * The live 3D arena renderer (performance standard §3 "Arena presentation",
 * §5.2). It replaces the Phaser arena; there is never a second live arena
 * renderer, and it never runs at the same time as the menu scene
 * (docs/CODE-PRACTICES.md §7): the menu stage unmounts before a match mounts
 * this, and `dispose()` releases everything before the menu returns.
 *
 * Like the menu scene, it creates and owns its canvas, because
 * `forceContextLoss()` permanently disables the canvas it is called on.
 *
 * It draws what the caller hands it each frame (snapshot, drawn positions,
 * aim) and plays one-shot cues the caller decides on. It never reads input,
 * sends anything, or touches React.
 */

/**
 * Camera decision (integration brief, open decision 1): a perspective follow
 * camera at a fixed pitch. It shows the same framing as the 2D arena did, 1.65x
 * arena fit around the followed fighter. The fighter remains centered at the
 * field edges, where the view may reveal scenery beyond the playable bounds.
 * There is no yaw, so screen up is always map up and stick, keyboard and mouse
 * directions keep their meaning.
 */
const CAMERA = {
  /** Low enough to see faces, high enough that cover never hides a fighter. */
  pitch: (50 * Math.PI) / 180,
  fov: 32,
  fit: 1.65,
};
/** Mouse aim is picked on this plane, about chest height, to avoid parallax. */
const AIM_HEIGHT = 0.8;
const LABEL_Y = FIGHTER_HEIGHT + 0.1;

/**
 * The grading pass for a Super cutscene: the world in grayscale with color
 * returning in a radial wave, a radial blur, color fringing and a white
 * flash. It is built on first use and runs only while a cutscene is shown.
 */
const POST_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;
const POST_FRAGMENT = /* glsl */ `
uniform sampler2D map;
uniform vec2 center;
uniform float aspect;
uniform float gray;
uniform float wave;
uniform float aberration;
uniform float blur;
uniform float flash;
varying vec2 vUv;
void main() {
  vec2 dir = vUv - center;
  vec3 col = vec3(0.0);
  for (int i = 0; i < 6; i++) {
    vec2 uv = center + dir * (1.0 - blur * float(i) / 5.0);
    col.r += texture2D(map, uv + dir * aberration).r;
    col.g += texture2D(map, uv).g;
    col.b += texture2D(map, uv - dir * aberration).b;
  }
  col /= 6.0;
  float d = length(dir * vec2(aspect, 1.0));
  float colored = 1.0 - smoothstep(wave - 0.14, wave, d);
  float luma = dot(col, vec3(0.299, 0.587, 0.114));
  // Dimmed as well as drained, so the caster and the gold read against it.
  col = mix(col, vec3(luma * 0.5), gray * (1.0 - colored));
  col += flash;
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

export interface ArenaFrame {
  match: Match;
  /** Drawn positions (prediction/interpolation applied) of living players. */
  positions: ReadonlyMap<string, Vec>;
  localId: string;
  spectateId: string | null;
  localAim: Vec;
  localMove: Vec;
  aiming: AimIntent | null;
  power: number;
  /** Seconds since `match` arrived, for extrapolating fast objects. */
  age: number;
  /** Seconds, same clock as performance.now() / 1000. */
  now: number;
  dt: number;
}

export type CueKind =
  | "attack"
  | "cone"
  | "gaze"
  | "release"
  | "super"
  | "item_sweep"
  | "melee_sweep";

export interface ArenaView {
  frame(f: ArenaFrame): void;
  /** First sight of an authoritative effect. */
  effect(e: Effect, match: Match, now: number): void;
  /** A locally predicted release cue (standard §4.1); presentation only. */
  cue(
    kind: CueKind,
    from: Vec,
    dir: Vec,
    color: number,
    now: number,
    shape?: { range: number; half: number },
    /** Whose cue this is, for fighter-specific flourishes. */
    by?: Player,
  ): void;
  /** Start a one-shot clip on a fighter. False when the graph ignored it. */
  action(id: string, clip: ActionClip, now: number): boolean;
  hit(id: string, strength: number): void;
  shake(ms: number, intensity: number, now: number): void;
  /** Ground aim from a client point toward a fighter's drawn position. */
  aim(clientX: number, clientY: number, from: Vec): Vec | null;
  dispose(): void;
}

interface DamageNumber {
  text: string;
  color: number;
  at: Vec;
  start: number;
  dur: number;
}

const hex = (c: string) => parseInt(c.slice(1), 16);
const TEAM_COLOR = [0x418bdd, 0xe45e6c] as const;

export function createArenaView(container: HTMLElement): ArenaView | null {
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  Object.assign(canvas.style, {
    display: "block",
    width: "100%",
    height: "100%",
    touchAction: "none",
  });
  container.prepend(canvas);
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: "high-performance",
    });
  } catch {
    canvas.remove();
    return null;
  }
  if (!renderer.getContext()) {
    renderer.dispose();
    canvas.remove();
    return null;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  const scene = new Scene();
  const camera = new PerspectiveCamera(CAMERA.fov, 1, 0.5, 160);
  camera.rotation.set(-CAMERA.pitch, 0, 0);
  const mats = createArenaMaterials();
  const hemi = new HemisphereLight(0xe8f0ff, 0x6f8a5a, 1.3);
  const sun = new DirectionalLight(0xfff4e2, 2.2);
  sun.position.set(-0.45, 1, 0.55);
  scene.add(hemi, sun);
  // Layer 1 holds what a cutscene keeps in full color (see `draw`).
  hemi.layers.enable(1);
  sun.layers.enable(1);
  camera.layers.enable(1);

  const billboards = new Billboards(mats);
  const markers = new Markers(mats);
  const effects = new Effects(mats);
  const items = new Items(mats);
  const projectiles = new Projectiles(mats);
  const areas = new Areas(mats);
  const ball = new Ball(mats);
  const vans = new Vans(mats);
  const arrow = aimArrow(mats);
  const guide = new AimGuide(mats);
  scene.add(
    billboards.mesh,
    markers.shadows,
    markers.rings,
    effects.group,
    items.group,
    projectiles.group,
    areas.group,
    ball.mesh,
    vans.group,
    arrow,
    guide.group,
  );

  const procedural = new Map<FighterId, ProceduralAsset>();
  const proceduralFor = (id: FighterId) => {
    let a = procedural.get(id);
    if (!a) procedural.set(id, (a = buildProceduralAsset(id)));
    return a;
  };
  const actors = new Map<string, FighterActor>();
  let disposed = false;
  const actorFor = (p: Player) => {
    let a = actors.get(p.id);
    if (a && a.fighter !== p.fighter) {
      scene.remove(a.group);
      a.dispose();
      a = undefined;
    }
    if (!a) {
      const actor = new FighterActor(p.fighter, mats, proceduralFor);
      a = actor;
      actors.set(p.id, actor);
      scene.add(actor.group);
      // Swap in the validated runtime asset when (or if) it arrives.
      void fighterAsset(p.fighter).then((asset) => {
        if (asset && !disposed && actors.get(p.id) === actor)
          actor.useAsset(asset);
      });
    }
    return a;
  };

  let map: ArenaMap | null = null;
  let mode: Mode | null = null;
  const useMode = (m: Mode) => {
    if (mode === m) return;
    if (map) {
      scene.remove(map.group);
      map.dispose();
    }
    mode = m;
    map = buildArenaMap(m, mats);
    scene.add(map.group);
    const night = m === "broomball";
    scene.background = new Color(night ? 0x141c2b : 0x5f8f4f);
    hemi.color.setHex(night ? 0xc8d6ff : 0xe8f0ff);
    hemi.groundColor.setHex(night ? 0x26324a : 0x6f8a5a);
    hemi.intensity = night ? 1.2 : 1.3;
    sun.color.setHex(night ? 0xf2f6ff : 0xfff4e2);
    sun.intensity = night ? 2 : 2.2;
    sun.position.set(night ? 0.2 : -0.45, 1, 0.55);
    fitted = "";
  };

  // ------------------------------------------------------------- camera
  let W = 1,
    H = 1,
    rect = { left: 0, top: 0, width: 1, height: 1 };
  let fitted = "";
  const view = {
    dist: 20,
    h: 17,
    back: 10,
    halfW: 10,
    ui: 1,
  };
  const cam = { x: 0, z: 0, ready: false, gliding: false };
  const shake = { until: 0, dur: 1, amp: 0 };
  const shakeBy = (ms: number, intensity: number, now: number) => {
    const amp = intensity * view.halfW * 2;
    const remaining =
      now < shake.until ? shake.amp * ((shake.until - now) / shake.dur) : 0;
    if (amp < remaining) return;
    shake.dur = ms / 1000;
    shake.until = now + shake.dur;
    shake.amp = amp;
  };
  // The UCLA Swiper showcase: built only once a match has a Brandon Nguyen,
  // so every other match pays nothing for it.
  let show: SwiperShow | null = null;
  let showOff = false;
  /**
   * The show is decoration. If it cannot start or ever throws on some
   * device, it is dropped for the rest of the match and the arena carries
   * on without it, rather than failing every frame with it.
   */
  const dropShow = (error: unknown) => {
    console.warn("UCLA Swiper showcase disabled:", error);
    if (show) scene.remove(show.group);
    show = null;
    showOff = true;
    metrics.showcase = "failed: " + String(error).slice(0, 90);
  };
  const safely = (run: () => void) => {
    try {
      run();
    } catch (error) {
      dropShow(error);
    }
  };
  const showFor = (match: Match) => {
    if (!show && !showOff && hasSwiper(match))
      safely(() => {
        const made = new SwiperShow(mats, camera, effects, shakeBy);
        made.group.traverse((o) => o.layers.set(1));
        scene.add(made.group);
        show = made;
        metrics.showcase = "on";
      });
    return show;
  };
  let labelPx = 0.02;
  /** Runs on resize and mode change only, never per frame (standard §5.2). */
  const fit = () => {
    if (!mode) return;
    const key = `${W}x${H}:${mode}`;
    if (key === fitted) return;
    fitted = key;
    const m = MAPS[mode];
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
    const zoom = CAMERA.fit * Math.min(W / m.w, H / m.h);
    const t = Math.tan((CAMERA.fov * Math.PI) / 360);
    view.dist = H / (2 * zoom * t);
    view.h = view.dist * Math.sin(CAMERA.pitch);
    view.back = view.dist * Math.cos(CAMERA.pitch);
    view.halfW = view.dist * t * (W / H);
    labelPx = (2 * view.dist * t) / H;
    billboards.px = labelPx;
    // Overhead labels grow with tall screens but never drop below phone size.
    view.ui = clamp(H / 640, 1, 1.35);
  };
  const place = (focus: Vec | null, dt: number, now: number) => {
    const m = MAPS[mode!];
    const want = focus ?? { x: m.w / 2, y: m.h / 2 };
    const x = want.x;
    const z = want.y;
    if (!cam.ready) {
      cam.x = x;
      cam.z = z;
      cam.ready = true;
    }
    // Follow exactly; glide only across a jump (respawn, spectate switch).
    if (Math.hypot(x - cam.x, z - cam.z) > 2.5) cam.gliding = true;
    if (cam.gliding) {
      const k = 1 - Math.exp(-dt * 9);
      cam.x += (x - cam.x) * k;
      cam.z += (z - cam.z) * k;
      if (Math.hypot(x - cam.x, z - cam.z) < 0.04) cam.gliding = false;
    } else {
      cam.x = x;
      cam.z = z;
    }
    let sx = 0,
      sz = 0;
    if (now < shake.until) {
      const k = (shake.until - now) / shake.dur;
      sx = (Math.random() * 2 - 1) * shake.amp * k;
      sz = (Math.random() * 2 - 1) * shake.amp * k;
    }
    // A zoom punch moves the camera along its own view line (presentation only).
    const zoom = show ? show.zoomAt(now) : 1;
    billboards.px = labelPx * zoom;
    camera.position.set(
      cam.x + sx,
      view.h * zoom,
      cam.z + view.back * zoom + sz,
    );
    camera.updateMatrixWorld();
  };

  const measure = () => {
    const r = canvas.getBoundingClientRect();
    rect = {
      left: r.left,
      top: r.top,
      width: r.width || 1,
      height: r.height || 1,
    };
    W = Math.max(1, Math.round(r.width));
    H = Math.max(1, Math.round(r.height));
    fit();
  };
  const resizer = new ResizeObserver(measure);
  resizer.observe(container);
  window.addEventListener("resize", measure);
  measure();

  let lost = false;
  const onLost = (e: Event) => {
    e.preventDefault();
    lost = true;
  };
  const onRestored = () => {
    lost = false;
    fitted = "";
    fit();
  };
  canvas.addEventListener("webglcontextlost", onLost);
  canvas.addEventListener("webglcontextrestored", onRestored);

  let post: {
    target: WebGLRenderTarget;
    scene: Scene;
    material: ShaderMaterial;
  } | null = null;
  const bufferSize = new Vector2();
  const draw = () => {
    const pass = show?.post;
    if (!pass?.active) {
      renderer.render(scene, camera);
      return;
    }
    renderer.getDrawingBufferSize(bufferSize);
    if (!post) {
      const material = mats.track(
        new ShaderMaterial({
          uniforms: {
            map: { value: null },
            center: { value: new Vector2(0.5, 0.5) },
            aspect: { value: 1 },
            gray: { value: 0 },
            wave: { value: 0 },
            aberration: { value: 0 },
            blur: { value: 0 },
            flash: { value: 0 },
          },
          vertexShader: POST_VERTEX,
          fragmentShader: POST_FRAGMENT,
          depthTest: false,
          depthWrite: false,
        }),
      );
      const quad = new Mesh(mats.track(new PlaneGeometry(2, 2)), material);
      quad.frustumCulled = false;
      const postScene = new Scene();
      postScene.add(quad);
      post = {
        // 8-bit sRGB with multisampling is core WebGL2, so every phone has
        // it; a multisampled float target is optional and some GPUs lack it.
        target: mats.track(
          new WebGLRenderTarget(bufferSize.x, bufferSize.y, {
            colorSpace: SRGBColorSpace,
            samples: 4,
          }),
        ),
        scene: postScene,
        material,
      };
    }
    if (
      post.target.width !== bufferSize.x ||
      post.target.height !== bufferSize.y
    )
      post.target.setSize(bufferSize.x, bufferSize.y);
    const u = post.material.uniforms;
    u.map.value = post.target.texture;
    u.center.value.set(pass.cx, pass.cy);
    u.aspect.value = camera.aspect;
    u.gray.value = pass.gray;
    u.wave.value = pass.wave;
    u.aberration.value = pass.aberration;
    u.blur.value = pass.blur;
    u.flash.value = pass.flash;
    // The world, graded; then the caster and the show over it in full color.
    camera.layers.set(0);
    renderer.setRenderTarget(post.target);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    renderer.render(post.scene, camera);
    // A color background forces a clear, which would wipe the graded world.
    const backdrop = scene.background;
    scene.background = null;
    camera.layers.set(1);
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(scene, camera);
    renderer.autoClear = true;
    scene.background = backdrop;
    camera.layers.enable(0);
  };

  // -------------------------------------------------------------- frame
  const numbers: DamageNumber[] = [];
  const shots: ProjectileView[] = [];
  const at = new Vector3();
  const hands = new Vector3();
  const itemCarrierHands = (id: string, out: Vector3) => {
    const actor = actors.get(id);
    if (!actor?.shown) return null;
    actor.hands(out);
    return actor.yaw;
  };
  const ballPos = { x: 0, y: 0, z: 0, ready: false };
  const raycaster = new Raycaster();
  const ndc = new Vector2();
  const aimPlane = new Plane(new Vector3(0, 1, 0), -AIM_HEIGHT);
  const hitPoint = new Vector3();
  let time = 0;

  const pushNumber = (text: string, color: number, pos: Vec, now: number) => {
    const n =
      numbers.length < 32
        ? { text, color, at: { ...pos }, start: now, dur: 0.75 }
        : numbers.shift()!;
    n.text = text;
    n.color = color;
    n.at.x = pos.x;
    n.at.y = pos.y;
    n.start = now;
    numbers.push(n);
  };

  function frame(f: ArenaFrame) {
    if (disposed) return;
    const s = f.match;
    useMode(s.mode);
    fit();
    const local = f.localId;
    const focusId = cameraFocusId(s.players, local, f.spectateId);
    const showcase = showFor(s);
    // Hit-stop holds the picture for a few frames. Input, prediction and the
    // authoritative simulation are untouched (standard section 6.1).
    if (showcase && f.now < showcase.freezeUntil) {
      safely(() =>
        showcase.frame({
          now: f.now,
          dt: 0,
          match: s,
          localId: local,
          focusId,
          actors,
        }),
      );
      if (!lost) draw();
      return;
    }
    time += f.dt;
    const localAlive = s.players.find((p) => p.id === local)?.alive ?? false;

    // Fighters: drawn position, aim, status, then animation.
    const present = new Set<string>();
    for (const p of s.players) {
      present.add(p.id);
      const actor = actorFor(p);
      // A Super cutscene freezes everyone but its caster mid-pose.
      if (s.cutscene && s.cutscene.owner !== p.id && actor.shown) continue;
      const pos = f.positions.get(p.id) ?? p.pos;
      const superSpec = FIGHTERS[p.fighter].abilities.super;
      const lift =
        superSpec.kind === "leap" && p.busyUntil > s.time
          ? Math.sin(
              Math.PI *
                (1 - clamp((p.busyUntil - s.time) / superSpec.air, 0, 1)),
            ) * 1.5
          : 0;
      actor.update(f.dt, f.now, {
        pos,
        aim: p.id === local ? f.localAim : p.aim,
        alive: p.alive,
        stunned: p.alive && p.stunUntil > s.time,
        carrying: s.ball.carrier === p.id,
        lift,
        turn: p.id === local ? 30 : 14,
      });
      if (s.phase === "playing") actor.graph.releaseHeld();
      if (showcase && p.fighter === "brandon_n") {
        // Squash and stretch, volume preserved.
        const tall = showcase.squashOf(p.id, f.now);
        const wide = 1 / Math.sqrt(tall);
        actor.group.scale.set(wide, tall, wide);
      }
    }
    // Concealed in a bush (not in this viewer's snapshot): not drawn.
    for (const [id, a] of actors) if (!present.has(id)) a.hide();

    // During a cutscene every camera holds on its caster.
    const followId = showcase?.leadId() ?? focusId;
    const focusActor = followId ? actors.get(followId) : undefined;
    const focusPlayer = s.players.find((p) => p.id === followId);
    const focus = focusActor?.shown
      ? focusActor.at
      : focusPlayer
        ? ((followId ? f.positions.get(followId) : undefined) ?? focusPlayer.pos)
        : null;
    map!.update(s, focus, time, f.dt, (pos) => {
      effects.ring(pos, 0.4, 1.5, 0xc99155, 0.45, f.now);
      effects.disc(pos, 0.2, 1.1, 0xe2b77c, 0.35, f.now, 0.45);
    });
    place(focus, f.dt, f.now);

    // Projectiles move fast; extrapolate a little past the snapshot so they
    // glide between 18 Hz updates instead of stepping.
    const ext = Math.min(f.age, 0.08);
    shots.length = 0;
    for (const q of s.projectiles) {
      const d = Math.min(
        ext * FIGHTERS[q.fighter].projectileSpeed,
        q.remaining,
      );
      shots.push({
        fighter: q.fighter,
        pos: { x: q.pos.x + q.dir.x * d, y: q.pos.y + q.dir.y * d },
        dir: q.dir,
      });
    }
    projectiles.update(shots, time);
    items.update(s.items, time, ext, itemCarrierHands);
    areas.update(s.areas, f.now, time);
    vans.update(f.now, (owner) => {
      const a = actors.get(owner);
      return a?.shown ? a.at : null;
    });
    effects.update(f.now);

    markers.begin();
    billboards.begin(camera);
    const ui = view.ui;
    for (const p of s.players) {
      const a = actors.get(p.id);
      if (!a?.shown) continue;
      const x = a.at.x,
        z = a.at.y;
      markers.shadow(x, z, 0.62);
      if (!p.alive) continue;
      const ring =
        s.mode === "broomball"
          ? TEAM_COLOR[p.team]
          : hex(FIGHTERS[p.fighter].color);
      if (p.id === local) {
        markers.ring(x, z, 0.74, 0xfff0b8);
        if (s.mode === "broomball") markers.ring(x, z, 0.6, ring, 0.035);
      } else markers.ring(x, z, 0.67, ring);
      if (!localAlive && focusId === p.id) markers.ring(x, z, 0.98, 0xffd86e);
      if (p.protectedUntil > s.time)
        markers.ring(x, z, 0.84, 0xffffff, 0.05 + 0.02 * Math.sin(time * 14));
      if (p.slow > 0) {
        markers.ring(x, z, 0.5, 0xd9ceff, 0.025);
        markers.ring(x, z, 0.42, 0x8c78c9, 0.018);
      }
      if (p.shield > 0) markers.ring(x, z, 0.9, 0x8bc7ff, 0.06);

      at.set(x, LABEL_Y, z);
      const max = FIGHTERS[p.fighter].hp;
      const w = 54 * ui,
        h = 7 * ui;
      billboards.bar(at, -w / 2 - 1.5, 10 * ui, w + 3, h + 3, 0x173e38, 0.92);
      billboards.bar(
        at,
        -w / 2,
        10 * ui,
        w * clamp(p.hp / max, 0, 1),
        h,
        p.hp > max / 3 ? 0x75e1ae : 0xff9987,
      );
      if (p.shield > 0)
        billboards.bar(
          at,
          -w / 2,
          19 * ui,
          w * clamp(p.shield / max, 0, 1),
          3 * ui,
          0x8bc7ff,
          0.95,
        );
      const name = `${s.mode === "broomball" ? (p.team === 0 ? "▲ " : "◆ ") : ""}${p.name}${p.connected ? "" : " · offline"}`;
      billboards.label(at, 27 * ui, billboards.text(p.id, name), 12.5 * ui);
      if (p.stunUntil > s.time)
        for (let k = 0; k < 2; k++) {
          const ang = time * 5 + k * Math.PI;
          hands.set(
            x + Math.cos(ang) * 0.42,
            FIGHTER_HEIGHT - 0.05,
            z + Math.sin(ang) * 0.3,
          );
          billboards.quad(
            hands,
            0,
            0,
            18 * ui,
            18 * ui,
            billboards.glyph("★"),
            0xffe494,
            1,
            time * 4,
          );
        }
    }
    for (const area of s.areas) {
      const max = AREAS[area.kind].hp;
      if (!max) continue;
      markers.shadow(area.pos.x, area.pos.y, 0.8);
      at.set(area.pos.x, area.kind === "barrier" ? 1.4 : 1.05, area.pos.y);
      const w = 44 * ui,
        h = 6 * ui;
      billboards.bar(at, -w / 2 - 1.5, 0, w + 3, h + 3, 0x173e38, 0.92);
      billboards.bar(
        at,
        -w / 2,
        0,
        w * clamp(area.hp / max, 0, 1),
        h,
        area.kind === "barrier" ? 0x9ead2c : 0x4ddaa2,
      );
    }

    // Ball: in the carrier's hands, otherwise dead-reckoned from the
    // snapshot velocity and eased so 18 Hz updates do not step.
    const b = s.ball;
    const carrier = b.carrier ? actors.get(b.carrier) : undefined;
    if (s.mode !== "broomball" || b.state === "resetting") {
      ball.mesh.visible = false;
      ballPos.ready = false;
    } else {
      let tx: number, ty: number, tz: number;
      if (carrier?.shown) {
        carrier.hands(hands);
        tx = hands.x;
        ty = hands.y;
        tz = hands.z;
      } else {
        const m = MAPS.broomball;
        tx = clamp(b.pos.x + b.velocity.x * ext, 0.32, m.w - 0.32);
        tz = clamp(b.pos.y + b.velocity.y * ext, 0.32, m.h - 0.32);
        ty = 0.3;
      }
      const jump =
        !ballPos.ready || Math.hypot(tx - ballPos.x, tz - ballPos.z) > 3;
      const k = jump ? 1 : 1 - Math.exp(-f.dt / (carrier?.shown ? 0.02 : 0.03));
      const ox = ballPos.x,
        oz = ballPos.z;
      ballPos.x += (tx - ballPos.x) * k;
      ballPos.y += (ty - ballPos.y) * k;
      ballPos.z += (tz - ballPos.z) * k;
      ballPos.ready = true;
      ball.mesh.visible = true;
      ball.mesh.position.set(ballPos.x, ballPos.y, ballPos.z);
      const dx = ballPos.x - ox,
        dz = ballPos.z - oz,
        dist = Math.hypot(dx, dz);
      if (!jump && dist > 1e-4) {
        hitPoint.set(dz / dist, 0, -dx / dist);
        ball.mesh.rotateOnWorldAxis(hitPoint, dist / 0.3);
      }
      markers.shadow(ballPos.x, ballPos.z, 0.34 + 0.1 * Math.min(1, ballPos.y));
    }

    for (let i = numbers.length - 1; i >= 0; i--) {
      const n = numbers[i];
      const k = (f.now - n.start) / n.dur;
      if (k >= 1) {
        numbers.splice(i, 1);
        continue;
      }
      at.set(n.at.x, LABEL_Y - 0.2 + k * 0.9, n.at.y);
      // Pops in large, settles, then fades while rising.
      const pop = k < 0.12 ? 1 + 0.5 * (1 - k / 0.12) : 1;
      billboards.number(
        at,
        0,
        n.text,
        15 * pop * ui,
        n.color,
        k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3,
      );
    }

    const me = s.players.find((p) => p.id === local);
    const meActor = actors.get(local);
    const canGuide = !!me?.alive && !!meActor?.shown && s.phase === "playing";
    if (canGuide) {
      const intent = f.aiming;
      let heldItem: (typeof s.items)[number] | undefined;
      if (intent === "item")
        for (const item of s.items)
          if (item.id === me!.heldItem) {
            heldItem = item;
            break;
          }
      guide.update(
        meActor!.at,
        f.localAim,
        f.localMove,
        intent === "super" || intent === "item"
          ? 0xf4c95d
          : hex(FIGHTERS[me!.fighter].color),
        intent,
        intent === "item"
          ? heldItem
            ? itemAimPreviewFor(heldItem.kind)
            : null
          : intent
            ? aimPreviewFor(
                me!.fighter,
                intent,
                s.ball.carrier === me!.id,
                f.power,
              )
            : null,
      );
    } else guide.hide();
    arrow.visible = canGuide && !f.aiming;
    if (arrow.visible) {
      arrow.position.set(meActor!.at.x, 0.05, meActor!.at.y);
      arrow.rotation.y = Math.atan2(f.localAim.x, f.localAim.y);
    }

    markers.end();
    billboards.end();
    if (showcase)
      safely(() =>
        showcase.frame({
          now: f.now,
          dt: f.dt,
          match: s,
          localId: local,
          focusId,
          actors,
        }),
      );
    if (!lost) draw();
    const info = renderer.info;
    metrics.gpu.calls = info.render.calls;
    metrics.gpu.triangles = info.render.triangles;
    metrics.gpu.geometries = info.memory.geometries;
    metrics.gpu.textures = info.memory.textures;
  }

  return {
    frame,
    effect(e, match, now) {
      const owner = match.players.find((p) => p.id === e.owner);
      const color = owner ? hex(FIGHTERS[owner.fighter].color) : 0xffe3b0;
      const showcase = showFor(match);
      const swiper = owner?.fighter === "brandon_n" ? showcase : null;
      const dur = clamp(e.end - match.time, 0.08, 3);
      const muzzle = {
        x: e.pos.x + e.dir.x * 0.55,
        y: e.pos.y + e.dir.y * 0.55,
      };
      switch (e.kind) {
        case "attack":
          effects.ring(muzzle, 0.2, 0.55, color, 0.2, now, 0.95, 0.8);
          effects.streak(e.pos, e.dir, 0.6, 1.4, 0.16, color, 0.18, now);
          safely(() => swiper?.swipe(e.owner, e.pos, e.dir, now));
          break;
        case "hit":
          effects.ring(e.pos, 0.5, 1, 0xffffff, 0.35, now);
          // His damage prints on a receipt instead of the plain number.
          if (swiper && e.value)
            safely(() => swiper.landed(e.owner, e.pos, e.value!, now));
          else if (e.value) pushNumber(String(e.value), 0xffffff, e.pos, now);
          break;
        case "heal":
          effects.ring(e.pos, 0.5, 1.05, 0x9dffc8, 0.45, now);
          if (e.value) pushNumber(`+${e.value}`, 0xb4ffd3, e.pos, now);
          break;
        case "cone":
          if (owner) {
            const attack = FIGHTERS[owner.fighter].abilities.attack;
            if (owner.fighter === "tovya") {
              effects.sweep(
                e.pos,
                e.dir,
                FIGHTERS.tovya.range,
                color,
                now,
                true,
              );
              break;
            }
            effects.cone(
              e.pos,
              e.dir,
              FIGHTERS[owner.fighter].range,
              attack.kind === "cone" ? attack.halfAngle : 0.5,
              color,
              dur,
              now,
            );
          }
          break;
        case "photo":
          // The resolving flash (value 1) is brighter than the framing tell.
          effects.rect(
            e.pos,
            e.dir,
            8,
            2.5,
            e.value ? 0xffffff : color,
            dur,
            now,
            e.value ? 0.5 : 0.24,
          );
          break;
        case "sound":
          effects.rect(e.pos, e.dir, 10, 2, color, dur, now, 0.32);
          break;
        case "aura":
          effects.ring(e.pos, 1, 4, color, dur, now);
          effects.disc(e.pos, 0.5, 4, color, dur, now, 0.28);
          break;
        case "glitch":
          effects.ring(e.pos, 0.6, 3, color, dur, now);
          effects.disc(e.pos, 0.3, 3, 0x77d5b9, dur, now, 0.32);
          break;
        case "van":
          vans.show(e.owner, e.dir, now + dur);
          break;
        case "goal":
          
          effects.ring(e.pos, 0.5, 6, 0xffe6a5, 1.1, now);
          effects.disc(e.pos, 0.3, 4, 0xffe6a5, 0.8, now, 0.4);
          break;
        case "eliminated":
          effects.ring(e.pos, 0.4, 1.6, 0xffffff, 0.5, now);
          effects.disc(e.pos, 0.2, 1.2, color, 0.45, now, 0.4);
          break;
        case "burst":
          effects.ring(e.pos, 0.5, e.value ?? 3, color, dur, now);
          effects.disc(e.pos, 0.3, e.value ?? 3, color, dur, now, 0.28);
          safely(() => swiper?.payoff(e.owner, e.pos, e.value ?? 4, match, now));
          break;
        case "marker":
        case "leap":
          effects.ring(
            e.pos,
            e.value ?? 1,
            e.value ?? 1,
            color,
            dur,
            now,
            0.9,
            0.12,
          );
          break;
        case "chain":
        case "swap":
          effects.streak(
            e.pos,
            e.dir,
            0,
            e.value ?? 1,
            0.12,
            color,
            dur,
            now,
            0.8,
          );
          break;
        case "panda":
          effects.streak(e.pos, e.dir, 0, 1.2, 0.18, 0xfbe8d3, dur, now, 0.9);
          effects.ring(e.pos, 0.2, 0.8, 0xe8553a, dur, now);
          break;
        case "harmony":
          effects.ring(e.pos, 0.18, 0.85, 0xf2c65d, dur, now, 0.9, 0.08);
          effects.ring(e.pos, 0.08, 0.62, 0x4f7fd1, dur, now, 0.9, 0.08);
          break;
        case "gaze": {
          const superSpec = owner
            ? FIGHTERS[owner.fighter].abilities.super
            : null;
          const range = superSpec?.kind === "frame" ? superSpec.range : 6.5;
          const width = superSpec?.kind === "frame" ? superSpec.width : 4.5;
          effects.rect(
            e.pos,
            e.dir,
            range,
            width,
            e.value ? 0xfff2a8 : color,
            dur,
            now,
            e.value ? 0.5 : 0.22,
          );
          if (e.value) {
            const center = {
              x: e.pos.x + e.dir.x * range * 0.55,
              y: e.pos.y + e.dir.y * range * 0.55,
            };
            const side = { x: -e.dir.y, y: e.dir.x };
            effects.streak(
              center,
              side,
              0,
              width * 0.45,
              0.12,
              0xfff2a8,
              dur,
              now,
              0.9,
            );
            effects.streak(
              center,
              { x: -side.x, y: -side.y },
              0,
              width * 0.45,
              0.12,
              0xfff2a8,
              dur,
              now,
              0.9,
            );
          }
          break;
        }
      }
    },
    cue(kind, from, dir, color, now, shape, by) {
      if (show && by?.fighter === "brandon_n") {
        const live = show;
        safely(() => {
          if (kind === "attack") live.swipe(by.id, from, dir, now);
          else if (kind === "super") live.windup(by.id, from, now);
        });
      }
      if (kind === "melee_sweep") {
        effects.sweep(from, dir, FIGHTERS.tovya.range, color, now, true);
        return;
      }
      if (kind === "item_sweep") {
        effects.sweep(from, dir, ITEMS.golden_broom.range, color, now);
        return;
      }
      if (kind === "super") {
        effects.ring(from, 0.7, 1.3, color, 0.25, now);
        return;
      }
      if (kind === "cone") {
        effects.cone(
          from,
          dir,
          shape?.range ?? 6.5,
          shape?.half ?? 0.5,
          color,
          0.25,
          now,
          0.28,
        );
        return;
      }
      if (kind === "gaze") {
        effects.rect(
          from,
          dir,
          shape?.range ?? 6.5,
          (shape?.half ?? 2.25) * 2,
          color,
          0.4,
          now,
          0.22,
        );
        return;
      }
      const muzzle = { x: from.x + dir.x * 0.55, y: from.y + dir.y * 0.55 };
      effects.ring(
        muzzle,
        0.2,
        0.55,
        color,
        kind === "release" ? 0.18 : 0.15,
        now,
        0.95,
        0.8,
      );
      effects.streak(
        from,
        dir,
        0.6,
        kind === "release" ? 2 : 1.4,
        0.18,
        color,
        kind === "release" ? 0.18 : 0.15,
        now,
      );
    },
    action(id, clip, now) {
      return actors.get(id)?.trigger(clip, now) ?? false;
    },
    hit(id, strength) {
      actors.get(id)?.hit(strength);
    },
    shake: shakeBy,
    aim(clientX, clientY, from) {
      ndc.set(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(ndc, camera);
      if (!raycaster.ray.intersectPlane(aimPlane, hitPoint)) return null;
      const dx = hitPoint.x - from.x,
        dz = hitPoint.z - from.y,
        l = Math.hypot(dx, dz);
      return l < 0.05 ? null : { x: dx / l, y: dz / l };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      resizer.disconnect();
      window.removeEventListener("resize", measure);
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
      for (const a of actors.values()) a.dispose();
      actors.clear();
      map?.dispose();
      for (const a of procedural.values()) {
        a.skin.dispose();
        a.shell.dispose();
      }
      procedural.clear();
      mats.dispose();
      scene.clear();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
}
