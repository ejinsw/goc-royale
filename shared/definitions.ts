export type FighterId =
  | "brandon"
  | "daniel"
  | "rich"
  | "samuel"
  | "josh"
  | "elijah"
  | "ethan"
  | "david"
  | "dylan"
  | "isaac"
  | "tovya"
  | "rosalie"
  | "joelle"
  | "susannah"
  | "joyce"
  | "miriam"
  | "jemuel"
  | "russell"
  | "brandon_n";
export type Mode = "showdown" | "broomball" | "fishing";
export type Vec = { x: number; y: number };

/** Shared simulation item catalogue. Behavior is resolved by kind, not item ID. */
export const ITEMS = {
  golden_broom: {
    name: "Golden broom",
    useLabel: "Sweep",
    kind: "sweep",
    range: 3.8,
    /** Full width perpendicular to aim. */
    width: 6.6,
    knock: 3,
    ballSpeed: 14,
    cooldown: 0.9,
  },
  goc_flyer: {
    name: "GOC flyer",
    useLabel: "Throw",
    kind: "throw",
    range: 9,
    speed: 14,
    damage: 800,
    width: 0.18,
  },
} as const;
export type ItemKind = keyof typeof ITEMS;

/**
 * Fighter abilities are data (pilot spec §14.2, docs/CODE-PRACTICES.md §1.3).
 * shared/engine.ts has one resolver per `kind` and never branches on a
 * fighter id, so a new fighter is a new row in FIGHTERS that composes the
 * existing kinds and options. Add an option or a kind only when no
 * combination of the existing ones expresses the ability.
 *
 * A basic attack's damage, range and projectile speed are the fighter's
 * top-level `damage`, `range` and `projectileSpeed`.
 */
export type AttackSpec = ShotSpec | ConeSpec | BeamSpec | LobSpec;

/**
 * A weaving flight path: the shot's center line advances along its
 * heading, and the shot itself sits `amp` units to the side at most,
 * repeating every `wavelength` units of travel (see `weaveOffset`).
 */
export interface WeaveSpec {
  amp: number;
  wavelength: number;
  /** A sharp triangle wave instead of a sine: a glitchy zigzag. */
  zigzag?: boolean;
  /** Each shot bends the other way first. Spread shots bend away from the aim. */
  alternate?: boolean;
}

/** Projectiles: one per `spread` angle, optionally fired as a timed burst. */
export interface ShotSpec {
  kind: "shot";
  /** Angles (radians) off the aim, one projectile each. Default [0]. */
  spread?: number[];
  /** Fire the volley `count` times per ammo, `gap` seconds apart. */
  burst?: { count: number; gap: number };
  /** Hit radius beyond the target's body. Default 0.13. */
  width?: number;
  /** Wall ricochets before the projectile breaks. */
  bounces?: number;
  /** Passes through rivals, hitting each one once. */
  pierce?: boolean;
  /** Flies back after full range and can hit everyone again on the way. */
  returns?: boolean;
  /** Turns toward the nearest visible rival ahead, up to this rate (rad/s). */
  homing?: number;
  /**
   * Aimbot: every step it turns straight at the nearest visible rival in
   * reach, whichever way it was fired. Cover, range and spawn protection
   * still stop it, and it cannot see a rival hidden in a bush.
   */
  seek?: boolean;
  /** Seconds a hit rival stays visible inside bushes. */
  reveal?: number;
  /** Bonus damage inside a narrower, clearly presented center hit radius. */
  centerBonus?: { width: number; damage: number };
  /** Drags a hit rival this far toward the shooter. Not a knockback. */
  tug?: number;
  /** Slows a hit rival (the strongest slow applies). */
  slow?: { amount: number; duration: number };
  /** Share of the damage dealt returned to the shooter as health. */
  lifesteal?: number;
  /** Flies a wavy path instead of a straight line. */
  weave?: WeaveSpec;
  /** Hit radius gained per unit traveled: a wave that widens as it goes. */
  grow?: number;
  /**
   * On a rival hit, or at full range, bursts into `count` smaller shots
   * fanned `spread` radians apart, each flying `range` for `damage`. They
   * skip the rival the parent hit and never split again.
   */
  split?: { count: number; spread: number; range: number; damage: number };
}

/** An instant cone (or full ring) from the fighter; hits each rival once. */
export interface ConeSpec {
  kind: "cone";
  /** Half the cone angle in radians; Math.PI is a full ring. */
  halfAngle: number;
}

/**
 * An instant line after a visible windup. The aim is fixed on the press;
 * the line fires from where the fighter stands when the windup ends, hits
 * the first rival along it and stops at cover. A stun or a ball pickup
 * during the windup cancels it.
 */
