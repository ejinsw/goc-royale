import type { FighterId, Mode, Vec, Wall } from "./definitions";
export interface Member {
  id: string;
  name: string;
  fighter: FighterId;
  team: 0 | 1;
  ready: boolean;
  connected: boolean;
}
export interface Lobby {
  code: string;
  host: string;
  mode: Mode;
  members: Member[];
  phase: "lobby" | "match" | "results";
}
export interface Stats {
  kills: number;
  deaths: number;
  damage: number;
  received: number;
  healing: number;
  goals: number;
  assists: number;
  survived: number;
}
export interface Player extends Member {
  pos: Vec;
  aim: Vec;
  hp: number;
  ammo: number;
  reload: number;
  charge: number;
  alive: boolean;
  respawn: number;
  protectedUntil: number;
  stunUntil: number;
  revealUntil: number;
  slow: number;
  quietSince: number;
  lastAttack: number;
  placement: number;
  stats: Stats;
}
export interface Input {
  move: Vec;
  aim: Vec;
  attack?: boolean;
  super?: boolean;
  power?: number;
}
export interface Projectile {
  id: number;
  owner: string;
  fighter: FighterId;
  pos: Vec;
  dir: Vec;
  remaining: number;
  traveled: number;
  bounces: number;
}
export interface Area {
  id: number;
  owner: string;
  kind: "welcome" | "table";
  pos: Vec;
  radius: number;
  end: number;
  hp: number;
}
export interface Effect {
  id: number;
  kind:
    | "hit"
    | "heal"
    | "cone"
    | "photo"
    | "sound"
    | "aura"
    | "glitch"
    | "van"
    | "goal"
    | "attack"
    | "eliminated";
  pos: Vec;
  dir: Vec;
  owner: string;
  value?: number;
  end: number;
}
export interface Ball {
  pos: Vec;
  velocity: Vec;
  carrier: string | null;
  state: "free" | "carried" | "flight" | "resetting";
  last: string | null;
  lockUntil: number;
  passer: string | null;
  passAt: number;
  scorer: string | null;
}
/**
 * Discrete presentation events (performance standard §6.2).
 *
 * The renderer plays each event's cue (audio, impact flash, camera impulse)
 * exactly once, keyed by the stable `id`, instead of inferring presentation
 * from state diffs. Events are authoritative output: the engine emits them from
 * the same actions that drive the simulation, but they never change the
 * simulation themselves. `tick` is the authoritative tick the event resolved
 * on; `owner` is the acting fighter where one applies.
 */
export type GameEventType =
  | "attack_started"
  | "projectile_spawned"
  | "attack_hit"
  | "heal_applied"
  | "super_started"
  | "super_resolved"
  | "ball_picked_up"
  | "ball_released"
  | "goal_scored"
  | "fighter_eliminated"
  | "fighter_respawned";
export interface GameEvent {
  id: number;
  tick: number;
  type: GameEventType;
  owner: string;
  pos: Vec;
  dir?: Vec;
  value?: number;
}
export interface Match {
  mode: Mode;
  time: number;
  phase: "countdown" | "playing" | "goal" | "finished";
  phaseUntil: number;
  players: Player[];
  projectiles: Projectile[];
  areas: Area[];
  effects: Effect[];
  events: GameEvent[];
  walls: Wall[];
  zone: number;
  score: [number, number];
  overtime: boolean;
  ball: Ball;
  winner: string | null;
  notice: string;
  tick: number;
  aliveCount: number;
}
export type Command =
  | { type: "select"; fighter: FighterId }
  | { type: "ready"; ready: boolean }
  | { type: "mode"; mode: Mode }
  | { type: "team"; id: string; team: 0 | 1 }
  | { type: "shuffle" }
  | { type: "start" }
  | { type: "lobby" }
  | { type: "input"; input: Input };
export type ClientMessage =
  | { type: "hello"; name: string; token?: string }
  | { type: "command"; command: Command }
  | { type: "ping"; at: number };
export type HostMessage =
  | { type: "welcome"; id: string; token: string; lobby: Lobby }
  | { type: "lobby"; lobby: Lobby }
  | { type: "snapshot"; match: Match }
  | { type: "error"; message: string }
  | { type: "pong"; at: number };
