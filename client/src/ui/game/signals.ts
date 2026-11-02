import { FIGHTERS, MAPS, RULES, distance } from "../../../../shared/definitions";
import type { Match } from "../../../../shared/types";
import type { GameStore } from "../../gameStore";
import type { MeterValue } from "../core/display";

/**
 * Live values for gameKit displays (docs/CODE-PRACTICES.md §6). A signal
 * derives one value from the mutable GameStore and notifies subscribers only
 * when it changes. Subscribers write to the DOM directly; nothing here calls
 * a React state setter, so snapshot-rate values never rerender React.
 */
export interface SignalRef<T> {
  read(): T;
  subscribe(onChange: (next: T, prev: T | undefined) => void): () => void;
}

export function matchSignal<T>(
  store: GameStore,
  select: (match: Match | null) => T,
  equal: (a: T, b: T) => boolean = Object.is,
): SignalRef<T> {
  let value = select(store.match);
  const listeners = new Set<(next: T, prev: T | undefined) => void>();
  let detach: (() => void) | null = null;
  const evaluate = () => {
    const next = select(store.match);
    if (equal(next, value)) return;
    const prev = value;
    value = next;
    for (const l of listeners) l(next, prev);
  };
  return {
    read: () => value,
    subscribe(onChange) {
      if (!detach) {
        value = select(store.match);
        detach = store.subscribe(evaluate);
      }
      listeners.add(onChange);
      return () => {
        listeners.delete(onChange);
        if (!listeners.size && detach) {
          detach();
          detach = null;
        }
      };
    },
  };
}

export const meterEqual = (a: MeterValue, b: MeterValue) =>
  a.fill === b.fill &&
  a.text === b.text &&
  a.count === b.count &&
  a.partial === b.partial &&
  a.state === b.state;

/** Quantize so tiny reload progress changes do not touch the DOM. */
const step = (v: number, q: number) => Math.round(v / q) * q;

/** The local fighter's live HUD values. */
export function createHudSignals(store: GameStore, selfId: string) {
  const self = (m: Match | null) => m?.players.find((p) => p.id === selfId);
  const center = { x: MAPS.showdown.w / 2, y: MAPS.showdown.h / 2 };
  return {
    hp: matchSignal<MeterValue>(
      store,
      (m) => {
        const p = self(m);
        if (!p) return { fill: 0, text: "0" };
        const max = FIGHTERS[p.fighter].hp;
        const hp = Math.max(0, Math.ceil(p.hp));
        const fill = hp / max;
        return { fill, text: String(hp), state: fill <= 0.3 ? "critical" : "" };
      },
      meterEqual,
    ),
    ammo: matchSignal<MeterValue>(
      store,
      (m) => {
        const p = self(m);
        if (!p) return { fill: 0, count: 0, partial: 0 };
        const f = FIGHTERS[p.fighter];
        return {
          fill: p.ammo / f.ammo,
          count: p.ammo,
          partial: p.ammo < f.ammo ? step(Math.min(1, p.reload / f.reload), 0.05) : 0,
          state: p.ammo === 0 ? "empty" : "",
        };
      },
      meterEqual,
    ),
    charge: matchSignal<MeterValue>(
      store,
      (m) => {
        const p = self(m);
        const c = p?.charge ?? 0;
        const full = c >= RULES.superCharge;
        return {
          fill: step(Math.min(1, c / RULES.superCharge), 0.01),
          text: full ? "SUPER" : `${Math.floor(c / 50)}%`,
          state: m?.ball.carrier === selfId ? "locked" : full ? "full" : "",
        };
      },
      meterEqual,
    ),
    /** fill 1 while the local fighter stands outside the Showdown safe zone. */
    zone: matchSignal<MeterValue>(
      store,
      (m) => {
        const p = self(m);
        if (!m || m.mode !== "showdown" || !p?.alive || m.phase !== "playing")
          return { fill: 0 };
        const outside = distance(p.pos, center) > m.zone;
        return { fill: outside ? 1 : 0, state: outside ? "danger" : "" };
      },
      meterEqual,
    ),
  };
}
export type HudSignals = ReturnType<typeof createHudSignals>;
