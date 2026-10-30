# Brandon — character redesign brief

October 27, 2026 · Historical redesign brief

**October 29 update:** [BRANDON_3D_ASSET.md](BRANDON_3D_ASSET.md) is the current Brandon production specification. It defines the painterly anime/chibi concept, five-finger hands, expressive face, garment construction, staged delivery and validation. The earlier requirements below are retained as history; follow the new specification where they differ. [CHARACTER_3D_PIPELINE.md](CHARACTER_3D_PIPELINE.md) extends the same eight passes, face/finger/garment requirements and per-fighter verification to the entire roster. Runtime limits are governed by [the performance standard](PERFORMANCE-AND-GAMEPLAY-STANDARDS.md).

## Target

An expressive stylized arena fighter with Brandon’s likeness, integrated center-parted hair, fitted glasses, a beige jacket, warm cream shirt, dark pants, sneakers and clipboard. The supplied reference establishes finish, appealing proportions and clean shading; its costume and character identity are not our design.

**Latest correction, October 27:** a stylized game fighter, with readable cartoon shapes and controlled smooth surfaces. The user rejected the toy-cartoon interpretation and explicitly requires limbs prepared for animation. Retain the beige jacket and simplify the face, but do not treat collectible proportions, exaggerated round eyes or a uniform plastic finish as approved. The earlier blue/gold jacket and semi-natural, glassy face remain superseded. Exact proportions, facial treatment and material settings are still proposals to review.

**Current readiness:** the existing waist-up bust studies are not animation-ready. A smooth shoulder outline does not establish a usable shoulder joint, and rotating separate rigid arms would not satisfy this brief. The next actual work is a full-body mesh with deforming shoulder, elbow, wrist, hip, knee and ankle regions, a fitted skeleton and blended skin weights, followed by visible stress-pose proof. No finished rig or limb-animation readiness is claimed here.

Proposed palette: beige jacket **#D4B78F**, warm cream shirt **#F5EDDA**, darker tan cuffs/collar **#A98B68**, and dark brown/ink hair and glasses **#29272B**. Keep color blocks clear, with only small restrained accent areas.

The current procedural Brandon is a technical blockout. Its disconnected primitive-like anatomy and generic motion do not meet this target. Preserve it as an integration test, not as the production art base that must be retained.

## Shape requirements

| Area | Replacement requirement |
|---|---|
| Head | A friendly deliberately shaped face with a soft jaw, short neck, small integrated nose and restrained smile. Rounded proportions and simplified pupils are starting proposals, not a locked toy face. Avoid oversized staring eyes, realistic iris detail, wet-eye highlights, protruding lips and a stretched grin. Avoid an unshaped sphere with features pasted on. |
| Hair | One coherent chunky hair form with a recognizable center part and a few broad sweeps integrated into the volume. No stacked leaf-like pieces, helmet ledges, angular blobs or individual strands. |
| Torso/jacket | Neck opening, shoulder slope, chest volume, waist taper, hem and collar. Sleeves transition naturally from shoulders and bend without gaps. |
| Arms/hands | Tapered upper arm and forearm, rounded elbow, shaped palm and thumb. Use simplified fingers where the tag-release pose needs them. |
| Legs/shoes | Hip-to-thigh flow, knee bend, ankle taper and deliberate toe/heel/sole profiles. No rigid cuboid leg segments. |
| Glasses | Face-fitted frame contours, bridge and temples with consistent thickness; frame placement must work in profile as well as front view. |

Review full-body proportion studies before locking head-to-body ratio; the earlier 3–3.5-head suggestion is provisional. Hands and shoes should read clearly without forcing collectible proportions. Clothing, hair and accessories can be separate meshes; surfaces that should bend continuously must have suitable topology and blended skin weights. Joining object names or smoothing normals is not a substitute for shaping geometry.

## Surface and lighting requirements

Judge the model first in neutral gray under a broad light, from front, side, back and three-quarter angles. Smooth highlights must flow over cheeks, sleeves and hair without unexpected creases, pinching or polygon bands. Keep intentional seams, cuffs and hard prop edges crisp. Use subdivision selectively while authoring and export a measured, optimized mesh; do not blindly subdivide the existing cubes or decimate a finished rig.

Use clean color blocks and controlled smooth shading with broad highlights. Distinguish skin, hair, glasses and the beige jacket through deliberate roughness differences; avoid making every surface read as the same plastic. Do not add photorealistic fabric weave, textured irises or wet corneas. Material settings remain subject to review alongside shape. No baked studio highlights, painted floor shadows or bloom to hide geometry defects. Confirm the exported GLB in browser lighting, not only a Blender beauty render.

## Production order

