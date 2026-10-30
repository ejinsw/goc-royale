export type FighterId =
  | "brandon"
  | "daniel"
  | "rich"
  | "samuel"
  | "josh"
  | "elijah"
  | "ethan";
export type Mode = "showdown" | "broomball";
export type Vec = { x: number; y: number };
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
    projectileSpeed: 22,
    attack: "Shutter Shot",
    super: "Group Photo!",
    color: "#b9a3ee",
    description: "A precision flash with bonus damage at long range.",
    superDescription:
      "Frame the crowd, then stun everyone caught in the photo.",
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
    projectileSpeed: 12,
    attack: "Munchie Toss",
    super: "Midterm Munchies",
    color: "#f5d46e",
    description: "Snacks hurt rivals and heal injured teammates.",
    superDescription:
      "Deploy a destructible snack table that heals nearby allies.",
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
    description: "A software bug ricochets once off a wall.",
    superDescription:
      "Rewind two seconds, recover up to 2,500 HP, leave an explosive glitch.",
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
    damage: 420,
    range: 8,
    projectileSpeed: 14,
    attack: "Rizz",
    super: "Aura Pulse",
    color: "#df83c8",
    description: "Strum two notes, each dealing 420 damage.",
    superDescription:
      "Instantly knock out rivals within 4 units. Walls and spawn protection block it.",
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
}
export const MAPS: Record<Mode, Arena> = {
  showdown: {
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
    ],
  },
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
  },
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
