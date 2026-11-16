## Main menu restoration — October 29, 2026

The unfinished home-menu JSX on main was restored to the previously verified
menu implementation, matching the existing stylesheet and leaving simulation,
network transport, renderer, audio, fighter balance and assets unchanged. The
interrupted redesign remains in Git history at d569d61 and on the independent
refactor branch. Broomball mode selection remains available inside the lobby.

Verification: clean npm ci, all 48 tests and production build passed. Two real
browser tabs on one computer created/joined an invite, selected Daniel/Ethan,
readied, launched Showdown, and observed movement in both directions; no browser
warning/error logs. At 1280x720 the play button is within y=580..635; at 390x844
it is within y=507..561, height 54.5px, with no horizontal overflow. Input height
is 51px. Existing native keyboard buttons/inputs retained. No runtime rate,
asset budget or authoritative rule changed. Physical touch/safe-area devices,
controlled latency/loss, reduced-motion/audio campaigns and p95 performance
remain unverified by this restoration; this is not certification of prototype
performance debt. The standard's section 13 runtime/latency questions retain
their existing limitations; the player-facing improvement here is access to the
play action without thousands of pixels of scrolling.

Vercel configuration now specifies npm ci, tests before production build, dist
output, immutable hashed assets, revalidating HTML/unversioned assets, and SPA
fallback. The existing Vercel project is connected to ejinsw/goc-royale.

---

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

[REDACTED — deprecated 3D study] Historical prototype measurements and browser
checks are retained in Git history and the adjacent archived README. This asset
is not a live runtime candidate.

[REDACTED — deprecated 3D study] The former standalone practice scene is
disabled and now displays a redaction notice.


## October 26 — [REDACTED] deprecated v2 3D study

The former standalone v2 study and its measurements are redacted and retained
only as historical repository evidence. It is not approved art, a likeness
reference, or a runtime candidate. See `docs/BRANDON-3D-REDACTED.md`.

## October 27 — [REDACTED] deprecated v4 3D study

The former standalone v4 study, browser viewer, and measurements are redacted
and retained only as historical repository evidence. Direct viewer routes now
show a static redaction notice and load no model. The study is not approved
art, a likeness reference, or a runtime candidate. See
`docs/BRANDON-3D-REDACTED.md`.


## October 29 — shared character production documentation

The art/audio direction, pilot specification, modeling-skill guidance and Brandon briefs now point to `docs/CHARACTER_3D_PIPELINE.md`. All seven fighters share eight passes, expressive faces, articulated five-finger hands, constructed garments/folds, prop-specific grip tests, animation evidence and browser/device acceptance. Each fighter still needs an individual brief and its own validation; shared tooling does not establish shared completion.

The performance standard remains authoritative. Detailed source rigs may be richer, but runtime exports retain the section 7.3 limits: at most 40 deforming bones, 1–2 materials, preferably one skinned mesh, 512–1024px gameplay textures and at most 1 MB compressed initial fighter payload. Earlier 55–75 exported-bone / 2–4-material / 1–3 MB proposals and a 30 fps passing fallback are superseded. No budget exception is approved. Optimization must demonstrate that required expressions, grips and motion survive.

This change updates documentation only. Brandon v4 remains a movement prototype; no new character model, facial/finger rig, production animation or mobile-performance result is claimed. Runtime gameplay, networking and renderer code were not changed by this documentation work.

## November 7, 2026 — roster appearance refresh and 3D archive redaction

The shared procedural fighter models and roster SVGs now reflect the approved
appearance updates. Brandon uses a beige jacket, the roster no longer selects
the retired Brandon or Ethan portrait PNGs, and Brandon continues to use the
same live procedural rendering path as every other fighter.

The retired standalone Brandon 3D studies are now explicitly redacted and
deprecated. Their source archives remain only as historical repository
evidence; they are not approved art, likeness references, or runtime inputs.
The legacy `index.html`, `movement.html`, and `play.html` viewer routes now
serve static redaction notices without scripts or GLB loading. See
`docs/BRANDON-3D-REDACTED.md` for the exact boundary; the live playable fighter,
abilities, simulation, networking, collision, timing, scoring, and camera are
unchanged.

Verification on Node 22.13.0: `npm test` passes 114/114, `npm run build` passes,
the live app route responds, and all three retired viewer routes return the
redaction notice with no script or GLB reference. No performance-budget
exception is introduced.

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

### Step 6 — instrumentation, development overlay, and controlled-network harness (done)

Standard §4.3 (ping/pong is incomplete until RTT, jitter, loss and stale snapshot age are measured and visible in a development overlay), §4.4 (controlled 50/100/200 ms RTT, loss, and 500 ms interruption verification) and §5.3 (profiling evidence).

- `client/src/metrics.ts`: allocation-light ring buffers and rate counters for frame time, correction error, RTT, jitter (RFC 3550-style), late pings, snapshot gaps/age/rate, bytes in/out, host sim and snapshot rates. Payload byte counting runs only while the overlay is visible.
- `client/src/devOverlay.ts`: a plain `<pre>` updated at 4 Hz, hidden by default and outside the normal HUD. Toggle with the backtick key or open with `?debug`. No React state is involved.
- Guests now send a 1 Hz `ping`; the host replies `pong` with the same timestamp. The client measures RTT and jitter and counts pings unanswered after 3 s as late (the reliable channel surfaces loss as delay). Pongs never reach React.
- Prediction and reconciliation moved into `client/src/prediction.ts` (no Phaser/DOM), shared by the renderer and the harness. The input send now happens at the start of the frame.

**Bug found and fixed by the harness:** step 3's replay recorded one frame of movement per sent input, while each input actually stays active for ~2 frames, and it ignored how much of the acknowledged input the authority had already applied. That produced a systematic under-prediction and a correction on every snapshot. Fixes:
- Each pending input now accumulates the time it is active locally.
- Snapshots carry a per-viewer `ackAge`: sim seconds the authority has been applying the acknowledged input. Replay covers only the unapplied remainder of that input plus every later input.
- Corrections no longer snap: the reconciled position is adopted immediately but drawn through a visual offset that decays over ~100 ms.

`npm run netsim` runs the real `Room`/`Engine` against a simulated guest that uses the renderer's predictor and send policy, over an ordered reliable link (latency, jitter, retransmission as ~1 RTT + 20 ms, outage). 20 s of scripted movement changing direction every 400 ms, plus an attack every 1.5 s:

