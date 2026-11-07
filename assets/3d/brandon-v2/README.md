# [REDACTED] — deprecated v2 shape study

> **REDACTED / DEPRECATED:** Retained only as historical repository evidence.
> Do not rebuild, publish, integrate, or use as a likeness reference. See
> [the repository redaction notice](../../../docs/BRANDON-3D-REDACTED.md).

October 26, 2026. Actual editable Blender geometry, created in Blender 5.2.3 using the installed Scenario sculpting workflow and live Blender brush operations. **This is a waist-up art study, not the final playable character.**

## Review files

- `brandon-study.blend`: saved working copy with a separate `Brandon v2 • Shape Study` scene; the original startup scene is retained.
- `../../../outputs/brandon-v2/three-quarter.png`, `front.png`, `profile.png`: studio views of the model.
- `../../../outputs/brandon-v2/shape-review/review_sheet.png`: silhouette and neutral matcap views from front, side, three-quarter and above.
- `../../../outputs/brandon-v2/shape-audit.json`: measured connected-component and manifold checks.

## What changed

Shaped tapered face, integrated nose, continuous shoulder/sleeve jacket surface, curved fitted shirt and trim, fitted rounded glasses, simplified palms and thumbs, and a joined sculptable hair surface. Real Smooth brush strokes ran in the live Blender GUI on sleeve transitions and hair. Original Brandon rig/model and game files were not replaced.

Visual review caught intersecting iris geometry, shirt/chest intersections, scalp showing through the hair, floating mouth surfaces, and collapsed cuff tube frames. The successive refinement scripts record corrections. The model still needs art refinement, especially the hair part and front volume, facial likeness, expressive eye/lid shapes, collar construction and hand anatomy.

## Checks and limits

The face, jacket and hair each measured as one connected mesh with no non-manifold edges. This is only a shape/topology sanity check. It does not establish clean animation edge flow, lack of all intersections, or professional art quality.

The study uses dense sculpt geometry and separate facial details. It has no production retopology, final UVs, rig, animation, lower body, gameplay GLB or mobile performance validation. It is intentionally excluded from the live game's asset paths. Brandon's blue/gold identity and all gameplay rules are unchanged.

## Authoring sequence

The saved Blender file is the review artifact. Source stages are `build_study.py`, `refine_study.py`, `fit_surfaces.py` `polish_study.py` and `smooth_crown.py`, executed in that order in a live Blender GUI with the Scenario skills installed. The builder refuses to overwrite its scene; later stages target owned `B2-` objects. The scripts are project-local and use absolute paths for this workspace. They are stage records, not a packaged generic modeling application. Two sleeve smoothing passes were applied during iteration; the saved `.blend` preserves the actual result.

`render_study.py` renders the saved scene. `review_study.py` uses the skill's review-sheet helper. `audit_study.py` measures the three main sculpt surfaces. Run heavy renders on a saved copy with factory startup so user add-ons are not loaded into the background renderer.

Next art work: refine the neutral character against the user's reference, then build the full body and deformation topology before authoring idle, run and throw. Do not transfer the old rigid-piece rig onto this mesh and call it finished.