export interface BeamSpec {
  kind: "beam";
  windup: number;
  /** Hit radius beyond the target's body. */
  width: number;
  /** Bonus damage when the hit lands past `from` of the full range. */
  farBonus?: { from: number; damage: number };
}

/**
 * Thrown in an arc over cover to a point along the aim, bursting on
 * landing. The landing point is shown to everyone while it flies. The
 * distance is the attack's power (hold or drag) share of the fighter's
 * range, 35% to 100%, at the fighter's projectile speed.
 */
export interface LobSpec {
  kind: "lob";
  /** Splash radius around the landing point, beyond the target's body. */
  radius: number;
  /** Injured teammates in the splash recover this much. */
  healAllies?: number;
}

/**
 * Lateral offset of a weaving shot after `traveled` units: positive is to
 * the left of its heading. Zero at every multiple of half a wavelength, so
 * a ricochet can restart the wave without a visible jump. Shared by the
 * authority (hit tests) and the renderer (drawn position).
 */
export function weaveOffset(w: WeaveSpec, traveled: number) {
  const u = traveled / w.wavelength;
  if (!w.zigzag) return w.amp * Math.sin(2 * Math.PI * u);
  const f = u - Math.floor(u);
  return w.amp * (f < 0.25 ? f * 4 : f < 0.75 ? 2 - f * 4 : f * 4 - 4);
}

/**
 * Where a shot actually flies: its center line `pos`, bent sideways by its
 * weave. `side` (+1 or -1) says which way it bends first.
 */
export function shotPoint(
  pos: Vec,
  dir: Vec,
  traveled: number,
  weave: WeaveSpec | undefined,
  side = 1,
): Vec {
  if (!weave) return pos;
  const off = weaveOffset(weave, traveled) * side;
  return { x: pos.x - dir.y * off, y: pos.y + dir.x * off };
}

/**
 * A circle of effects. Effects on rivals need line of sight from the
 * center; effects on teammates (the caster included) do not.
 */
export interface BurstSpec {
  radius: number;
  /** "knockout" removes all remaining health, shield included. */
  damage?: number | "knockout";
  stun?: number;
  /** Push rivals this far away from the center. */
  knock?: number;
  /** Drag rivals to the center instead of pushing them out. */
  pull?: boolean;
  /** Empty rivals' ammo; they reload as normal. */
  drain?: boolean;
  /** Teammates recover this much health. */
  heal?: number;
  /** Teammates get a shield that absorbs damage first. */
  shield?: { amount: number; duration: number };
  /** Teammates take no damage for this long. */
  protect?: number;
}

/**
 * A cinematic pause before a Super resolves. The match clock stops for
 * everyone for its length, so nothing in the simulation advances, and the
 * Super then resolves on the tick it was cast. Presentation fills the pause.
 */
export interface CutsceneSpec {
  /** Full length (s). */
  seconds: number;
  /** Shorter length (s) for a repeat, or when the caster asks for brevity. */
  again: number;
  /** A cast within this many match seconds of the caster's last one repeats. */
  window: number;
}

export type SuperSpec =
  /** Place an area object `distance` units along the aim (see AREAS). */
  | { kind: "zone"; area: AreaKind; distance: number }
  /** A rectangle along the aim, after an optional visible windup. */
  | {
      kind: "frame";
      windup: number;
      range: number;
      width: number;
      damage: number;
      stun: number;
      knock: number;
      /** Push perpendicular to aim, away from the rectangle's center line. */
      sideKnock?: number;
      slow?: { amount: number; duration: number };
      effect: "photo" | "sound" | "gaze";
    }
  /** Wind up, then charge along the aim, hitting each rival once. */
  | {
      kind: "charge";
      windup: number;
      distance: number;
      speed: number;
      damage: number;
      knock: number;
    }
  /** Return to the position from `seconds` ago and leave a blast behind. */
  | { kind: "rewind"; seconds: number; heal: number; blast: BurstSpec }
  /**
   * A burst on the caster (`at` 0) or thrown `at` units along the aim. A
   * thrown burst lands after `delay` with a visible marker. It stops at
   * cover unless `overWalls` (a lob).
   */
  | ({
      kind: "burst";
      at: number;
      delay?: number;
      overWalls?: boolean;
      effect?: "aura";
      /** Pause the match for a cutscene first (only with `at` 0). */
      cutscene?: CutsceneSpec;
    } & BurstSpec)
  /** Jump `distance` along the aim over cover, landing with a burst. */
  | { kind: "leap"; distance: number; air: number; landing: BurstSpec }
  /** A Super projectile; `swap` trades places with the rival it hits. */
  | {
      kind: "shot";
      speed: number;
      range: number;
      damage: number;
      width: number;
      swap?: boolean;
      stun?: number;
    };

