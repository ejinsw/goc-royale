import type { FighterId } from "../../shared/definitions";

export const hasPortraitArt = (id: FighterId) =>
  id === "ethan" || id === "brandon";
export const fighterArt = (id: FighterId) =>
  `/art/${id}.${hasPortraitArt(id) ? "png" : "svg"}`;
