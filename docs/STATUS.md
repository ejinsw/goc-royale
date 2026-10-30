# GOC Royale — implementation status

Updated October 23, 2026. This is a playable multiplayer alpha, with a production static build. The complete device, network, balance, and presentation acceptance bar in the design document has not yet been signed off.

## Decisions applied

- Product name: **GOC Royale**, including the design document.
- Seven fighters: **Brandon Kam, Daniel, Rich, Samuel, Josh, Elijah, Ethan Ha**. Brandon occupies the original controller slot with identical balance values and abilities. Surnames for Brandon and Ethan were supplied by the user; art remains fictional.
- Only Showdown FFA and 3v3 Broomball.
- Browser-host authority over WebRTC. There is no Node/Socket.IO application server or alternate server implementation.

## Implemented

- React home, original cartoon roster, character cards, private room codes and invite URLs, readiness, host controls, team assignment and shuffling, settings, results, and return-to-lobby rematches.
- PeerJS signaling and actual WebRTC data-channel participants. Fixed-step 30 Hz host simulation and 30 Hz snapshots. Guest session recovery with private tokens and grace periods. Membership, input, rate, capacity, mode, and start validation.
- Seven distinct attacks and seven Supers. Ammo/reload, effective damage and healing, Super charge, regeneration, reveal, strongest slow, stun, collision-safe knockback, dash, rollback history, destructible cover and healing stations.
- Central Lawn: cover, bushes/concealment, permanent elimination, shrinking danger zone, placement, hard time limit, spectator highlights, and stats.
- Broomball Night: three per team, possession, directional power-scaled release, interceptions, boards, goal planes, own goals, assists, carrier combat lock, forced drops, respawns, protection, kickoff, two-goal wins, regulation, golden goal, and draws.
- Phaser rendering with remote smoothing and lightweight local prediction/correction; directional aim indicator; keyboard/mouse and multi-pointer touch controls; landscape prompt; safe-area spacing; health, ammo and charge HUD; modest effects and generated audio.
- Static build, locked dependencies, setup and deployment instructions, optional TURN configuration, and font license notices.

## Verification completed

- **48 automated tests pass**. Coverage includes seven fighter kits, movement and collision, cadence/reload, health bounds, charge, status effects, rollback, zone damage, placement, ball transitions, goal/reset/overtime, room validation, reconnect identity, disconnect expiration, immutable finalized statistics, and rematch resets.
- Strict TypeScript check and production build pass. Vite reports the expected large Phaser gameplay chunk; it is loaded separately from the menu bundle.
- Real browser check: two independent WebRTC clients created/joined a room, readied up, started Showdown, observed synchronized keyboard movement, reached matching results, and rematched in the same room.
- Real browser check: six independent WebRTC clients joined Broomball with the original six fighters. Through ordinary controls the host acquired the ball, charged and released shots, scored two goals, and reached a 2–0 win. An opposing client showed the same score. A refreshed guest recovered its session and the results screen.
- Final-build browser checks also confirmed Brandon in the lobby and live match, a 390px portrait menu, the landscape prompt, and an 844px landscape layout. Pointer drags on the movement and attack sticks moved a fighter and consumed ammo. This used browser pointer input, not simultaneous physical touches.
- A WebGL framebuffer error surfaced during rapid viewport resize/teardown. The simple 2D renderer was changed to Phaser Canvas mode. A fresh two-client match, portrait/landscape changes, and leaving the match completed with no errors reported on the test client. Physical-device performance remains to be measured.
- The preceding six-client run used the controller's earlier display name. The rename to Brandon preserved its mechanics; automated tests and the production build were rerun afterward.
- A protocol integration suite exercises six participants, movement, scoring, reconnects, and rematches without contacting external signaling services. These deterministic tests are separate from the real browser checks above.

## Remaining acceptance work and deliberate simplifications

