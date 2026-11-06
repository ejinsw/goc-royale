import {
  FIGHTERS,
  IDS,
  clamp,
  distance,
  type FighterId,
  type Vec,
} from "../../shared/definitions";
import type { GameEvent, Input, Match, Player } from "../../shared/types";
import { preferences, sound } from "./audio";
import { LocalPredictor } from "./prediction";
import { ActionPredictor, type PredictedAttack } from "./actionPrediction";
import { metrics } from "./metrics";
import { uiPrefs } from "./ui/core/feedback";
import { preloadFighterAssets } from "./arena/fighters";
import { createArenaView, type ArenaView, type CueKind } from "./arena/view";

/**
 * The match: input, prediction and presentation timing around the 3D arena
 * renderer (performance standard §3 "Arena presentation"). This replaces the
 * Phaser arena; input sampling, the send cadence, local prediction,
 * predicted cues and event dedupe are unchanged from it.
 *
 * Rates stay independent (§3): the host simulates at 30 Hz and snapshots at
 * ~18 Hz elsewhere; this runs at display rate and only reads the latest
 * snapshot from the bridge; React never sees a frame.
 */
export interface GameBridge {
  match: Match | null;
  id: string;
  input: Input;
  spectate: string | null;
  send: (input: Input) => void;
  paused: boolean;
}

export interface ArenaHandle {
  destroy(): void;
}

export interface MountOptions {
  /** WebGL could not start; the HUD and controls keep working without the view. */
  onUnavailable?: () => void;
}

const col = (s: string) => parseInt(s.replace("#", ""), 16);
const MOVE_KEYS = [
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
];
/** Authoritative cues for an action already played as a prediction are skipped within this window (s). */
const PREDICTION_WINDOW = 1;

class Arena {
  private view: ArenaView | null;
  private keys = new Set<string>();
  private mouseDown = 0;
  /** Last mouse position (client px); null once touch is in use. */
  private mouse: { x: number; y: number } | null = null;
  private lastSend = 0;
  private lastInputKey = "";
  private localSeq = 0;
  private predictor = new LocalPredictor();
  private actions = new ActionPredictor();
  private renderPos = new Map<string, Vec>();
  private consumedEffects = new Set<number>();
  private consumedEvents = new Set<number>();
  /** Authoritative effects whose cue already played as a prediction. */
  private predictedEffectIds = new Set<number>();
  /** Client times of predicted local attack animations not yet matched. */
  private predictedAttacks: number[] = [];
  private predictedSuperAt = -Infinity;
  private predictedReleaseAt = -Infinity;
  private lastMatch: Match | null = null;
  private matchAt = 0;
  private lastFrame = 0;
  private raf = 0;
  private cleanups: (() => void)[] = [];

  constructor(
    private parent: HTMLElement,
    private bridge: GameBridge,
    opts: MountOptions,
  ) {
    this.view = createArenaView(parent);
    if (!this.view) opts.onUnavailable?.();
    this.listen();
    this.raf = requestAnimationFrame(this.frame);
  }

  private on<K extends keyof WindowEventMap>(
    target: Window,
    type: K,
    fn: (e: WindowEventMap[K]) => void,
    options?: AddEventListenerOptions,
  ): void;
  private on<K extends keyof HTMLElementEventMap>(
    target: HTMLElement,
    type: K,
    fn: (e: HTMLElementEventMap[K]) => void,
    options?: AddEventListenerOptions,
  ): void;
  private on(
    target: Window | HTMLElement,
    type: string,
    fn: (e: Event) => void,
    options?: AddEventListenerOptions,
  ) {
    target.addEventListener(type, fn, options);
    this.cleanups.push(() => target.removeEventListener(type, fn, options));
  }

