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
