# Fishers of Men

**Branch:** `feature/fishers-of-men`
**Worktree:** `~/Documents/GitHub/goc-royale-wt/feature-fishers-of-men`
**Base:** `origin/main` at `e6f86b5`
**Status:** Implemented November 20, 2026: the functionality pass (first
verified on Central Lawn's geometry with a dock in the middle), then
Lakeside, the mode's own slightly larger map. Values are first-pass and need
a human playtest.

## Goal

A third mode built on the Fisherman's Team motto ("fishers of men"): an
infection game. The pilot specification lists additional modes as out of
scope (§2.2); this mode was an explicit user decision, like the full ministry
roster.

## Rules

| Rule | Value |
|---|---|
| Players | Up to 10, no minimum (as Showdown) |
| Map | Lakeside, 42 x 28 (Central Lawn is 36 x 24) |
| Starting Fishers | 25% of the party, rounded, at least one, chosen at random by the host. Lobby teams are ignored. |
| Sides | Team 0 = Fish (still free), team 1 = Fishers. Each side is a team of allies: no friendly fire, and heals and shields help teammates. |
| Start | Fishers on the dock in the middle; Fish on the map's spawn points. |
| Catching | A Fish eliminated by anything joins the Fishers at once. Its catcher gets a catch. Its projectiles, placed areas, thrown items and pending Super windups are withdrawn so they cannot change sides. |
| Respawn | Fishers (including newly caught Fish) come back after 2 s on the dock point farthest from living Fish, with the normal 1.5 s spawn protection. Fish never come back as Fish. |
| Speed | Fishers move 10% faster (`MODES.fishing.teamSpeed`). |
| Vision | Bushes hide rivals unless the viewer or a living teammate is within 2.5 units. The last Fish cannot hide. |
| Win | Fishers: every Fish caught. Fish: at least one free when 2:30 runs out. |
| Placement | Free Fish first (by health, then damage), then caught Fish from last caught to first, then starting Fishers by catches. |
| No zone | There is no shrinking circle; the timer pressures the Fishers. |

1 player: one Fisher and no Fish, so the match ends immediately, like a
one-player Showdown.

## How it is built

- **Modes are data.** `MODES` in `shared/definitions.ts` holds every mode's
  name (and a short lobby label), capacity, length, whether teammates are allies, respawn delay and
  per-team speed. The engine, room, lobby, HUD, arena and touch aim read it
  instead of testing `mode === "broomball"`. Showdown and Broomball keep
  exactly their previous values; all pre-existing tests pass unmodified
  except the item-spawn test, which now also covers fishing.
- `moveSpeed(mode, player)` is the one movement-speed rule, used by the
  authority's timeline consumer and by client prediction, so a faster Fisher
  is not corrected every snapshot.
- `Arena.respawns` gives each team its respawn points (Broomball's existing
  two, the Fishers' dock). Item placement avoids them.
- Concealment is now map-driven (Broomball Night has no bushes) and
  team-aware. Showdown's visibility rule is unchanged, because a Showdown
  viewer's only teammate is itself.
- `Match.score` carries `[Fish free, Fishers]` in this mode. The HUD cannot
  count teams from the snapshot because hidden Fish are filtered out of it.
- `Stats.catches`, a `caught` effect (splash plus a line reeling the Fish to
  its catcher, with a ratchet-and-splash cue) and a `fighter_caught` event
  (owner = catcher, target = caught Fish) are new. `winner` is `"fish"` or
  `"fishers"`.
- HUD: `▲ N FISH` / `M FISHERS ◆` beside the clock, a role badge
  (`▲ YOU'RE A FISH · STAY FREE` or `◆ YOU'RE A FISHER · CATCH THEM`), and
  "Back in N · On the dock, as a Fisher" while respawning. Team rings and
  name glyphs use the Broomball blue/red treatment, so a caught Fish visibly
  switches sides. Results lead with "N fish got away!" or "Everyone got
  caught!", and the top catcher is starred.

## Lakeside

The field is a lawn running out into a lake: sand and a rope line on the
three water sides, a hedge and trees on the camera side, and a pier with a
moored rowboat off the far edge. Its area is 1.36x Central Lawn's, in the
same 3:2 proportions.

```
..........................................
...s........%%%%.....s....%%%%.........s..
...............x..........................
........####...............x..####........
.......s....%%............................
..........#........####...................
....%%%...#.....#....D...#.........%%%....
..s.%%%.........#...DD...#.....#...%%%..s.
...................####........#..........
............................%%.....s......
........####..x...............####........
..........................x...............
...s........%%%%.....s....%%%%.........s..
..........................................
```

(Generated from `MAPS.fishing`, one column per unit and one row per two
units, north at the top: `#` wall, `x` crate, `%` bush, `D` the Fishers'
dock, `s` Fish spawn.)

- **Fair under a half turn.** Walls, crates, bushes, spawns and the dock map
  onto themselves rotated 180 degrees, as Central Lawn's do.
- **The dock ring.** Four short walls surround the dock with open corners, so
  Fishers leave it in four directions and Fish cannot shoot onto it from
  across the field.
- **Fish start at least 8 units from the dock** on ten spawns around the
  edge; nobody starts in a bush.
- **Cover on every flank:** four long cover lines, two short walls, four
  crates and eight bushes.
- **Same framing.** `Arena.frame` makes the camera fit Central Lawn's
  36 x 24, so fighters are the same size on screen; the extra field is off
  screen until a fighter goes there (the camera already follows the fighter).
- `tests/maps.test.ts` checks every map: half-turn symmetry, wall gaps wider
  than a fighter, nothing overlapping a bush, every spawn and respawn a free
  standing spot, and every open spot reachable from the spawns.

## Verification

See `docs/STATUS.md` (November 20, 2026 — Fishers of Men).

## Open items

- **Map balance.** Lakeside's layout passed geometric checks only. Watch
  whether the dock ring's corners make Fishers predictable, and whether the
  far corners are too safe for the last Fish now that the field is larger.
- **Balance.** 25% starters, 2 s respawn, +10% Fisher speed and 2:30 are
  guesses. Watch for Fish turtling as a group early, Fishers spawn-camped on
  the dock, and the last Fish kiting the clock out.
- **Presentation debt.** The catch has no authored animation clip; it uses
  the existing elimination reaction plus the new effect, consistent with
  standard §10.
- **Physical devices and controlled latency** were not exercised for this mode.