/** Area objects a Super can place: zones, stations, companions, walls. */
export type AreaKind = "welcome" | "table" | "panda" | "barrier";
export interface AreaSpec {
  /** Effect radius (world units); a barrier's half length. */
  radius: number;
  /** Lifetime (s). */
  duration: number;
  /** Destructible: enemy shots and cones damage it. */
  hp?: number;
  /** How close an enemy shot must pass to hit it. */
  hitRadius?: number;
  /** Health per second for the owner's teammates inside the radius. */
  heal?: number;
  /** Movement slow for rivals inside the radius. */
  slow?: number;
  /** Removed when its owner is eliminated. */
  bound?: boolean;
  /**
   * A companion: walks to the nearest visible rival within `sight` and
   * deals `damage` every `every` seconds within `reach`. Its damage is Super
   * damage, so it does not charge the owner's Super.
   */
  chase?: {
    speed: number;
    sight: number;
    reach: number;
    damage: number;
    every: number;
  };
  /** A wall across the aim that stops enemy shots, not movement or the ball. */
  wall?: { thickness: number };
}
export const AREAS: Record<AreaKind, AreaSpec> = {
  welcome: { radius: 3.5, duration: 5, heal: 220, slow: 0.3 },
  table: { radius: 3, duration: 6, hp: 2000, hitRadius: 0.65, heal: 350 },
  panda: {
    radius: 0.7,
    duration: 12,
    hp: 3600,
    hitRadius: 0.75,
    bound: true,
    chase: { speed: 5.4, sight: 9, reach: 1.15, damage: 500, every: 0.8 },
  },
  barrier: { radius: 2, duration: 6, hp: 3000, wall: { thickness: 0.5 } },
};