| Case | Correction p50 / p95 / max (units) | Max per-frame jump | Stale snapshot age p95 / max | Attacks sent/shown |
|---|---|---|---|---|
| LAN 10 ms | 0.055 / 0.092 / 0.350 | 0.075 | 50 / 50 ms | 10/10 |
| 50 ms RTT, 0% loss | 0.078 / 0.092 / 0.350 | 0.080 | 50 / 50 ms | 10/10 |
| 100 ms RTT, 1% loss | 0.081 / **0.262** / 0.688 | 0.149 | 50 / 167 ms | 10/10 |
| 200 ms RTT, 3% loss | 0.078 / **0.350** / 1.120 | 0.202 | 167 / 267 ms | 10/10 |
| 100 ms + 500 ms outage | 0.080 / 0.093 / 2.430 | 0.373 | 50 / 567 ms | 10/10 |

Reading the results against the standard:
- Local movement responds on the frame the input is sampled in every case (0 extra frames). This is by construction and independent of network delay.
- No action was lost or doubled in any case. Repeated event ids from the rolling window were absorbed by id dedupe.
- Correction p95 meets the <= 0.25-unit target at LAN, 50 ms, and across the 500 ms outage. It **misses** at 100 ms/1% (0.262) and 200 ms/3% (0.350). Cause: the authority applies the latest received input each tick, so inputs delayed by retransmission behind head-of-line blocking are stretched or skipped. The fix is a per-tick authoritative input queue, which changes input-to-tick timing on the authority and should be its own reviewed change.
- The outage produces one large correction (2.43 units) on recovery. It is spread over ~100 ms, so its worst per-frame jump is 0.373 units, which is visible.

`tests/netsim.test.ts` adds six tests. They assert exact-once actions, same-frame response, the 0.25 target where it is met, per-frame jumps <= 0.25 at LAN/50/100 ms, bounded pending inputs, outage recovery, and a regression ceiling (not the target) for 100/1% and 200/3%.

Harness limits: the retransmit model is optimistic compared with real SCTP timers; frames run at an ideal 60 Hz; there is no browser, renderer, device, or real network in the loop. These numbers do not replace the physical-device and real-network checks in §4.4/§11.

Verified: `npm run typecheck`, `npm test` (64 pass), `npm run build`, and `npm run netsim` all pass. Not verified: the overlay was not opened in a live browser match during this session. Its code paths compile and build, but their on-screen output has not been observed.

### Step 7 — delta-encoded snapshots (done)

**Why this came before the per-tick input queue:** host outbound bandwidth was past the standard's §4.2 *failure* threshold (> 5 Mbps sustained), while the 100 ms/1% correction result missed only the *target*. Measured with full snapshots before this change (scripted 40 s matches, 18 Hz, random movement/attacks/Supers): 8-player Showdown 6.99 Mbps host outbound, 10-player 10.33 Mbps, per-viewer ingress up to 140 KB/s.

- `shared/delta.ts`: a lossless structural delta codec. Changed fields are sent as nested diffs. Entity arrays with ids (players, projectiles, areas, effects, events) are diffed per entity, with adds, removals, and order sent only when they differ. Other arrays are replaced whole. Removed keys and key order are carried so the decoded JSON is byte-identical to the full snapshot.
- The host keeps one `SnapshotEncoder` per guest connection and sends `delta` messages against the previous snapshot on that connection. Every 180th snapshot (~10 s) is a full keyframe. A new connection or reconnect always starts with a keyframe. Deltas against the previous message are safe because the PeerJS channel is reliable and ordered. Moving to an unreliable channel would need acknowledgement-based baselines.
- Each message is numbered (`n`, `base`). The guest's `SnapshotDecoder` detects a gap, sends a single `resync`, and drops deltas until the keyframe arrives. The host's own local view bypasses the codec.
- The netsim harness now goes through the same codec. Its results are unchanged, as expected for a lossless codec.

Measured after (same scripted matches):

| Match | Per-viewer ingress, full → delta | Host outbound, full → delta |
|---|---|---|
| Showdown 2p | 44.2 → 9.8 KB/s | 0.36 → 0.08 Mbps |
| Showdown 8p | 121.9 → 28.2 KB/s | 6.99 → 1.62 Mbps |
| Showdown 10p | 140.2 → 32.5 KB/s | 10.33 → 2.39 Mbps |
| Broomball 6p | 83.2 → 19.6 KB/s | 3.41 → 0.80 Mbps |

All four now meet the <= 75 KB/s ingress and <= 3 Mbps host-outbound targets, including the 10-player Showdown budget exception recorded earlier. Keyframes are larger than deltas: the largest single message seen was ~9.7 KB, once per ~10 s. Host CPU cost: encoding plus serialization for one 10-player broadcast takes ~1.16 ms (vs ~0.22 ms for full serialization only), about 21 ms per second of host main thread at 18 Hz.

`tests/delta.test.ts` adds eight tests: primitive, nested, and deleted-key diffs; keyed add/remove/change/reorder; whole-array replacement; 400 randomized structures round-tripping byte-identically; gap detection and keyframe recovery; keyframe cadence; and full 10-player Showdown and 6-player Broomball matches whose every per-viewer snapshot decodes byte-identically while sending under 40% of the full bytes.

Verified: `npm run typecheck`, `npm test` (72 pass), `npm run build`, `npm run netsim`. Not verified: measured bytes on a real PeerJS connection. PeerJS JSON serialization adds its own framing, and the numbers above are JSON payload sizes.

### Step 8 — authority applies movement from the client's input timeline (done; authoritative timing change approved by the user)

Before this, the authority applied only the newest received move each tick. Under loss, the reliable channel delivers inputs late and in bursts (head-of-line blocking). Delayed inputs were then skipped or stretched, and correction p95 missed the 0.25-unit target at 100 ms/1% (0.262) and 200 ms/3% (0.350).

