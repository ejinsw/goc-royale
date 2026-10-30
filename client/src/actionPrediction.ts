import { RULES } from "../../shared/definitions";
import type { Match, Player } from "../../shared/types";

/**
 * Predicted action presentation (standard §4.1, §6): decide on the input
 * frame whether a local attack/Super is plausible, so its release cue plays
 * immediately instead of after a network round trip. Presentation only:
 * damage, ammo, cooldowns and Super charge stay authoritative.
 *
 * Kept free of Phaser/DOM for unit testing.
 */
export type PredictedAttack = "attack" | "release";

/** Unconfirmed predictions older than this were mispredicted (s). */
const CONFIRM_WINDOW = 1;
/** Minimum spacing between repeated Super anticipation cues (s). */
const SUPER_CUE_SPACING = 0.5;

export class ActionPredictor {
  /** Client times (s) of predicted attacks not yet confirmed by the host. */
  pending: number[] = [];
  private lastAttackAt = -Infinity;
  private lastSuperAt = -Infinity;

  private canAct(self: Player | undefined, match: Match, paused: boolean): self is Player {
    return (
      !paused &&
      !!self?.alive &&
      match.phase === "playing" &&
      match.time >= self.stunUntil
    );
  }

  private expire(now: number) {
    while (this.pending.length && now - this.pending[0] > CONFIRM_WINDOW)
      this.pending.shift();
  }

  /**
   * Called when the local attack input is sent. Returns the cue to play now,
   * or null when the authority would reject it (stunned, no ammo after
   * counting unconfirmed shots, or inside the attack interval).
   */
  tryAttack(
    self: Player | undefined,
    match: Match,
    now: number,
    paused: boolean,
  ): PredictedAttack | null {
    if (!this.canAct(self, match, paused)) return null;
    // A carrier's attack input passes/shoots the ball (Engine.attack).
    if (match.ball.carrier === self.id) return "release";
    this.expire(now);
    if (self.ammo - this.pending.length < 1) return null;
    if (now - this.lastAttackAt < RULES.attackInterval) return null;
    this.pending.push(now);
    this.lastAttackAt = now;
    return "attack";
  }

  /**
   * Called once per authoritative attack effect owned by the local fighter.
   * Returns true when it confirms a prediction, so its cue must not replay.
   */
  confirmAttack(now: number): boolean {
    this.expire(now);
    if (!this.pending.length) return false;
    this.pending.shift();
    return true;
  }

  /** Called when the local Super input is sent; true to play anticipation. */
  trySuper(self: Player | undefined, match: Match, now: number, paused: boolean): boolean {
    if (!this.canAct(self, match, paused)) return false;
    if (self.charge < RULES.superCharge || match.ball.carrier === self.id) return false;
    if (now - this.lastSuperAt < SUPER_CUE_SPACING) return false;
    this.lastSuperAt = now;
    return true;
  }

  reset() {
    this.pending = [];
    this.lastAttackAt = -Infinity;
    this.lastSuperAt = -Infinity;
  }
}