- Physical iPhone Safari and Android Chrome playtests, simultaneous multi-thumb gestures, eight real browser participants, and six separate devices have not yet been verified. Browser viewport checks cannot substitute for those tests.
- No controlled 50/100/200 ms latency or packet-loss campaign has been run. Local prediction uses correction/smoothing; it does not yet replay acknowledged/sequenced inputs as described in the full design target.
- Host tab closure/reload ends the room. There is no host migration. Background browser throttling or a suspended phone can pause or slow a match. A desktop host kept in the foreground is recommended.
- Direct WebRTC is the configured first-use path. Restrictive networks can need a TURN relay; none is bundled. Third-party signaling and STUN availability are external dependencies. No paid resources or payment details are configured, but universal free connectivity is not promised.
- Original portraits and map art are placeholders. Animation uses simple movement, rings, flashes, shapes, and text rather than full character animation sets. Music is one synthesized loop; the entire per-event/per-mode soundtrack list is not yet implemented. Accessibility and motion polish remain subject to human playtesting.
- The camera now follows the local fighter or selected survivor at 1.65x arena-fit scale. Less of the arena is visible at once.
- Targeted healing/control Supers place their area four world units along the aim direction. Terrain collision uses conservative player-vs-wall bounds and small swept substeps for fast objects.
- There are no external accounts, analytics, public matchmaking, progression, gadgets, or additional fighters/modes.

## Before a friend-group pilot

1. Deploy `dist/` to an HTTPS static URL and confirm two separate networks can connect.
2. Play one Showdown and one Broomball round with mixed iOS/Android/desktop participants.
3. Exercise mobile movement and aiming simultaneously, carrier passing/shooting, stuns/drops, and reconnect within the grace window.
4. Check host backgrounding, Wi-Fi/cellular changes, and restrictive networks. Configure a relay only if needed and after choosing its service/cost policy.
5. Tune balance and readability from observed matches. Do not treat the automated pass count as a substitute for that playtest.

Latest changes: Ethan Rizz and Aura Pulse; Brandon blue/gold palette; 30 Hz snapshots, next-frame action/movement-change sends, and shorter remote smoothing. Added tests cover twin-projectile damage, radius, ally safety, walls, charge, carrier lock, multiple knockouts, and spawn protection. Internet latency and balance are not certified by these tests.

A fresh two-tab WebRTC match verified Ethan selection, live Rizz ammo use, the enlarged arena view, and Brandon’s blue/gold avatar. The new Aura Pulse rules were verified by automated simulation tests; physical-device and controlled-latency benchmarks remain pending.

Ethan now uses the user-approved generated portrait based on supplied reference photos, in menus, lobby, results, and gameplay. Its transparent PNG is preserved at original resolution; gameplay keeps the 2:3 aspect ratio. Other fighters retain placeholder artwork.

Brandon now also uses a generated portrait based on user-provided photos: blue/gold jacket, glasses, clipboard and nametags. Both custom portraits are integrated through the shared artwork selector in roster, lobby, results and gameplay, preserving their aspect ratio. The other five fighters retain original placeholders.

Brandon 3D prototype: editable Blender source, a 2,666-triangle skinned GLB with one vertex-color material, 17 bones and ten named animation clips; separate local Three.js viewer. Browser run/Super checks and GLB structure validation completed. This is not yet the live multiplayer renderer; detailed quality/remaining work is documented in assets/3d/brandon/README.md.

Brandon 3D v0.2: 15 animation clips and a separate controllable practice scene at /art3d/play.html, using a bundle of the existing shared simulation. Browser checks verified a 700-damage marked hit, movement, and Welcome Committee healing after damage. Practice-only automatic Super refill; no multiplayer renderer migration yet.


## October 26 — Brandon v2 shape study and live sculpting

Blender 5.2.3 LTS, eight Scenario Blender skills, and Scenario extension 0.12.0 are installed. The user enabled the connection; local MCP scene inspection and Python execution succeeded. Real live Smooth brush operations ran on the new study’s sleeves and hair with no missed stroke points.

The separate `assets/3d/brandon-v2/brandon-study.blend` contains a waist-up study with continuous face, jacket/sleeve and hair surfaces, fitted spectacles, rounded cuffs and simplified hands. Studio front/profile/three-quarter renders and silhouette/matcap review sheets are in `outputs/brandon-v2/`. The three main surfaces each pass connected-component (one) and non-manifold-edge (zero) checks. The README records the visual corrections and limits.

This is an art study, not a replacement playable asset. Hair volume/part, facial likeness, collar and hands still need review. The full lower body, deformation topology, final textures, rig, animations and browser/game export remain. Existing prototype assets, gameplay code, networking and the main menu work were preserved.

## October 27 — Brandon v4 articulated movement study

The separate full-body beige-jacket study now has connected sleeve/torso and pelvis/leg meshes, a 26-bone FK skeleton, blended weights and four elbow/knee support bones. Wrist skin covers the cuff transitions. The source is saved in `assets/3d/brandon-v4/brandon-rig.blend`; the measured browser export is `client/public/art3d/brandon-v4/brandon-rig.glb`.