What changed, and what did not:
- Movement inputs carry `t`, the client clock time the input became active. The authority keeps a per-player timeline and each tick applies 1/30 s of it, segment by segment, with the existing substepped collision. Average speed is unchanged.
- It may run past the newest input by at most 60 ms. Beyond that the stream is treated as stalled and the fighter holds position instead of guessing.
- Unused time is banked (max 0.25 s) and allows catch-up at no more than 2x once the delayed inputs arrive. A backlog larger than the bank is skipped, not replayed, so a long stall cannot leave permanent lag. Total movement is bounded by speed × (real elapsed time + 0.25 s), so forged timestamps cannot speed-hack.
- Stun and disconnect consume timeline time without moving, so a stunned period is not replayed as movement afterward. Countdown, the goal pause, and death re-anchor the timeline, so pre-"Go" inputs never become a burst.
- A client clock that jumps back by more than 1 s (page reload, new renderer) starts a fresh timeline.
- **Unchanged:** aim, attacks, Supers, and ball release still latch on arrival and resolve on the next tick, exactly as before. Inputs without `t` keep the old latest-wins movement, so every pre-existing simulation and room test still runs unmodified against the old path.
- Snapshots carry `ackTime` per viewer: the point on that viewer's own timeline up to which movement has been applied. This replaces step 6's `ackAge` heuristic. The client replays its timeline from `ackTime` to now.

`npm run netsim` before → after:

| Case | Correction p95 | Max per-frame jump |
|---|---|---|
| LAN 10 ms | 0.092 → 0.123 | 0.075 → 0.087 |
| 50 ms RTT, 0% loss | 0.092 → 0.127 | 0.080 → 0.070 |
| 100 ms RTT, 1% loss | **0.262 → 0.148** | 0.149 → 0.138 |
| 200 ms RTT, 3% loss | **0.350 → 0.153** | 0.202 → 0.215 |
| 100 ms + 500 ms outage | 0.093 → 0.130 | 0.373 → 0.138 |

Correction p50 dropped from ~0.08 to ~0.006 units in every case. Correction p95 now meets the 0.25-unit target in every §4.4 case, and the worst per-frame visible jump is <= 0.25 in every case, including outage recovery. The small p95 increase at LAN/50 ms comes from the 60 ms extrapolation window: when a turn lands inside it, the authority briefly applies the old direction. Attacks were presented exactly once in every case.

Trade-off for other viewers: a guest whose uplink stalls now visibly holds still for the stall (after 60 ms) and then catches up at up to 2x, instead of drifting in the last direction. This is the authority's honest view of an unknown input stream.

Tests: six new engine tests (held-duration ordering, stall hold plus <= 2x catch-up recovering the full path, forged-timestamp speed bound, no countdown burst, stun consumes time without moving, clock-reset restart). The netsim tests now assert the 0.25 p95 target and <= 0.25 per-frame jump in all five cases, and p50 < 0.05. `npm run typecheck`, `npm test` (78 pass), `npm run build`, `npm run netsim` all pass.

Not verified: a live two-browser match with this change, and any real-network or physical-device measurement. The harness limits from step 6 still apply.

### Step 9 — predicted attack and Super release cues (done)

Standard §4.1 (input sampled → immediate local animation, audio and VFX cue, then reconcile without restarting presentation) and §6 (predicted anticipation/release; damage, possession, score and cooldown truth stay authoritative). Before this, every local attack and Super cue waited a full round trip for the host's effect.

- `client/src/actionPrediction.ts` (no Phaser/DOM): on the frame the attack input is sent, it predicts whether the authority will accept it. It requires: alive, playing, not stunned, not paused, ammo left after subtracting this client's own unconfirmed shots, and the 0.32 s attack interval elapsed. A ball carrier's attack predicts a release cue instead. Super anticipation requires full charge and no ball, and is rate limited against mashing.
- Predicted attack: the attack sound plays immediately, plus a muzzle-flash ring and release streak in the fighter's color along the aim. Josh, whose basic attack is an instant cone, gets a predicted cone outline instead.
- Predicted Super: a rising anticipation sound and a gold ring. The authoritative Super effects and sounds still play when the host confirms, so this cue is anticipation, not a duplicate release.
- Ball release: an immediate whoosh and streak. The host emits no attack effect for a carrier release, so there is nothing to dedupe.
- When the host's `attack` effect for the local fighter arrives, it confirms one pending prediction. Its sound and ring are then skipped so the cue never plays twice. An authoritative attack with no matching prediction plays normally. A prediction unconfirmed after 1 s is treated as a misprediction and dropped. Nothing is undone, because only a ~0.15 s flash and sound were played.
- Presentation only: no damage, ammo, cooldown, charge or projectile is created locally. The projectile itself still appears with the authoritative snapshot, about one RTT after the predicted flash.
- `client/src/audio.ts` gained two cue kinds (`super_cue` rising, `release` falling). Audio nodes are still created per sound, as before (existing §9 debt).

Tests: `tests/actionPrediction.test.ts` adds seven tests. They cover immediate prediction; no prediction when paused, dead, stunned or in countdown; unconfirmed shots counting against ammo, plus the attack interval; confirmation and expiry; carrier release; Super charge, carrier lock and rate limiting; and a real-engine run where every predicted shot got exactly one authoritative attack effect (none lost, none doubled). `npm run typecheck`, `npm test` (85 pass), and `npm run build` pass.

Not verified: how the cues look and sound in a live match, and the reduced-motion review. The cues have no camera motion; they are gameplay-readable tells, which §7.2 says reduced-motion should keep.

### Step 10 — match HUD: degraded-only connection warning, onboarding-only controls line (done)

Standard §8.1: network architecture labels do not belong in the normal HUD, a compact warning shows only when the connection is degraded, reconnect belongs in a pause or connection panel, tutorial copy disappears after onboarding, and critical state is not conveyed by color alone.

- Removed the always-on "Browser host" label and Reconnect button from the match HUD.
- The HUD now shows a compact "⚠ Connection unstable" when no snapshot has arrived for over 1 s. It shows "⚠ Connection lost" with a Reconnect button when the guest transport reports the host connection lost. Both use a symbol plus text, not color alone. The check polls at 2 Hz and re-renders only when the state changes (§5.1).
- Guests can always reconnect from the Settings (pause) panel during a match. On narrow screens the HUD Reconnect button was already hidden by CSS, so this is now the reliable path there.
- The desktop controls line ("WASD move · …") shows only for the first 10 s of a player's first three matches, counted in `localStorage` (`goc.controlsSeen`). The full controls text remains in Settings.

