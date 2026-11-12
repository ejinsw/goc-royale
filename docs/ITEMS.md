# Items framework

Items are owned by the fixed-step match authority. A match creates six pickups
at initialization, sampled within the map and away from walls, player spawns,
the Broomball kickoff, and each other. Each player has one item slot. Pickup,
drop, use, collisions, damage, and possession are decided by the authority;
clients present the resulting state and stable events. Items drop when their
carrier is eliminated or disconnects.

On a keyboard, F picks up or puts down an item, and E uses it. The match HUD
provides a pickup/put-down control and a small item joystick on touch devices;
the joystick aims and uses the item. Aim determines the direction of an item
use. A flyer is consumed when thrown; the broom is reusable after its cooldown.
Initial values are playtest starting points, not finalized balance.

## Adding an item

1. Add its name, use label, behavior kind and tuning to `ITEMS` in
   `shared/definitions.ts`. The item ID is derived from the catalogue. Reuse a
   behavior kind where possible.
2. Add it to the initialization distribution in `shared/engine.ts`.
   `createItem` constructs the common authority-owned state. For a genuinely
   new behavior, extend the relevant authority resolver and collision tests;
   do not put gameplay decisions in the renderer.
3. Extend the shared item presentation in `client/src/arena/fx.ts` and use the
   existing action graph in `client/src/arena/fighters.ts`. Keep the hit region
   derived from the same parameters as the simulation. Start local cues from
   input and reconcile against authoritative events without replaying them.
4. Cover spawning, ownership, use, collision, and networking with tests. Review
   anticipation, release, impact, and recovery in the actual game camera, and
   complete the applicable performance and device checks in
   `PERFORMANCE-AND-GAMEPLAY-STANDARDS.md`.

The current procedural sweep and throw profiles are a foundation for future
actions, not a finished animation set. The carried prop currently follows an
approximate attachment point; authored hand attachment and precisely timed
impact animation remain future work.
