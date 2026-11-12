import {
  AREAS,
  FIGHTERS,
  IDS,
  ITEMS,
  RULES,
  type FighterId,
  type ItemKind,
} from "../../../shared/definitions";

/** Local-only intent shown while an action control is held. */
export type AimIntent = "attack" | "super" | "item";

/** A stable, data-derived ground footprint. It never participates in gameplay. */
export type AimShape =
  | { kind: "lane"; range: number; width: number; coreWidth?: number }
  | { kind: "cone"; range: number; halfWidth: number }
  | { kind: "circle"; distance: number; radius: number }
  | { kind: "bar"; distance: number; length: number; thickness: number };

const attackShape = (id: FighterId): AimShape => {
  const fighter = FIGHTERS[id];
  const attack = fighter.abilities.attack;
  if (attack.kind === "cone")
    return attack.halfAngle >= Math.PI * 0.99
      ? { kind: "circle", distance: 0, radius: fighter.range }
      : {
          kind: "cone",
          range: fighter.range,
          halfWidth: Math.tan(attack.halfAngle) * fighter.range + RULES.radius,
        };
  const hitWidth = RULES.radius + (attack.width ?? 0.13);
  const spread = Math.max(0, ...(attack.spread ?? []).map(Math.abs));
  if (spread > 0)
    return {
      kind: "cone",
      range: fighter.range,
      halfWidth: Math.tan(spread) * fighter.range + hitWidth,
    };
  return {
    kind: "lane",
    range: fighter.range,
    width: hitWidth * 2,
    coreWidth: attack.centerBonus
      ? (RULES.radius + attack.centerBonus.width) * 2
      : undefined,
  };
};

const superShape = (id: FighterId): AimShape => {
  const spec = FIGHTERS[id].abilities.super;
  switch (spec.kind) {
    case "frame":
      return { kind: "lane", range: spec.range, width: spec.width };
    case "charge":
      return { kind: "lane", range: spec.distance, width: RULES.radius * 3 };
    case "shot":
      return {
        kind: "lane",
        range: spec.range,
        width: (RULES.radius + spec.width) * 2,
      };
    case "zone": {
      const area = AREAS[spec.area];
      return area.wall
        ? {
            kind: "bar",
            distance: spec.distance,
            length: area.radius * 2,
            thickness: area.wall.thickness,
          }
        : { kind: "circle", distance: spec.distance, radius: area.radius };
    }
    case "burst":
      return {
        kind: "circle",
        distance: spec.at,
        radius: Number.isFinite(spec.radius) ? spec.radius : 6,
      };
    case "leap":
      return {
        kind: "circle",
        distance: spec.distance,
        radius: spec.landing.radius,
      };
    case "rewind":
      return { kind: "circle", distance: 0, radius: spec.blast.radius };
  }
};

const SHAPES = Object.fromEntries(
  IDS.map((id) => [id, { attack: attackShape(id), super: superShape(id) }]),
) as Record<FighterId, Record<Exclude<AimIntent, "item">, AimShape>>;

const ITEM_SHAPES: Record<ItemKind, AimShape> = {
  golden_broom: {
    kind: "lane",
    range: ITEMS.golden_broom.range,
    width: ITEMS.golden_broom.width,
  },
  goc_flyer: {
    kind: "lane",
    range: ITEMS.goc_flyer.range,
    width: (RULES.radius + ITEMS.goc_flyer.width) * 2,
  },
};

/** The same authoritative dimensions drive both aim preview and item use. */
export function itemAimPreviewFor(kind: ItemKind): AimShape {
  return ITEM_SHAPES[kind];
}

/** Reuses static fighter shapes; only a charged ball lane varies per frame. */
export function aimPreviewFor(
  id: FighterId,
  intent: Exclude<AimIntent, "item">,
  carrying = false,
  power = 0.35,
): AimShape {
  if (intent === "attack" && carrying)
    return {
      kind: "lane",
      range: 5 + Math.max(0.35, Math.min(1, power)) * 7,
      width: RULES.radius * 2.2,
    };
  return SHAPES[id][intent];
}