Verified: `npm run typecheck`, `npm test` (85 pass), `npm run build`. Not verified: supported-viewport captures, keyboard focus, and the touch target/safe-area review in §11's Game UI row. There are no React component tests in this repo, so the warning states were checked by code review only.

## November 1, 2026 — game-style UI pass (branch `feature/ui-pass`)

Worktree: `~/Documents/GitHub/goc-royale-wt/feature-ui-pass`. The whole
player-facing interface was rebuilt as a game UI over a live 3D backdrop,
replacing the previous page-style menus and text HUD. Gameplay rules,
networking, the authority and the Phaser arena renderer were not changed.

**New mandatory standard.** `docs/CODE-PRACTICES.md` defines the component
architecture and is referenced from `AGENTS.md` as required reading: two kits
(`menuKit`, and `gameKit` which extends it) built by one factory, a single
`Control` / `Display` interface with kinds and variants as data, an
extend-before-adding rule, the tactile feedback contract, the game-signal
rule that continuous values never reach React state, and the one-way rule
(no device tiers or dev-only vs production paths for the same feature). The
performance standard still takes precedence.

**Interface.** `client/src/ui/core/` holds the design tokens, the feedback
engine, and the base control and display renderers; `menu/` and `game/`
configure the two kits; `screens/` only composes and lays out. Every
pressable element depresses on the same frame as the input, springs back,
and then plays a confirm pulse or a deny shake with a reason; disabled
controls deny rather than going silent. Palette is blue plus greys and black
(user decision), recorded in the art direction doc.

**Fixed a standard violation.** The old touch `Stick` called a React state
setter on every pointer move (performance standard §5.1). All three sticks
are now one kind driven by a single touch router that writes transforms
directly to the DOM. Sticks float to where the thumb lands inside their half
of the screen, clamped to the safe area, and size with the viewport's short
side.

**3D menu backdrop.** Added `three` 0.187.0. `scene/plaza.ts` builds a
stylized low-poly courtyard in the spirit of the Broad Art Center plaza
(arcade and tilted canopy with a tall staircase on the left, brick path in
the middle, lawn with rusted steel vessels on the right) as one merged mesh
plus a swaying tree crown and drifting clouds. `scene/fighterModels.ts`
builds all seven fighters procedurally from one per-fighter look table that
mirrors their 2D portraits. Everything shares one toon material. All of it
is original geometry from primitives: no photo texture, traced geometry or
scanned asset.

**Bug found and fixed.** `dispose()` calls `renderer.forceContextLoss()`, and
a canvas whose context was lost that way can never get another one. The
canvas was owned by React, so the second `createMenuScene` on the same
element failed with "THREE.WebGLRenderer: Cannot read properties of null
(reading 'precision')" on module reload or remount. The scene now creates and
owns its own canvas and removes it on dispose, and it checks for a null
context instead of letting Three.js throw later.

Verified: `npm run typecheck`, `npm test` (85 pass), `npm run build`. The
menu scene is a lazy chunk (144.7 kB gzipped) loaded only for menus. Real
WebRTC runs in headless Chromium exercised a 10-player Showdown lobby and a
6-player Broomball lobby through to the live HUD and the results screen,
plus a 4-player match reaching real results and a rematch, at 1280x720,
390x844 and 844x390, with no console errors. Touch sticks were driven with
real multi-touch events. A menu → match → menu cycle confirms the scene is
disposed and recreated with one healthy WebGL context. HUD DOM writes during
play stayed in the single digits over a 3-second sample, consistent with the
continuous values bypassing React.

Not verified: physical iOS/Android devices, measured frame time and p95 on
any real device, the complete-match memory trend with the new scene, a
reduced-motion visual review, and the audio cue mix. The 3D scene's cold
load and frame cost have not been profiled against the standard's §5.3
requirements, so the menu backdrop is not certified against §7.3 asset
budgets; it is procedural geometry rather than a loaded asset, but that is
not a measurement. Screens were reviewed from captures, not by a human
playing on a phone.

## November 2, 2026 — 3D arena renderer (branch `feature/arena-3d`)

Worktree: `~/Documents/GitHub/goc-royale-wt/feature-arena-3d`. Implements
`docs/ARENA-3D-INTEGRATION-BRIEF.md`. The Phaser arena is replaced, not
supplemented: `phaser` is removed from the dependencies, and matches render in
a Three.js arena (`client/src/arena/`) driven by `client/src/game.ts`.
Simulation, the host loop, the input protocol, snapshots and every gameplay
rule are unchanged; no file under `shared/` was edited.

**Decisions (provisional, recorded in the brief):** fixed-pitch perspective
follow camera with the old 1.65× framing; Brandon on the validated low-poly
GLB, the other six on the procedural menu models; flat ground with raised
cover on unchanged footprints; separate renderer from the menu scene.

**What carries over from the 2D arena, unchanged:** keyboard and mouse
handling, the send cadence and input sequencing, `LocalPredictor`
reconciliation, remote smoothing, `ActionPredictor` cues, effect and event
dedupe, sounds, and the importance- and distance-scaled camera impulse
(now also gated by reduced motion). One change to input: mouse aim is picked
again every frame, so it stays on a still cursor while the fighter moves.

**Renderer structure (standard §5.2):**
- One canvas and WebGL context, owned by the arena and released on teardown
  (`forceContextLoss`, then the canvas is removed). The menu scene is disposed
  before the arena mounts and recreated after.
- Static map art is merged once per match. Per frame only transforms, counts,
  colors and a zone uniform change. Camera fit runs on resize only
  (ResizeObserver), with no DOM measurement during play.
- Pooled or instanced: names, health bars, damage numbers and stun stars are
  one instanced draw from one canvas atlas (text redrawn only when a name
  changes). Shadows and rings are two instanced draws, projectiles one draw per
  type plus one for trails, and effects come from fixed pools.
- Fighters: one skinned mesh and one outline shell each. Procedural fighters
  are 10.3k–13.9k triangles drawn (skin and shell), 9 bones, no textures.
  Brandon's GLB is 2,666 triangles, 17 bones, one material, no textures,
  611 KB uncompressed.