Open `http://localhost:5180/movement.html` on the existing art-preview server. It provides idle and joint-demo clips, timeline scrubbing, orbit, camera presets and a skeleton overlay. GLB loading, both clip selections and multiple posed views were verified in the browser. The 1.88 MB export contains 64,112 triangles and 26 bones; export/re-import comparison passes. Runtime weights have no unweighted/normalization/excess-influence flags. Sampled demo frames have no within-mesh crossings in the jacket, trousers or wrist skin.

This is **a rigged movement prototype, not approved final art or a production-ready animation set**. Extreme elbow flexion and knee-fold stress flags remain documented, numerical shoulder-volume coverage is incomplete, and planted-foot controls, individual fingers, expressions and combat/run clips are unfinished. Art polish, mobile profiling and game integration remain. See `assets/3d/brandon-v4/README.md` and `outputs/brandon-v4/runtime-deformation.json` for the exact evidence and limits. Existing game/menu/network code and previous assets were preserved.


## October 29 — shared character production documentation

The art/audio direction, pilot specification, modeling-skill guidance and Brandon briefs now point to `docs/CHARACTER_3D_PIPELINE.md`. All seven fighters share eight passes, expressive faces, articulated five-finger hands, constructed garments/folds, prop-specific grip tests, animation evidence and browser/device acceptance. Each fighter still needs an individual brief and its own validation; shared tooling does not establish shared completion.

The performance standard remains authoritative. Detailed source rigs may be richer, but runtime exports retain the section 7.3 limits: at most 40 deforming bones, 1–2 materials, preferably one skinned mesh, 512–1024px gameplay textures and at most 1 MB compressed initial fighter payload. Earlier 55–75 exported-bone / 2–4-material / 1–3 MB proposals and a 30 fps passing fallback are superseded. No budget exception is approved. Optimization must demonstrate that required expressions, grips and motion survive.

This change updates documentation only. Brandon v4 remains a movement prototype; no new character model, facial/finger rig, production animation or mobile-performance result is claimed. Runtime gameplay, networking and renderer code were not changed by this documentation work.

Documentation-update validation: all 37 local links across the eight touched documents resolve; `npm test` passes 48/48 and `npm run build` passes, with a large-chunk warning for the current gameplay bundle. These checks do not certify model quality, mobile performance or latency; those require the per-asset and runtime evidence above.

## October 29 — Performance-standards refactor (branch `refactor/performance-gameplay-standards`)

Tracking the migration toward `docs/PERFORMANCE-AND-GAMEPLAY-STANDARDS.md`. Each step is landed only when `npm test` (48 tests) and `npm run build` pass. Steps are sequenced from highest game-feel payoff and lowest risk. Authoritative gameplay rules (collision, damage, timing, visibility, scoring) are held frozen; this is presentation/architecture work only.

### Step 1 — React decoupled from the snapshot firehose (done)

Standard §5.1 requires that per-snapshot world state not live in top-level React state and that the HUD be change-driven or capped to a low frequency. Previously `setMatch(snapshot)` ran on every 30 Hz snapshot and rerendered the entire `App` tree (menus, lobby, gallery, settings, HUD).

- Added `client/src/gameStore.ts`: a mutable, ref-based `GameStore` plus a `useGameSelector` hook that samples derived values at <= ~10 Hz and only rerenders when the derived value changes.
- The network snapshot path now writes to the store and the renderer bridge only. Top-level React holds just `matchPhase`, which changes on phase transitions (countdown/playing/goal/finished), not per tick.
- Extracted `MatchHud` and `ResultsScreen` into isolated subtrees that subscribe through `useGameSelector`. A snapshot can no longer rerender the menu, lobby, gallery, or settings code paths.
- The Phaser renderer is unchanged and still reads `bridge.match` every frame, so arena visuals keep updating at the full snapshot rate. No gameplay rule, collision, damage, timing, or scoring path was touched.

Verified: `npm run typecheck`, `npm test` (48 pass), and `npm run build` all pass. Not yet verified: measured React commit profile and frame-time before/after on a real device (standard §11 React HUD row). The structural change (snapshot no longer sets top-level state) is confirmed by code; the numeric main-thread improvement still needs a profiler capture in a live match.

### Step 2 — presentation event stream (done)

Standard §6.2 calls for a dedicated, typed presentation event stream with stable IDs so the client plays each cue once across retransmission, reconnect, and reconciliation, rather than inferring presentation from state diffs.