export interface Fighter {
  id: FighterId;
  name: string;
  team: string;
  role: string;
  hp: number;
  speed: number;
  ammo: number;
  reload: number;
  damage: number;
  range: number;
  projectileSpeed: number;
  attack: string;
  super: string;
  color: string;
  description: string;
  superDescription: string;
  attackSound?: "mixed_voice";
  /** Super charge gained per point of damage dealt or healing given. Default 1. */
  chargeRate?: number;
  /** How the attack and Super resolve on the authority. */
  abilities: { attack: AttackSpec; super: SuperSpec };
}
export const FIGHTERS: Record<FighterId, Fighter> = {
  brandon: {
    id: "brandon",
    name: "Brandon",
    team: "Welcome & Follow-Up",
    role: "Controller",
    hp: 5700,
    speed: 5.2,
    ammo: 3,
    reload: 1.3,
    damage: 700,
    range: 8,
    projectileSpeed: 12,
    attack: "Nametag Toss",
    super: "Welcome Committee",
    color: "#417bc2",
    description: "Throw a nametag. Mark enemies for 4 seconds.",
    superDescription: "A welcoming circle slows enemies and heals allies.",
    abilities: {
      attack: { kind: "shot", reveal: 4 },
      super: { kind: "zone", area: "welcome", distance: 4 },
    },
  },
  daniel: {
    id: "daniel",
    name: "Daniel",
    team: "Rides",
    role: "Tank",
    hp: 8200,
    speed: 4.6,
    ammo: 3,
    reload: 1.6,
    damage: 330,
    range: 5.5,
    projectileSpeed: 13,
    attack: "Key Toss",
    super: "Full Carpool",
    color: "#83b5ef",
    description: "Five keys. One close-range problem.",
    superDescription:
      "Wind up, then charge in a van. Knock enemies aside and break crates.",
    abilities: {
      attack: { kind: "shot", spread: [-0.25, -0.125, 0, 0.125, 0.25] },
      super: {
        kind: "charge",
        windup: 0.3,
        distance: 10,
        speed: 22,
        damage: 1400,
        knock: 2,
      },
    },
  },
  rich: {
    id: "rich",
    name: "Rich",
    team: "Media",
    role: "Marksman",
    hp: 4600,
    speed: 5.2,
    ammo: 2,
    reload: 1.7,
    damage: 1350,
    range: 11,
    projectileSpeed: 0,
    attack: "Shutter Shot",
    super: "Group Photo!",
    color: "#b9a3ee",
    description:
      "Focus for a blink, then fire an instant flash down the line. Bonus damage at long range.",
    superDescription:
      "Frame the crowd, then stun everyone caught in the photo.",
    abilities: {
      attack: {
        kind: "beam",
        windup: 0.2,
        width: 0.16,
        farBonus: { from: 0.8, damage: 200 },
      },
      super: {
        kind: "frame",
        windup: 0.35,
        range: 8,
        width: 5,
        damage: 900,
        stun: 0.75,
        knock: 0,
        effect: "photo",
      },
    },
  },
  samuel: {
    id: "samuel",
    name: "Samuel",
    team: "Care",
    role: "Healer",
    hp: 5900,
    speed: 5.2,
    ammo: 3,
    reload: 1.4,
    damage: 800,
    range: 7.5,
    projectileSpeed: 11,
    attack: "Munchie Toss",
    super: "Midterm Munchies",
    color: "#f5d46e",
    description:
      "Lob a snack bag over cover. It bursts on landing: rivals get hurt, teammates get fed.",
    superDescription:
      "Deploy a destructible snack table that heals nearby allies.",
    abilities: {
      attack: { kind: "lob", radius: 1.2, healAllies: 850 },
      super: { kind: "zone", area: "table", distance: 4 },
    },
  },
  josh: {
    id: "josh",
    name: "Josh",
    team: "Sound",
    role: "Artillery",
    hp: 5600,
    speed: 5.2,
    ammo: 3,
    reload: 1.5,
    damage: 950,
    range: 6.5,
    projectileSpeed: 0,
    attack: "Feedback Burst",
    super: "Soundcheck!",
    color: "#f5a474",
    description: "A wide sound cone hits every enemy in its path.",
    superDescription:
      "A huge sound blast pierces enemies and pushes them back.",
    abilities: {
      attack: { kind: "cone", halfAngle: Math.PI / 9 },
      super: {
        kind: "frame",
        windup: 0,
        range: 10,
        width: 4,
        damage: 1400,
        stun: 0,
        knock: 3,
        effect: "sound",
      },
    },
  },
  elijah: {
    id: "elijah",
    name: "Elijah",
    team: "Web",
    role: "Trickster",
    hp: 5100,
    speed: 5.8,
    ammo: 3,
    reload: 1.3,
    damage: 750,
    range: 8,
    projectileSpeed: 14,
    attack: "Bug Report",
    super: "Production Rollback",
    color: "#77d5b9",
    description: "A glitching bug zigzags across the floor and ricochets once.",
    superDescription:
      "Rewind two seconds, recover up to 2,500 HP, leave an explosive glitch.",
    abilities: {
      attack: {
        kind: "shot",
        bounces: 1,
        weave: { amp: 0.55, wavelength: 2.4, zigzag: true },
      },
      super: {
        kind: "rewind",
        seconds: 2,
        heal: 2500,
        blast: { radius: 3, damage: 1200 },
      },
    },
  },
  ethan: {
    id: "ethan",
    name: "Ethan",
    team: "Music",
    role: "Burst",
    hp: 5400,
    speed: 5.2,
    ammo: 3,
    reload: 1.4,
    damage: 2000,
    range: 8,
    projectileSpeed: 14,
    attack: "Rizz",
    super: "Aura Pulse",
    color: "#df83c8",
    description:
      "Strum two notes that spiral around each other, each dealing 2,000 damage.",
    superDescription:
      "Instantly knock out rivals within 4 units. Walls and spawn protection block it.",
    abilities: {
      attack: {
        kind: "shot",
        spread: [-0.03, 0.03],
        weave: { amp: 0.32, wavelength: 3.2 },
      },
      super: {
        kind: "burst",
        at: 0,
        radius: 4,
        damage: "knockout",
        effect: "aura",
        cutscene: { seconds: 3.8, again: 1.2, window: 20 },
      },
    },
  },
  david: {
    id: "david",
    name: "David",
    team: "Music",
    role: "Vocal Controller",
    hp: 5500,
    speed: 5.2,
    ammo: 3,
    reload: 1.4,
    damage: 500,
    range: 8,
    projectileSpeed: 13,
    attack: "Mixed Voice",
    super: "Side Eye",
    color: "#4f7fd1",
    description:
      "Blend two vocal layers. The bright center deals bonus damage.",
    superDescription:
      "A judging gaze shoves rivals sideways and briefly slows them.",
    attackSound: "mixed_voice",
    abilities: {
      attack: {
        kind: "shot",
        width: 0.32,
        centerBonus: { width: 0.04, damage: 400 },
      },
      super: {
        kind: "frame",
        windup: 0.4,
        range: 6.5,
        width: 4.5,
        damage: 750,
        stun: 0,
        knock: 0,
        sideKnock: 1.6,
        slow: { amount: 0.25, duration: 1 },
        effect: "gaze",
      },
    },
  },
  dylan: {
    id: "dylan",
    name: "Dylan",
    team: "Fisherman's",
    role: "Catcher",
    hp: 6000,
    speed: 5.2,
    ammo: 3,
    reload: 1.5,
    damage: 720,
    range: 7.5,
    projectileSpeed: 15,
    attack: "Line Cast",
    super: "Fishers of Men",
    color: "#2a8fd6",
    description: "Cast a hook that reels rivals a step closer.",
    superDescription:
      "Throw a net. Everyone caught is dragged to the middle and stunned.",
    abilities: {
      attack: { kind: "shot", tug: 1.2 },
      super: {
        kind: "burst",
        at: 4.5,
        delay: 0.4,
        radius: 3,
        damage: 500,
        pull: true,
        stun: 0.8,
      },
    },
  },
  isaac: {
    id: "isaac",
    name: "Isaac",
    team: "Admin",
    role: "Defender",
    hp: 6200,
    speed: 5.2,
    ammo: 3,
    reload: 1.5,
    damage: 330,
    range: 8,
    projectileSpeed: 18,
    attack: "Stapler",
    super: "Room Setup",
    color: "#8d6e63",
    description: "Three staples in a quick burst per shot.",
    superDescription:
      "Set up folding tables that block enemy shots for 6 seconds.",
    abilities: {
      attack: { kind: "shot", burst: { count: 3, gap: 0.09 } },
      super: { kind: "zone", area: "barrier", distance: 1.8 },
    },
  },
  tovya: {
    id: "tovya",
    name: "Tovya",
    team: "Homeless Outreach",
    role: "Brawler",
    hp: 7600,
    speed: 5.2,
    ammo: 3,
    reload: 1.2,
    damage: 1050,
    range: 2.6,
    projectileSpeed: 0,
    attack: "Ladle Swing",
    super: "Dinner's Ready!",
    color: "#9ead2c",
    description: "A wide close-range swing hits everyone in front.",
    superDescription: "Leap over cover and slam down, knocking rivals back.",
    abilities: {
      attack: { kind: "cone", halfAngle: 0.96 },
      super: {
        kind: "leap",
        distance: 6,
        air: 0.5,
        landing: { radius: 2.5, damage: 1200, knock: 1.5 },
      },
    },
  },
  rosalie: {
    id: "rosalie",
    name: "Rosalie",
    team: "Welcome & Follow-Up",
    role: "Summoner",
    hp: 5400,
    speed: 5.2,
    ammo: 3,
    reload: 1.4,
    damage: 760,
    range: 6.5,
    projectileSpeed: 13,
    attack: "Warm Welcome",
    super: "Follow-Up Panda",
    color: "#e8553a",
    description:
      "A welcome wave that widens as it rolls out and passes through every rival.",
    superDescription: "Throw out a giant red panda that chases rivals down.",
    abilities: {
      attack: { kind: "shot", pierce: true, width: 0.18, grow: 0.1 },
      super: { kind: "zone", area: "panda", distance: 3 },
    },
  },
  joelle: {
    id: "joelle",
    name: "Joelle",
    team: "Rides",
    role: "Skirmisher",
    hp: 5000,
    speed: 5.8,
    ammo: 3,
    reload: 1.4,
    damage: 560,
    range: 7,
    projectileSpeed: 13,
    attack: "Round Trip",
    super: "Mix It Up",
    color: "#ffb300",
    description: "A throw that flies out and back, hitting on both legs.",
    superDescription: "Swap places with the first rival hit and stun them.",
    abilities: {
      attack: { kind: "shot", pierce: true, returns: true },
      super: {
        kind: "shot",
        speed: 20,
        range: 9,
        damage: 500,
        width: 0.2,
        swap: true,
        stun: 0.5,
      },
    },
  },
  susannah: {
    id: "susannah",
    name: "Susannah",
    team: "Media",
    role: "Thrower",
    hp: 4800,
    speed: 5.2,
    ammo: 3,
    reload: 1.5,
    damage: 720,
    range: 8,
    projectileSpeed: 14,
    attack: "Share Post",
    super: "Merch Drop",
    color: "#ff6f91",
    description:
      "A post that goes viral: on a hit or at full range it splits into three shares.",
    superDescription: "Lob a bundle of tees over cover. It bursts on landing.",
    abilities: {
      attack: {
        kind: "shot",
        split: { count: 3, spread: 0.55, range: 3, damage: 360 },
      },
      super: {
        kind: "burst",
        at: 6,
        delay: 0.6,
        overWalls: true,
        radius: 2.3,
        damage: 1300,
        knock: 1.5,
      },
    },
  },
  joyce: {
    id: "joyce",
    name: "Joyce",
    team: "Care",
    role: "Support",
    hp: 5300,
    speed: 5.2,
    ammo: 3,
    reload: 1.4,
    damage: 700,
    range: 8.5,
    projectileSpeed: 11,
    attack: "Care Note",
    super: "Christmas Grams",
    color: "#2e9e5b",
    description: "A paper-plane note that curves toward rivals.",
    superDescription:
      "Heal yourself and every teammate 1,800 HP wherever they are, plus 1 s of protection.",
    abilities: {
      attack: { kind: "shot", homing: 2.6 },
      super: { kind: "burst", at: 0, radius: Infinity, heal: 1800, protect: 1 },
    },
  },
  miriam: {
    id: "miriam",
    name: "Miriam",
    team: "Prayer",
    role: "Peacekeeper",
    hp: 5200,
    speed: 5.2,
    ammo: 3,
    reload: 1.4,
    damage: 680,
    range: 8,
    projectileSpeed: 12,
    attack: "Peace Dove",
    super: "Be Still",
    color: "#7e57c2",
    description:
      "A dove glides out in a gentle arc and slows rivals by 30% for 1.5 seconds.",
    superDescription: "Stun every rival around you for 1.25 seconds.",
    abilities: {
      attack: {
        kind: "shot",
        slow: { amount: 0.3, duration: 1.5 },
        weave: { amp: 0.45, wavelength: 16, alternate: true },
      },
      super: { kind: "burst", at: 0, radius: 3.5, damage: 400, stun: 1.25 },
    },
  },
  jemuel: {
    id: "jemuel",
    name: "Jemuel",
    team: "Prayer",
    role: "Guardian",
    hp: 6800,
    speed: 5.2,
    ammo: 3,
    reload: 1.5,
    damage: 900,
    range: 2.8,
    projectileSpeed: 0,
    attack: "Morning Light",
    super: "Prayer Covering",
    color: "#c2185b",
    description: "A ring of light hits every rival close around you.",
    superDescription:
      "Shield yourself and nearby teammates from 2,000 damage for 6 seconds.",
    abilities: {
      attack: { kind: "cone", halfAngle: Math.PI },
      super: {
        kind: "burst",
        at: 0,
        radius: 4.5,
        shield: { amount: 2000, duration: 6 },
      },
    },
  },
  russell: {
    id: "russell",
    name: "Russell",
    team: "Finance",
    role: "Disruptor",
    hp: 5500,
    speed: 5.2,
    ammo: 3,
    reload: 1.4,
    damage: 760,
    range: 8,
    projectileSpeed: 14,
    attack: "Reimbursement",
    super: "Budget Cuts",
    color: "#7cb342",
    description: "Coins that refund 35% of their damage as health.",
    superDescription: "Rivals around you take damage and lose all their ammo.",
    abilities: {
      attack: { kind: "shot", lifesteal: 0.35 },
      super: { kind: "burst", at: 0, radius: 4.5, damage: 700, drain: true },
    },
  },
  brandon_n: {
    id: "brandon_n",
    name: "Brandon Nguyen",
    team: "Rides",
    role: "UCLA Swiper",
    hp: 5400,
    speed: 5.2,
    ammo: 3,
    reload: 1.15,
    damage: 340,
    range: 11,
    projectileSpeed: 15,
    attack: "Card Swipe",
    super: "Swipe You In",
    color: "#2d6fc0",
    description:
      "Fling three meal cards that lock onto the nearest rival in reach. They do not miss.",
    superDescription:
      "All-you-can-eat: heal yourself and nearby teammates 1,200 HP, plus a 600 shield for 4 seconds. Charges 20% faster.",
    // His Super is ready after about 4,170 damage instead of 5,000.
    chargeRate: 1.2,
    abilities: {
      attack: { kind: "shot", spread: [-0.17, 0, 0.17], seek: true },
      super: {
        kind: "burst",
        at: 0,
        radius: 4,
        heal: 1200,
        shield: { amount: 600, duration: 4 },
        cutscene: { seconds: 3.8, again: 1.2, window: 20 },
      },
    },
  },
};
export const IDS = Object.keys(FIGHTERS) as FighterId[];
export const RULES = {
  tick: 30,
  radius: 0.42,
  superCharge: 5000,
  healDelay: 4,
  healRate: 0.12,
  attackInterval: 0.32,
  respawn: 3,
  protection: 1.5,
};
/**
 * Per-mode rules as data, read by the authority, the room and the client
 * alike, so a mode is a row here rather than a branch at every call site.
 */
