# GOC Royale performance and gameplay standards

**Status:** Mandatory repository standard  
**Applies to:** `client/src/`, `shared/`, `tests/`, `client/public/art3d/`,
`assets/3d/`, and gameplay-facing documentation  
**Last updated:** November 6, 2026

## 1. Purpose

GOC Royale is a real-time arena game. It must be judged first by response,
readability, impact, and replayability. Visual fidelity matters only when it
strengthens those qualities without damaging frame pacing or input latency.

This document converts those priorities into engineering and presentation
conventions. It is the acceptance standard for future agents and contributors.
Existing prototype code is evidence of the current state, not automatic proof of
the correct architecture.

## 2. Product principles

The following are non-negotiable:

1. **Response before spectacle.** Movement and action feedback must feel
   immediate before art complexity is increased.
2. **Game feel before feature count.** A polished movement and combat loop is
   more valuable than another mode, fighter, menu, or progression system.
3. **Authority and presentation are separate.** The host or server decides game
   truth. The local client predicts presentation so the player does not wait to
   see their own intent.
4. **Frame pacing is a feature.** A high average frame rate does not excuse
   visible hitching, long frames, or overloaded input frames.
5. **Every action has a readable arc.** Anticipation, release, impact, and
   recovery must be visually and audibly distinct.
6. **The arena is the product.** During a match, UI supports play instead of
   reading like a website placed over a canvas.
7. **Mobile is a real target.** A desktop browser preview is not a substitute for
   physical iOS and Android testing.
8. **Measure before declaring success.** Automated correctness tests do not
   certify latency, touch quality, animation, readability, or fun.

## 3. Runtime boundaries

Maintain clear ownership:

| Layer | Owns | Must not own |
|---|---|---|
| Shared simulation | Rules, collision, damage, cooldowns, scoring, authoritative positions | DOM, camera, animation playback, renderer objects |
| Room authority | Sessions, validation, fixed simulation stepping, authoritative event production | Local visual prediction, HUD layout |
| Network transport | Input delivery, snapshots, acknowledgements, latency measurement | Game rules, animation selection |
| Arena presentation | Interpolation, predicted local cues, animation, VFX, camera, world audio | Authoritative damage, scoring, collision |
| React UI | Menus, lobby, low-frequency HUD, settings, results | Per-frame transforms or full snapshot processing |
| Asset pipeline | Validated and budgeted models, clips, textures, compression metadata | Gameplay rules or hidden runtime dependencies |

Simulation, input transmission, snapshot delivery, rendering, animation, and
React updates MUST be independently configurable. Matching all of them to one
rate is not a simplification; it is a latency and performance defect.

## 4. Latency and networking conventions

### 4.1 Target pipeline

The intended flow for a local action is:

```text
input sampled
  -> immediate local animation, audio, and VFX cue
  -> sequenced input sent
  -> authority simulates and acknowledges sequence
  -> authoritative state or event arrives
  -> client reconciles without restarting the presentation
```

The player must not wait for the last three steps before seeing the first cue.

### 4.2 Required rates and budgets

These are initial pilot budgets. Report median and p95 values, not only averages.

| Metric | Target | Failure threshold |
|---|---:|---:|
| Local input to visible response | <= 50 ms p95 | > 80 ms p95 |
| Client rendering | 60 FPS target | Sustained < 50 FPS on target devices |
| Frame time | <= 16.7 ms p95 | Repeated frames > 33 ms |
| Authoritative simulation | Fixed 30 Hz | Variable-step gameplay |
| Input send cadence | 30-60 Hz plus immediate action/change send | Action waits for a periodic snapshot |
| Snapshot cadence | 15-20 Hz by default | Full-state 30 Hz without evidence |
| Remote interpolation delay | 80-120 ms, tuned from measured jitter | Directly rendering arrival timing |
| React HUD update cadence | <= 10 Hz or change-driven | Full-app rerender at snapshot rate |
| Local correction error | <= 0.25 world units p95 | Frequent visible snapping |
| Match-state ingress | <= 75 KB/s per client average | Unbounded full-state growth |
| Eight-player browser-host outbound | <= 3 Mbps average | Sustained > 5 Mbps before overhead |

### 4.3 Protocol requirements

- Inputs MUST carry a monotonically increasing sequence number.
- Authoritative snapshots MUST acknowledge the last processed local sequence.
- The local client MUST retain and replay unacknowledged movement inputs after a
  correction.