- Added `GameEvent` / `GameEventType` to `shared/types.ts` and an `events: GameEvent[]` field to the match snapshot. Each event carries a stable id, the authoritative tick, type, owner, position, optional direction and value.
- The engine now emits the standard's named events from the same authoritative actions that drive the simulation: `attack_started`, `projectile_spawned`, `attack_hit`, `heal_applied`, `super_started`, `super_resolved`, `ball_picked_up`, `ball_released`, `goal_scored`, `fighter_eliminated`. Emission is pure output; it does not read back into or alter simulation state.
- Events are kept in a short rolling window (~15 ticks) in the snapshot so a dropped snapshot does not lose a one-shot cue; the client dedupes by stable id.
- The renderer consumes the event stream (`playEvents`) for impact layering: camera impulses scaled by event importance and distance from the viewed fighter, honoring the reduced-motion/shake setting (standard §6.1). Camera shake was moved off the visual effect stream onto these events; audio continues to play from the visual effect stream, so no cue is duplicated.
- Added four deterministic engine tests covering event ids/ticks/payloads, hit and elimination emission, broomball pickup/release, and the rolling-window prune.

Verified: `npm run typecheck`, `npm test` (52 pass, 4 new), and `npm run build` all pass. Authoritative gameplay (collision, damage, timing, scoring) unchanged — the pre-existing 48 tests still pass without modification. Not yet verified: in-game readability capture of the impact layering and reduced-motion behavior on a real device (standard §11 VFX/camera row).

### October 29 — player-count rules change (deliberate gameplay-rules edit)

User-requested change to lobby capacity and start validation. This is a rules change, explicitly requested, separate from the performance refactor steps above.

- Showdown FFA now holds **up to 10 players** (was 2–8). Added two spawn points to the Central Lawn map (8 → 10) and a modulo spawn fallback in the engine so no roster can index an undefined spawn.
- Broomball now holds **up to 6 players** (unchanged cap) but no longer requires exactly three per team or distinct fighters per team. Teams may be any split and may repeat fighters. The same-team duplicate-fighter block was removed from the `select` command.
- **No minimum player count** in either mode. A single readied host passes validation and can start. A degenerate match (e.g. a 1-player Showdown) resolves immediately via the existing last-survivor logic; this is the expected consequence of removing the minimum, not a bug.
- UI capacity readouts and mode copy updated (`10` / `6`, "no minimum"). README room rules updated. `docs/PILOT-SPEC.txt` retains its original 2–8 / exactly-6 design text as a historical supplied document; this entry records the deviation.

**Budget exception (AGENTS.md rule 6, standard §4.2/§10):** Showdown at 10 players exceeds the standard's documented 8-player outbound/scene budget by two fighters. This was an explicit user decision. The standard's 8-player budgets (<= 3 Mbps outbound, whole-scene triangle/draw-call targets) have **not** been re-measured for 10 players; snapshot bandwidth and host CPU at 10 players remain unverified and should be profiled before a real pilot at that size. Broomball stays within the existing cap.

Verified: `npm run typecheck`, `npm test` (54 pass; old exactly-6 test replaced with duplicate/uneven-team, broomball-cap, and showdown-no-minimum/10-cap tests, including an engine spawn check for 10 players), and `npm run build` all pass.

### Step 3 — input sequencing, acknowledgement, replay, and decoupled snapshot rate (done)

Standard §4.2–4.3: inputs must carry a monotonic sequence; snapshots must acknowledge the last processed sequence and carry an authoritative tick and sample time; the client must retain and replay unacknowledged inputs after a correction; remote entities render from an interpolation buffer; simulation and snapshot rates must be independent.

- `Input` gained an optional monotonic `seq`. The engine records the highest processed seq per player (`lastSeq`), tolerating absent, stale, or out-of-order values.
- `Match` gained `sampleTime` (the authoritative sim clock the snapshot represents) and a per-viewer `ackSeq` (highest processed local seq), stamped in `snapshot(viewerId)`.
- The client stamps a monotonic seq on every sent input (renderer-owned counter so it can tag its reconciliation buffer with the same value; the network layer assigns one if absent).
- The renderer retains unacknowledged local move inputs and, on each fresh snapshot, reconciles the local fighter: it drops acknowledged inputs, resets to the authoritative position, and replays the remainder through `predictStep`, which mirrors the engine's substepped movement and wall/bounds validity. Large divergences (teleport/knockback/death) accept authority directly rather than rubber-banding. Between snapshots the client leads with live input for immediate response, or eases toward authority when movement is server-forced.
- Remote fighters interpolate toward the latest authoritative sample, which absorbs the lowered snapshot rate.
- The host loop now runs the fixed 30 Hz simulation but broadcasts snapshots at ~18 Hz via an accumulator independent of the tick (standard §3, §4.2 — snapshot cadence 15–20 Hz by default). Immediate action/movement-change sends are unchanged.
- Added five tests: engine ack/sampleTime (including out-of-order and no-seq cases) and an end-to-end room test proving ackSeq/sampleTime round-trip to each client's snapshot per viewer.

