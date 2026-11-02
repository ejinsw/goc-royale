# GOC Royale — 3D Art & Audio Direction

Version 0.6 · October 29, 2026

**Roster-wide production standard:** all seven fighters follow [CHARACTER_3D_PIPELINE.md](CHARACTER_3D_PIPELINE.md): painterly anime-inspired chibi 3D, shaped expressive faces, articulated five-finger hands, believable garments and the same eight production passes with per-character evidence. [BRANDON_3D_ASSET.md](BRANDON_3D_ASSET.md) is the first individual specification, not an exception to a simpler standard for the other fighters. Exact designs and budgets remain subject to review and device tests.

**Current user requirements:** properly shaped and shaded stylized game fighters, actual 3D models, free production tools and limbs prepared for animation. The October 27 correction rejects the toy-cartoon interpretation; collectible proportions and a uniform molded-plastic finish are not approved. Keep readable cartoon shapes, a less strange-looking face and controlled smooth surfaces. Brandon’s beige jacket replaces the earlier blue/gold direction. Seven fighters; Showdown FFA and 3v3 Broomball. Ethan keeps Rizz and Aura Pulse.

[Performance and gameplay standards](PERFORMANCE-AND-GAMEPLAY-STANDARDS.md), especially sections 7.3 and 11–12, govern runtime budgets and acceptance. Detailed source rigs may exceed runtime complexity; that does not approve larger live-game exports. Any runtime-budget exception requires written rationale, measured evidence and an explicit user decision. No exception is approved by this document.

**Proposed for review:** the exact palette, proportions, material settings, animation timings, audio direction, asset budgets and runtime renderer below. These are production targets, not claims about assets already built.

Primary direction: the October 29 painterly anime/chibi references and concept, built on the requirements for properly shaped bodies, expressive faces, usable fingers and animated clothing. See [the shared pipeline](CHARACTER_3D_PIPELINE.md) and each fighter’s individual asset specification. [Brandon redesign brief](BRANDON-REDESIGN-BRIEF.md) is historical. The earlier style comparison is historical exploration. Existing Ethan/Brandon PNGs remain likeness references, not production meshes. The v4 Brandon movement study has a full-body limb rig and browser export, with documented deformation limits. It does not yet implement the October 29 concept, articulated fingers, facial animation or finished clothing.

## 1. Visual promise

A lively campus arena populated by painterly, anime-inspired chibi 3D fighters. Sculpted expressive faces, articulated hand gestures, believable stylized clothing, grouped shadows, controlled highlights, colorful props and dynamic movement. Humor comes from the ministry-themed abilities and recognizable personalities.

- Start around 2.8–3.2 heads tall and review full-body proportions before locking each fighter. Vary body shapes and posture while retaining shared chibi readability; enlarged hands/shoes should support gestures and gameplay.
- Broad, deliberately shaped hair locks with continuous curved silhouettes; no clumps of primitive spheres or visible random facets. Low polygon count is an optimization goal, not the visible style.
- Shaped shoulders, tapered sleeves and limbs, defined cuffs and rounded shoe profiles. Continuous deforming surfaces at joints; a bevel on a cube is not sufficient character modeling.
- Preserve likeness through hairline, glasses, smile, face proportions and posture.
- Explore friendly shaped faces, short necks, small noses, simple eyes and restrained smiles. Exact proportions remain open; avoid oversized staring toy eyes as well as semi-natural skin, glassy detailed eyes and stretched grins.
- Every production fighter has shaped palms, four articulated fingers and an opposable thumb on each hand. Fit and test grips on that fighter’s actual props; mitten prototypes do not satisfy the source/menu asset requirement.
- No skin pores, individual hair strands, fabric weave, photorealistic wear or glossy wet skin.
- Low-poly does not mean unfinished: controlled silhouettes, clean deformation and consistent lighting are required.
- Check all art at the actual overhead gameplay size, not just a large showcase render.

## 2. Color script

Proposed shared palette; tune against actual arena and phone screenshots before locking.