**Animation (standard §7.2):** one graph for every fighter, blending idle and
four directional runs by speed and by travel direction relative to facing.
Attacks, Supers, shots, hit reactions and the ball carry override the upper
body only, so legs keep running. Knockouts, respawns, stuns and goal reactions
take the whole body. Facing follows aim, or follows travel for a fighter that
has not aimed for 0.7 s, which is how touch players move. Root motion is not
used. One-shots start only from a predicted local input or once per
presentation event id. The authoritative cue for an action the client already
predicted is skipped, so snapshots and reconciliation never restart a clip.
The GLB is validated on import against its manifest (all 15 clip names,
durations within 0.05 s, loop flags, triangle and bone counts) and against
the §7.3 budget; a failed asset falls back to the procedural model with a
console warning. Respawn is detected from the alive flag because the engine
does not emit `fighter_respawned`.

**Verification** (headless Chromium 1223 with SwiftShader software rendering
on an Apple Silicon Mac, real PeerJS/WebRTC peers, DPR 1–2, 1280×720 and
844×390. This is not a device measurement):
- `npm run typecheck`, `npm test` (85/85), `npm run build` pass. The game chunk
  is 106.8 kB (36.1 kB gzip) plus a shared three.js chunk the menu already
  loads. Phaser's chunk is gone.
- Frame pacing, before (Phaser Canvas, 2 players) vs after (3D, 2 players):
  p50 16.7 / p95 17.5 ms vs p50 16.7 / p95 17.4–17.7 ms, zero frames over
  33 ms in both. 3D draw calls are 11–17 and triangles 10.5k–24k.
- Eight-peer Showdown with all seven fighters plus a duplicate Brandon walked
  into one view, all firing: p50 16.7 / p95 17.6 ms, no long frames, 25–36
  draw calls, 78k–94k triangles (under the 100k scene target), 33–36
  geometries, 12 textures.
- Resize stress: 40 viewport changes across eight sizes mid-match left one
  healthy canvas at the final size.
