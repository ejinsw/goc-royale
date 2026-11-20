# Fishers of Men

**Branch:** `feature/fishers-of-men`
**Worktree:** `~/Documents/GitHub/goc-royale-wt/feature-fishers-of-men`
**Base:** `origin/main` at `e6f86b5`
**Status:** Implemented November 20, 2026: the functionality pass (first
verified on Central Lawn's geometry with a dock in the middle), then a
slightly larger lakeside map, since replaced by Bruin Plaza, a much larger
UCLA campus map around Ackerman Union. Values are first-pass and need a
human playtest.

## Goal

A third mode built on the Fisherman's Team motto ("fishers of men"): an
infection game. The pilot specification lists additional modes as out of
scope (§2.2); this mode was an explicit user decision, like the full ministry
roster.

## Rules

| Rule | Value |
|---|---|
| Players | Up to 10, no minimum (as Showdown) |
| Map | Bruin Plaza, 60 x 40 (Central Lawn is 36 x 24) |
| Starting Fishers | 25% of the party, rounded, at least one, chosen at random by the host. Lobby teams are ignored. |
| Sides | Team 0 = Fish (still free), team 1 = Fishers. Each side is a team of allies: no friendly fire, and heals and shields help teammates. |
| Start | Fishers around the Bruin Bear in the middle; Fish on the map's spawn points around the edge. |
| Catching | A Fish eliminated by anything joins the Fishers at once. Its catcher gets a catch. Its projectiles, placed areas, thrown items and pending Super windups are withdrawn so they cannot change sides. |
| Respawn | Fishers (including newly caught Fish) come back after 2 s at the point by the Bruin Bear farthest from living Fish that no one is standing on, with the normal 1.5 s spawn protection. Fish never come back as Fish. |
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
  two, the Fishers' points around the Bruin Bear). Item placement avoids them.
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
  "Back in N · At the Bruin Bear, as a Fisher" while respawning. Team rings and
  name glyphs use the Broomball blue/red treatment, and names are tinted by
  side (light blue Fish, red Fishers), so a caught Fish visibly switches
  sides. Results lead with "N fish got away!" or "Everyone got
  caught!", and the top catcher is starred.

## Bruin Plaza

UCLA's central campus around Ackerman Union, as an original low-poly
interpretation built from primitives (no photo texture, traced geometry or
scanned asset), like the menu plaza. Bruin Walk runs east-west and Westwood
Plaza north-south; they cross at Bruin Plaza, where the Fishers gather
around the Bruin Bear.

| Where | What |
|---|---|
| Middle | Bruin Plaza: brick pavers and the Bruin Bear on its plinth (solid cover) |
| South-east | Ackerman Union, and Kerckhoff Hall (brick, arched windows, a tower) beyond it |
| South-west | Pauley Pavilion |
| North-west | The John Wooden Center, and the JD Morgan Center beyond it |
| North-east | The Student Activities Center |
| Bruin Walk | Club tables along both sides, brick planters with lamps down the middle |
| Westwood Plaza | A campus shuttle parked on each side of the plaza |
| Beyond the east edge | Janss Steps, with Royce Hall's twin towers beside their top |
| Beyond the west edge | Stairs climbing to the Hill |

```
.........%%....x.........................s..%%%%............
..s......%%............................##############.....s.
..######....############......#........##############.......
..######....############%%....#....%%..##############..%%%..
..######....############%%....#....%%..##############..%%%..
..######....############...............##############.......
...%%%%%................................................x...
...%%%%%........s......%%%........%%%.......................
............##....##..........D.............##....##........
......##........##...........##...........##........##......
....s.##........##.........D.##.D.........##........##..s...
........##....##..............D.........##....##............
.......................%%%........%%%...............%%%%%...
...x........................................s.......%%%%%...
.......##############...............############....######..
..%%%..##############..%%....#....%%############....######..
..%%%..##############..%%....#....%%############....######..
.......##############........#......############....######..
.......##############............................%%.........
..s.........%%%%..s.........................x....%%.......s.
```

(Generated from `MAPS.fishing`, one column per unit and one row per two
units, north at the top: `#` building or cover, `x` crate, `%` bush, `D` the
Fishers' respawn points around the Bear, `s` Fish spawn.)

- **2.8x Central Lawn's area** in the same 3:2 proportions: about a 12 s run
  across at normal speed.
- **Fair under a half turn**, as Central Lawn is, so footprints pair up:
  Ackerman with the Wooden Center, Pauley with the Student Activities
  Center, Kerckhoff with the JD Morgan Center, and each shuttle and table
  with another. The art differs; the gameplay shapes do not.
- **Wall ids name the art** (`ackerman`, `bear`, `bus0`, `table3`...), so
  footprints still come only from `MAPS` and the art cannot drift from
  collision.
- **Buildings never hide fighters.** The camera always looks north, so each
  building is a body at cover height whose tall part is its south facade,
  the side the camera sees. Nothing on a building rises more than 0.6 per
  unit south of its north face (`sightLimit` in `client/src/arena/map.ts`),
  which sight lines clear even at the top of the screen. There are no trees
  or canopies inside the field.
- **No faces fighting for depth.** Ground layers (paths, road, pavers,
  rings) sit on a fixed ladder 0.002 apart below the fighters' shadows, caps
  stand proud of what they cap, and facade details step out from the wall.
  `tests/mapArt.test.ts` fails if any two visible faces of different color
  share a plane and overlap.
- **Fish start at least 8 units from the Bear** on ten spawns around the
  edge; nobody starts in a bush. Sixteen bushes (planting beds) give the Fish
  places to hide.
- **Same framing.** `Arena.frame` makes the camera fit Central Lawn's
  36 x 24, so fighters are the same size on screen; the extra field is off
  screen until a fighter goes there.
- `tests/maps.test.ts` checks every map: half-turn symmetry, wall gaps wider
  than a fighter, nothing overlapping a bush, every spawn and respawn a free
  standing spot, and every open spot reachable from the spawns.

## Verification

See `docs/STATUS.md` (November 20, 2026 — Fishers of Men).

## Open items

- **Map balance.** Bruin Plaza passed geometric checks only. With 2.8x the
  ground, 2:30 may be too short for the Fishers, and the Bruin Walk and
  Westwood Plaza sightlines may be too long or too exposed. Watch whether
  the corners behind Kerckhoff and the JD Morgan Center are too safe for the
  last Fish.
- **No minimap.** On a field this size a player can lose track of where
  they are; the HUD has no map or edge indicators.
- **Balance.** 25% starters, 2 s respawn, +10% Fisher speed and 2:30 are
  guesses. Watch for Fish turtling as a group early, Fishers spawn-camped on
  the Bear, and the last Fish kiting the clock out.
- **Presentation debt.** The catch has no authored animation clip; it uses
  the existing elimination reaction plus the new effect, consistent with
  standard §10.
- **Physical devices and controlled latency** were not exercised for this mode.