| Purpose | Color | Hex |
|---|---|---|
| UI shadow / outline / dark clothing | Ink navy | #18283E |
| Main UI panels | Deep blue | #244769 |
| Primary action / selection | Warm gold | #F4C95D |
| Light text / shoes / nametags | Warm cream | #FFF1D4 |
| Neutral stone | Warm gray | #B9B3A5 |
| Lawn ground | Muted sage | #88A977 |
| Rink ground | Pale ice | #B9DCE5 |
| Friendly team | Cyan blue | #39B9ED |
| Opposing team | Coral red | #F16C61 |
| Healing | Mint | #74DDA6 |
| Danger / zone | Hot coral with dark edge | #F06C64 |

Ground is less saturated than fighters. Attacks are brighter than environment detail. Reserve gold for selection, meaningful rewards and a few outfit accents; do not make every effect gold.

Team identity uses ground rings, arrow/diamond markers and goal markings, not recoloring all clothes. Keep fighter identity distinct from team identity. Pair color with shape and labels; test grayscale readability and common color-vision deficiencies. Check text contrast on final UI surfaces.

## 3. Fighter visual briefs

| Fighter | Primary / accent | Silhouette and prop | Basic / Super presentation |
|---|---|---|---|
| Brandon Kam | Beige #D4B78F / warm cream #F5EDDA; tan cuffs #A98B68 | Integrated chunky curtain hair, fitted dark brown/ink glasses, beige jacket, clipboard | Nametag flick; outlined welcome circle with inward floating tags |
| Daniel | Sky blue #83B5EF / navy | Broad tank proportions, oversized keys | Key fan; chunky stylized van with visible charge direction |
| Rich | Lavender #B9A3EE / cream | Compact camera, prominent lens | Narrow flash shot; rectangular viewfinder and single soft flash |
| Samuel | Mustard #EBC65A / mint | Rounded snack bag and apron-like color block | Snack toss; clearly destructible snack table with healing pulses |
| Josh | Orange #F5A474 / charcoal | Speaker-shaped backpack or handheld mixer | Wide graphic sound cone; larger directional pressure wave |
| Elijah | Teal #77D5B9 / ink | Laptop and squared digital accessories | Blocky bug projectile; offset silhouettes and rewind trail |
| Ethan Ha | Plum #A96AB5 / gold | Black sculpted fringe, dark tee, gray joggers, small guitar | Rizz musical notes; crisp circular Aura Pulse with a readable boundary |

Only Brandon and Ethan currently have supplied likeness references. Treat the other five as provisional silhouettes until reference photos arrive. Clothing/props are fictionalized game designs, not assertions about the people.

Ethan's Aura Pulse remains an instant enemy knockout within its current 4-unit, line-of-sight radius; walls and spawn protection still apply. Visual animation must not introduce a new gameplay delay or imply a longer damage radius. A future warning/cast time would be a separate balance decision.

## 4. Modeling, materials and textures

Author editable source in Blender. Use shared base proportions and a common humanoid rig, then vary head shape, hair, clothing and props. Rig sharing should not make every fighter look identical.

- Smooth stylized surfaces with broad controlled highlights. Model the silhouette and volume first, then refine normals and materials. Smooth shading cannot repair blocky geometry. Reserve sharp edges for intentional hard details such as clipboard edges.
- Start with portable metallic/roughness materials and painted tonal variation. Test any required toon ramp or outline in the browser during look development; a Blender-only shader does not establish the game look.
- Most surfaces: metalness 0. Tune roughness separately for skin, hair, glasses and costume under neutral and game lighting; a shared plastic finish is not the target. Keep readable broad highlights without photorealistic cloth weave or wet corneas. Exact settings remain look-development proposals. Small metallic clips may use a separate restrained material.
- Use coherent painted/baked maps for cloth, skin, hair and props; vertex colors or shared palette accents can supplement them. Model large folds and garment edges, bake shallow detail, and animate changing folds through weights/corrections and authored garment support motion.
- Begin with one 1024px character atlas, plus a small face atlas only if needed. Preserve editable higher-resolution sources and measure encoded size/GPU memory. Lower-resolution gameplay variants must retain readability.
- Model eyelids, lips, a usable mouth opening/interior and shaped facial volume. Provide tested blink, smile, brow, jaw and reaction controls using appropriate joints/shape keys. Keep anime features readable without realistic pores or wet-eye effects; facial graphics alone are not an expressive rig. Glasses may use opaque frames without transparent lenses.
- No baked directional highlights on skin or clothing that fight the runtime light. Very light ambient occlusion may be baked separately.
- No baked bloom, floor shadow, aura, lettering or UI baked into a character texture.
- Keep held props separate and attach them to named sockets. Avoid thin geometry that disappears at gameplay scale.

