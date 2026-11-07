# GOC Royale — modeling skill selection

> **Redaction notice:** Brandon-specific 3D studies mentioned below are
> deprecated and redacted historical evidence. They are not production inputs
> or likeness references. See
> [BRANDON-3D-REDACTED.md](BRANDON-3D-REDACTED.md).

Research/setup snapshot: October 26, 2026. Historical status: eight selected skills were installed and their helper modules were checked in Blender 5.2.3 LTS. The Brandon-specific outputs from that work are now redacted and deprecated.

**November 7 redaction update:** Apply these skills through [the shared character pipeline](CHARACTER_3D_PIPELINE.md) for the roster. The retired Brandon-specific specification and v4 study are redacted and must not be used as production or likeness references. The research statistics and setup results below are dated evidence, not a fresh verification.

## Selected candidate

Use the Blender domain skills in [scenario-labs/skills](https://github.com/scenario-labs/skills) for the staged production workflow across the roster, with Brandon as the first complete proof. This is a better fit than the previous generic modeling skill because it includes character-form construction, deformation-aware topology tools, critique references and explicit failure checks. It does not guarantee professional-quality results.

| Skill | Purpose for every fighter |
|---|---|
| scenario-blender-expert | Shared execution, staged review and asset audits; required background for the domain skills |
| scenario-blender-sculpting | Design and refine connected forms, facial landmarks, lids and hair; includes bx_sculpt.py |
| scenario-blender-retopology | Build planned face/joint loops, preserve volume, review mesh flow; includes bx_retopo.py |
| scenario-blender-uv-baking | Prepare UVs and bake portable maps for the browser |
| scenario-blender-texturing-shading | Controlled material response and visual checks under different lighting |
| scenario-blender-rigging | Joint placement, weights, deformation stress tests and export-aware rig choices |
| scenario-blender-animation | Strong key poses, timing, overlap, arcs and contact checks |
| scenario-blender-export | Validate the exported asset against its destination |

[Skill directory](https://skills.sh/scenario-labs/skills). Reviewed source lives under `skills/dcc/blender/` in the repository.

## Evidence and limits

- GitHub API reported 1,153 repository stars and an MIT license. Skills CLI reported 628 installs for expert, 391 for sculpting and 393 for retopology. These are discovery signals, not evidence that a Brandon-quality character has been delivered.
- Sculpting includes form-building helpers and visual critiques addressing balloon-like faces, poorly joined masses and helmet-like hair. Its intended final surface-polish stage uses actual Blender brushes in a live GUI session.
- Retopology includes explicit loop planning and construction helpers. Its own documented comparison acknowledges remaining human-quality gaps; automated measurements alone can flatter a visually poor mesh.
- Rigging and animation include deformation and motion review steps. Browser export must be tested because Blender-only deformation/material features do not automatically transfer to GLB.
- The suite targets Blender 5.2. Its documented GUI path uses a local Blender connector. Scenario extension 0.12.0 has now been installed and verified enabled in Blender 5.2.3. After the user enabled the connection, scene_summary and execute_python were successfully called through the local MCP endpoint. Live Smooth brush operations also succeeded.
- The selected local Blender work is separate from Scenario hosted generation. No paid generation, API credits or account purchases are part of this recommendation. Source inspection indicates local scene/Python tools do not require Scenario credentials; no API keys were added. Local scene inspection and sculpt brush execution succeeded; no hosted generation was invoked.
- The shared art direction and each fighter's individual likeness/outfit brief govern style. Do not inherit generic adult anatomy, realistic pores, film mesh budgets or large textures merely because a skill gives them as defaults.

## Alternatives inspected

| Candidate | Finding |
|---|---|
| roble3/cc-blender-skill — blender-modeling | Explicitly limits organic modeling to blockout; insufficient as the main character workflow. |
| arjun988/blender-skills — character-artist | 1,001 repo stars; 343 skill installs. Useful topology checklist but substantially less executable character-shaping support. Its “AAA” label is not independent validation. |
| laxmimerit/Claude-Skills — character-image-to-3d | 7 repo stars; primarily reference staging and primitive construction. Does not solve the current quality problem. |
| omer-metin/skills-for-antigravity — 3d-modeling | 183 repo stars; about 1.2K installs. Broad modeling guidance, not a stronger character-shaping implementation. |
| edemaistre/blender-expert-skills | Similar expert workflow; 4 repo stars and no license reported by GitHub API. Prefer the reviewed MIT-licensed Scenario distribution for this trial. |

## Prepared installation command

Equivalent command for reproducibility. The eight skills below were installed using Codex’s skill installer from the same repository paths:

```sh
npx skills add scenario-labs/skills --skill scenario-blender-expert --skill scenario-blender-sculpting --skill scenario-blender-retopology --skill scenario-blender-uv-baking --skill scenario-blender-texturing-shading --skill scenario-blender-rigging --skill scenario-blender-animation --skill scenario-blender-export
```

## First proof of usefulness

Follow [the shared pipeline](CHARACTER_3D_PIPELINE.md) with a newly approved, fighter-specific brief. Do not reuse the redacted Brandon studies. Complete the eight passes with gray/colored turnarounds, expressive face, both five-finger hands, fitted props, believable garment folds and full limb deformation. Prove a close-up face/grip/garment performance before polished idle/run/attack clips. Repeat the checks on every fighter and its browser export; retargeting alone does not establish quality. Apply the mandatory runtime budgets and physical-device acceptance checks in [the performance standard](PERFORMANCE-AND-GAMEPLAY-STANDARDS.md).

## Historical verified setup and reconnection reference

- Blender: 5.2.3 LTS, verified by the application executable.
- Skill helper import check: bx_audit, bx_gui, bx_review, bx_sculpt, bx_retopo, bx_uvbake, bx_materials, bx_rig, bx_anim, bx_export all passed. This verifies loading only, not model quality or complete function compatibility.
- Scenario extension: 0.12.0 installed from its official release ZIP. SHA-256 matched the GitHub release digest: `7124cf4d5daae03ce1f0a2abe68a3d20e497ab3a9f27f301d9872d9d4159453f`.
- Installer and pre-install preferences backup: `/Users/ejinsw/Downloads/GOC-Royale-Setup/`.
- During the installation step, no game files, model assets or paid services were changed.

The connection was already enabled for the recorded work. If reconnection is needed: open Blender, enable **Preferences → System → Network → Allow Online Access**, then open **N sidebar → Scenario → Agents (MCP)**. Enable **Allow connected agents to run Python** and choose **Connect a client → Codex**. Keep Blender open. The Python toggle grants the live editing capability required by the sculpting helpers; it defaults off and was not enabled by the setup process. The local connector uses `http://127.0.0.1:9876/mcp`.

References: [official connector documentation](https://github.com/scenario-labs/blender-plugin/blob/main/docs/MCP.md), [official release](https://github.com/scenario-labs/blender-plugin/releases/tag/blender-plugin-v0.12.0).
