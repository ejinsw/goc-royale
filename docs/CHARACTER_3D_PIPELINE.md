# GOC Royale — shared character asset pipeline

Version 1.0 · October 29, 2026 · Production requirements for all seven fighters

## Scope and document authority

**Brandon, Daniel, Rich, Samuel, Josh, Elijah and Ethan all use the same staged character-production process and quality requirements.** The shared direction is painterly, anime-inspired chibi 3D: shaped expressive faces, articulated five-finger hands, believable stylized clothing and dynamic motion.

This document governs the common workflow. [Performance and gameplay standards](PERFORMANCE-AND-GAMEPLAY-STANDARDS.md), especially sections 7.3 and 11–12, govern runtime budgets and acceptance. Detailed source rigs may exceed runtime complexity; that does not approve larger live-game exports. Any runtime-budget exception requires written rationale, measured evidence and an explicit user decision. No exception is approved by this document. [Art and audio direction](ART-AND-AUDIO-DIRECTION.md) governs the wider visual world, effects, UI and sound. Each fighter must have a newly approved individual asset specification following the template below. The former Brandon specification is [redacted and deprecated](BRANDON-3D-REDACTED.md), not a worked example. Fighter-specific documents supply identity, outfit, prop and performance decisions, not lower quality standards. The [pilot specification](PILOT-SPEC.txt) governs gameplay and networking; art must not change those rules implicitly.

The earlier mitten-hand, static-face and sprite-only final-art defaults are superseded. Runtime rig limits remain governed by the performance standard. Existing prototypes and historical asset reports remain valid records of what was built, not exemptions for the next production asset. This update does not claim that any fighter already meets the new standard.

## Shared visual language, individual characters

- Begin around 2.8–3.2 heads tall and review silhouette, face proportions and overhead readability. Vary body shape, posture, head shape and scale deliberately by fighter; do not make seven copies of Brandon.
- Sculpt coherent faces with modeled eyelids, lips, a mouth opening/interior and readable eyes. Build blink, smile, brow and jaw/reaction controls appropriate to the character. Facial graphics alone do not replace expression-ready geometry.
- Shape a palm, four fingers and an opposable thumb on **both** hands. Fit finger topology and controls to the character's props and gestures. Gloves may be stylized but still need usable articulated digits.
- Construct garments with deliberate collar/cuff/hem shapes, major folds and visible-edge thickness. Use painted or baked detail for shallow creases and seams. Pose corrections and authored garment motion handle changes under movement.
- Use broad hair locks, painted color variation, grouped shadows and selective highlights. No toy assembly joints, uniform vinyl finish, photorealistic pores or simulated individual strands.
- Share compatible skeleton conventions, material tools, base topology and animation tooling where useful. Refit and validate geometry, weights, expressions, grips and retargeted motion for each fighter.
- Shared style does not mean shared costume: retain each fighter's palette, ministry props and personality. Team identification stays separate from clothing color.

The October 29 Brandon concept illustrates this direction; its face, beige jacket and clipboard belong to Brandon. Generated art is a design reference, not an automatic 3D mesh or evidence of a finished rig. Supplied photos inform likeness; where photos are unavailable, identify the design as provisional and do not claim likeness approval.

## Required passes for every fighter

| Pass | Required artifact | Exit evidence |
| --- | --- | --- |
| 0 — Reference and proportions | Individual specification, consistent front/profile/back/three-quarter guides, palette, prop scale and hand assignment | One coherent character across views; reference gaps and provisional choices recorded |
| 1 — Primary sculpt | Neutral full-body sculpt, shaped face/hair and both five-finger hands | Silhouette, likeness cues and anatomical form read in gray renders without flattering lighting |
| 2 — Clothing and secondary forms | Garment construction, major folds, shoes/accessories and fitted props | Folds follow tension/compression/gravity; openings and thickness work from all views |
| 3 — Deforming mesh and initial rig | Planned joint/face/finger topology, UVs, fitted skeleton and weights | Both sides deform; no unweighted vertices; normalized weights, maximum four influences; plausible hand/prop contacts |
| 4 — Textures and browser look | Baked/painted surface maps, material sample and candidate browser export | Consistent appearance under neutral/menu/arena lighting; any toon/outline shader actually works in the browser |
| 5 — Face, grip and garment proof | Close-up performance with prop contact, arm bend/reach, blink/smile and garment follow-through | No prop sliding, exposed gaps, unacceptable penetration or broken expressions; verify transitions in-browser |
| 6 — First gameplay animation set | Polished idle, in-place run and fighter-specific basic attack with blends | Stable contacts, weight transfer, intentional arcs and correct gameplay-event timing |
| 7 — Optimization and integration | Measured export, remaining required states, device tests and versioned manifest | Export round-trip, playback, multi-fighter game presentation and physical-device checks pass |