## 5. Lighting, camera and environments

Proposed camera: fixed three-quarter overhead orthographic view, initially about 55 degrees above the ground. Follow the local fighter with bounded smoothing; retain predictable aim and arena visibility. Validate framing on wide and narrow screens before finalizing models.

Lighting: one warm key light, cool ambient fill, soft ground contact shadows. Use a simple blob shadow fallback. Avoid relying on ambient-occlusion or bloom postprocessing for readability. Menu showcase uses the same model and materials, with a closer camera.

**Central Lawn:** modular sage grass tiles, cream paths, beveled stone cover, chunky planter bushes and wooden crates. Bush concealment must agree with game rules. Decorative campus buildings remain outside the combat field; no collision surprises.

**Broomball Night:** clean pale rink, bold team goals, thick low boards, graphic center markings, warm lights outside the play space. No expensive mirror-like ice or heavy fog. Ball readability takes priority over decoration.

Map visuals wrap the existing collision geometry. Do not change obstacle sizes or introduce 3D physics merely to accommodate art. Props that occlude players should fade or be omitted from camera-facing edges.

## 6. Rig and animation specification

**Current status:** Brandon v4 is a rigged movement prototype with idle/joint-demo clips and documented bend limits. The next asset requires rebuilt face/hands/garments, renewed deformation testing and production animation, as specified in [BRANDON_3D_ASSET.md](BRANDON_3D_ASSET.md). The requirements below are not claims that the final asset or shared roster rig is complete.

Share humanoid naming and animation conventions for root, hips, spine, neck/head, arms/hands and legs/feet, with articulated finger chains, required face controls and limited garment support. Author the detailed controls needed for performance, then deliver a tested runtime rig with at most 40 deforming bones under the performance standard. Preserve expressions and grips through validated bone/shape-key/baked-motion choices. Provide foot-plant controls in Blender and named prop sockets: hand_r, hand_l, back, head. Refit and test each character; retargeting is not automatic acceptance. Use authored garment follow-through in the first milestone; no runtime cloth/hair solver is required.

Arms move by blended skin weights across shoulder/clavicle, upper arm, forearm and hand bones. The jacket needs joint loops and enough underarm room to follow those bends without tearing or collapsing. Hips, thighs, shins and feet need the same deliberate topology and weight transitions. Separate garments should share compatible deformation weights; rigid props use sockets. Rotating disconnected arm blocks or merely joining objects cannot establish animation readiness.

Before authoring performance clips, render both sides in raised-arm and forward-reach poses, 90–120-degree elbow bends, wrist/forearm twists, hip lifts, deep knee bends, ankle flexion and a planted-foot squat. Examine shoulder, elbow, wrist, groin, knee and ankle close-ups for collapse, gaps, pinching and garment drift. Require no unweighted vertices, normalized weights, at most four influences per vertex and no unexplained cross-body weight leaks. Confirm every requested joint was actually measured; numeric checks do not replace visual inspection. Repeat the checks on the exported model with game-compatible skinning.

Author in Blender at 30 fps, export baked animation clips. Locomotion is in-place: authoritative simulation moves the root. Camera bob and mesh squash must not move the hitbox. Rig constraints are baked before export.

| Clip | Initial duration | Notes |
|---|---|---|
| idle | 2–3 s loop | Breathing and tiny weight shift, stable feet |
| run_forward | 0.55–0.75 s loop | Match step cadence to actual movement speed |
| run_backward / strafe_left / strafe_right | 0.55–0.75 s loops | Allow aiming independently of movement |
| basic_attack | 0.25–0.4 s | Clear wrist/arm gesture; recovery may blend into movement |
| super | Fighter-specific | Sync visual event to authoritative activation; no hidden new delay |
| hit | 0.12–0.2 s | Small additive flinch, does not interrupt control |
| stunned | loop for actual status | Readable pose and status icon |
| eliminated | 0.45–0.7 s | Stylized recoil/fall, no gore; remove hitbox immediately per rules |
| respawn | 0.4–0.6 s | Pop-in with protection ring; movement follows rules |
| carry_ball | locomotion overlay | Keep ball and carrier state visible |
| ball_shot | 0.25–0.4 s | Charge pose and release synchronized with shot |
| victory / defeat | 1–2 s | Distinct personalities; skippable results presentation |