Verified: `npm run typecheck`, `npm test` (57 pass, 5 new), and `npm run build` all pass. Authoritative gameplay unchanged — every pre-existing simulation/room test passes without modification.

Not yet verified (requires a running match and instrumentation, which arrive in the later steps): the controlled 50/100/200 ms RTT and loss campaign (standard §4.4), measured local-input-to-response latency, correction magnitude, and that no action double-plays or disappears under loss. The reconciliation and rate decoupling are implemented and unit-covered; their feel and latency numbers still need the dev overlay (step 6) and a live/controlled-network capture before they can be called certified.

### Step 4 — renderer: cached static scenery and resize-gated layout (done)

Standard §5.2 and the named prototype debt in §10: the Phaser Canvas arena cleared and procedurally redrew all static and dynamic scenery every frame, and camera-fit layout ran unconditionally every frame.

- Static map art (ground fill, the checkerboard grid, Showdown cream stripes and bushes, Broomball rink lines/circles/goals/border) is now drawn once per mode into a dedicated `staticLayer` Graphics in world units. Each frame that layer is only transformed (`setPosition(offset)` + `setScale(zoom)`) to match the camera, rather than re-issuing hundreds of fill calls. It rebuilds only when the mode changes.
- The dynamic graphics object now draws only genuinely dynamic scenery: the shrinking Showdown danger zone (continuous), walls (destructible), areas, projectiles, players, ball, effects, labels, and the aim indicator.
- `fit()` (camera zoom/offset) is gated by a quantized layout key (viewport size, mode, focus position to ~1/20 unit) and recomputes only when an input changes or on a forced resize, instead of every frame.
- Avatars and name/number labels remain pooled through their existing Maps; no new per-frame renderer object churn was introduced.

Verified: `npm run typecheck`, `npm test` (57 pass, unchanged — this is presentation-only, no authority touched), and `npm run build` all pass. The static layer is a scene-owned Graphics torn down with the scene; resize calls `fit(true)` and only re-transforms the cached layer.

Not yet verified (needs a live capture): before/after frame-time profile, the resize/teardown stress test, and the complete-match memory trend required by standard §5.2/§11. The per-frame draw-call reduction is structural and clear from the code (static shapes went from every-frame to once-per-mode), but the measured FPS/frame-time improvement on a target device has not been captured here.

### Step 5 — snapshot compaction: quantization and rounding (done, partial)

Standard §4.2: prefer deltas, compact schemas, quantization, and omission of unchanged data over full-precision full-state JSON at frequency.

- Added a `compact()` pass in `Engine.snapshot()` that quantizes the per-viewer wire copy: positions/aim/velocity/directions to 0.01 world units (well inside the <= 0.25-unit correction tolerance and imperceptible), sampleTime to 3 decimals, HP to integer (ceil), and charge to integer.
- It operates only on the transmitted clone, never on authoritative state, so simulation precision is preserved. A new test asserts both the quantized wire values and that the authoritative player position/HP are untouched.

Measured effect (scripted 8-player Showdown, 120 ticks of random movement with periodic attacks): a busy snapshot shrank from ~8,672 to ~7,564 serialized bytes, about **12.8%**. At 18 Hz that busy case is still roughly ~136 KB/s per client — **above** the standard's <= 75 KB/s ingress target.

Honest conclusion: quantization is a real but modest win. The dominant cost is the schema itself (full state every snapshot). Closing the gap to the 75 KB/s budget needs **delta-against-baseline encoding and omission of unchanged entities**, which is deliberately deferred as the next bandwidth step because it requires per-client baseline tracking that interacts with the per-viewer bush-concealment filter. Tracked as future work; the budget is not yet met for the worst-case 8-player scene, and 10-player Showdown (the new cap) is further over.

Verified: `npm run typecheck`, `npm test` (58 pass, 1 new), and `npm run build` all pass.
