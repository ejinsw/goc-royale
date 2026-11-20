import { FIGHTERS, ITEMS, clamp, distance, type Vec } from "../../../../shared/definitions";
import type { GameBridge } from "../../game";
import { feedback } from "../core/feedback";

/**
 * The single touch router for every stick (docs/CODE-PRACTICES.md §6.1).
 *
 * - Touches in the left half start the move stick and touches in the right
 *   half start the attack stick, wherever the thumb lands (floating sticks).
 * - Touches on the Super stick start a local preview; release fires. A mouse
 *   click on it uses the current mouse aim, so desktop uses the same control.
 * - Positions and thumb transforms are written straight to the DOM. Layout
 *   metrics are read only on resize, never per frame, and nothing here
 *   touches React state.
 */
type Role = "move" | "attack" | "super" | "item";

interface Stick {
  el: HTMLElement;
  thumb: HTMLElement;
  pointer: number | null;
  mouse: boolean;
  origin: Vec;
  value: Vec;
  power: number;
}

export interface StickRouterOptions {
  root: HTMLElement;
  bridge: GameBridge;
  /** null when Super can fire, otherwise why it cannot. */
  superBlocked: () => string | null;
  /** True when an attack would have no ammo (and is not a ball release). */
  attackEmpty: () => boolean;
  carrying: () => boolean;
  onDeny?: (role: Role) => void;
}

/** Fraction of the stick radius the thumb can travel. */
const THUMB_TRAVEL = 0.6;
/** Super button radius relative to the main sticks. */
const SUPER_SCALE = 0.6;
/** Normalized drag below which a release counts as a tap (auto-aim). */
const TAP = 0.2;
/** Normalized move below which the fighter does not walk. */
const DEAD_ZONE = 0.08;