Early rig tests should expose difficult proportions during sculpting. Complete a neutral material sample before committing to elaborate textures. Changes that affect a passed result reopen its relevant checks: new sleeves require bending/contact review; retargeted motion requires contact and grip review.

Reviewable checkpoints are primary form/likeness, the close-up performance proof and the first gameplay set. Continue reversible work using the established brief; do not turn each operation into a permission request. Record feedback and unresolved decisions, and never mark a proposal user-approved without that feedback.

## Fighter-specific proof scenes

All rows require expressive faces, articulated hands and the complete shared limb tests. These are proposed test choreography based on current visual briefs, not new gameplay mechanics or locked costume designs.

| Fighter | Distinct identity to preserve | Hand, garment and motion proof |
| --- | --- | --- |
| Brandon | Beige jacket, glasses, center-parted hair, clipboard and nametags | Hold clipboard while lifting/turning the arm; pinch and release a tag; sleeve compression; blink and welcoming smile |
| Daniel | Broad tank silhouette, blue utility motifs, keys and van theme | Grip a keyring, open fingers for key throw, brace/turn for the existing van move; check shoulder and hip clothing under the wider body shape |
| Rich | Lavender/cream, camera and lens silhouette | Support camera with one hand and place shutter finger with the other; raise camera without face/glasses penetration; lens/shutter event matches attack |
| Samuel | Mustard/mint, snack bag and apron-like costume proposal | Stabilize bag, grasp and release a snack; elbow folds and loose costume edges follow reach; friendly expression remains readable |
| Josh | Orange/charcoal, speaker/mixer equipment | Grip or operate the selected mixer/microphone prop, plant feet and perform a broad sound gesture; verify equipment attachments and sleeve motion |
| Elijah | Teal/ink, laptop and digital accessories | Support/open the laptop and articulate tapping fingers; maintain contact during torso motion and the existing rollback presentation |
| Ethan Ha | Plum/gold accents, dark tee, gray joggers, music identity | If the proposed guitar remains, fret/strum with separate fingers and stable strap/hand contacts; demonstrate the chosen Rizz gesture and Aura Pulse stance without adding a cast delay |

Choose final props and gestures in each individual specification. Do not copy Brandon's hand animation onto a differently shaped prop. Every fighter also needs Broomball carry/shoot presentation that agrees with existing carrier restrictions and ball state.

## Common clothing, face and prop contract

Large folds and silhouette details are modeled. Fine seams/creases use appropriate textures and baked normals. Joint topology, compatible weights and pose corrections control bending. A small set of authored garment/helper-bone motions provides collar, hem or accessory follow-through. Runtime cloth simulation is not required for the first playable assets; offline cloth experiments must be converted into a supported export representation before delivery.

Provide usable foot-plant controls, individual finger posing and accessible face controls in Blender. The exported rig contains the required deform bones/attachments and sampled animation data, not every authoring controller. Test ordinary linear skinning; do not depend on Blender-only volume preservation or modifiers that are absent from the game.

Each fighter needs relaxed/open hands and the actual grip/release poses for its equipment. Attach held props through named left/right hand sockets with per-prop offsets. Release events, projectile ownership, impacts and damage follow the authoritative simulation. The gameplay root remains stationary for in-place clips; animation cannot move hitboxes, extend an effect radius or create a new attack delay.

At minimum, prove neutral, blink left/right, smile, brow changes, jaw opening and a hit/reaction expression. Inspect eye/lid and lip closure, both hands and all visible garment openings. An unused placeholder expression or a bone with no useful deformation does not satisfy the requirement.

## Budgets and browser constraints

Shared authoring quality must be delivered within the mandatory runtime baseline below. Source rigs retain the detailed fingers and expressions; optimize runtime representations with validated skinning, shape keys, baked motion and LODs. Never silently discard the required grips or expressions.

