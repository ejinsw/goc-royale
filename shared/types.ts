import type {
  AreaKind,
  FighterId,
  ItemKind,
  Mode,
  Vec,
  Wall,
} from "./definitions";
export interface Member {
  id: string;
  name: string;
  fighter: FighterId;
  team: 0 | 1;
  ready: boolean;
  connected: boolean;
  /** Played by the room's bot brain (shared/bot.ts), not a connection. */
  bot?: boolean;
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
  /** One carried item, identified in Match.items. */
  heldItem: number | null;
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
  /** Effective movement slow this tick: the strongest active slow. */
  slow: number;
  /** A timed slow from an attack, active until slowUntil. */
  slowBy: number;
  slowUntil: number;
  /** Damage absorbed before health, until shieldUntil. */
  shield: number;
  shieldUntil: number;
  /** Mid-Super (a leap): no movement input or attacks until then. */
  busyUntil: number;
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
  itemPickup?: boolean;
  itemDrop?: boolean;
  itemUse?: boolean;
  power?: number;
  /** Ask for the short cutscene when this input casts a Super that has one. */
  brief?: boolean;
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
/** Authority-owned pickup or thrown item. */
export interface Item {
  id: number;
  kind: ItemKind;
  pos: Vec;
  state: "ground" | "carried" | "flight";
  carrier: string | null;
  owner: string | null;
  dir: Vec;
  remaining: number;
  cooldownUntil: number;
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
  /** Rivals already hit on this leg (piercing shots). */
  hit?: string[];
  /** On the return leg of a returning shot. */
  back?: boolean;
  /** Fired by a Super: uses the fighter's Super spec, never charges. */
  super?: boolean;
  /** A weaving shot's first bend: +1 to the left of its heading, -1 right. */
  side?: 1 | -1;
  /** Lobbed in an arc over cover; bursts where `remaining` runs out. */
  lob?: boolean;
  /** A share from a split shot: smaller, and it never splits again. */
  shard?: boolean;
}
export interface Area {
  id: number;
  owner: string;
  kind: AreaKind;
  pos: Vec;
  radius: number;
  end: number;
  hp: number;
  /** Facing: a barrier's normal, a companion's heading. */
  dir?: Vec;
  /** A companion's next attack time. */
  next?: number;
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
    | "eliminated"
    /** A Super burst ring; value = radius. */
    | "burst"
    /** Where a thrown Super will land; value = radius. */
    | "marker"
    /** A beam: value 0 is the windup tell, value > 0 the fired line's length. */
    | "beam"
    /** Where a lob will land (pos); value = splash radius. */
    | "lob"
    /** A lob burst on landing; value = splash radius. */
    | "splash"
    /** A shot split into shares at pos; value = how many. */
    | "split"
    /** Two fighters traded places: from pos along dir for value units. */
    | "swap"
    /** A companion's swipe. */
    | "panda"
    /** Where a leap lands; value = landing radius. */
    | "leap"
    /** David's center-hit harmony and Side Eye warning/release. */
    | "harmony"
    | "gaze";
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
  | "fighter_respawned"
  | "item_picked_up"
  | "item_dropped"
  | "item_used"
  | "item_hit";
export interface GameEvent {
  id: number;
  tick: number;
  type: GameEventType;
  owner: string;
  pos: Vec;
  dir?: Vec;
  value?: number;
  itemKind?: ItemKind;
  /** Input sequence that requested this action, for prediction reconciliation. */
  inputSeq?: number;
  /** Fighter affected, when an event has a specific player target. */
  target?: string;
}
export interface Match {
  mode: Mode;
  time: number;
  phase: "countdown" | "playing" | "cutscene" | "goal" | "finished";
  /**
   * A Super's cinematic pause (phase "cutscene"). `time` does not advance
   * while it runs; `left` counts down from `total` in real seconds.
   */
  cutscene: { owner: string; left: number; total: number } | null;
  phaseUntil: number;
  players: Player[];
  items: Item[];
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
  /** Pick a fighter; the host may pick for a bot by passing its `id`. */
  | { type: "select"; fighter: FighterId; id?: string }
  /** Host: add a bot, optionally as a given fighter. */
  | { type: "bot"; fighter?: FighterId }
  | { type: "ready"; ready: boolean }
  | { type: "mode"; mode: Mode }
  | { type: "team"; id: string; team: 0 | 1 }
  | { type: "kick"; id: string }
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
  | { type: "removed"; message: string }
  | { type: "pong"; at: number };
