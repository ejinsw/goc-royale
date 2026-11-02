import type { FighterId } from "../../shared/definitions";

/**
 * Portrait art per fighter. Fighters listed here use a full-body PNG
 * (2:3, generated from supplied, approved likeness references); everyone
 * else uses the square placeholder SVG at /art/<id>.svg, which mirrors the
 * fighter's 3D look (client/src/ui/scene/fighterModels.ts).
 */
const PNG_PORTRAITS: ReadonlySet<FighterId> = new Set(["ethan", "brandon"]);

export const hasPortraitArt = (id: FighterId) => PNG_PORTRAITS.has(id);
export const fighterArt = (id: FighterId) =>
  `/art/${id}.${hasPortraitArt(id) ? "png" : "svg"}`;
