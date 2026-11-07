# [REDACTED] — deprecated low-poly 3D prototype

> **REDACTED / DEPRECATED:** Retained only as historical repository evidence.
> Do not rebuild, publish, integrate, or use as a likeness reference. See
> [the repository redaction notice](../../../docs/BRANDON-3D-REDACTED.md).

Created locally with Blender 4.1.0. Original procedural mesh guided by the user's Brandon references and selected low-poly cartoon direction. No paid generator used.

## Deliverables

- `brandon.blend`: editable model, 17-bone rig, animation actions and studio lighting.
- `build_brandon.py`: reproducible source; run with Blender from this repository.
- `client/public/art3d/brandon/brandon.glb`: browser-ready skinned model, 2,666 triangles, one vertex-color material, no external textures.
- `client/public/art3d/brandon/manifest.json`: clip durations and known limitations.
- `client/public/art3d/index.html`: interactive Three.js viewer, with all dependencies served locally and their license included.

## Preview

From the project root:

```sh
python3 -m http.server 5180 --bind 127.0.0.1 --directory client/public/art3d
```

Open http://localhost:5180/. Drag to orbit; select a clip, playback speed or game camera. Use a local HTTP server instead of opening the HTML as a file.

Rebuild from the project root (macOS Blender install):

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --python assets/3d/brandon/build_brandon.py
```

## Playable local test

Open http://localhost:5180/play.html after starting the preview server. WASD/arrows move; mouse aims; click or Throw launches a nametag; Space or Welcome Committee activates the Super. The touch pad and Throw button provide a simple mobile control path. Reset restarts the practice scene. Take Damage exercises the hit reaction and healing. Sound is opt-in and uses original short synthesized cues.

This imports a bundled copy of the existing shared Engine, not a second combat implementation. Practice uses the Showdown lawn with a stationary target and refills Super charge every tick; that refill is explicitly a practice-only convenience. It is not multiplayer and is not a performance benchmark. The target regenerates normally after four quiet seconds.

Regenerate the engine bundle when shared rules change:

```sh
./node_modules/.bin/esbuild shared/engine.ts --bundle --format=esm --target=es2022 --outfile=client/public/art3d/engine.js
```

## Animations

idle, run_forward, run_backward, strafe_left, strafe_right, basic_attack, super, hit, eliminated, victory, carry_ball, ball_shot, stunned, respawn, defeat. Locomotion is in-place. The animation studio shows isolated gestures. The playable test synchronizes basic/Super gestures to simulation events and renders nametag projectiles and welcome circles.

## Verification and limits

GLB loaded in a separate browser viewer. Run and Super clips selected and visually checked; asset structure and all named clips checked. No claim of complete animation polish or physical-device performance validation.

The limbs are intentionally rigid weighted toy pieces, not a final smoothly deforming character. Hair, face and overall likeness need art review against the selected reference. Additional refinement, transition testing, contact/foot sliding adjustments, final ability VFX/audio and actual multiplayer-renderer integration remain. Carry/shot/stun/respawn clips now exist but have not yet been integrated into an actual Broomball match. No game's collision rules were changed. This asset has not replaced the character in live matches.

The viewer uses Three.js 0.180.0 (MIT), with its license in `vendor/THREE-LICENSE.txt`. The source photos are not bundled in the export or viewer.

October 26 verification: browser controls dealt 700 damage and marked the target; WASD moved the 3D model; after taking 1,200 damage, moving into Welcome Committee increased HP above 4,500 before passive regeneration. GLB validation found 15 named clips, a skin, and one material.
