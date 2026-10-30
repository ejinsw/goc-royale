# Brandon v4 — limb movement study

Updated October 27, 2026. **Rigged prototype, not final character art.** The direction is a stylized game fighter wearing a beige jacket, cream shirt, dark trousers and glasses. The face, hair, hands and outfit still need an art pass against the reference; this is not a toy/collectible design sign-off.

## Open it

- Current local viewer: http://localhost:5180/movement.html
- If that server is stopped, run from the project root:
  ```sh
  python3 -m http.server 5180 --bind 127.0.0.1 --directory client/public/art3d
  ```
- On a server that serves `client/public` as its root: `/art3d/movement.html`.
- Editable source: `assets/3d/brandon-v4/brandon-rig.blend`, scene **Brandon v4 • Limb Rig**.
- Baked export inspection copy: `assets/3d/brandon-v4/brandon-runtime.blend`, scene **Brandon v4 • Browser export**.
- Browser asset: `client/public/art3d/brandon-v4/brandon-rig.glb`.

Use the clip selector, timeline, front/side/game cameras, orbit and skeleton overlay in the viewer. The source Blender scene remains available in the user's open session, and the copies above are saved on disk. Earlier studies are preserved.

## How the limbs move

The beige jacket is one connected mesh from torso through both sleeves, with quad loops around the elbows. Trousers similarly connect the pelvis to both legs. The skeleton has **26 bones**, including four bend-support bones at the elbows and knees. The support bones follow half of the joint rotation, spreading the deformation across the surface. Smooth weights connect the shoulders, upper arms, forearms and hands; the same principle connects hips, thighs and shins. Wrist skin overlaps under each cuff so there is no exposed gap into the sleeve.

This is a compact **FK rig**. Its bones can be posed and keyed in Blender. It has no IK foot controls or planted-foot solver yet. Hands are shaped mittens, without separately animated fingers. The head, glasses and facial graphics follow the head bone; facial expressions are not rigged. Toe bones are reserved and do not yet deform the shoe.

The exported animations use ordinary bone transforms and linear skinning. They do not require Blender's Preserve Volume, corrective smoothing, or live constraints in the browser. Support-bone motion is sampled into the GLB clips.

## Delivered clips

| Clip | Duration | Purpose |
| --- | --- | --- |
| `joint_demo` | 4.03 seconds | Elbow flexion, shoulder lift, wrist rotation and alternating hip/knee/ankle poses. In-place review, not a locomotion cycle. |
| `idle` | 2.03 seconds | Restrained upper-body movement; root and feet remain stationary. |

The v4 character does **not** inherit the older blockout model's combat clips. Run, throw, Super, recoil, defeat and victory must be authored for this rig.

## Validation and measurements

- Blender 5.2.3 LTS; Scenario Blender rigging/export helpers used.
- **64,112 triangles, 26 bones, 27 authored meshes, 11 materials, 1,875,980 bytes**. Three.js splits material groups into 31 skinned meshes. This still needs mobile profiling and further optimization before multiplayer adoption.
- All checked runtime vertices have normalized deform weights, no unweighted vertices and at most four influences.
- Export/re-import comparison passes: size, triangles, skeleton, root, clips and materials agree. See `outputs/brandon-v4/roundtrip.json`.
- The delivery checker reports no errors. Flat-color materials have no UV textures; warnings and small intentional facial overlays remain recorded in `runtime-delivery-gate.json`.
- Browser verification: GLB loads; both clips appear; timeline scrubbing, orbit, side view and skeleton overlay work. Raised-arm and bent-knee poses were inspected in the actual viewer.
- Evaluated runtime surfaces: no within-mesh self-intersections in jacket, trousers or wrist skin at sampled demo frames 1, 21, 41, 61, 81 and 101.
- **Stress-test limits remain:** 110-degree elbows show two crossing face pairs per side; 75- and 95-degree knee tests flag compressed/stretched edges in the fold. Knee tests show no self-intersections. These are not a blanket deformation approval. Cross-mesh contacts, every intermediate frame, planted-foot motion and phone performance are not certified. See `runtime-deformation.json`.
- The earlier `deformation.json` records an intermediate authoring-cage test and its missing shoulder bands; it is retained as history. `runtime-deformation.json` is the current baked-surface report. Shoulder raises have visual/demo checks, but a complete numerical shoulder-volume gate is still pending.

## Reproduce from the saved source

Export preserves the editable cage, creates a separate export scene, samples the rigid head grids more economically, and bakes subdivision into weighted geometry at rest. This avoids relying on runtime subdivision or comparing the base cage's bounds to the smoothed export.

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup \
  assets/3d/brandon-v4/brandon-rig.blend --python-exit-code 1 \
  --python assets/3d/brandon-v4/export_runtime.py

/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup \
  assets/3d/brandon-v4/brandon-runtime.blend --python-exit-code 1 \
  --python assets/3d/brandon-v4/audit_runtime.py
```

The modeling scripts are stage operations, not a single idempotent build command. `build_rig.py` starts from the preserved v3 scene; refinements are applied once in order: `refine_and_export.py`, `improve_bends.py`, `refine_joint_surfaces.py`, `connect_wrists.py`, then `export_runtime.py`. Prefer editing the saved source. Do not repeatedly apply geometry refinements to an already-refined model.

## Remaining work

1. Art review: stronger game-character silhouette and likeness; designed hair, expression, hands, garment details and shoes.
2. Finish extreme bend corrections, shoulder-volume measurement, cross-mesh contact checks and planted-foot controls.
3. Author a dynamic run and tag throw, validate contacts/arcs, then Super and reactions.
4. Optimize draw calls/geometry and profile multiple characters on a phone.
5. Integrate approved v4 art and clips into the game renderer. The current game and earlier practice scene still use their existing assets.
