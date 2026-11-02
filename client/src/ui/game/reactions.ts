import { useEffect, type RefObject } from "react";
import { preferences } from "../../audio";
import { applyMeter, type DisplayBase, type DisplaySpec, type MeterValue } from "../core/display";
import { feedback, type Phase } from "../core/feedback";
import type { UiCue } from "../core/tokens";
import type { SignalRef } from "./signals";

/**
 * The reaction table (docs/CODE-PRACTICES.md §6): how a live display responds
 * when its signal changes. A display lists reactions by name; there is no
 * component per event. `when` returns an intensity, 0 for no reaction.
 */
export interface Reaction {
  when: (next: MeterValue, prev: MeterValue | undefined) => number;
  phase: Phase;
  cue?: UiCue | null;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const lost = (n: MeterValue, p: MeterValue | undefined) =>
  p && n.fill < p.fill - 0.001 ? clamp01(0.2 + (p.fill - n.fill) * 5) : 0;

export const REACTIONS = {
  /** Meter shakes in proportion to the health lost. */
  damage: { when: lost, phase: "jolt" },
  /** Screen-edge flash in proportion to the health lost. */
  hitFlash: { when: lost, phase: "flash" },
  heal: {
    when: (n, p) => (p && n.fill > p.fill + 0.015 ? 0.6 : 0),
    phase: "pulse",
  },
  /** Super charge reached full. */
  ready: {
    when: (n, p) => (p && n.fill >= 1 && p.fill < 1 ? 1 : 0),
    phase: "burst",
  },
  /** A hazard or state became active. */
  enter: {
    when: (n, p) => (n.fill > 0 && (!p || p.fill === 0) ? 1 : 0),
    phase: "pop",
    cue: "ui_deny",
  },
  /** Edge flash when a hazard becomes active. */
  danger: {
    when: (n, p) => (n.fill > 0 && (!p || p.fill === 0) ? 0.8 : 0),
    phase: "flash",
  },
} satisfies Record<string, Reaction>;
export type ReactionName = keyof typeof REACTIONS;

export interface SignalDisplayProps {
  signal?: SignalRef<MeterValue>;
  reactions?: ReactionName[];
}

/**
 * gameKit's display binding: subscribe to the display's signal, write each
 * value through `applyMeter`, then run its reactions. Screen-shake off turns
 * jolts into pulses; reduced motion is handled by the feedback engine.
 */
export function useSignalBinding(
  ref: RefObject<HTMLElement | null>,
  _spec: DisplaySpec,
  props: DisplayBase,
) {
  const { signal, reactions } = props as DisplayBase & SignalDisplayProps;
  const key = reactions?.join() ?? "";
  useEffect(() => {
    if (!signal) return;
    const run = (next: MeterValue, prev: MeterValue | undefined) => {
      const el = ref.current;
      applyMeter(el, next);
      for (const name of reactions ?? []) {
        const r: Reaction = REACTIONS[name];
        const intensity = r.when(next, prev);
        if (intensity <= 0) continue;
        const phase = r.phase === "jolt" && !preferences.shake ? "pulse" : r.phase;
        feedback(el, phase, { intensity, cue: r.cue });
      }
    };
    run(signal.read(), undefined);
    return signal.subscribe(run);
  }, [signal, key]);
}