Every fighter first needs the close-up face/grip/garment proof from [the shared pipeline](CHARACTER_3D_PIPELINE.md), in addition to a reviewed full-body mesh and proven limb deformation. Then deliver three polished clips: idle, run_forward and basic_attack. Review contacts, weight transfer, arcs and silhouette before extending the library. The later fighter prototype requires forward/back/strafe movement, Super, hit, eliminated and victory. Finish common Broomball states before declaring the shared rig production-ready.

Per-character signatures: Brandon flicks a tag; Ethan strums or snaps a note; Daniel braces then van-charges; Rich raises the camera; Samuel lobs a snack; Josh plants feet for a cone; Elijah taps the laptop and snaps back on rollback.

Prefer short authored keyframe gestures suited to the fighter’s approved proportions. Test a full run/attack cycle in-engine: good Blender playback alone is insufficient.

## 7. Effects and combat feedback

Use simple meshes and pooled billboards: rings, wedges, stretched quads, short trails and small sparks. Ground telegraphs remain readable from above. Cap simultaneous particles and avoid full-screen flashes.

Each fighter needs a distinct projectile, hit accent, Super accent and ready icon. Shared effects cover healing, stun, shield/protection, elimination, respawn, goals and ball possession. Never make sound or camera shake the sole indicator of a gameplay event.

Keep gameplay event IDs separate from presentation: confirm damage and elimination from the host; play immediate local attack gesture provisionally without awarding damage. Avoid duplicated sounds/effects when a predicted action is confirmed. Latency engineering remains a separate workstream from the 3D art migration.

## 8. Game UI direction

A game lobby, not a marketing website. Large animated fighter on a small stage; compact player identity; obvious mode choice; one dominant Play/Create Party action; nearby invite/join controls. No fake currencies, ranks or progression systems.

Interface chrome is plain but punchy and uses blue plus greys and black only (user decision, October 31, 2026; supersedes the earlier navy/cream/gold direction). Fighters keep their own palettes on their models and portraits. Barlow Condensed remains the display face and Barlow the readable body face unless tests reveal a need to replace them. Component rules live in `docs/CODE-PRACTICES.md`.

Fighter selection should emphasize silhouette, role, basic attack and Super with clear selected/ready states. Party lobby groups teammates, invites, mode and readiness. Keep skill explanations available without crowding the launch flow.

HUD priorities: local HP/ammo/Super, match objective, timer, teammates/ball where relevant. Big touch targets and safe-area spacing. UI transitions around 120–200 ms; honor reduced-motion preferences. Keep game state independent of menu animations.

The interrupted menu code is unfinished source work, not an approved visual direction. Do not treat it as final or overwrite concurrent deployment work.

## 9. Sound and music

Tone: playful, tactile and punchy. Dry, short sounds with rounded transients; avoid harsh feedback squeals and overly loud memes. Record original foley or synthesize effects locally, then edit and mix in Audacity. Compose original music in LMMS. No paid generation APIs in this plan.

| Category | Required cues | Character |
|---|---|---|
| UI | focus/select, confirm, back, error, ready, countdown | Soft plastic clicks and short pitched chimes |
| Brandon | tag throw/hit, welcome circle | Paper flick plus warm two-note chime |
| Daniel | key volley, van windup/dash | Key jingle, stylized engine, soft tire rush |
| Rich | shutter, flash/photo | Camera click, short airy pop |
| Samuel | toss, heal, table deploy/break | Bag rustle, snack tap, soft healing bell |
| Josh | cone, sound blast | Rounded bass thump and short air movement |
| Elijah | bug, bounce, rollback | Original digital blips and reversed chirp |
| Ethan | Rizz, Aura Pulse | Plucked notes and a brief expanding synth chord |
| Shared match | hit, elimination, respawn, shield, zone warning | Clear contrasting cues, no gore |
| Broomball | pickup, charge, release, bounce, goal | Rubber taps, sliding swoosh, celebratory chord |

