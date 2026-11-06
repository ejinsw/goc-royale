# In-game 3D integration brief

**Branch:** `feature/arena-3d`
**Worktree:** `~/Documents/GitHub/goc-royale-wt/feature-arena-3d`
**Base:** `main` at `67bafc3` (the game-style UI pass)
**Status:** First integration landed on this branch (November 2, 2026). The
Phaser arena is replaced by `client/src/arena/` and `client/src/game.ts`.
The decisions taken for the open questions and the evidence produced are at
the end of this brief; device and network evidence is still missing.

## Goal

Replace the 2D Phaser arena with a 3D arena renderer, so matches are played
in 3D with real fighter models and animation instead of procedurally drawn
shapes and portraits.

## Required reading before any code

- `docs/PERFORMANCE-AND-GAMEPLAY-STANDARDS.md` — especially §3 (layer
  ownership), §5.2 (renderer rules), §6 (feedback contract), §7 (animation
  conventions and the §7.3 runtime asset budget), §11 and §12.
- `docs/CODE-PRACTICES.md` — the UI kit rules, and §7 for the one-live-
  renderer requirement and scene disposal.
- `docs/CHARACTER_3D_PIPELINE.md` — the eight production passes every
  fighter must go through.
- `assets/3d/brandon/README.md` and `assets/3d/brandon-v4/README.md` — what
  the existing models actually are and are not.

## Hard constraints

1. **One live arena renderer.** The standard forbids stacking a Phaser arena
   and a 3D arena to make the final product. The Phaser renderer in
   `client/src/game.ts` is replaced, not supplemented.
2. **One live renderer at a time, full stop.** The menu already runs a
   Three.js scene (`client/src/ui/scene/menuScene.ts`). It is disposed before
   the match mounts and recreated afterwards. Whatever the arena uses must
   keep that invariant. Note the canvas lifetime trap already hit once:
   `forceContextLoss()` permanently disables a canvas, so a renderer must own
   and replace its own canvas rather than reuse one owned by React.
3. **Authoritative gameplay is frozen.** Collision, damage, timing,
   visibility, scoring and the input protocol must not change. The engine in
   `shared/` and the host loop in `client/src/network.ts` are presentation-
   independent and stay that way.
4. **Rates stay independent** (§3): 30 Hz simulation, ~18 Hz snapshots, render
   at display rate, React HUD change-driven at ≤10 Hz. Do not couple them.
5. **Prediction is preserved.** `client/src/prediction.ts` and
   `client/src/actionPrediction.ts` already give immediate local response and
   predicted attack/Super cues. Reconciliation must not restart animations
   (§7.2).
6. **Presentation events, not state diffs.** Consume the typed `GameEvent`
   stream (`shared/types.ts`, standard §6.2) once per stable id, as the Phaser
   renderer does today in `playEvents`.

## What already exists and can be reused

- `client/src/ui/scene/geometry.ts` — primitive build, paint, merge and flip
  helpers with vertex colors.
- `client/src/ui/scene/fighterModels.ts` — procedural low-poly models for all
  seven fighters from one per-fighter look table. These are a usable arena
  placeholder before rigged assets land, and they already share one material.
- `client/public/art3d/brandon/brandon.glb` — 2,666 triangles, 17 bones, one
  vertex-color material, 15 named clips. Per the standard §7.3 this low-poly
  Brandon with the complete clip list is **the preferred integration mule**.
- `client/public/art3d/brandon-v4/brandon-rig.glb` — 64,112 triangles, 26
  bones, idle plus a joint demo. This is a deformation study, **not** a
  runtime asset, and it is far over budget.
- `client/public/art3d/engine.js`, `play.html`, `movement.html` — the existing
  standalone viewers, useful for checking a model outside the game.

## Open decisions for the user

1. **Camera.** The arena is currently a top-down 2D view at 1.65× arena-fit
   scale. A 3D arena needs a chosen camera: fixed isometric, follow-cam at a
   fixed pitch, or something closer to Brawl Stars' angled third-person. This
   changes readability and must be decided before layout work.
2. **Fighter assets.** Only Brandon has a rigged model with a clip set. The
   other six have no 3D asset. Options: ship procedural models for all seven
   first and swap them in as real assets land, or block the migration until
   more fighters are modeled.
3. **Map geometry.** `shared/definitions.ts` defines Central Lawn and
   Broomball Night as 2D rectangles, walls and spawns. 3D needs an elevation
   and art treatment for those, without changing the collision footprints.
4. **Whether the menu scene and arena share a renderer.** Sharing one
   WebGL context would avoid teardown cost, but it couples the two and risks
   the menu's geometry staying resident during a match.

## Acceptance evidence this branch must produce

Per the standard's §11 matrix, a renderer change requires a before/after frame
profile, a resize and teardown stress test, and a complete-match memory
trend. A 3D asset additionally requires a triangle/bone/material/texture
report, an external GLB load, a mobile profile, and an eight-character scene
test. Animation requires clip manifest validation, state-transition review,
and proof that reconciliation does not restart clips. None of that is
satisfied by unit tests.

Minimum gates on every commit: `npm run typecheck`, `npm test`,
`npm run build`.

## Decisions taken in the first integration (provisional)

These were taken to implement the brief. Each one is a constant or table
entry, so a different user decision is a small change.

1. **Camera:** perspective follow camera at a fixed 50° pitch, 32° vertical
   field of view, no yaw. It keeps the 2D arena's framing: the view plane at
   the followed fighter has the old 1.65× arena-fit scale, and the camera is
   clamped near field edges, with extra room on the camera side so a fighter
   at the bottom edge stays clear of the HUD. Screen up is always map up, so
   stick, keyboard and mouse directions are unchanged. Mouse aim is picked
   per frame on a chest-height plane. `CAMERA` in `client/src/arena/view.ts`.
2. **Fighter assets:** all 18 fighters use the menu's shared procedural
   `LOOKS` models, merged into one rigidly skinned mesh each, with the same
   15-clip set authored as code. Brandon intentionally uses this path too;
   the experimental Brandon GLBs are not selected by the live runtime. A
   future approved fighter can move to a real asset through one `GLB_ASSETS`
   entry in `client/src/arena/fighters.ts` after manifest, art, animation,
   budget, and device review.
3. **Map geometry:** flat ground. Stone walls 1.15 tall, wooden crates 0.9,
   bush clumps 0.95 (the one the viewed fighter stands in fades), hedge and
   boards outside the bounds, goals behind the mouths. Every footprint is read
   from `MAPS` and `match.walls`; collision is unchanged.
4. **Renderer sharing:** not shared. The arena creates and owns its canvas
   and WebGL context and releases everything on teardown; the menu scene is
   disposed before it mounts and recreated after.

## Evidence produced so far

See `docs/STATUS.md`, November 2, 2026. In short: real WebRTC matches in
headless Chromium (software rendering) for both modes, an eight-peer
eight-fighter scene, a 40-step resize stress, five match-to-menu teardown
cycles with a heap census, import-time clip manifest and budget validation,
and counters showing reconciliation never restarted a local one-shot.
Still missing: physical-device mobile profiles, a complete-match memory
trend, controlled-network runs with the renderer in the loop, and art review
of the procedural clip set.