- Match snapshots MUST carry an authoritative tick and sample time.
- Remote entities MUST render from a short interpolation buffer rather than from
  packet arrival time.
- Discrete gameplay events MUST have stable IDs so presentation plays each event
  once across retransmission, reconnect, and reconciliation.
- Lobby commands, session changes, and results use reliable delivery.
- High-frequency movement and state traffic SHOULD avoid ordered head-of-line
  blocking when the selected transport supports a safe alternative.
- Full JSON snapshots at simulation frequency MUST NOT be the assumed end state.
  Prefer deltas, compact schemas, quantization, and omission of unchanged data.
- Ping and pong message types are incomplete until RTT, jitter, loss, and stale
  snapshot age are measured and visible in a development overlay.

### 4.4 Controlled network verification

Network-facing work is incomplete until exercised at:

- 50 ms RTT, no loss
- 100 ms RTT, 1% loss
- 200 ms RTT, 3% loss
- A brief 500 ms interruption followed by recovery

Record input response, correction magnitude, stale snapshot age, queued bytes,
and whether actions double-play or disappear.

## 5. Main-thread and rendering conventions

### 5.1 React

- Per-frame or per-snapshot world state MUST NOT be placed in top-level React
  state.
- The renderer receives snapshots through a mutable store, ref, or dedicated
  gameplay state object.
- React reads derived HUD values only: health, ammo, score, phase, charge,
  connection degradation, and results.
- HUD values update only when changed or at a capped low frequency.
- Pointer movement, stick displacement, camera motion, and animation time MUST
  NOT call React state setters every frame.
- Menu and match component trees SHOULD be separated so a match snapshot cannot
  rerender the menu, lobby, gallery, and settings code paths.

### 5.2 Arena renderer

- Use one live arena renderer. Do not stack a Phaser arena and a Three.js arena
  to create the final product.
- Static map art MUST be cached, batched, instanced, tiled, or rendered once.
  Rebuilding every decorative shape every frame is prohibited.
- Per-frame work should update transforms, animation parameters, visibility, and
  genuinely dynamic effects.
- Camera fitting and expensive layout calculations run on resize or meaningful
  camera state changes, not unconditionally every frame.
- Reuse particles, labels, projectiles, and temporary effects through pools.
- Avoid per-frame object creation in hot loops.
- Animate transforms, opacity, shader parameters, or skeletal poses. Avoid layout
  work and DOM measurement during combat.
- Renderer changes MUST include a teardown and resize stress test. Fixing a
  WebGL lifecycle bug by permanently falling back to a more expensive rendering
  strategy is a temporary mitigation, not a final performance plan.

### 5.3 Profiling evidence

Rendering or HUD work must record:

- Device and browser
- Resolution and device pixel ratio
- Median and p95 FPS or frame time
- Long frames above 33 ms
- JavaScript heap trend over a complete match and rematch
- Main-thread time attributed to React, rendering, scripting, and garbage
  collection
- Asset download and decode time for a cold match load

## 6. Gameplay feedback contract

Every basic attack, Super, ball action, hit, elimination, respawn, and goal needs
a four-part presentation contract:

1. **Anticipation:** pose, aim change, charge, windup, or readable tell.
2. **Release:** animation acceleration, sound onset, muzzle or hand effect, and
   projectile or area creation.
3. **Impact:** contact flash, directional hit reaction, damage response,
   knockback readability, and appropriate camera or controller feedback.
4. **Recovery:** recoil, settle, cooldown readability, and return to locomotion.

Immediate local cues may be predicted. Damage, elimination, possession, score,
collision, and cooldown truth remain authoritative.

### 6.1 Impact layering

Important impacts should combine several short cues rather than one large effect:

- Pose or hit reaction
- Contact particle or decal
- Layered transient audio
- Small camera impulse when appropriate
- Brief material, outline, or value change
- Knockback, recoil, or environment response

Hit-stop is allowed only as a presentation technique. It MUST NOT pause the
authoritative simulation or delay outgoing inputs. Keep ordinary hit-stop within
roughly 30-70 ms and reserve stronger treatment for eliminations, Supers, and
goals.

Screen shake, flashes, and rapid zoom MUST respect accessibility settings and
must scale by event importance and distance. Continuous shake is prohibited.

### 6.2 Presentation events

Use a dedicated event stream rather than inferring every effect from changed
state. Recommended events include:

- `attack_started`
- `projectile_spawned`
- `attack_hit`
- `attack_blocked`
- `heal_applied`
- `super_started`
- `super_resolved`
- `ball_picked_up`
- `ball_released`
- `goal_scored`
- `fighter_eliminated`
- `fighter_respawned`

Events need an ID, authority tick, owner, position, direction where relevant,
and the minimum payload required by presentation.

## 7. Animation conventions

### 7.1 Minimum playable animation set

A fighter is not ready for live integration without:

- Idle
- Forward locomotion
- Backward locomotion
- Left and right strafe or a convincing directional blend
- Basic attack anticipation and release
- Super anticipation and release
- Hit reaction
- Stunned or disabled loop
- Elimination or defeat
- Respawn or entrance
- Victory
- Ball carry and ball release for Broomball

A model with only an idle clip is an art review asset, not a playable fighter.

### 7.2 Runtime animation graph

- Locomotion uses speed and local movement direction as blend parameters.
- Facing follows aim or the fighter-specific targeting rule, not arbitrary travel
  direction.
- One-shot actions crossfade over locomotion and cannot be restarted by every
  snapshot.
- Reconciliation adjusts position without resetting the active animation.
- Root motion remains disabled unless the authority explicitly consumes and
  validates it. Simulation position is the source of truth.
- Footstep and release markers come from animation events or explicit normalized
  times, not visual guesses in the render loop.
- Clip names, loop behavior, duration, and event markers belong in the asset
  manifest and are validated during build or import.
- Reduced-motion mode can reduce camera and screen effects, but it should not
  remove gameplay-readable tells.

### 7.3 3D runtime asset budget

Provisional mobile baseline per fighter:

| Asset property | Target |
|---|---:|
| Visible triangles | 10k-25k per fighter |
| Skeleton | <= 40 deforming bones |
| Skinned meshes | Prefer 1; justify more than 2 |
| Materials | 1-2 |
| Texture resolution | 512-1024 px for normal gameplay view |
| Compressed initial fighter payload | <= 1 MB |
| Simultaneously visible fighters | Validate 8 plus effects |

Use Meshopt or Draco geometry compression when it wins after decode cost is
measured. Use KTX2 or an equivalent GPU texture format for textured production
assets. Provide a lower-cost shadow and LOD strategy before increasing mesh
complexity.

The retired standalone Brandon GLB prototypes are **redacted and deprecated**.
They are not integration mules, production inputs, or live runtime candidates.
The shared procedural fighter path is the current integration baseline. See
`docs/BRANDON-3D-REDACTED.md`.

## 8. Game UI conventions

### 8.1 Match HUD

The HUD is a combat instrument panel, not an informational webpage.

- The top center is reserved for score, timer, phase, and short match-critical
  announcements.
- Health, ammo, status effects, and Super charge must be identifiable in
  peripheral vision without reading sentences.
- Network architecture labels such as `Browser host` do not belong in the normal
  HUD. Show a compact warning only when the connection is degraded.
- Reconnect, settings, and technical information belong in a pause or connection
  panel.
- Tutorial copy disappears after onboarding. Persistent control paragraphs are
  prohibited during normal matches.
- Mobile action controls use clear silhouettes, cooldown states, charge states,
  pressed feedback, and comfortable safe-area spacing.
- Critical state cannot be communicated by color alone.

### 8.2 Menus and lobby

- Character selection should feel like choosing a fighter, not reading a product
  catalog. Prefer a focused preview or carousel, concise ability identity, and
  immediate selection feedback over seven equally weighted text cards.
- The lobby emphasizes party slots, readiness, teams, mode or map identity, and
  the start action.
- Long mechanical explanations belong in fighter details or help, not the main
  path to a match.
- The primary play action remains visible without scrolling at supported desktop
  and mobile menu sizes.
- Ready, selected, connected, and unavailable states require distinct visual and
  motion treatment.

### 8.3 Results

- Lead with winner, placement, score, MVP moments, and rematch.
- Detailed statistics may live behind a secondary panel or table.
- Rematch should be faster and visually more prominent than leaving the room.

## 9. Audio conventions

- Local input feedback plays immediately when safe to predict.
- Confirmed impact audio follows the authoritative event.
- Repeated weapon sounds need small pitch or layer variation without becoming
  noisy.
- Important categories need distinct frequency and timing profiles: local
  attack, enemy threat, hit received, heal, Super, elimination, goal, countdown.
- Music and ambience must not mask attack tells or confirmation sounds.
- Audio node creation and decoding must not occur inside hot combat loops.