export interface ModeRules {
  name: string;
  /** Lobby chip label when `name` is too long for it. */
  short?: string;
  capacity: number;
  /** Regulation length (s) after the 3 s countdown. */
  length: number;
  /** Same-team fighters are allies: no friendly fire, shared heals. */
  teams: boolean;
  /** Seconds until an eliminated fighter is back; null means out for the match. */
  respawn: number | null;
  /** Movement speed multiplier by team. */
  teamSpeed?: readonly [number, number];
}
export const MODES: Record<Mode, ModeRules> = {
  showdown: {
    name: "Showdown",
    capacity: 10,
    length: 210,
    teams: false,
    respawn: null,
  },
  broomball: {
    name: "Broomball",
    capacity: 6,
    length: 150,
    teams: true,
    respawn: RULES.respawn,
  },
  fishing: {
    name: "Fishers of Men",
    short: "Fishers",
    capacity: 10,
    length: 150,
    teams: true,
    respawn: 2,
    teamSpeed: [1, 1.1],
  },
};
export const isMode = (m: unknown): m is Mode =>
  typeof m === "string" && Object.hasOwn(MODES, m);
/**
 * Fishers of Men (infection): team 0 are the Fish still free, team 1 the
 * Fishers. A caught Fish joins the Fishers. First-pass playtest values.
 */
