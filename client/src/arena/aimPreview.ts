import {
  AREAS,
  FIGHTERS,
  IDS,
  ITEMS,
  RULES,
  type FighterId,
  type ItemKind,
  type WeaveSpec,
} from "../../../shared/definitions";

/** Local-only intent shown while an action control is held. */
export type AimIntent = "attack" | "super" | "item";

/**
 * A stable, data-derived ground footprint: exactly where a rival's center
 * must be for the action to hit, with the aim pointing along local +z. It
 * never participates in gameplay; tests check each fighter's footprint
 * against the authority's hits (tests/aimPreview.test.ts).
 */
export type AimShape =
  /**
   * A straight path from `from` (default 0) to `range` along the aim,
   * `width` across. `cap` rounds the far end with the hit radius, as a
   * projectile's body reach does. `tail` fans shares from the far end.
   */
  | {
      kind: "lane";
      range: number;
      width: number;
      from?: number;
      cap?: boolean;
      coreWidth?: number;
      tail?: { range: number; width: number; angles: readonly number[] };
    }
  /** An arc: within `radius` and `half` radians either side of the aim. */
  | { kind: "sector"; radius: number; half: number }
  /** One capped lane per angle (radians) off the aim. */
  | { kind: "fan"; range: number; width: number; angles: readonly number[] }
  /** Weaving flights, along the authority's own path, `width` across. */
  | {
      kind: "path";
      range: number;
      width: number;
      weave: WeaveSpec;
      paths: readonly { angle: number; side: 1 | -1 }[];
    }
  /** A capped lane that widens from `near` to `far` across. */
  | { kind: "taper"; range: number; near: number; far: number }
  | { kind: "circle"; distance: number; radius: number }
  | { kind: "bar"; distance: number; length: number; thickness: number }
  /** Reaches teammates wherever they are: nothing to aim on the ground. */
  | { kind: "global" };

/** Hit radius from a projectile's center: the body plus the shot's width. */
const reach = (width = 0.13) => RULES.radius + width;

const attackShape = (id: FighterId): AimShape => {
  const fighter = FIGHTERS[id];
  const attack = fighter.abilities.attack;
  switch (attack.kind) {
    case "cone":
      // The authority tests the rival's center: within range plus the body
      // radius, and within the half angle of the aim.
      return attack.halfAngle >= Math.PI * 0.99
        ? { kind: "circle", distance: 0, radius: fighter.range + RULES.radius }
        : { kind: "sector", radius: fighter.range + RULES.radius, half: attack.halfAngle };
    case "beam":
      return { kind: "lane", range: fighter.range, width: reach(attack.width) * 2, cap: true };
    case "lob":
      // The distance follows the held power; see aimPreviewFor.
      return { kind: "circle", distance: fighter.range, radius: attack.radius + RULES.radius };
    case "shot": {
      const w = reach(attack.width);
      const spread = attack.spread ?? [0];
      if (attack.weave) {
        // Spread shots bend away from the aim; an alternating shot may bend
        // either way, so both paths are shown.
        const paths = attack.weave.alternate
          ? spread.flatMap((angle) => [
              { angle, side: 1 as const },
              { angle, side: -1 as const },
            ])
          : spread.map((angle) => ({ angle, side: (angle < 0 ? -1 : 1) as 1 | -1 }));
        return { kind: "path", range: fighter.range, width: w * 2, weave: attack.weave, paths };
      }
      if (attack.grow)
        return {
          kind: "taper",
          range: fighter.range,
          near: w * 2,
          far: (w + attack.grow * fighter.range) * 2,
        };
      if (spread.length > 1)
        return { kind: "fan", range: fighter.range, width: w * 2, angles: spread };
      const split = attack.split;
      return {
        kind: "lane",
        range: fighter.range,
        width: w * 2,
        cap: true,
        coreWidth: attack.centerBonus
          ? (RULES.radius + attack.centerBonus.width) * 2
          : undefined,
        tail: split
          ? {
              range: split.range,
              width: reach() * 2,
              angles: Array.from(
                { length: split.count },
                (_, i) => (i - (split.count - 1) / 2) * split.spread,
              ),
            }
          : undefined,
      };
    }
  }
};

const superShape = (id: FighterId): AimShape => {
  const spec = FIGHTERS[id].abilities.super;
  switch (spec.kind) {
    case "frame":
      // A rectangle on the rival's center, no body padding.
      return { kind: "lane", range: spec.range, width: spec.width };
    case "charge":
      // Anyone within 1 unit of the van's path.
      return { kind: "lane", range: spec.distance, width: 2, cap: true };
    case "shot":
      return { kind: "lane", range: spec.range, width: reach(spec.width) * 2, cap: true };
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
      return Number.isFinite(spec.radius)
        ? { kind: "circle", distance: spec.at, radius: spec.radius }
        : { kind: "global" };
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
  // The sweep hits a rival whose body touches its rectangle.
  golden_broom: {
    kind: "lane",
    from: -RULES.radius,
    range: ITEMS.golden_broom.range + RULES.radius,
    width: ITEMS.golden_broom.width + RULES.radius * 2,
  },
  goc_flyer: {
    kind: "lane",
    range: ITEMS.goc_flyer.range,
    width: (RULES.radius + ITEMS.goc_flyer.width) * 2,
    cap: true,
  },
};

/** The same authoritative dimensions drive both aim preview and item use. */
export function itemAimPreviewFor(kind: ItemKind): AimShape {
  return ITEM_SHAPES[kind];
}

/**
 * Reuses static fighter shapes; only a charged ball lane and a lob's
 * landing circle vary per frame, both with the held power.
 */
export function aimPreviewFor(
  id: FighterId,
  intent: Exclude<AimIntent, "item">,
  carrying = false,
  power = 0.35,
): AimShape {
  const held = Math.max(0.35, Math.min(1, power));
  if (intent === "attack" && carrying)
    return {
      kind: "lane",
      range: 5 + held * 7,
      width: RULES.radius * 2.2,
    };
  const shape = SHAPES[id][intent];
  // A lob lands at the held power's share of its range, as the authority
  // resolves it.
  if (intent === "attack" && FIGHTERS[id].abilities.attack.kind === "lob" && shape.kind === "circle")
    return { ...shape, distance: FIGHTERS[id].range * held };
  return shape;
}