## 10. Known prototype debt

The following describe the current implementation and MUST NOT be copied as
preferred conventions:

- Snapshots are delta-encoded JSON (quantized, ~18 Hz, keyframe every 10 s)
  over a reliable ordered channel. The schema still carries fields the client
  does not read, and per-entity ids are long UUIDs; a compact binary or
  index-keyed schema would cut the remaining bytes further.
- Movement inputs are applied from the client's timestamped timeline with
  bounded extrapolation and catch-up. A stall longer than the 0.25 s bank is
  skipped rather than replayed, and a stalled fighter visibly holds and then
  catches up at up to 2x for other viewers.
- Local attack and Super intent is shown immediately with data-driven held aim
  footprints, followed by predicted release cues (sound, muzzle flash, cone,
  or Super anticipation). Projectiles themselves are not predicted: they appear
  when the authoritative snapshot arrives, about one RTT after the release
  flash. Predicted cues are not yet animation clips.
- The arena is a single Three.js renderer (`client/src/arena/`). All 18
  fighters use procedural placeholder models whose clip set is authored as
  code, not as validated animation assets with manifests. The older Brandon
  GLB studies are redacted, deprecated, and deliberately unavailable to the
  live runtime. Release
  timing is still taken from the authoritative event, not from clip markers.
- Respawn presentation is inferred from the alive flag because the engine
  does not emit `fighter_respawned`.

Resolved on the `refactor/performance-gameplay-standards` branch (see
`docs/STATUS.md`): snapshots no longer replace top-level React state; inputs
carry sequences with per-viewer acknowledgement and client replay; static map
art is no longer redrawn every frame; a development overlay and scripted
latency/loss harness exist; snapshots are delta-encoded and measured within
the ingress and host-outbound budgets up to 10 players; the authority applies
each movement input for the time it was held, and correction p95 meets the
0.25-unit target in every scripted §4.4 case.
- The redacted Brandon v4 archive is not a production runtime asset. Arena
  import validation would reject it (64k triangles exceeds the 25k budget, and
  its clip set is incomplete).
- Physical-device performance and controlled latency or loss campaigns remain
  incomplete.

When work touches one of these areas, agents should either improve the debt or
avoid making it harder to remove.

## 11. Verification matrix

Use all rows that apply.

| Change type | Required evidence |
|---|---|
| Simulation or balance | Unit tests, deterministic replay where applicable, two-client verification |
| Network protocol | Unit/integration tests, sequence and reconnect checks, controlled latency/loss results |
| Renderer | Before/after frame profile, resize and teardown stress test, complete-match memory trend |
| React HUD | React commit profile, proof that snapshot delivery does not rerender the full app |
| Animation | Clip manifest validation, state-transition review, no restart on reconciliation, game-camera capture |
| 3D asset | Triangle/bone/material/texture report, external GLB load, mobile profile, eight-character scene test |
| Controls | Desktop keyboard/mouse check, physical multi-touch check, focus/background recovery |
| VFX or camera | Readability capture, reduced-motion behavior, worst-case effect stress test |
| Audio | Event mapping review, rapid-fire stress test, volume and mute verification |
| Game UI | Supported viewport captures, keyboard focus, touch target and safe-area review |

All gameplay-facing changes still require:

```sh
npm test
npm run build
```

## 12. Definition of done

A gameplay or performance task is done only when:

- Correctness tests pass.
- The relevant numeric budgets were measured.
- The result was observed in the actual game camera, not only an isolated viewer.
- Local response remains immediate under the controlled network cases.
- Mobile layout and controls were checked at the target orientation.
- Reduced-motion and audio settings remain functional.
- No new high-frequency React path, unbounded allocation loop, or duplicate live
  renderer was introduced.
- Any accepted budget exception is documented with measurements and user
  approval.
- `docs/STATUS.md` records material verification or known remaining limitations.

## 13. Change review checklist

Before completing a task, answer these questions explicitly:

1. What does the player feel sooner, more clearly, or more satisfyingly?
2. What work occurs on every frame, every simulation tick, every snapshot, and
   every React render?
3. Which cues are predicted locally and which results remain authoritative?
4. What happens at 100 ms RTT and 1% loss?
5. What is the p95 frame time on the weakest tested device?
6. Can eight fighters, their effects, and the HUD stay within budget together?
7. Does the change make the arena feel more like a game and less like a website?
8. What evidence proves the result outside unit tests?

If those answers are unknown, the task is not ready to be called complete.