export const FISH = 0;
export const FISHERS = 1;
export const FISHING = {
  /** Share of the party that starts as Fishers (rounded, at least one). */
  starters: 0.25,
};
/** A fighter's movement speed before slows, in this mode and on this team. */
export const moveSpeed = (mode: Mode, p: { fighter: FighterId; team: 0 | 1 }) =>
  FIGHTERS[p.fighter].speed * (MODES[mode].teamSpeed?.[p.team] ?? 1);
export interface Wall {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  hp?: number;
}
export interface Arena {
  w: number;
  h: number;
  walls: Wall[];
  bushes: { x: number; y: number; w: number; h: number }[];
  spawns: Vec[];
  /**
   * Where each team comes back in modes that respawn; the point farthest
   * from living rivals is used. Fishers of Men also starts its Fishers here.
   */
  respawns?: readonly [Vec[], Vec[]];
  /**
   * The area the camera fits to the screen; the whole field by default. A
   * larger field keeps Central Lawn's frame so fighters stay the same size.
   */
  frame?: { w: number; h: number };
}
const LAWN: Arena = {
  w: 36,
  h: 24,
  walls: [
    { id: "a", x: 8, y: 7, w: 3, h: 1 },
    { id: "b", x: 25, y: 16, w: 3, h: 1 },
    { id: "c", x: 8, y: 16, w: 3, h: 1 },
    { id: "d", x: 25, y: 7, w: 3, h: 1 },
    { id: "e", x: 16, y: 9, w: 1, h: 2 },
    { id: "f", x: 19, y: 13, w: 1, h: 2 },
    ...[
      [12, 5],
      [23, 18],
      [12, 18],
      [23, 5],
    ].map(([x, y], i) => ({ id: "crate" + i, x, y, w: 1, h: 1, hp: 1800 })),
  ],
  bushes: [
    { x: 4, y: 10, w: 3, h: 4 },
    { x: 29, y: 10, w: 3, h: 4 },
    { x: 14, y: 3, w: 4, h: 2 },
    { x: 18, y: 19, w: 4, h: 2 },
  ],
  spawns: [
    { x: 3, y: 3 },
    { x: 33, y: 21 },
    { x: 33, y: 3 },
    { x: 3, y: 21 },
    { x: 18, y: 3 },
    { x: 18, y: 21 },
    { x: 3, y: 12 },
    { x: 33, y: 12 },
    { x: 10, y: 12 },
    { x: 26, y: 12 },
  ],
};
/** Where the Fishers start and come back: around the Bruin Bear. */
const BEAR: Vec[] = [
  { x: 30, y: 17.3 },
  { x: 27.3, y: 20 },
  { x: 32.7, y: 20 },
  { x: 30, y: 22.7 },
];
/**
 * Bruin Plaza, Fishers of Men's field: UCLA's central campus around Ackerman
 * Union, an original low-poly interpretation. Bruin Walk runs east-west and
 * Westwood Plaza north-south, crossing at the Bruin Bear. Ackerman Union and
 * Kerckhoff Hall stand to the south-east, Pauley Pavilion to the south-west,
 * the John Wooden Center and JD Morgan Center to the north-west and the
 * Student Activities Center to the north-east; Janss Steps close Bruin Walk's
 * east end. 2.8x Central Lawn's area in the same proportions, and the same
 * under a half turn (so Ackerman's footprint is the Wooden Center's,
 * Pauley's is the Student Activities Center's, and so on). Wall ids name the
 * art the client draws for them.
 */
