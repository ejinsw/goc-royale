import { useEffect, useRef, useState } from "react";
import type { Match } from "../../shared/types";

/**
 * Mutable, ref-based gameplay store.
 *
 * Performance standard §5.1: per-snapshot world state MUST NOT live in
 * top-level React state. The renderer and input bridge read the authoritative
 * match through this store without triggering React work. React subscribes
 * only through derived, rate-limited selectors (see useGameSelector) so a
 * 30 Hz snapshot never rerenders the menu, lobby, gallery, or settings trees.
 */
export class GameStore {
  /** Latest authoritative match snapshot, or null when not in a match. */
  match: Match | null = null;
  private listeners = new Set<() => void>();

  /** Called by the network transport on every snapshot. No React state write. */
  setMatch(match: Match | null) {
    this.match = match;
    for (const l of this.listeners) l();
  }

  /** Clear match state (e.g. returning to lobby). */
  clear() {
    this.setMatch(null);
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

/**
 * Subscribe to a derived value from the store, sampled at a capped frequency.
 *
 * The selector runs on every snapshot, but React is only told to rerender when
 * the derived value actually changes AND the minimum interval has elapsed. This
 * keeps the HUD change-driven and bounded to <= ~10 Hz per the standard, while
 * the arena renderer continues to read the raw snapshot every frame.
 */
export function useGameSelector<T>(
  store: GameStore,
  selector: (match: Match | null) => T,
  isEqual: (a: T, b: T) => boolean = Object.is,
  minIntervalMs = 100,
): T {
  const [, forceRender] = useState(0);
  const valueRef = useRef<T>(selector(store.match));
  const lastEmitRef = useRef(0);
  const pendingRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep the returned value current for this render.
  valueRef.current = selector(store.match);

  useEffect(() => {
    const evaluate = () => {
      const next = selector(store.match);
      if (isEqual(next, valueRef.current)) return;
      valueRef.current = next;
      const now =
        typeof performance !== "undefined" ? performance.now() : Date.now();
      const elapsed = now - lastEmitRef.current;
      if (elapsed >= minIntervalMs) {
        lastEmitRef.current = now;
        forceRender((n) => n + 1);
      } else if (pendingRef.current === null) {
        pendingRef.current = setTimeout(() => {
          pendingRef.current = null;
          lastEmitRef.current =
            typeof performance !== "undefined"
              ? performance.now()
              : Date.now();
          forceRender((n) => n + 1);
        }, minIntervalMs - elapsed);
      }
    };
    const unsubscribe = store.subscribe(evaluate);
    evaluate();
    return () => {
      unsubscribe();
      if (pendingRef.current !== null) clearTimeout(pendingRef.current);
    };
    // selector/isEqual are expected to be stable (module-level) references.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, minIntervalMs]);

  return valueRef.current;
}