export function installStickRouter(o: StickRouterOptions): () => void {
  const sticks: Partial<Record<Role, Stick>> = {};
  for (const role of ["move", "attack", "super", "item"] as const) {
    const el = o.root.querySelector<HTMLElement>(`[data-stick="${role}"]`);
    const thumb = el?.querySelector<HTMLElement>(".ui-stick-thumb");
    if (el && thumb)
      sticks[role] = {
        el,
        thumb,
        pointer: null,
        mouse: false,
        origin: { x: 0, y: 0 },
        value: { x: 0, y: 0 },
        power: 0.35,
      };
  }
  const rest: Record<Role, Vec> = {
    move: { x: 0, y: 0 },
    attack: { x: 0, y: 0 },
    super: { x: 0, y: 0 },
    item: { x: 0, y: 0 },
  };
  const safe = { l: 0, r: 0, t: 0, b: 0 };
  let W = 1,
    H = 1,
    R = 60;
  // Safe-area insets are only readable through computed style.
  const probe = document.createElement("div");
  probe.className = "hud-safe-probe";
  o.root.appendChild(probe);

  const radius = (role: Role) => (role === "super" || role === "item" ? R * SUPER_SCALE : R);
  const place = (s: Stick, p: Vec) => {
    s.el.style.transform = `translate3d(${p.x}px, ${p.y}px, 0)`;
  };

  const layout = () => {
    W = window.innerWidth;
    H = window.innerHeight;
    const cs = getComputedStyle(probe);
    safe.l = parseFloat(cs.paddingLeft) || 0;
    safe.r = parseFloat(cs.paddingRight) || 0;
    safe.t = parseFloat(cs.paddingTop) || 0;
    safe.b = parseFloat(cs.paddingBottom) || 0;
    const short = Math.min(W, H);
    R = clamp(short * 0.155, 46, 84);
    const margin = clamp(short * 0.05, 14, 36);
    const y = H - safe.b - margin - R;
    rest.move = { x: safe.l + margin + R, y };
    rest.attack = { x: W - safe.r - margin - R, y };
    rest.super = { x: rest.attack.x - R * 1.5, y: rest.attack.y - R * 0.95 };
    rest.item = { x: rest.attack.x, y: rest.attack.y - R * 1.9 };
    o.root.style.setProperty("--stick-r", `${R}px`);
    o.root.style.setProperty("--super-r", `${R * SUPER_SCALE}px`);
    for (const role of ["move", "attack", "super", "item"] as const) {
      const s = sticks[role];
      if (s && s.pointer === null) place(s, rest[role]);
    }
  };

  const aim = (v: Vec) => {
    const n = Math.hypot(v.x, v.y);
    if (n > 0.05) o.bridge.input.aim = { x: v.x / n, y: v.y / n };
  };

  const syncAimIntent = () => {
    o.bridge.aiming =
      sticks.item?.pointer != null
        ? "item"
        : sticks.super?.pointer != null
        ? "super"
        : sticks.attack?.pointer != null
          ? "attack"
          : null;
  };

  /**
   * A tap aims at the nearest visible enemy, or the ball for a sweep.
   * Returns how far away that target is, or null with nothing to aim at.
   */
  const autoAim = (itemAction = false): number | null => {
    const m = o.bridge.match,
      me = m?.players.find((p) => p.id === o.bridge.id);
    if (!m || !me) return null;
    const clear = (a: Vec, b: Vec) =>
      !m.walls.some((w) => {
        for (let t = 0; t <= 1; t += 0.02) {
          const x = a.x + (b.x - a.x) * t,
            y = a.y + (b.y - a.y) * t;
          if (x > w.x && x < w.x + w.w && y > w.y && y < w.y + w.h) return true;
        }
        return false;
      });
    const item = m.items.find((candidate) => candidate.id === me.heldItem);
    const range = itemAction && item ? ITEMS[item.kind].range : FIGHTERS[me.fighter].range;
    const targets = m.players
      .filter(
        (p) =>
          p.id !== me.id &&
          p.alive &&
          (m.mode === "showdown" || p.team !== me.team) &&
          distance(p.pos, me.pos) <= range &&
          clear(me.pos, p.pos),
      )
      .map((p) => p.pos);
    if (itemAction && item && ITEMS[item.kind].kind === "sweep" &&
        m.mode === "broomball" && m.ball.state !== "resetting" && m.ball.carrier !== me.id &&
        distance(m.ball.pos, me.pos) <= range && clear(me.pos, m.ball.pos))
      targets.push(m.ball.pos);
    targets.sort((a, b) => distance(a, me.pos) - distance(b, me.pos));
    const target = targets[0];
    if (!target) return null;
    aim({ x: target.x - me.pos.x, y: target.y - me.pos.y });
    return distance(target, me.pos);
  };

  const track = (role: Role, s: Stick, x: number, y: number) => {
    const dx = x - s.origin.x,
      dy = y - s.origin.y,
      d = Math.hypot(dx, dy),
      n = Math.max(role === "item" ? radius(role) : R, d);
    s.value = { x: dx / n, y: dy / n };
    s.power = clamp(d / R, 0.35, 1);
    const travel = radius(role) * THUMB_TRAVEL;
    s.thumb.style.transform = `translate3d(${s.value.x * travel}px, ${s.value.y * travel}px, 0)`;
    if (role === "move")
      o.bridge.input.move = d < R * DEAD_ZONE ? { x: 0, y: 0 } : s.value;
    else if (!s.mouse) {
      aim(s.value);
      if (role === "attack") o.bridge.input.power = s.power;
    }
  };

  const begin = (role: Role, e: PointerEvent, mouse: boolean) => {
    const s = sticks[role];
    if (!s || s.pointer !== null) return;
    const r = radius(role);
    s.pointer = e.pointerId;
    s.mouse = mouse;
    s.origin =
      role === "item"
        ? { x: e.clientX, y: e.clientY }
        : role === "super"
          ? { ...rest.super }
          : {
            x: clamp(e.clientX, safe.l + r, W - safe.r - r),
            y: clamp(e.clientY, safe.t + r, H - safe.b - r),
          };
    s.value = { x: 0, y: 0 };
    s.power = 0.35;
    s.el.dataset.active = "";
    syncAimIntent();
    place(s, role === "item" ? rest.item : s.origin);
    track(role, s, e.clientX, e.clientY);
    feedback(s.el, "press", { profile: "stick" });
  };

  const end = (role: Role, fire: boolean) => {
    const s = sticks[role];
    if (!s || s.pointer === null) return;
    s.pointer = null;
    syncAimIntent();
    delete s.el.dataset.active;
    feedback(s.el, "release", { profile: "stick" });
    s.thumb.style.transform = "";
    place(s, rest[role]);
    if (role === "move") {
      o.bridge.input.move = { x: 0, y: 0 };
      return;
    }
    if (!fire) return;
    const tap = Math.hypot(s.value.x, s.value.y) < TAP;
    if (role === "item") {
      const me = o.bridge.match?.players.find((p) => p.id === o.bridge.id);
      if (me?.heldItem == null) {
        feedback(s.el, "deny", { reason: "Pick up an item first" });
        o.onDeny?.("item");
        return;
      }
      if (tap && !s.mouse) autoAim(true);
      else if (!s.mouse) aim(s.value);
      o.bridge.input.itemUse = true;
      return;
    }
    if (role === "attack") {
      if (o.attackEmpty()) {
        feedback(s.el, "deny", { reason: "Reloading" });
        o.onDeny?.("attack");
      }
      let power = s.power;
      if (tap && !o.carrying()) {
        // A tapped lob lands on the auto-aim target.
        const reach = autoAim();
        const me = o.bridge.match?.players.find((p) => p.id === o.bridge.id);
        if (reach !== null && me && FIGHTERS[me.fighter].abilities.attack.kind === "lob")
          power = clamp(reach / FIGHTERS[me.fighter].range, 0.35, 1);
      } else if (!s.mouse) aim(s.value);
      o.bridge.input.attack = true;
      o.bridge.input.power = power;
      return;
    }
    const blocked = o.superBlocked();
    if (blocked) {
      feedback(s.el, "deny", { reason: blocked });
      o.onDeny?.("super");
      return;
    }
    if (tap && !s.mouse) autoAim();
    else if (!s.mouse) aim(s.value);
    o.bridge.input.super = true;
  };

  const roleOf = (pointerId: number) =>
    (Object.keys(sticks) as Role[]).find((r) => sticks[r]!.pointer === pointerId);

  const cancelAll = () => {
    for (const role of Object.keys(sticks) as Role[]) end(role, false);
  };

  const onDown = (e: PointerEvent) => {
    if (o.bridge.paused) return;
    const target = e.target as Element | null;
    const onSuper = !!target?.closest('[data-stick="super"]');
    const onItem = !!target?.closest('[data-stick="item"]');
    if (e.pointerType === "mouse") {
      if ((onSuper || onItem) && e.button === 0) begin(onItem ? "item" : "super", e, true);
      return;
    }
    document.documentElement.dataset.touch = "on";
    let role: Role;
    if (onItem) role = "item";
    else if (onSuper) role = "super";
    else if (
      target?.closest(
        '[data-ui="control"]:not([data-input="stick"]), .ui-backdrop, [data-display="sheet"]',
      )
    )
      return;
    else role = e.clientX < W / 2 ? "move" : "attack";
    if (sticks[role]?.pointer !== null) return;
    e.preventDefault();
    begin(role, e, false);
  };
  const onMove = (e: PointerEvent) => {
    const role = roleOf(e.pointerId);
    if (!role) return;
    if (o.bridge.paused) {
      cancelAll();
      return;
    }
    track(role, sticks[role]!, e.clientX, e.clientY);
  };
  const onUp = (e: PointerEvent) => {
    const role = roleOf(e.pointerId);
    if (role) end(role, !o.bridge.paused);
  };
  const onCancel = (e: PointerEvent) => {
    const role = roleOf(e.pointerId);
    if (role) end(role, false);
  };
  const onHidden = () => {
    if (document.hidden) cancelAll();
  };

  if (matchMedia("(pointer: coarse)").matches) document.documentElement.dataset.touch = "on";
  layout();
  window.addEventListener("resize", layout);
  window.addEventListener("pointerdown", onDown, { capture: true, passive: false });
  window.addEventListener("pointermove", onMove, { passive: true });
  window.addEventListener("pointerup", onUp);
  window.addEventListener("pointercancel", onCancel);
  window.addEventListener("blur", cancelAll);
  document.addEventListener("visibilitychange", onHidden);
  return () => {
    cancelAll();
    window.removeEventListener("resize", layout);
    window.removeEventListener("pointerdown", onDown, { capture: true });
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onCancel);
    window.removeEventListener("blur", cancelAll);
    document.removeEventListener("visibilitychange", onHidden);
    probe.remove();
  };
}