1. Draw or construct front/side shape guides using Brandon’s photos for identity and the new reference for proportions and finish.
2. Shape a full-body neutral model with continuous surfaces. Refine silhouette and facial likeness before fine detail; a bust is insufficient for this milestone.
3. Establish deformation loops at shoulders, elbows, wrists, hips, knees and ankles. Keep elbows and knees slightly pre-bent in the bind pose; prepare UVs, normals and simple materials.
4. Review gray and colored turnarounds at menu size and overhead gameplay size. This is the first visual review milestone.
5. Fit a compact game skeleton and bind the model. Blend weights through each joint so the jacket and arm bend together; transfer compatible weights to separate clothing. Test arm raise and forward reach, elbow bends, wrist/forearm twist, hip lift, deep knee bend, ankle flexion and a planted-foot squat before animation production. Review both sides and joint close-ups, not only a rest render.
6. Author idle, run and tag throw using deliberate key poses, then inspect sampled frames and real-time browser playback.
7. Expand to the remaining clips only after the first three pass. Export editable Blender source, GLB, textures and a measured manifest. Recheck deformation after export in the browser; Blender-only smoothing or volume-preservation effects cannot stand in for working exported skinning.

## Dynamic animation direction

- Idle: relaxed asymmetric stance, subtle breathing, occasional glance or clipboard adjustment; feet stay grounded.
- Run: forward lean, weight shifting over planted feet, opposing hip/shoulder rotation, curved hand paths and controlled clipboard follow-through. Match stride to movement speed.
- Tag throw: torso and shoulder contribute to a clear wrist flick; readable release pose and short follow-through. Blend with locomotion rather than freezing the legs.
- Welcome Super: a broad welcoming arm sweep and body weight shift, followed by a confident settle. Keep the effect boundary exact.
- Hit: brief directional recoil layered onto motion, without taking control away.

Gameplay response remains immediate. Cosmetic anticipation cannot add a new attack delay; release/effect timing must agree with existing simulation events. Locomotion stays in place, with gameplay controlling position. Mesh motion must not change collision or hitboxes.

## Acceptance evidence

- Front, side, back, three-quarter and overhead previews: no unintended block joints or primitive silhouettes.
- Front and profile face review: friendly proportion proposals, small nose, simple readable eyes and restrained smile; no uncanny facial detail, staring toy expression or detached hair pieces.
- Neutral lighting and browser lighting: no shading seams, pinched highlights or missing materials.
- Full-body deformation evidence: shoulder raise/reach, elbow bend, wrist twist, hip lift, knee bend, ankle flexion and planted-foot squat on both sides. No detached shoulders, collapsing joints, exposed gaps or clothing drifting away from the body.
- Weight report: no unweighted vertices, normalized deform weights, at most four influences per vertex and no unexplained opposite-side motion. Rendered stress poses and browser playback must pass alongside numeric checks.
- Run and throw contact sheets plus real-time playback: stable contacts, clear poses, intentional arcs, no severe sliding or clipping.
- Phone-scale preview: face readable in menus; silhouette, direction and prop readable during play.
- Measured triangle count, materials, download size and frame time. Performance targets do not excuse unfinished forms.

## Skill and tool audit

Updated selection: [Scenario Blender suite audit](MODELING-SKILL-AUDIT.md). Blender 5.2.3, eight selected skills and Scenario extension 0.12.0 are installed. Helper import checks passed. The live connection and real sculpt brush execution are verified. The first waist-up study is saved in assets/3d/brandon-v2/brandon-study.blend, with renders and shape checks in outputs/brandon-v2. It remains an art study, without a rig or game export.

Blender remains the free authoring tool. The reviewed community `blender-modeling` skill explicitly limits organic character work to blockout. It cannot substantiate a claim of professional character modeling by itself. The existing model was a procedural prototype, not evidence of a completed professional modeling workflow.

`blender-pro-workflow` provides useful stage ordering and critique guidance; `animation-quality-gate` calls for sampled-frame review and export validation. These are reviewed workflow references, not installed or proven character-generation capabilities. No professional certification or quality guarantee is claimed. The geometry, shading and motion must pass the evidence above regardless of the skill name.

Sources inspected October 26:
- https://github.com/roble3/cc-blender-skill/blob/main/plugin/skills/blender-modeling/SKILL.md
- https://github.com/roble3/cc-blender-skill/blob/main/plugin/skills/blender-pro-workflow/SKILL.md
- https://github.com/roble3/cc-blender-skill/blob/main/plugin/skills/animation-quality-gate/SKILL.md

## October 27 movement-study milestone

The v4 full-body study implements the limb structure described above: continuous sleeves, connected trousers, blended skinning and four bend-support bones. The beige jacket direction remains; the face, hair, hand shapes and outfit are still under art review. The target remains a stylized game fighter.

The interactive movement study at `http://localhost:5180/movement.html` now uses an exported 26-bone GLB with idle and joint-demo clips. This proves that the model can articulate in the browser; it does not replace the acceptance criteria above. The export round-trip passes. Sampled demo frames have no within-mesh jacket/trouser/wrist intersections, but deep elbow and knee stress tests still report limits. Facial/finger animation, foot planting, a dynamic run and tag throw remain. Current measurements and reproducible checks are in `assets/3d/brandon-v4/README.md`.
