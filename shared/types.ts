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
  /**
   * Monotonically increasing per-client input sequence (standard §4.3).
   * Optional for backward compatibility; the authority records the highest
   * value it has processed and echoes it back as `Match.ackSeq` so the client
   * can discard acknowledged inputs and replay the rest after a correction.
   */
  seq?: number;
  /**
   * Client clock (seconds, monotonic) when this input became active. When
   * present, the authority consumes movement from the client's input timeline
   * at a bounded rate instead of applying only the newest move each tick.
   */
  t?: number;
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
  /**
   * Authoritative sample time (seconds) this snapshot represents — the sim
   * clock. Remote entities interpolate from a short buffer keyed on this value
   * rather than packet arrival time (standard §4.3).
   */
  sampleTime: number;
  /**
   * The highest local input sequence the authority had processed for the
   * recipient when this snapshot was produced (standard §4.3). Per-viewer.
   */
  ackSeq: number;
  /**
   * Point on the recipient's own input timeline (client clock, seconds) up
   * to which the authority has applied movement. The client replays its
   * timeline from here to now. 0 when no timestamped input has been applied.
   */
  ackTime: number;
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
  | { type: "ping"; at: number }
  /** Guest lost its delta baseline; host sends a full keyframe next. */
  | { type: "resync" };
export type HostMessage =
  | { type: "welcome"; id: string; token: string; lobby: Lobby }
  | { type: "lobby"; lobby: Lobby }
  /** Full snapshot. `n` numbers the per-connection stream for deltas. */
  | { type: "snapshot"; match: Match; n?: number }
  /** Snapshot `n` encoded against snapshot `base` (see shared/delta.ts). */
  | { type: "delta"; n: number; base: number; diff: unknown }
  | { type: "error"; message: string }
  | { type: "pong"; at: number };