- Teardown: five match → menu cycles, always exactly one canvas with a live
  context. The heap went 9.2 MB in the lobby, then 10.8–11.8 MB at the menu
  after each cycle (rising about 0.3 MB per cycle). A heap census after three
  cycles found zero surviving arena objects (Arena, actors, rigs, mixers,
  billboards, effects, projectiles), one WebGLRenderer (the menu's) and no
  leftover Network or Room. The small rise is not attributed yet.
- Combat on two peers: a touch-tap auto-aimed Brandon hit Josh (700, with
  number, ring, flash and hit reaction), eliminated him, and the match reached
  results and returned to the menu scene.
- Broomball: pickup, carry pose, charged shot, goal, kickoff banner, with goal
  reactions on both teams.
- Reconciliation versus animation: 14 rapid local attacks gave
  `predicted 4, skipped 4, authoritative 0` in the dev overlay's new `anim`
  line. Every accepted local attack started its clip on the input frame, and
  every matching authoritative `attack_started` was skipped rather than
  restarting it.

**Not verified / remaining:** physical iOS and Android profiles and frame
times; a complete-match heap trend (only cycles of about 10 s were run);
the §4.4 controlled-network cases with this renderer in the loop (the
networking itself is unchanged); art review of the procedural clip set and of
Brandon's GLB beside the procedural models (their styles differ); a
reduced-motion visual review; context-loss recovery on a real GPU reset. The
procedural fighters are placeholders, not §7.1-complete assets: their clips
are code, not authored animation, and none has an asset manifest.

## November 2, 2026 — all ministry leaders playable (branch `feature/ministry-teams`)

Worktree: `~/Documents/GitHub/goc-royale-wt/feature-ministry-teams`. User
request: every named ministry team leader becomes a fighter, every 3D model
gets a distinctive feature, and future model changes must be easy. Details,
kits and open items are in `docs/MINISTRY-TEAMS-BRIEF.md`.

**Deliberate scope and rules change.** The roster grows from 7 to 17 (Dylan,
Isaac, Tovya, Rosalie, Joelle, Susannah, Joyce, Miriam, Jemuel, Russell).
`docs/PILOT-SPEC.txt` keeps its seven-fighter text as a historical document;
this entry records the deviation. Video Resources has no leader and no fighter.

- Abilities are now data in `shared/definitions.ts`, and `shared/engine.ts`
  resolves them by kind with no fighter-id branches. The pilot seven were
  converted to the same data; every pre-existing test passes unmodified.
- New shared mechanics: shields (absorb first, still count as dealt), timed
  slows (strongest wins), a leap that blocks input while airborne, companions
  bound to their owner, a barrier that stops enemy shots only, burst attacks,
  piercing, returning, homing and chaining shots, and Super shots.
- Overlapping stuns from the new Supers keep the longer stun.
- Fix: `shared/room.ts` seeded first picks with `IDS[i % 6]` and never offered
  the seventh fighter; it now uses the whole roster.
- 3D menu looks: one `LOOKS` row per fighter built from named feature, prop,
  hair and companion tables (`client/src/ui/scene/fighterModels.ts`). Ethan's
  hard-coded floating note became a generic companion slot.
- Ten new placeholder SVG portraits mirror the 3D looks. The arena draws
  projectiles from a per-fighter `SHOT_LOOKS` table, and cones, frames and
  bursts from the owner's data.

Verified: `npm run typecheck`, `npm test` (104 pass, 19 new), `npm run build`.
In headless Chromium, the real menu scene rendered all 17 fighters, and the
real Phaser arena ran every new kit's attack and Super with no page errors.
The picker was checked at 390×844, 844×390 and 1280×720 with no horizontal
overflow, and Done stays visible on a portrait phone. Scripted 40 s Node
matches with forced Supers, delta-encoded at 18 Hz: 10-player Showdown of the
new kits peaks at 32 KB/s per viewer and 2.6 Mbps host outbound, the same as
the pilot roster. Authority step p95 is 0.09 ms (pilot 0.13 ms). Menu models
are 5.9k–10.5k triangles each; the pilot seven grew 0.4k–1.3k each.

Not verified: two-client networked matches and human playtests of the new
kits (balance is first-pass), physical devices, frame time with the larger
menu models, reduced-motion review of the new effects, and the new synthesized
cues by ear. None of the ten has a likeness reference.

## November 6, 2026 — integrated 3D arena and 17-fighter roster

Branches `feature/arena-3d` and `feature/ministry-teams` were combined on
`codex/integrate-3d-arena-roster`. The single Three.js arena remains the live
match renderer, while the data-driven 17-fighter rules remain authoritative in
`shared/`. No collision, damage, timing, scoring, or network rule was moved
into presentation code.

User decision: Brandon does not use any of the separately iterated GLB studies
in the live game. Brandon now takes the same procedural `LOOKS` → rigid arena
rig path as the other 16 fighters. The GLB loader and validation path remain
available for future approved assets, but `GLB_ASSETS` has no live entries.
A regression test asserts this selection and builds all 17 arena rigs.

Merge integration added Three.js presentation for the new authoritative state:
distinct projectile geometry for every shot fighter; panda and barrier area
models with health bars; slow and shield markers; leap height that never alters
the authoritative ground position; data-driven cone range/angle; and burst,
marker, chain, swap, panda, and leap effects. The local predictor now stops
movement while `busyUntil` blocks input. These are presentation changes only.

Verification:

- `npm run typecheck` passes.
- `npm test` passes 105/105, including the new all-arena-rigs and Brandon asset
  selection regression.
- `npm run build` passes. The lazy procedural fighter-model chunk is 627.91 kB
  minified / 157.94 kB gzip; Vite reports its >500 kB warning. This is tracked
  as an optimization item, not hidden as a passing budget measurement.
- `npm run netsim` passes every standard case. Correction p95 is 0.123–0.153
  world units; all scenarios present 10/10 actions once, including 100 ms RTT
  with 1% loss, 200 ms RTT with 3% loss, and the 500 ms interruption.
- Local browser QA at 1280×720 showed all 17 picker entries and the intended
  procedural Brandon (glasses, nametag, clipboard). A Brandon Showdown rendered
  at p50 16.7 / p95 17.5 ms, 13 calls, and 21,408 triangles. A live Rosalie
  Broomball match rendered at p50 16.7 / p95 17.5 ms, about 60 FPS, 9 calls,
  and 24,368 triangles. Browser logs contained no warnings or errors.

Still not verified after the merge: physical iOS/Android devices, an
eight-fighter stress scene covering the expanded roster and effects, a complete
match/rematch heap trend, real-GPU context-loss recovery, reduced-motion review,
or human balance/game-feel testing of the ten new kits. The procedural models
and code-authored clips remain placeholders rather than approved production
assets with manifests.

## November 6, 2026 — David playable (branch `codex/feature-david`)

**Deliberate roster and balance change.** David expands the roster from 17 to
18 as a Music-team Vocal Controller. This is an original provisional character
design; no likeness reference has been supplied or claimed.

- Mixed Voice is one 500-damage projectile with a narrow, clearly presented
  center lane that adds 400 damage. The projectile uses braided blue/gold
  geometry, a two-layer synthesized cue, and a harmony impact for the center.
- Side Eye has a 0.4 s rectangular warning, then deals 750 damage, pushes each
  target 1.6 units sideways away from the gaze center line using the existing
  collision-safe movement path, and applies a 25% slow for 1 s. It does not
  stun. The warning is predicted on the local input frame and is not restarted
  when authority confirms it; damage, displacement, and slow remain
  authoritative.
- The center bonus, perpendicular displacement, and frame slow are generic
  ability-data options, not David-id engine branches.
- David has an original procedural 3D look with in-ear monitors and a handheld
  microphone plus a matching SVG portrait. His menu model is 6,378 triangles,
  below the provisional 10k–25k per-fighter budget.

Verification:

- `npm run typecheck` passes.
- `npm test` passes 107/107, including center-versus-outer Mixed Voice damage,
  Side Eye windup/damage/displacement/slow, all-fighter gameplay in both modes,
  every picker model, and every arena rig.
- `npm run build` passes. The procedural-model chunk is 628.41 kB minified /
  158.06 kB gzip; the existing >500 kB Vite warning remains tracked.
- `npm run netsim` passes every §4.4 case with 10/10 actions presented once.
  Correction p95 is 0.123–0.153 world units, including 100 ms RTT / 1% loss,
  200 ms RTT / 3% loss, and the 500 ms interruption.
- Local browser QA at 1280×720 showed David's picker portrait, procedural model,
  complete kit text, and a live Broomball Mixed Voice projectile. The live arena
  measured p50 16.7 / p95 17.6 ms at about 60 FPS: 9 calls / 16,904 triangles at
  rest and 15 calls / 17,686 triangles during the attack. There were no browser
  warnings or errors.

Still not verified for David: the Side Eye presentation in a live two-player
match, physical iOS/Android performance and touch controls, an eight-fighter
stress scene, reduced-motion review, synthesized cues by ear, or human
balance/game-feel testing.

## November 6, 2026 — held aim previews and movement direction pip

Branch `codex/aim-previews`. This is a controls and presentation change only;
authoritative damage, collision, range, cooldowns, scoring, and network schemas
are unchanged.

- Holding a basic-attack control now shows its data-derived ground footprint;
  release fires. Holding Space, right click, or the Super stick does the same
  for a Super. Mouse, keyboard, and touch all write one mutable local intent on
  `GameBridge`; it is never transmitted or placed in React state.
- Footprints distinguish straight shots, spread and cone attacks, rectangular
  frames, charges, projectile Supers, placed zones, barrier crossbars, leaps,
  thrown or self-centered bursts, and rewinds. Mixed Voice also shows its narrow
  center lane. A charged Broomball shot grows with held power.
- A small mint direction pip appears just ahead of the local fighter whenever
  movement input is active. It follows keyboard and analog stick direction,
  independently of aim direction.
- `AimGuide` owns fixed meshes created once with the arena and only changes
  visibility, material color, and transforms per frame. No transient meshes,
  second renderer, snapshot-rate React path, or new authority work was added.

Verification:

- `npm test` passes 110/110, including finite attack and Super footprints for
  all 18 fighters, representative geometry checks, and charged-ball scaling.
- `npm run build` passes. The game chunk is 115.80 kB minified / 38.48 kB gzip;
  the existing 628.41 kB procedural-model warning is unchanged.
- `npm run netsim` passes every §4.4 case with 10/10 actions presented once and
  correction p95 of 0.123–0.153 world units.
- Live Chromium QA at 1280×720, DPR 2 showed: an attack footprint throughout a
  held left click with no release animation until pointer-up; a Super placement
  circle throughout held Space; and the movement pip immediately while holding
  a movement key. Frame time was p50 16.7 / p95 17.7 ms at about 60 FPS. The
  scene used 9 calls / about 19.9k triangles at rest, 10 calls during the attack
  footprint, and 13 calls / about 20k triangles with the movement pip. Hot
  reload tore down the live arena and returned to the menu with no browser
  warnings or errors.

Still not verified: physical simultaneous multi-touch on iOS/Android, the
eight-fighter worst-case effect scene, complete-match/rematch heap trend,
real-GPU context-loss recovery, or human readability/game-feel testing across
every fighter footprint.

## November 6, 2026 — camera ownership and mobile full screen

Branch `codex/camera-fullscreen`. This is presentation and game-UI work only;
authoritative gameplay and network behavior are unchanged.

- A living local fighter now always owns the camera. Spectating is allowed only
  while the local fighter is out, stale/dead targets fall back to a living
  survivor, and respawn, rematch, lobby return, and leave clear spectator state.
- The follow camera centers on its fighter across the whole arena instead of
  clamping near field edges. At an edge it intentionally reveals scenery beyond
  the playable bounds; collision and playable bounds are unchanged.
- Settings now offers a user-triggered full-screen toggle. Dynamic viewport
  sizing, safe-area coverage, standalone metadata, and the existing
  `viewport-fit=cover` support mobile browser layouts. iPhone users are directed
  to Add to Home Screen where element fullscreen is unavailable.
- The match timer/status panel is smaller and anchored in the upper-right
  safe-area corner instead of occupying the top center of the playfield.

Verification:

- `npm test` passes 114/114, including four new target-selection cases for
  local respawn, valid spectating, dead/missing targets, and no survivors.
- `npm run build` passes; the existing 628.41 kB procedural-model warning is
  unchanged.
- Live Chromium QA at 1440×900 and 1280×720 showed the fighter centered beside
  the rink edge, with out-of-bounds scenery visible, and the compact timer in
  the upper-right safe corner. Settings exposed the full-screen control and its
  iPhone installed-mode guidance without browser warnings or errors.

Still not verified: physical iOS/Android browser and installed-mode behavior,
safe areas on a notched device, or a live death/spectate/respawn loop across
two real clients.

## November 6, 2026 — roster appearance refresh

Branch `codex/character-appearance-refresh`. This is game-art and character-
presentation work only. Fighter collision, visibility, damage, timing, scoring,
abilities, network schemas, animation playback, and authoritative rules are
unchanged.

- Brandon now has a beige/brown jacket; Rich no longer has glasses; Samuel has
  glasses and slightly longer hair; Josh has a black shirt; and Ethan has a blue
  shirt with a natural bowl cut.
- David has a side part and Isaac has a middle part. Tovya has a warm brown
  skin tone, glasses, and wavy shoulder-length hair. Rosalie has unbraided
  shoulder-length hair; Joelle has shoulder-length hair; and Joyce has wavy
  brown hair.
- Miriam has glasses. Jemuel has a close-shaved head and a broader procedural
  build. Russell has a dark leather jacket with lapels, zipper, pockets, and
  cuffs.
- Brandon, Isaac, Rosalie, Joelle, Joyce, and Russell use a slightly tan skin
  palette. Brandon and Ethan's one-off PNG portraits were removed; every picker,
  lobby, result, and fighter sheet now uses the roster SVG that mirrors the live
  procedural model.
- New hair and garment pieces are merged into the existing per-part geometry.
  This adds no renderer, material, texture, per-frame allocation, React update,
  simulation work, or network work.

Verification:

- `npm test` passes 114/114. Every fighter builds in the menu and arena paths,
  every look remains distinct, and changed models remain within the existing
  procedural geometry budget (5,770–9,582 triangles).
- `npm run build` passes. The procedural-model chunk is 630.44 kB minified /
  159.57 kB gzip; the existing >500 kB Vite warning remains tracked.
- Local Chromium QA at 1280×720 reviewed the changed roster models and icons,
  including the long/wavy hair silhouettes, eyewear, tan palettes, Jemuel's
  close shave and build, and Brandon/Russell jacket construction. Russell was
  also observed front-on in the actual arena/results camera. No browser warning
  or error was recorded.

Still not verified for this art pass: physical iOS/Android appearance and frame
pacing, an eight-fighter worst-case effect scene, complete-match/rematch heap
trend, or human likeness review. No budget exception is requested.

## November 7, 2026 — projectile readability and host lobby controls

Branch `fix/projectile-lobby-host-controls`. This is presentation, lobby UI,
and host-authority networking work. Authoritative projectile dimensions,
collision, damage, timing, scoring, and match simulation are unchanged.

- Every projectile model is rendered at 1.6× scale so it fills the existing
  highlight more clearly. The change reuses the existing instanced geometry,
  material, transform, and draw path; it adds no draw call, per-frame allocation,
  texture, or network data.
- Broomball lobby plates now expose an explicit `TO RED` / `TO BLUE` menu-kit
  control for every player when viewed by the host, including the host's own
  plate. Selecting the host plate still opens the fighter picker.
- Hosts now receive a `KICK` menu-kit control for each guest. Removal is enforced
  by the authoritative room, rejects guest-issued requests and host self-removal,
  invalidates the removed player's reconnect session, and returns that client to
  the home screen with an explanation.

Verification:

- `npm test` passes 117/117, including host/guest authority, team assignment,
  reconnect-session removal, and lobby-control visibility coverage.
- `npm run build` passes; the existing procedural-model chunk-size warning is
  unchanged.
- `npm run netsim` passes all five required network scenarios with every attack
  presented once.
- Live Arc QA at 2880×1609 verified the desktop Broomball lobby, including a
  successful host self-team change from Blue to Red through the explicit control,
  and then started and rendered a Broomball match normally.

Still not verified: physical multi-client mobile lobby use, physical iOS/Android
frame pacing, an eight-fighter worst-case effect scene, complete-match/rematch
heap trend, or human game-feel review of every projectile. No budget exception
is requested.

## November 11, 2026 — item framework and action presentation

Added authority-owned, bounded randomized item spawns and a single carried-item
slot, with pickup, use, drop, disconnect/elimination cleanup, and stable
presentation events. The first catalogue entries are a reusable golden broom
sweep that knocks rivals, mobile companions, and the Broomball, and a
single-use damaging GOC flyer. On desktop F picks up or puts down an item and
E uses it; on touch, a pickup/put-down button and a small item-aim joystick
use the existing gameKit controls and touch router. Item use begins locally and
reconciles by input sequence. Reconnects reset their input timeline and reject old transport data.
See `docs/ITEMS.md` for the extension path. Tuning is provisional.

The existing action graph now supports procedural sweep and throw profiles;
Tovya's basic uses the sweep. The broom's forward rectangle and held-aim
preview use the simulation's range and width; confirmed item contacts provide
feedback. This is an animation foundation, not a completed authored animation
set for every attack or Super.
The carried prop uses an approximate attachment and the immediate authoritative
impact does not yet align precisely with the procedural windup.

Verification on Node 23.10.0: `npm test` passed 129 tests and `npm run build`
passed (with the existing large-chunk warning). A local browser Broomball match
confirmed F pickup and put-down and an E-activated rectangular broom sweep. The
two-client Room/snapshot test covers ownership, use, reconnect, and delta
round-trips. A simulated reliable link checks item events under 50 ms, 100 ms
with modeled 1% retransmission, 200 ms with approximately 3%, and a 500 ms
outage. The existing movement harness reported correction p95 of 0.127, 0.148,
0.153, and 0.130 world units respectively; this is a model, not a live-network
or item-latency measurement.

Still required by the performance standard: real two-client gameplay and
controlled network measurements; physical iOS/Android multi-touch; reduced
motion and audio checks; animation and impact captures for all actions; and
before/after frame, heap, resize, teardown, and eight-fighter stress profiles.
No budget exception is approved, and these checks do not certify performance or
game feel.

## November 13, 2026 — item release checks

The network check reproduced a presentation bug: after a 500 ms modeled
interruption, multiple snapshots could arrive before one rendered frame and
the latest snapshot could omit an earlier item event. A bounded, deduplicated
event queue now retains snapshot events until the renderer consumes them. A
regression test exercises that exact arrival burst and verifies one delivery;
the queue resets between matches. Simulated touch tests exercise concurrent
move and item-aim pointers, auto-aim, release, cancellation, blur and
backgrounding. These tests do not replace physical-device checks.

`npm test` passed 132 tests and `npm run build` passed on Node 23.10.0. Modeled
50 ms/0%, 100 ms/1%, 200 ms/3% and 500 ms interruption cases retained item
pickup, use and drop events once and matched predicted use to confirmation.
The modeled movement correction p95 was 0.127, 0.148, 0.153 and 0.130 world
units respectively; this is not a live-network measurement. Two local browser
clients started Broomball; the guest saw the host carry a flyer, and the flyer
disappeared from the carrier after use. A desktop reduced-motion check showed
the broom's rectangular release cue remained visible; the prior preference
was restored afterward.

Desktop comparison on an Apple M2 Mac, in-app browser, 1280×720 CSS pixels at
DPR 2, sampled 300 frames in an idle single-player match. Baseline p50/p95 was
16.7/17.5 ms and the item build was 16.7/17.6 ms, with zero frames over 33 ms
in each sample. The item scene used 9 draw calls and 22,848 triangles versus
7 and 21,056 at baseline. Both p95 results are above the 16.7 ms target. Two
cycles across landscape, portrait and desktop sizes and one teardown showed no
browser errors. An isolated CPU-only pool test kept mesh and resource counts
fixed through 10,000 iterations with eight simultaneous sweeps.

Physical iOS and Android devices were not attached. Real network impairment,
mobile multi-touch and frame profiling, worst-case eight-fighter rendering,
complete-match/rematch heap trends, and complete renderer, VFX, accessibility
and audio reviews remain outstanding. The desktop samples, synthetic touch
tests and network model do not satisfy those gates.

On November 13, 2026, the user explicitly directed an immediate production push
despite the outstanding checks and the desktop p95 measurements above. The
unverified mobile, network, renderer and accessibility gates remain open; this
decision does not establish that the performance targets were met.

## November 16, 2026 — Brandon Nguyen, "The UCLA Swiper" (`add-brandon-nguyen`)

Brandon Nguyen is fighter 19 (`brandon_n`), listed with his surname because
`brandon` is already Brandon Kam. The user asked for this fighter, supplied a
reference photo for his look and requested the full name. He is placed on the
Rides team; that placement is an assumption and is one field to change.

The change is data only: a `FIGHTERS` row, a `LOOKS` row, one new hair style
(`wavyTop`), one feature (`wireGlasses`), one prop (`mealCard`), a card
projectile shape and a placeholder SVG portrait. `shared/engine.ts` is
unchanged and no other fighter's values changed.

- **Card Swipe**: three meal cards in a fan (±0.17 rad), 340 each, range 7,
  reload 1.4. All three land inside about 3 units (1,020), one at range (340).
  The request named a melee swipe and a ranged throw; fighters have one attack,
  so the fan expresses both instead of adding a second attack slot.
- **Swipe You In**: radius 4 around him, 1,200 healing and a 600 shield for
  4 s to himself and teammates. 5,400 HP, speed 5.2.

Balance is first-pass, set against the other supports: the Super's 1,800
effective health is local, where Joyce gives 1,800 anywhere plus protection
and Jemuel gives a 2,000 shield in 4.5. His ranged damage per reload (243) is
the lowest in the roster and his close damage (729) needs him inside 3 units
at 5,400 HP.

`npm test` passed 133 tests (one new, covering the fan at both ranges and the
Super's reach, shield expiry and ally-only effect) and `npm run build` passed
on Node 24.13.1; the repository pins Node 22. In a desktop browser at
1024×768 he appeared in the fighter picker, home stage, lobby, results podium
and a solo Broomball match; the fan, its trails, the Super ring, the heal
number and the shield were seen in the arena camera with no console errors.
His name is ellipsized on the picker tile and shown in full elsewhere. His
menu model is within the test's 12,000-triangle ceiling.

Not done: no two-client match, no human playtest, no phone layout or
physical-device check, no frame profile, and no controlled latency run. The
verification matrix rows for simulation or balance (two-client) and 3D asset
(mobile profile, eight-character scene) remain open for this fighter.