Create 2–3 subtle variations for frequently repeated hits/footsteps. Limit repeated sound stacking, attenuate distant sources and prioritize local damage and objectives. Duck music lightly for critical cues. Separate music, effects and UI volume controls; existing settings can be extended later.

Music scope: one 45–60 s seamless menu loop, one 60–90 s arena loop with optional intensity layer, 3–5 s victory/defeat stingers. Proposed instrumentation: light drums, mallet/pluck synth, warm bass, occasional guitar-like accents. Keep enough space for gameplay sound; no vocals needed for launch.

Master files: 48 kHz WAV, clean starts/ends and no clipping. Ship tested compressed browser formats with fallback as needed; preserve lossless sources outside the public bundle. Validate loop joins and overlapping effects on phone speakers and headphones. Do not normalize every sound to the same peak. Keep headroom and offer mute/reduced intensity.

No voice cloning. If original spoken lines are later wanted, record willing participants and track permission/source metadata. Reference photos and contact information stay out of shipped assets.

## 10. Asset contract and initial budgets

These are shared provisional targets from [the character pipeline](CHARACTER_3D_PIPELINE.md), to measure on real devices. Larger candidate assets must still fit the whole-scene budget.

- Character: attempt roughly 12k triangles including props; evaluate a 12–18k candidate only where visibly justified and profiled. Runtime limits remain at most 40 deforming bones, 1–2 materials and 512–1024px gameplay textures. Prefer one skinned mesh; justify more than two. Keep detailed source hands/expressions and prove the optimized version preserves them.
- Up to eight active characters. Test all seven unique models plus a duplicate, projectiles, effects and arena detail; test repeated same-fighter cases too.
- Combined visible scene: start below 100k triangles and approximately 80 draw calls. Optimize after profiling, not by these numbers alone.
- Target 60 fps and p95 frame time at most 16.7 ms; sustained below 50 fps fails on target devices. Cap pixel ratio and reduce shadows/effects before reducing input responsiveness. A 30 fps fallback is not a passing result under the performance standard.
- Export GLB with named clips and required facial/corrective animation; keep the initial compressed fighter payload at most 1 MB. Measure actual bytes, decode costs, codecs and later-loaded assets separately. Use measured geometry compression and KTX2 or an equivalent GPU texture format. Load unused fighters on demand.
- Coordinate contract: one simulation unit maps to one world unit; simulation X/Y maps to scene X/Z. Vertical height is cosmetic. Model origin at feet, upright, consistent facing and scale. Confirm exported axes with a test model before mass production.
- Colliders remain simple gameplay shapes derived from existing rules, never auto-generated from detailed visual meshes.
- Deliver editable .blend, exported .glb, source textures, preview renders, clip list and a manifest (author/source, license, version, dimensions, triangle/material counts, file sizes).

Suggested naming: char_brandon_v001.blend, char_brandon_v001.glb; clips idle, run_forward, basic_attack, super, hit, eliminated, victory; audio sfx_brandon_tag_throw_01.wav.

## 11. Free production workflow and researched skills

**Roster workflow update (October 29): Blender + the installed Scenario sculpting, retopology, UV/baking, shading, rigging, animation and export skills, applied to every fighter.** See [modeling skill audit](MODELING-SKILL-AUDIT.md) for the dated setup/research evidence. Brandon v4 demonstrates limb animation and browser export, with remaining limits; it does not prove the new face/finger/garment standard. Production acceptance is pending for each fighter. The candidate table below records the earlier search, not the current selection.

**Foundation: Blender + a reviewed character workflow.** A skill supplies instructions and automation; it does not by itself provide a modeling application, professional judgment, or a production-ready character generator.

| Candidate inspected | Fit | Caveat / decision |
|---|---|---|
| roble3/cc-blender-skill — blender-modeling, blender-materials, blender-animation | Mesh creation, materials, rig/animation operations through Blender | Earlier candidate, superseded by the Scenario suite for the character trial; community code, not official Blender. Modeling skill explicitly limits organic work to blockout; likeness/deformation still require refinement. |
| freshtechbro/claudedesignskills — blender-web-pipeline | GLB export and browser optimization recipes | Useful companion for export. Examples need checking against installed Blender; automated decimation is not a substitute for clean deforming topology. |
| Meshy — meshy-3d-generation | Image/text-to-3D, texturing, rigging/animation pipeline | Excluded from default plan: service login and potentially billable stages. |
| Layer — layer-audio / layer-3d | Hosted generation workflows | Excluded from default plan: service-dependent generation; small repository footprint and no local free workflow established. |

