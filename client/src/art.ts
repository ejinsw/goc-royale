import type { FighterId } from "../../shared/definitions";

/** Square roster art mirrors the procedural 3D look for every fighter. */
export const fighterArt = (id: FighterId) => `/art/${id}.svg`;