  private listen() {
    this.on(window, "keydown", (e) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      if (
        ["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(
          e.code,
        )
      )
        e.preventDefault();
      this.keys.add(e.code);
      if (e.code === "Space" && !e.repeat) this.bridge.input.super = true;
    });
    this.on(window, "keyup", (e) => {
      this.keys.delete(e.code);
      if (MOVE_KEYS.includes(e.code)) this.bridge.input.move = { x: 0, y: 0 };
    });
    this.on(window, "blur", () => {
      this.keys.clear();
      this.bridge.input.move = { x: 0, y: 0 };
      this.bridge.input.attack = false;
      this.mouseDown = 0;
      this.bridge.send({ move: { x: 0, y: 0 }, aim: this.bridge.input.aim });
    });
    // Mouse play: aim follows the cursor; HUD controls sit above the arena
    // and keep their own clicks. Touch is handled by the HUD's stick router.
    this.on(
      window,
      "pointermove",
      (e) => {
        if (e.pointerType === "mouse")
          this.mouse = { x: e.clientX, y: e.clientY };
      },
      { passive: true },
    );
    this.on(
      window,
      "pointerdown",
      (e) => {
        if (e.pointerType !== "mouse") this.mouse = null;
      },
      { capture: true, passive: true },
    );
    this.on(this.parent, "pointerdown", (e) => {
      if (e.pointerType !== "mouse") return;
      this.mouse = { x: e.clientX, y: e.clientY };
      if (e.button === 2) this.bridge.input.super = true;
      else if (e.button === 0) this.mouseDown = performance.now();
    });
    this.on(window, "pointerup", (e) => {
      if (e.pointerType !== "mouse" || !this.mouseDown) return;
      this.bridge.input.attack = true;
      this.bridge.input.power = clamp(
        (performance.now() - this.mouseDown) / 800,
        0.35,
        1,
      );
      this.mouseDown = 0;
    });
    this.on(this.parent, "contextmenu", (e) => e.preventDefault());
  }

  private frame = (nowMs: number) => {
    this.raf = requestAnimationFrame(this.frame);
    const deltaMs = this.lastFrame
      ? Math.min(250, nowMs - this.lastFrame)
      : 1000 / 60;
    this.lastFrame = nowMs;
    const s = this.bridge.match;
    if (!s) return;
    if (s !== this.lastMatch) {
      this.lastMatch = s;
      this.matchAt = nowMs;
    }
    metrics.recordFrame(deltaMs);
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
    const me = s.players.find((p) => p.id === this.bridge.id);
    // Re-aim every frame, so the aim keeps pointing at a still cursor while
    // the fighter or camera moves.
    if (this.mouse && this.view && me?.alive && !this.bridge.paused) {
      const aim = this.view.aim(
        this.mouse.x,
        this.mouse.y,
        this.renderPos.get(me.id) ?? me.pos,
      );
      if (aim) this.bridge.input.aim = aim;
    }
    // Send this frame's input before drawing so it leaves as early as
    // possible and the predictor attributes this frame to the right input.
    this.sendInput(s, nowMs);
    this.positions(s, deltaMs);
    const now = performance.now() / 1000;
    this.consumeEffects(s, now);
    this.playEvents(s, now);
    this.view?.frame({
      match: s,
      positions: this.renderPos,
      localId: this.bridge.id,
      spectateId: this.bridge.spectate,
      localAim: this.bridge.input.aim,
      age: (nowMs - this.matchAt) / 1000,
      now,
      dt: Math.min(deltaMs / 1000, 0.1),
    });
  };

  /** Local prediction (standard §4.3) and remote smoothing, as in the 2D arena. */
  private positions(s: Match, deltaMs: number) {
    if (!s.players.some((p) => p.id === this.bridge.id && p.alive)) {
      this.predictor.reset();
      this.actions.reset();
    }
    for (const p of s.players) {
      if (!p.alive) continue;
      let rp = this.renderPos.get(p.id) || { ...p.pos };
      if (p.id === this.bridge.id) {
        const canPredict =
          !this.bridge.paused &&
          s.phase === "playing" &&
          s.time >= p.stunUntil &&
          s.time >= p.busyUntil;
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
        const blend = Math.min(1, deltaMs / 35);
        rp =
          distance(rp, p.pos) > 3
            ? { ...p.pos }
            : {
                x: rp.x + (p.pos.x - rp.x) * blend,
                y: rp.y + (p.pos.y - rp.y) * blend,
              };
      }
      this.renderPos.set(p.id, rp);
    }
  }

  /**
   * Send the local input when movement changes, an action is pressed, or the
   * 30 Hz steady cadence elapses. Each send gets a monotonic seq and is
   * recorded in the predictor, which tracks how long it stays active.
   */
  private sendInput(s: Match, time: number) {
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
    // Immediate local release cues on the input frame (standard §4.1, §6).
    if (me && payload.attack) {
      const kind = this.actions.tryAttack(me, s, t, this.bridge.paused);
      if (kind) this.playPredictedAttack(kind, me, t);
    }
    if (
      me &&
      payload.super &&
      this.actions.trySuper(me, s, t, this.bridge.paused)
    ) {
      sound("super_cue");
      const superSpec = FIGHTERS[me.fighter].abilities.super;
      this.cue(
        superSpec.kind === "frame" && superSpec.effect === "gaze" ? "gaze" : "super",
        me,
        0xf4c95d,
        t,
        superSpec.kind === "frame" && superSpec.effect === "gaze"
          ? { range: superSpec.range, half: superSpec.width / 2 }
          : undefined,
      );
      if (this.view?.action(me.id, "super", t)) metrics.anim.predicted++;
      this.predictedSuperAt = t;
    }
    this.bridge.input.attack = false;
    this.bridge.input.super = false;
  }

  private cue(
    kind: CueKind,
    me: Player,
    color: number,
    t: number,
    shape?: { range: number; half: number },
  ) {
    this.view?.cue(
      kind,
      { ...(this.renderPos.get(me.id) ?? me.pos) },
      { ...this.bridge.input.aim },
      color,
      t,
      shape,
    );
  }

  private playPredictedAttack(kind: PredictedAttack, me: Player, t: number) {
    if (kind === "release") {
      sound("release");
      this.cue("release", me, 0xffe6a5, t);
      if (this.view?.action(me.id, "ball_shot", t)) metrics.anim.predicted++;
      this.predictedReleaseAt = t;
      return;
    }
    const fighter = FIGHTERS[me.fighter];
    sound(fighter.attackSound ?? "attack", IDS.indexOf(me.fighter));
    const attack = fighter.abilities.attack;
    // Cone attacks are instant; shot attacks create authoritative projectiles.
    this.cue(
      attack.kind === "cone" ? "cone" : "attack",
      me,
      col(fighter.color),
      t,
      attack.kind === "cone"
        ? { range: fighter.range, half: attack.halfAngle }
        : undefined,
    );
    // The animation starts on the input frame and is never restarted by the
    // authoritative attack_started that follows (standard §7.2).
    if (this.view?.action(me.id, "basic_attack", t)) {
      this.predictedAttacks.push(t);
      metrics.anim.predicted++;
    }
  }

  /** Authoritative effects: sound and visuals once per stable id. */
  private consumeEffects(s: Match, now: number) {
    for (const e of s.effects) {
      if (this.consumedEffects.has(e.id)) continue;
      this.consumedEffects.add(e.id);
      // A confirmed local attack already played its cue on the input frame.
      if (
        e.kind === "attack" &&
        e.owner === this.bridge.id &&
        this.actions.confirmAttack(now)
      ) {
        this.predictedEffectIds.add(e.id);
        continue;
      }
      // Side Eye's warning was already drawn on the local input frame; only
      // the resolving flash is replayed from authority.
      if (
        e.kind === "gaze" &&
        !e.value &&
        e.owner === this.bridge.id &&
        now - this.predictedSuperAt < PREDICTION_WINDOW
      ) {
        this.predictedEffectIds.add(e.id);
        continue;
      }
      sound(
        e.kind,
        IDS.indexOf(
          s.players.find((p) => p.id === e.owner)?.fighter || "brandon",
        ),
      );
      this.view?.effect(e, s, now);
    }
    if (this.consumedEffects.size > 3000)
      this.consumedEffects = new Set(s.effects.map((e) => e.id));
    // Attack effects live 0.2 s; keep only ids still present.
    if (this.predictedEffectIds.size > 64)
      for (const id of this.predictedEffectIds)
        if (!s.effects.some((e) => e.id === id))
          this.predictedEffectIds.delete(id);
  }

  /**
   * Consume the authoritative presentation event stream (standard §6.2) once
   * per stable id: animation one-shots, hit flashes, and camera impulses that
   * scale by importance and distance (standard §6.1) and respect the shake
   * and reduced-motion settings.
   */
  private playEvents(s: Match, now: number) {
    if (!s.events?.length) return;
    const self = s.players.find((p) => p.id === this.bridge.id);
    const focus =
      (this.bridge.spectate
        ? s.players.find((p) => p.id === this.bridge.spectate)
        : self) || null;
    for (const e of s.events) {
      if (this.consumedEvents.has(e.id)) continue;
      this.consumedEvents.add(e.id);
      this.animate(e, s, now);
      if (!preferences.shake || uiPrefs.reducedMotion) continue;
      // Distance attenuation from the viewed fighter keeps far-off impacts
      // from shaking the whole screen (standard §6.1: scale by distance).
      const near = focus ? clamp(1 - distance(focus.pos, e.pos) / 14, 0, 1) : 1;
      if (near <= 0) continue;
      const impulse = eventImpulse(e);
      if (impulse > 0)
        this.view?.shake(impulse * 90 + 60, impulse * 0.004 * near, now);
    }
    if (this.consumedEvents.size > 4000)
      this.consumedEvents = new Set(s.events.map((e) => e.id));
  }

  /** One animation cue per event; local actions already played as predictions are skipped. */
  private animate(e: GameEvent, s: Match, now: number) {
    const view = this.view;
    if (!view) return;
    const local = e.owner === this.bridge.id;
    const skip = () => {
      metrics.anim.skipped++;
    };
    const start = (clip: "basic_attack" | "super" | "ball_shot") => {
      if (view.action(e.owner, clip, now) && local)
        metrics.anim.authoritative++;
    };
    switch (e.type) {
      case "attack_started": {
        if (local) {
          while (
            this.predictedAttacks.length &&
            now - this.predictedAttacks[0] > PREDICTION_WINDOW
          )
            this.predictedAttacks.shift();
          if (this.predictedAttacks.length) {
            this.predictedAttacks.shift();
            return skip();
          }
        }
        return start("basic_attack");
      }
      case "super_started":
        if (local && now - this.predictedSuperAt < PREDICTION_WINDOW)
          return skip();
        return start("super");
      case "ball_released":
        // Only a shot or pass plays the shot clip; drops from stuns and
        // knockbacks already have their own reaction.
        if (local && now - this.predictedReleaseAt < PREDICTION_WINDOW)
          return skip();
        if (s.ball.state === "flight" && s.ball.last === e.owner)
          start("ball_shot");
        return;
      case "attack_hit": {
        // Zone ticks are tiny; reactions are for real hits.
        const value = e.value ?? 0;
        if (value < 100) return;
        const target = nearest(s, e.pos, e.owner);
        if (!target) return;
        view.action(target.id, "hit", now);
        view.hit(target.id, value / 1400);
        return;
      }
      case "fighter_eliminated":
        view.action(e.owner, "eliminated", now);
        return;
      case "goal_scored":
        for (const p of s.players)
          if (p.alive)
            view.action(p.id, p.team === e.value ? "victory" : "defeat", now);
        return;
    }
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    for (const c of this.cleanups.splice(0)) c();
    this.view?.dispose();
    this.view = null;
  }
}

/** The fighter an `attack_hit` landed on: nearest to the event position. */
function nearest(s: Match, pos: Vec, owner: string): Player | null {
  let best: Player | null = null,
    bestD = 1.2;
  for (const p of s.players) {
    if (p.id === owner) continue;
    const d = distance(p.pos, pos);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}

/** Importance weight (0..1) for an event's camera impulse. */
function eventImpulse(e: GameEvent): number {
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

export function mountGame(
  parent: HTMLElement,
  bridge: GameBridge,
  opts: MountOptions = {},
): ArenaHandle {
  const arena = new Arena(parent, bridge, opts);
  return { destroy: () => arena.destroy() };
}

/** Warm the runtime fighter assets a lobby will need before its match starts. */
export function preloadArena(fighters: readonly FighterId[]) {
  preloadFighterAssets(fighters);
}
