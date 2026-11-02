import { useEffect, useState } from "react";

/**
 * Orientation for menu layout decisions. Re-renders only when portrait and
 * landscape flip, never per resize event. Menus only; the match HUD lays out
 * through CSS and the touch router.
 */
export function usePortrait() {
  const query = "(orientation: portrait)";
  const [portrait, setPortrait] = useState(() => matchMedia(query).matches);
  useEffect(() => {
    const mq = matchMedia(query);
    const on = () => setPortrait(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return portrait;
}
