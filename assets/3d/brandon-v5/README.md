# Brandon v5 — primary-form study

October 29, 2026. **Passes 0–1 in progress. Not approved final art. Full character unrigged; isolated left-hand rig experiment available. Not a runtime replacement.**

This follows [Brandon's production specification](../../../docs/BRANDON_3D_ASSET.md) and the shared character pipeline. The editable scene is `Brandon v5 — primary forms` inside `brandon-primary.blend`. Existing v4 assets and the live multiplayer renderer remain separate.

## What changed

- New continuous head surface with a tapered jaw, cheek volume and integrated nose bridge/tip. The neutral basis remains symmetric.
- Repositioned eyes within the glasses, shaped lid margins and a small neutral mouth/lip study. Eye surfaces and mouth aperture are still construction studies; they do not yet form an expression-ready facial topology or usable mouth interior.
- Center-parted hair shell and broad sweeping locks. The shell was fitted to the actual head profile after side-view review exposed scalp penetration.
- Both hands now contain a connected palm, four separate fingers and a thumb. The full-body hands remain unrigged sculpt meshes. A separate copy of the left hand now has an experimental articulated rig and static clipboard grip; production retopology and integration are pending.
- Retained and correctly evaluated the v4 neutral body surfaces. Jacket now has a separate inset shirt, an open front with thickness and fitted zipper-edge strips. Cuffs/collar, folds and garment construction still need refinement.
- Slightly enlarged sneaker volumes and neutral matte material swatches for form review. No claim of final painterly textures or a browser shader.

## Review and evidence

`outputs/brandon-v5/` contains orthographic front, profile, back and three-quarter views, face/hand close-ups, a silhouette/matcap contact sheet, a 90 mm perspective face review and an overhead view. These views describe one actual mesh, not separately generated interpretations. They are draft proportion guides, not user-approved turnarounds.

The first iteration is retained in `brandon-primary-iteration01.blend` and `outputs/brandon-v5/iteration01/`. Corrections address lost body smoothing during scene evaluation, eye placement, faceted jaw interpolation, scalp penetration, zipper-edge sampling and hand normal direction. A copy of the user's previously open Blender session is preserved in `live-session-before-v5.blend`.

Read `primary-report.json`, `form-check.json` and `delivery-gate.json` for measured checks. The source measures **199,284 triangles across 42 parts**. The basic render-geometry gate passes, but the lower-face form diagnostic still flags a rounded/ball-like profile; the face needs more deliberate chin, lip and cheek structure. A basic geometry gate does not establish production readiness or mobile suitability. The deliberately dense source study exceeds runtime budgets and is not exported to the game.

## Remaining blockers

1. Face likeness and appeal need refinement; the current expression is neutral and subdued. Eye sockets, integrated eyelid loops, oral cavity and expression controls remain unbuilt.
2. Hair is still a broad volume study; the side/back cut and lock roots need more natural flow and live sculpt refinement.
3. The isolated left hand has static bend/grip evidence, but no production joint topology, full-body attachment, right-hand rig or animated contact/release proof. It does not pass the full character rig gate.
4. Garments still need intentional folds, collar/cuff construction, pockets, seam details and bending tests. Existing torso/leg surfaces are carried-over study geometry.
5. A clipboard stand-in exists only in the hand experiment. Full-character prop fitting, nametag geometry, retopology, UVs, baked/painted textures, full rigging, clips and browser export remain pending.
6. No latency, phone frame-time, eight-character runtime or multiplayer visual acceptance claim follows from this source study.

Next: improve face/hair appeal in the same saved study, then develop deformation topology and test actual face/hand/garment performance. Preserve useful forms rather than rebuilding the entire character again.

## Isolated hand experiment

`brandon-hand-rig.blend` contains scene `Brandon v5 — hand rig experiment`. It tests an actual five-digit mesh with **11 deform bones**, standard linear skinning, individually posed fingers and a two-bone authoring IK control for the thumb. The clipboard is attached to the palm. No animation actions or browser export are supplied by this experiment; thumb constraints would need baking for export.

Measured on the saved source:

- 27,073 hand vertices / 54,142 triangles. This dense sculpt is not a game mesh.
- Zero unweighted vertices; normalized weights; at most four influences per vertex; all major bone groups populated.
- Zero detected self-intersecting face pairs in each of three evaluated static poses: open, curled and clipboard grip.
- Zero vertices inside the tested unbeveled board interior in the grip pose. The interior test excludes 5 mm edge bands. A separate evaluated surface-overlap check also reports zero hand/board, hand/paper and hand/clip face pairs in the saved grip. These are static checks, not an animated collision certificate.
- Nearest sampled distal-finger/thumb distances to the board range from approximately **0.50–1.30 mm** in study scale; the paper adds about 1 mm over the board. This measures proximity, not grip pressure, contact area or motion stability.

The first grip had hovering fingertips, board penetration and web creases. Corrections fit each finger separately, smooth weights through the finger webs and adjust the thumb target/board edge. The earlier iteration is preserved. Evidence: `outputs/brandon-v5/hand-rig/{open,curl,clipboard,clipboard-side,clipboard-underside}.png`, `rig-report.json` and `contact-report.json`. A compact measured record with source-file hashes is kept alongside the assets in `validation-summary.json`. The actual topology, posed side view and underside were inspected.

`brandon-review-session.blend` contains both new review scenes plus the preserved v4 scene. The original open Blender session was retained; this file was saved as a separate copy. The new study scenes are also appended to the live Blender session.

## Reproduce

Use the locally installed Blender and Scenario Blender helper modules referenced by the scripts. Run one Blender process at a time:

```sh
/Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python-exit-code 1 -P assets/3d/brandon-v5/build_primary.py
/Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python-exit-code 1 -P assets/3d/brandon-v5/audit_primary.py
/Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python-exit-code 1 -P assets/3d/brandon-v5/hand_rig_probe.py
/Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python-exit-code 1 -P assets/3d/brandon-v5/check_hand_contacts.py
```

These are local Blender operations, with no paid asset generation. The build reads saved v4, writes v5 and does not replace the user's open scene. Rebuilding overwrites the reproducible v5 output, so preserve future manual edits as a new stage copy before rerunning it.
