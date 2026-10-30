import Phaser from "phaser";
import { fighterArt, hasPortraitArt } from "./art";
import {
  FIGHTERS,
  IDS,
  MAPS,
  clamp,
  distance,
  add,
  mul,
  type Vec,
} from "../../shared/definitions";
import type { Match, Input, GameEvent } from "../../shared/types";
import { preferences, sound } from "./audio";
import { LocalPredictor } from "./prediction";
import { metrics } from "./metrics";
export interface GameBridge {
  match: Match | null;
  id: string;
  input: Input;
  spectate: string | null;
  send: (input: Input) => void;
  paused: boolean;
}

const col = (s: string) => parseInt(s.replace("#", ""), 16);
export class ArenaScene extends Phaser.Scene {
  bridge: GameBridge;
  g!: Phaser.GameObjects.Graphics;
  /**
   * Static map art (ground, grid, stripes, bushes, rink markings) drawn once
   * in world units and reused every frame via a transform, instead of
   * procedurally redrawing hundreds of shapes per frame (standard §5.2,
   * resolves the named prototype debt in §10).
   */
  staticLayer!: Phaser.GameObjects.Graphics;
  staticKey = "";
  labels = new Map<string, Phaser.GameObjects.Text>();
  avatars = new Map<string, Phaser.GameObjects.Image>();
  renderPos = new Map<string, Vec>();
  keys = new Set<string>();
  mouseAim: Vec = { x: 1, y: 0 };
  lastSend = 0;
  mouseDown = 0;
  consumedEffects = new Set<number>();
  consumedEvents = new Set<number>();
  zoomFactor = 24;
  lastInputKey = "";
  /** Local input sequence counter stamped on every sent input. */
  localSeq = 0;
  /** Local prediction + reconciliation, shared with the netsim harness. */
  predictor = new LocalPredictor();
  /** Cached camera-layout inputs; fit() recomputes only when these change. */
  private lastFitKey = "";
  offset = { x: 0, y: 0 };
  keyDown!: (e: KeyboardEvent) => void;
  keyUp!: (e: KeyboardEvent) => void;
  blur!: () => void;
  constructor(bridge: GameBridge) {
    super("arena");
    this.bridge = bridge;
  }
  preload() {
    for (const id of IDS) {
      if (hasPortraitArt(id)) this.load.image(id, fighterArt(id));
      else this.load.svg(id, fighterArt(id), { width: 160, height: 160 });
    }
  }
  create() {
    // Static layer sits behind the dynamic graphics and is drawn in world
    // units; each frame it is only transformed, not rebuilt.
    this.staticLayer = this.add.graphics().setDepth(-1);
    this.g = this.add.graphics();
    this.scale.on("resize", () => this.fit(true));
    this.fit(true);
    this.keyDown = (e) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      if (
        ["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(
          e.code,
        )
      )
        e.preventDefault();
      this.keys.add(e.code);
      if (e.code === "Space" && !e.repeat) this.bridge.input.super = true;
    };
    this.keyUp = (e) => {
      this.keys.delete(e.code);
      if (
        [
          "KeyW",
          "KeyA",
          "KeyS",
          "KeyD",
          "ArrowUp",
          "ArrowDown",
          "ArrowLeft",
          "ArrowRight",
        ].includes(e.code)
      )
        this.bridge.input.move = { x: 0, y: 0 };
    };
    this.blur = () => {
      this.keys.clear();
      this.bridge.input.move = { x: 0, y: 0 };
      this.bridge.input.attack = false;
      this.mouseDown = 0;
      this.bridge.send({ move: { x: 0, y: 0 }, aim: this.mouseAim });
    };
    window.addEventListener("keydown", this.keyDown);
    window.addEventListener("keyup", this.keyUp);
    window.addEventListener("blur", this.blur);
    this.input.mouse?.disableContextMenu();
    this.input.on("pointermove", (p: Phaser.Input.Pointer) => {
      if (p.wasTouch) return;
      const me = this.bridge.match?.players.find(
        (x) => x.id === this.bridge.id,
      );
      if (me) {
        const v = {
          x: (p.x - this.offset.x) / this.zoomFactor - me.pos.x,
          y: (p.y - this.offset.y) / this.zoomFactor - me.pos.y,
        };
        const l = Math.hypot(v.x, v.y) || 1;
        this.mouseAim = { x: v.x / l, y: v.y / l };
        this.bridge.input.aim = this.mouseAim;
      }
    });
    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      if (p.wasTouch) return;
      if (p.rightButtonDown()) this.bridge.input.super = true;
      else this.mouseDown = performance.now();
    });
    this.input.on("pointerup", (p: Phaser.Input.Pointer) => {
      if (p.wasTouch || !this.mouseDown) return;
      this.bridge.input.attack = true;
      this.bridge.input.power = clamp(
        (performance.now() - this.mouseDown) / 800,
        0.35,
        1,
      );
      this.mouseDown = 0;
    });
    this.events.once("shutdown", () => {
      window.removeEventListener("keydown", this.keyDown);
      window.removeEventListener("keyup", this.keyUp);
      window.removeEventListener("blur", this.blur);
    });
  }
  /**
   * Recompute camera zoom/offset. Expensive layout runs only when an input
   * changes (viewport size, mode, focus target, or focus position), not
   * unconditionally every frame (standard §5.2). Pass force=true on resize.
   */
  fit(force = false) {
    const m = MAPS[this.bridge.match?.mode || "showdown"];
    const target = this.bridge.match?.players.find(
      (p) => p.id === (this.bridge.spectate || this.bridge.id),
    );
    const focus = target
      ? this.renderPos.get(target.id) || target.pos
      : { x: m.w / 2, y: m.h / 2 };
    // Quantize the focus so sub-pixel camera drift does not force a recompute
    // every frame; a change of ~1/20 world unit is the threshold.
    const key = `${this.scale.width}x${this.scale.height}:${this.bridge.match?.mode}:${Math.round(focus.x * 20)},${Math.round(focus.y * 20)}`;
    if (!force && key === this.lastFitKey) return;
    this.lastFitKey = key;
    this.zoomFactor =
      1.65 * Math.min(this.scale.width / m.w, this.scale.height / m.h);
    const axis = (size: number, world: number, center: number) =>
      world * this.zoomFactor <= size
        ? (size - world * this.zoomFactor) / 2
        : clamp(
            size / 2 - center * this.zoomFactor,
            size - world * this.zoomFactor,
            0,
          );
    this.offset = {
      x: axis(this.scale.width, m.w, focus.x),
      y: axis(this.scale.height, m.h, focus.y),
    };
  }
  /**
   * Draw the unchanging map art into staticLayer once, in world units. The
   * layer is positioned/scaled each frame to match the camera, so this runs
   * only when the mode changes rather than every frame.
   */
  buildStaticLayer(mode: Match["mode"]) {
    const g = this.staticLayer;
    g.clear();
    const map = MAPS[mode];
    const wr = (
      x: number,
      y: number,
      w: number,
      h: number,
      color: number,
      alpha = 1,
    ) => {
      g.fillStyle(color, alpha);
      g.fillRoundedRect(x, y, w, h, 0.15);
    };
    const wc = (x: number, y: number, r: number, color: number, alpha = 1) => {
      g.fillStyle(color, alpha);
      g.fillCircle(x, y, r);
    };
    wr(0, 0, map.w, map.h, mode === "showdown" ? 0x83b66a : 0xb8e0e7);
    for (let x = 0; x < map.w; x += 2)
      for (let y = 0; y < map.h; y += 2)
        if ((x + y) % 4 === 0)
          wr(x, y, 2, 2, mode === "showdown" ? 0x7eaf65 : 0xb0d9e3, 0.4);
    if (mode === "showdown") {
      wr(0, 11, 36, 2, 0xe3d5a0, 0.75);
      wr(17, 0, 2, 24, 0xe3d5a0, 0.75);
      for (const b of map.bushes) {
        wr(b.x, b.y, b.w, b.h, 0x2f754b);
        for (let x = b.x + 0.4; x < b.x + b.w; x += 0.7)
          for (let y = b.y + 0.4; y < b.y + b.h; y += 0.7)
            wc(x, y, 0.43, 0x409157);
      }
    } else {
      g.lineStyle(3 / 24, 0xdb6372, 0.6);
      g.lineBetween(17, 0, 17, 20);
      g.lineStyle(3 / 24, 0x6193be, 0.6);
      g.lineBetween(10, 0, 10, 20);
      g.lineBetween(24, 0, 24, 20);
      g.lineStyle(3 / 24, 0x5f91b0, 0.7);
      g.strokeCircle(17, 10, 3);
      wr(0, 8, 0.5, 4, 0x3d7cc2);
      wr(33.5, 8, 0.5, 4, 0xd8606d);
      g.lineStyle(5 / 24, 0x396977);
      g.strokeRoundedRect(0, 0, 34, 20, 0.5);
      g.lineStyle(2 / 24, 0x3d7cc2, 0.6);
      g.strokeCircle(3, 10, 2.5);
      g.lineStyle(2 / 24, 0xd8606d, 0.6);
      g.strokeCircle(31, 10, 2.5);
    }
  }
  point(p: Vec) {
    return {
      x: p.x * this.zoomFactor + this.offset.x,
      y: p.y * this.zoomFactor + this.offset.y,
    };
  }
  rect(x: number, y: number, w: number, h: number, color: number, alpha = 1) {
    this.g.fillStyle(color, alpha);
    this.g.fillRoundedRect(
      this.offset.x + x * this.zoomFactor,
      this.offset.y + y * this.zoomFactor,
      w * this.zoomFactor,
      h * this.zoomFactor,
      Math.min(6, this.zoomFactor * 0.15),
    );
  }
  circle(p: Vec, r: number, color: number, alpha = 1) {
    const q = this.point(p);
    this.g.fillStyle(color, alpha);
    this.g.fillCircle(q.x, q.y, r * this.zoomFactor);
  }
  line(a: Vec, b: Vec, color: number, width = 2, alpha = 1) {
    a = this.point(a);
    b = this.point(b);
    this.g.lineStyle(width, color, alpha);
    this.g.lineBetween(a.x, a.y, b.x, b.y);
  }
  update(_time: number, delta: number) {
    const s = this.bridge.match;
    if (!s) return;
    if (!this.bridge.paused) {
      const x =
          (this.keys.has("KeyD") || this.keys.has("ArrowRight") ? 1 : 0) -
          (this.keys.has("KeyA") || this.keys.has("ArrowLeft") ? 1 : 0),
        y =
          (this.keys.has("KeyS") || this.keys.has("ArrowDown") ? 1 : 0) -
          (this.keys.has("KeyW") || this.keys.has("ArrowUp") ? 1 : 0);
      if (x || y || this.keys.size)
        this.bridge.input.move = {
          x: x / Math.max(1, Math.hypot(x, y)),
          y: y / Math.max(1, Math.hypot(x, y)),
        };
    }
    this.fit();
    const dt = Math.min(delta / 1000, 0.05),
      z = this.zoomFactor,
      g = this.g;
    g.clear();
    metrics.recordFrame(delta);
    // Send this frame's input before drawing so it leaves as early as
    // possible and the predictor attributes this frame to the right input.
    this.sendInput(s, _time);
    const map = MAPS[s.mode];
    // Static map art: build once per mode, then just transform it to match the
    // camera this frame (standard §5.2) instead of redrawing every shape.
    if (this.staticKey !== s.mode) {
      this.staticKey = s.mode;
      this.buildStaticLayer(s.mode);
    }
    this.staticLayer
      .setPosition(this.offset.x, this.offset.y)
      .setScale(z)
      .setVisible(true);
    // Dynamic scenery only (depends on live state): the shrinking Showdown
    // zone is redrawn each frame because it changes continuously.
    if (s.mode === "showdown") {
      for (let y = 0; y < 24; y += 0.4) {
        const d = Math.abs(y + 0.2 - 12),
          extent = Math.sqrt(Math.max(0, s.zone * s.zone - d * d));
        if (d > s.zone) this.rect(0, y, 36, 0.42, 0x693a66, 0.55);
        else {
          this.rect(0, y, Math.max(0, 18 - extent), 0.42, 0x693a66, 0.55);
          this.rect(
            Math.min(36, 18 + extent),
            y,
            Math.max(0, 18 - extent),
            0.42,
            0x693a66,
            0.55,
          );
        }
      }
      const c = this.point({ x: 18, y: 12 });
      g.lineStyle(3, 0xffde9f, 0.9);
      g.strokeCircle(c.x, c.y, s.zone * z);
    }
    for (const w of s.walls) {
      this.rect(w.x, w.y + 0.12, w.w, w.h, 0x36544a);
      this.rect(w.x, w.y, w.w, w.h, w.hp === undefined ? 0xa7b7a6 : 0xc99155);
      this.line(
        { x: w.x + 0.15, y: w.y + 0.1 },
        { x: w.x + w.w - 0.15, y: w.y + 0.1 },
        0xe1d3a6,
        2,
      );
    }
    for (const a of s.areas) {
      const owner = s.players.find((p) => p.id === a.owner);
      this.circle(
        a.pos,
        a.radius,
        a.kind === "welcome" ? 0x417bc2 : 0xf7d66d,
        0.25,
      );
      const p = this.point(a.pos);
      g.lineStyle(2, a.kind === "welcome" ? 0xf2c65d : 0xffdc69);
      g.strokeCircle(p.x, p.y, a.radius * z);
      if (a.kind === "table") {
        this.rect(a.pos.x - 0.65, a.pos.y - 0.35, 1.3, 0.7, 0x93603c);
        this.circle(a.pos, 0.2, 0xffd573);
        this.rect(
          a.pos.x - 0.6,
          a.pos.y - 0.65,
          1.2 * clamp(a.hp / 2000, 0, 1),
          0.12,
          0x4ddaa2,
        );
      }
      void owner;
    }
    for (const q of s.projectiles) {
      const color = col(FIGHTERS[q.fighter].color);
      this.line(add(q.pos, mul(q.dir, -0.45)), q.pos, color, 5);
      this.circle(q.pos, q.fighter === "rich" ? 0.12 : 0.19, color);
      if (q.fighter === "brandon")
        this.rect(q.pos.x - 0.2, q.pos.y - 0.12, 0.4, 0.24, 0xffedb8);
      if (q.fighter === "ethan") {
        this.line(q.pos, add(q.pos, { x: 0, y: -0.5 }), color, 3);
        this.line(
          add(q.pos, { x: 0, y: -0.5 }),
          add(q.pos, { x: 0.25, y: -0.38 }),
          color,
          3,
        );
      }
      if (q.fighter === "samuel") {
        this.circle(q.pos, 0.22, 0xd8994c);
        this.circle(add(q.pos, { x: 0.07, y: 0.05 }), 0.05, 0x624534);
      }
    }
    const visible = new Set<string>();
    if (!s.players.some((p) => p.id === this.bridge.id && p.alive))
      this.predictor.reset();
    for (const p of s.players) {
      if (!p.alive) continue;
      visible.add(p.id);
      let rp = this.renderPos.get(p.id) || { ...p.pos };
      const local = p.id === this.bridge.id;
      const canPredict =
        !this.bridge.paused && s.phase === "playing" && s.time >= p.stunUntil;
      if (local) {
        // Prediction + reconciliation (standard §4.3); see prediction.ts.
        const result = this.predictor.frame(
          s,
          p.pos,
          FIGHTERS[p.fighter].speed,
          p.slow,
          this.bridge.paused ? { x: 0, y: 0 } : this.bridge.input.move,
          performance.now() / 1000,
          canPredict,
        );
        rp = result.pos;
        if (result.correction !== null)
          metrics.recordCorrection(result.correction);
      } else {
        // Remote entities interpolate toward the latest authoritative sample
        // (standard §4.3). Lowered snapshot rate is absorbed by this smoothing.
        const blend = Math.min(1, delta / 35);
        rp =
          distance(rp, p.pos) > 3
            ? { ...p.pos }
            : {
                x: rp.x + (p.pos.x - rp.x) * blend,
                y: rp.y + (p.pos.y - rp.y) * blend,
              };
      }
      this.renderPos.set(p.id, rp);
      const at = this.point(rp);
      this.circle(add(rp, { x: 0, y: 0.2 }), 0.55, 0x163e39, 0.22);
      const team =
        s.mode === "broomball"
          ? p.team === 0
            ? 0x418bdd
            : 0xe45e6c
          : col(FIGHTERS[p.fighter].color);
      g.lineStyle(local ? 3 : 2, local ? 0xfff0b8 : team);
      g.strokeCircle(at.x, at.y, 0.67 * z);
      if (this.bridge.spectate === p.id) {
        g.lineStyle(4, 0xffd86e);
        g.strokeCircle(at.x, at.y, 0.95 * z);
      }
      if (p.protectedUntil > s.time) {
        g.lineStyle(3, 0xffffff, 0.6);
        g.strokeCircle(at.x, at.y, 0.8 * z);
      }
      let avatar = this.avatars.get(p.id);
      if (!avatar) {
        avatar = this.add.image(at.x, at.y, p.fighter);
        this.avatars.set(p.id, avatar);
      }
      avatar
        .setTexture(p.fighter)
        .setPosition(at.x, at.y)
        .setDisplaySize(
          hasPortraitArt(p.fighter) ? 1.0 * z : 1.15 * z,
          hasPortraitArt(p.fighter) ? 1.5 * z : 1.15 * z,
        )
        .setDepth(3)
        .setVisible(true);
      avatar.setAngle(
        Math.sin(_time / 100 + at.x) *
          (local && length2(this.bridge.input.move) > 0.1 ? 4 : 1),
      );
      this.rect(rp.x - 0.65, rp.y - 1.03, 1.3, 0.15, 0x173e38);
      this.rect(
        rp.x - 0.63,
        rp.y - 1.01,
        (1.26 * p.hp) / FIGHTERS[p.fighter].hp,
        0.11,
        p.hp > FIGHTERS[p.fighter].hp / 3 ? 0x75e1ae : 0xff9987,
      );
      let label = this.labels.get(p.id);
      if (!label) {
        label = this.add
          .text(0, 0, "", {
            fontFamily: "system-ui",
            fontSize: "12px",
            color: "#ffffff",
            stroke: "#173e38",
            strokeThickness: 3,
            align: "center",
          })
          .setOrigin(0.5, 1)
          .setDepth(5);
        this.labels.set(p.id, label);
      }
      label
        .setText(
          `${s.mode === "broomball" ? (p.team === 0 ? "▲ " : "◆ ") : ""}${p.name}${p.connected ? "" : " · offline"}`,
        )
        .setPosition(at.x, at.y - 1.12 * z)
        .setVisible(true);
      if (p.stunUntil > s.time)
        this.circle(add(rp, { x: 0, y: -0.7 }), 0.18, 0xffe494);
      if (local) {
        this.line(
          rp,
          add(rp, mul(this.bridge.input.aim, 2.4)),
          0xffffff,
          2,
          0.65,
        );
        this.circle(add(rp, mul(this.bridge.input.aim, 2.4)), 0.08, 0xffffff);
      }
    }
    for (const [id, a] of this.avatars)
      if (!visible.has(id)) a.setVisible(false);
    for (const [id, l] of this.labels)
      if (!visible.has(id)) l.setVisible(false);
    if (s.mode === "broomball" && s.ball.state !== "resetting") {
      this.circle(s.ball.pos, 0.36, 0x173e38);
      this.circle(add(s.ball.pos, { x: -0.04, y: -0.06 }), 0.24, 0xffe6a5);
    }
    for (const e of s.effects) {
      const p = this.point(e.pos),
        progress = clamp((e.end - s.time) / 0.5, 0, 1);
      if (!this.consumedEffects.has(e.id)) {
        this.consumedEffects.add(e.id);
        sound(
          e.kind,
          IDS.indexOf(
            s.players.find((p) => p.id === e.owner)?.fighter || "brandon",
          ),
        );
        // Camera impulses are now driven by the typed presentation event
        // stream (see playEvents), scaled by importance and distance.
      }
      const owner = s.players.find((x) => x.id === e.owner);
      const color = owner ? col(FIGHTERS[owner.fighter].color) : 0xffe3b0;
      if (e.kind === "cone" || e.kind === "sound" || e.kind === "photo") {
        const range = e.kind === "cone" ? 6.5 : e.kind === "photo" ? 8 : 10;
        const width = e.kind === "photo" ? 5 : 4;
        const end = add(e.pos, mul(e.dir, range));
        const perp = { x: (-e.dir.y * width) / 2, y: (e.dir.x * width) / 2 };
        const points = (
          e.kind === "cone"
            ? [e.pos, add(end, perp), add(end, mul(perp, -1))]
            : [
                add(e.pos, perp),
                add(end, perp),
                add(end, mul(perp, -1)),
                add(e.pos, mul(perp, -1)),
              ]
        ).map((v) => this.point(v));
        g.fillStyle(color, 0.2 * progress);
        g.fillPoints(points, true);
        g.lineStyle(2, color, progress);
        g.strokePoints(points, true);
      } else if (e.kind === "van") {
        this.rect(e.pos.x - 0.8, e.pos.y - 0.5, 1.6, 1, 0x89b8eb, 0.8);
        this.rect(e.pos.x - 0.3, e.pos.y - 0.38, 0.6, 0.75, 0xd9edf0, 0.8);
      } else {
        g.lineStyle(3, color, progress);
        g.strokeCircle(
          p.x,
          p.y,
          (e.kind === "aura" ? 4 : e.kind === "glitch" ? 3 : 0.8) *
            (1.2 - progress / 2) *
            z,
        );
        if (e.value) {
          const key = "effect:" + e.id;
          let text = this.labels.get(key);
          if (!text) {
            text = this.add
              .text(p.x, p.y, String(e.value), {
                fontFamily: "system-ui",
                fontStyle: "bold",
                fontSize: "14px",
                color: e.kind === "heal" ? "#b4ffd3" : "#ffffff",
                stroke: "#173e38",
                strokeThickness: 3,
              })
              .setOrigin(0.5)
              .setDepth(8);
            this.labels.set(key, text);
          }
          text
            .setPosition(p.x, p.y - (1 - progress) * z)
            .setAlpha(progress)
            .setVisible(true);
        }
      }
    }
    for (const [id, label] of this.labels)
      if (
        id.startsWith("effect:") &&
        !s.effects.some((e) => "effect:" + e.id === id)
      ) {
        label.destroy();
        this.labels.delete(id);
      }
    if (this.consumedEffects.size > 3000)
      this.consumedEffects = new Set(s.effects.map((e) => e.id));
    this.playEvents(s);
  }
  /**
   * Send the local input when movement changes, an action is pressed, or the
   * 30 Hz steady cadence elapses. Each send gets a monotonic seq and is
   * recorded in the predictor, which tracks how long it stays active.
   */
  sendInput(s: Match, time: number) {
    const inputKey = `${this.bridge.input.move.x},${this.bridge.input.move.y},${this.bridge.paused}`;
    if (
      inputKey === this.lastInputKey &&
      !this.bridge.input.attack &&
      !this.bridge.input.super &&
      time - this.lastSend < 1000 / 30
    )
      return;
    this.lastInputKey = inputKey;
    this.lastSend = time;
    const seq = ++this.localSeq;
    const move = this.bridge.paused
      ? { x: 0, y: 0 }
      : { ...this.bridge.input.move };
    // Client clock for the movement timeline; same clock as predictor.frame.
    const t = performance.now() / 1000;
    const payload: Input = this.bridge.paused
      ? { move, aim: this.bridge.input.aim, seq, t }
      : { ...this.bridge.input, move, seq, t };
    this.bridge.send(payload);
    const me = s.players.find((pl) => pl.id === this.bridge.id);
    this.predictor.record(seq, move, me?.slow ?? 0, t);
    this.bridge.input.attack = false;
    this.bridge.input.super = false;
  }
  /**
   * Consume the authoritative presentation event stream (standard §6.2) once
   * per stable id, driving impact feedback that scales by importance and
   * distance (standard §6.1). Camera impulses respect the accessibility shake
   * setting. Audio continues to be driven by the visual effect stream; this
   * pass adds readable impact layering without duplicating those cues.
   */
  playEvents(s: Match) {
    if (!s.events?.length) return;
    const self = s.players.find((p) => p.id === this.bridge.id);
    const focus =
      (this.bridge.spectate
        ? s.players.find((p) => p.id === this.bridge.spectate)
        : self) || null;
    for (const e of s.events) {
      if (this.consumedEvents.has(e.id)) continue;
      this.consumedEvents.add(e.id);
      if (!preferences.shake) continue;
      // Distance attenuation from the viewed fighter keeps far-off impacts
      // from shaking the whole screen (standard §6.1: scale by distance).
      const near = focus ? clamp(1 - distance(focus.pos, e.pos) / 14, 0, 1) : 1;
      if (near <= 0) continue;
      const impulse = this.eventImpulse(e);
      if (impulse > 0)
        this.cameras.main.shake(impulse * 90 + 60, impulse * 0.004 * near);
    }
    if (this.consumedEvents.size > 4000)
      this.consumedEvents = new Set(s.events.map((e) => e.id));
  }
  /** Importance weight (0..1) for an event's camera impulse. */
  eventImpulse(e: GameEvent): number {
    switch (e.type) {
      case "goal_scored":
        return 1;
      case "fighter_eliminated":
        return 0.85;
      case "super_resolved":
        return 0.7;
      case "attack_hit":
        // Scale with damage dealt, capped; small hits barely register.
        return clamp((e.value ?? 0) / 1600, 0, 0.5);
      default:
        return 0;
    }
  }
}
const length2 = (v: Vec) => Math.hypot(v.x, v.y);
export function mountGame(parent: HTMLElement, bridge: GameBridge) {
  return new Phaser.Game({
    // Canvas avoids WebGL framebuffer allocation failures during rapid mobile resize/teardown.
    type: Phaser.CANVAS,
    parent,
    backgroundColor: "#143831",
    scale: {
      mode: Phaser.Scale.RESIZE,
      width: parent.clientWidth,
      height: parent.clientHeight,
    },
    scene: new ArenaScene(bridge),
    render: { antialias: true, pixelArt: false },
    audio: { noAudio: true },
    input: { activePointers: 4 },
  });
}