Discovery snapshot (October 25, 2026): Skills CLI reported about 2.2k installs for blender-modeling and 3.5k for blender-web-pipeline; GitHub API reported 125 and 1,129 repository stars respectively. These are popularity signals only, not a quality guarantee. At that October 25 snapshot, no candidate had been installed or exercised against this project. Verify compatibility and inspect dependencies before installation.

Historical setup commands from the earlier search, not executed; use the newer selection in the modeling skill audit instead:

```sh
npx skills add roble3/cc-blender-skill --skill blender-modeling --skill blender-materials --skill blender-animation
npx skills add freshtechbro/claudedesignskills --skill blender-web-pipeline
```

Use Blender locally with Python automation or a separately reviewed Blender connector. Do not assume a skill installs a working connector. Prefer local production that does not need paid APIs. A generated 2D illustration cannot be imported as an animated 3D character without modeling, topology and rigging work.

## 12. Production sequence and acceptance

Every fighter follows the same eight passes: reference/proportions → primary sculpt → clothing/secondary forms → deforming mesh/rig → textures/browser look → face/grip/garment proof → first gameplay clips → optimization/integration. Required deliverables, checks and the individual-specification template are in [CHARACTER_3D_PIPELINE.md](CHARACTER_3D_PIPELINE.md).

1. **Brandon pilot asset:** use his individual specification to establish the full face, finger and garment workflow. The beige jacket, face and clipboard are specific to him; the process is shared.
2. **Browser integration proof:** verify appearance, clips, grips and event timing on phone/desktop. Keep the existing simulation, rooms and WebRTC architecture; renderer migration is a separate implementation step.
3. **Ethan reuse test:** create his own asset specification and complete the same passes with his silhouette, outfit and proposed guitar/gestures. Verify Rizz and Aura Pulse against their existing timing and radius.
4. **Daniel, Rich, Samuel, Josh and Elijah:** each receives an individual specification, references, turnarounds, grip/expression/garment proof, tested retargeting and unique combat clips. Missing likeness references remain explicit; no fighter is complete because Brandon passed a check.
5. **Complete game states:** finish remaining combat/Broomball states, environments, menu showcase and audio while preserving each character's personality and shared visual language.
6. **Release QA:** exercise actual multiplayer devices, loading/frame-time budgets, audio overlap, readability/accessibility, contacts and animation transitions; deliver a manifest and evidence per fighter.

A fighter passes only when its exported asset works outside Blender, its face and grips read at menu size, its silhouette/prop read at game size, its joints and clothing survive intended poses, its feet/props remain stable, and its attacks/effects agree with authoritative events. Check both hands, face deformation, all required limb regions, cross-mesh contacts, source reproducibility and phone performance. A pretty still or a reused rig alone does not pass.

## 13. Decisions still to validate

- Exact per-fighter proportions around the initial 2.8–3.2-head range, individual palettes and the browser painterly-shading implementation.
- Three.js versus another browser 3D runtime; no renderer migration committed yet.
- Minimum physical test devices and acceptable download/frame-time budgets.
- Final music instrumentation after a short original loop is auditioned.

## Sources and tool references

- [Blender — free and open-source 3D software](https://www.blender.org/about/)
- [Audacity — free audio editor](https://www.audacityteam.org/)
- [LMMS — free music production](https://www.lmms.io/)
- [Blender skills repository](https://github.com/roble3/cc-blender-skill)
- [Blender modeling skill](https://github.com/roble3/cc-blender-skill/blob/main/plugin/skills/blender-modeling/SKILL.md)
- [Blender web pipeline skill](https://github.com/freshtechbro/claudedesignskills/blob/main/.claude/skills/blender-web-pipeline/SKILL.md)
- [Meshy skill inspected, not selected](https://github.com/meshy-dev/meshy-3d-agent)
- [Layer skills inspected, not selected](https://github.com/layerai/skills)