const BRUIN_PLAZA: Arena = {
  w: 60,
  h: 40,
  frame: { w: LAWN.w, h: LAWN.h },
  walls: [
    { id: "ackerman", x: 36, y: 28, w: 12, h: 8 },
    { id: "wooden", x: 12, y: 4, w: 12, h: 8 },
    { id: "kerckhoff", x: 52, y: 29, w: 6, h: 7 },
    { id: "morgan", x: 2, y: 4, w: 6, h: 7 },
    { id: "pauley", x: 7, y: 28, w: 14, h: 9 },
    { id: "sac", x: 39, y: 3, w: 14, h: 9 },
    { id: "bear", x: 29, y: 19, w: 2, h: 2 },
    { id: "bus0", x: 28.5, y: 30, w: 2, h: 5.5 },
    { id: "bus1", x: 29.5, y: 4.5, w: 2, h: 5.5 },
    // Club tables along both sides of Bruin Walk.
    ...[
      [8, 23.2],
      [14, 23.2],
      [40, 23.2],
      [46, 23.2],
      [49.6, 16],
      [43.6, 16],
      [17.6, 16],
      [11.6, 16],
    ].map(([x, y], i) => ({ id: "table" + i, x, y, w: 2.4, h: 0.8 })),
    // Brick planters down the middle of Bruin Walk.
    ...[6, 16, 42.4, 52.4].map((x, i) => ({ id: "planter" + i, x, y: 19.2, w: 1.6, h: 1.6 })),
    ...[
      [44, 38],
      [15, 1],
      [3, 26],
      [56, 13],
      [24.5, 34],
      [34.5, 5],
    ].map(([x, y], i) => ({ id: "crate" + i, x, y, w: 1, h: 1, hp: 1800 })),
  ],
  bushes: [
    { x: 34, y: 30, w: 2, h: 4 },
    { x: 24, y: 6, w: 2, h: 4 },
    { x: 52, y: 25, w: 5, h: 2 },
    { x: 3, y: 13, w: 5, h: 2 },
    { x: 23, y: 30, w: 2, h: 3 },
    { x: 35, y: 7, w: 2, h: 3 },
    { x: 2, y: 31, w: 3, h: 3 },
    { x: 55, y: 6, w: 3, h: 3 },
    { x: 49, y: 37, w: 2, h: 2 },
    { x: 9, y: 1, w: 2, h: 2 },
    { x: 12, y: 38, w: 4, h: 1.6 },
    { x: 44, y: 0.4, w: 4, h: 1.6 },
    { x: 34, y: 23.5, w: 3, h: 2 },
    { x: 23, y: 14.5, w: 3, h: 2 },
    { x: 23, y: 23.5, w: 3, h: 2 },
    { x: 34, y: 14.5, w: 3, h: 2 },
  ],
  spawns: [
    { x: 2, y: 2 },
    { x: 58, y: 38 },
    { x: 58, y: 2 },
    { x: 2, y: 38 },
    { x: 4, y: 20 },
    { x: 56, y: 20 },
    { x: 18.5, y: 38.8 },
    { x: 41.5, y: 1.2 },
    { x: 44, y: 26 },
    { x: 16, y: 14 },
  ],
  respawns: [BEAR, BEAR],
};
export const MAPS: Record<Mode, Arena> = {
  showdown: LAWN,
  broomball: {
    w: 34,
    h: 20,
    walls: [],
    bushes: [],
    spawns: [
      { x: 4, y: 10 },
      { x: 7, y: 5 },
      { x: 7, y: 15 },
      { x: 30, y: 10 },
      { x: 27, y: 5 },
      { x: 27, y: 15 },
    ],
    respawns: [[{ x: 4, y: 10 }], [{ x: 30, y: 10 }]],
  },
  fishing: BRUIN_PLAZA,
};
export const add = (a: Vec, b: Vec): Vec => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y });
export const mul = (a: Vec, n: number): Vec => ({ x: a.x * n, y: a.y * n });
export const length = (a: Vec) => Math.hypot(a.x, a.y);
export const distance = (a: Vec, b: Vec) => length(sub(a, b));
export const clamp = (n: number, a: number, b: number) =>
  Math.max(a, Math.min(b, n));
export const unit = (a: Vec): Vec =>
  length(a) > 0 ? mul(a, 1 / length(a)) : { x: 1, y: 0 };
export function finiteVec(v: unknown): v is Vec {
  return (
    !!v &&
    typeof v === "object" &&
    Number.isFinite((v as Vec).x) &&
    Number.isFinite((v as Vec).y) &&
    Math.abs((v as Vec).x) < 1e5 &&
    Math.abs((v as Vec).y) < 1e5
  );
}
export function segmentDistance(p: Vec, a: Vec, b: Vec) {
  const v = sub(b, a);
  const t = clamp(
    ((p.x - a.x) * v.x + (p.y - a.y) * v.y) / (v.x * v.x + v.y * v.y || 1),
    0,
    1,
  );
  return distance(p, add(a, mul(v, t)));
}
