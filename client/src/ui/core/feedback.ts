import { uiCue } from "../../audio";
import {
  PROFILES,
  SIZES,
  MOTION,
  type ProfileName,
  type SizeName,
  type UiCue,
} from "./tokens";

/**
 * Tactile feedback engine (docs/CODE-PRACTICES.md §5). Every control and
 * display plays its physical response through `feedback`, so press depth,
 * spring-back, confirm, deny, and emphasis look and sound the same
 * everywhere. Only transform and opacity are animated, through the Web
 * Animations API, and nothing here touches React state.
 */
export type Phase =
  | "press"
  | "release"
  | "cancel"
  | "confirm"
  | "deny"
  | "tick"
  | "pop"
  | "pulse"
  | "jolt"
  | "flash"
  | "burst";

export const uiPrefs = {
  reducedMotion:
    typeof matchMedia !== "undefined" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches,
  haptics: true,
  /** Always ask for the short version of a Super cutscene. */
  shortCutscenes: false,
};

export function setReducedMotion(on: boolean) {
  uiPrefs.reducedMotion = on;
  document.documentElement.dataset.motion = on ? "reduced" : "full";
}

export interface FeedbackOptions {
  profile?: ProfileName;
  /** 0..1 scale for jolt, flash, and pulse strength. */
  intensity?: number;
  /** Override the profile's sound; null for silence. */
  cue?: UiCue | null;
  /** Direction for jolt, in screen space. */
  dir?: { x: number; y: number };
  /** Reason text shown by a deny. */
  reason?: string;
}

const vibrate = (pattern: number | number[]) => {
  if (!uiPrefs.haptics) return;
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // Vibration is optional; unsupported browsers simply ignore it.
  }
};

const marks = new WeakMap<Element, Record<string, ReturnType<typeof setTimeout>>>();
/**
 * Set a data attribute for `ms`. The value alternates between "a" and "b";
 * ui.css binds each value to an identical keyframe set with a different
 * name, so a repeated mark restarts its CSS animation without forcing a
 * layout read.
 */
function mark(el: Element, attr: string, ms: number) {
  const timers = marks.get(el) ?? {};
  marks.set(el, timers);
  clearTimeout(timers[attr]);
  el.setAttribute(attr, el.getAttribute(attr) === "a" ? "b" : "a");
  timers[attr] = setTimeout(() => el.removeAttribute(attr), ms);
}

function animate(
  el: Element,
  keyframes: Keyframe[],
  duration: number,
  easing: string = MOTION.out,
) {
  if (typeof (el as HTMLElement).animate !== "function") return;
  (el as HTMLElement).animate(keyframes, { duration, easing });
}

const profileOf = (el: Element, opts: FeedbackOptions) =>
  PROFILES[
    opts.profile ??
      ((el as HTMLElement).dataset?.profile as ProfileName | undefined) ??
      "punchy"
  ] ?? PROFILES.punchy;

const depthOf = (el: Element) =>
  (SIZES[(el as HTMLElement).dataset?.size as SizeName] ?? SIZES.md).depth;

export function feedback(
  el: Element | null | undefined,
  phase: Phase,
  opts: FeedbackOptions = {},
) {
  if (!el) return;
  const p = profileOf(el, opts);
  const reduced = uiPrefs.reducedMotion;
  const k = Math.max(0, Math.min(1, opts.intensity ?? 1));
  const cue = (fallback: UiCue | null) => {
    const c = opts.cue === undefined ? fallback : opts.cue;
    if (c) uiCue(c, 1, c === "ui_tick" ? 45 : 0);
  };
  switch (phase) {
    case "press":
      // Same-frame response: the attribute is read by CSS on the next paint.
      el.setAttribute("data-pressed", "");
      cue(p.cue);
      if (p.haptic) vibrate(p.haptic);
      return;
    case "release": {
      if (!el.hasAttribute("data-pressed")) return;
      el.removeAttribute("data-pressed");
      if (reduced) return;
      const sink = depthOf(el) * p.pressDepth;
      animate(
        el,
        [
          { scale: String(p.pressScale), translate: `0 ${sink}px` },
          { scale: String(p.overshoot), translate: "0 -1px", offset: 0.55 },
          { scale: "1", translate: "0 0" },
        ],
        p.releaseMs,
        MOTION.out,
      );
      return;
    }
    case "cancel":
      el.removeAttribute("data-pressed");
      return;
    case "confirm":
      mark(el, "data-flash", 320);
      cue("ui_confirm");
      vibrate(12);
      if (!reduced)
        animate(
          el,
          [
            { scale: "1" },
            { scale: "1.08", offset: 0.35 },
            { scale: "0.98", offset: 0.7 },
            { scale: "1" },
          ],
          280,
        );
      return;
    case "deny":
      if (opts.reason) (el as HTMLElement).dataset.reason = opts.reason;
      mark(el, "data-denied", 1600);
      cue("ui_deny");
      vibrate([10, 40, 10]);
      if (!reduced)
        animate(
          el,
          [
            { translate: "0 0" },
            { translate: "-7px 0" },
            { translate: "6px 0" },
            { translate: "-4px 0" },
            { translate: "3px 0" },
            { translate: "0 0" },
          ],
          260,
          "linear",
        );
      return;
    case "tick":
      cue("ui_tick");
      if (!reduced)
        animate(el, [{ scale: "1" }, { scale: "1.035" }, { scale: "1" }], 110);
      return;
    case "pop":
      cue(null);
      animate(
        el,
        reduced
          ? [{ opacity: 0 }, { opacity: 1 }]
          : [
              { scale: "0.6", opacity: 0 },
              { scale: "1.1", opacity: 1, offset: 0.6 },
              { scale: "1", opacity: 1 },
            ],
        MOTION.slow,
        reduced ? "linear" : MOTION.out,
      );
      return;
    case "pulse":
      cue(null);
      animate(
        el,
        reduced
          ? [{ opacity: 1 }, { opacity: 0.55 }, { opacity: 1 }]
          : [{ scale: "1" }, { scale: String(1 + 0.12 * k) }, { scale: "1" }],
        300,
      );
      return;
    case "jolt": {
      mark(el, "data-flash", 220);
      cue(null);
      if (reduced) return;
      const d = opts.dir ?? { x: 1, y: 0.4 };
      const m = 4 + 8 * k;
      animate(
        el,
        [
          { translate: "0 0" },
          { translate: `${d.x * m}px ${d.y * m}px` },
          { translate: `${-d.x * m * 0.5}px ${-d.y * m * 0.5}px` },
          { translate: "0 0" },
        ],
        200,
        "linear",
      );
      return;
    }
    case "flash":
      cue(null);
      animate(
        el,
        [{ opacity: 0 }, { opacity: 0.25 + 0.6 * k }, { opacity: 0 }],
        reduced ? 320 : 240,
        "linear",
      );
      return;
    case "burst":
      mark(el, "data-flash", 480);
      cue("ui_ready");
      vibrate(20);
      if (!reduced)
        animate(
          el,
          [
            { scale: "1" },
            { scale: "1.22", offset: 0.4 },
            { scale: "0.96", offset: 0.75 },
            { scale: "1" },
          ],
          420,
        );
      return;
  }
}