| Item | Target |
| --- | --- |
| Geometry | Attempt approximately 12k triangles including visible props. Evaluate 12–18k only where visibly justified; retain a separate high-resolution sculpt. |
| Skeleton | Runtime: at most 40 deforming bones. The detailed authoring rig may use more controls/bones; prove conversion preserves required grips and expressions. |
| Materials / skinned meshes | Runtime: 1–2 materials; prefer one skinned mesh and justify more than two. Measure browser splits and draw calls. |
| Textures | Start with one 1024px character atlas; add a small face atlas only if needed. Record compressed size and GPU memory. |
| Transfer | Initial compressed fighter payload at most 1 MB. Report actual bytes, decode cost, codecs and any later-loaded assets separately. |
| Whole scene | Keep the existing starting target below 100k triangles and around 80 draw calls. Test the supported eight-player case, including duplicates, and all seven distinct assets. Larger individual candidates are not permission to raise the scene budget silently. |
| Performance | Target 60 fps and p95 frame time at most 16.7 ms; sustained below 50 fps fails on target devices. Validate on named physical phones with fighters, effects and UI together. |

Reduce invisible geometry, share appropriate materials, use LODs and simplify distant facial detail as needed. A gameplay LOD may simplify fingers only after the full authored grip/gesture is proven and the gameplay result remains readable; it cannot substitute for the expressive source/menu asset.

Use measured geometry compression and KTX2 or an equivalent GPU texture format as required by the performance standard. Use portable textures/materials for GLB. If matching the look needs a toon ramp or outline, implement and document its runtime shader during pass 4. Blender screenshots, face counts and successful export commands alone do not establish browser quality or performance.

## Evidence required for each fighter

- Neutral turnarounds, silhouette/gray views, colored menu and actual overhead-game views.
- Face expression sheet and both hands gripping their real props, including profile/contact close-ups.
- Shoulder raise/reach, intended elbow flexion, wrist/forearm twist, hip lift, knee/ankle flexion and planted-foot squat on both sides. Report missing measurement regions explicitly.
- Normalized weights, maximum four influences, no unweighted vertices or unexplained cross-body movement; inspect self-intersections and cross-mesh contacts in motion.
- Sampled frames and playback of grips, release, expressions, limb bends, cloth motion and animation transitions. Check the exported asset, not just the source rig.
- Export/re-import structure/size/material checks plus actual deformation/transform checks where the comparison tool only reports counts.
- Recorded phone model/browser, scene load, settings, frame times, memory/download measurements and unresolved limitations.
- Editable Blender source, sculpt/game meshes, source/baked textures, GLB, animation/event list, renders, reports and manifest with version/provenance/licenses.

Track each pass as planned, in progress, passed, failed or deferred with a reason and evidence links. Passing Brandon's rig does not pass another fighter's rig. A retargeted clip must be checked on its destination character before it is counted as delivered.

## Individual specification template

Create `docs/<FIGHTER>_3D_ASSET.md` before that fighter's production modeling begins, using these sections:

1. Identity/reference provenance and open likeness questions.
2. Concept/turnaround references, proportions, palette, costume and personality.
3. Current asset inventory and honest limitations.
4. Face, hand, garment, hair and prop requirements.
5. Grip hand, attack hand, sockets and release/attachment choreography.
6. Eight-pass ledger with deliverables, evidence and unresolved issues.
7. Fighter-specific close-up proof and animation/event list.
8. Asset budgets, runtime shader/material contract and device test plan.
9. Versioned source/export locations, reproducibility and delivery checklist.

Keep this shared pipeline linked rather than forking its standards into conflicting copies. Fighter-specific deviations need a stated reason and supporting visual/performance evidence. Existing asset READMEs remain historical measurement records.

## Rollout and current status

Use Brandon to establish the first complete face/hand/garment proof, then Ethan to test reuse across a distinct silhouette and equipment. Daniel, Rich, Samuel, Josh and Elijah each go through the same passes, with their own specifications and evidence. Reference gathering and concepts can proceed before the first production model is finished.

As of this document, Brandon has a v4 movement prototype, a proposed October 29 concept and an individual production specification. Ethan has reference/portrait work; the other five retain provisional visual briefs. No other completed model, facial rig, finger rig, runtime test or character-specific specification is implied here.

Use free Blender tools and the installed Scenario Blender domain skills documented in [the modeling skill audit](MODELING-SKILL-AUDIT.md). Their instructions support the workflow; the visible and measured results determine acceptance. No paid generation service or automatic publishing is introduced by this standard.
