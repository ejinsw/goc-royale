import bpy,sys,json,struct,math
from pathlib import Path
ROOT=Path('/Users/ejinsw/Documents/GitHub/GOC Royale')
sys.path.extend(['/Users/ejinsw/.codex/skills/scenario-blender-export/scripts','/Users/ejinsw/.codex/skills/scenario-blender-expert/scripts'])
import bx_export as E,bx_audit as A
scene=bpy.data.scenes['Brandon v4 • Limb Rig'];bpy.context.window.scene=scene;scene.frame_set(1)
parts=list(bpy.data.collections['Brandon v4 • character'].objects)
path=str(ROOT/'client/public/art3d/brandon-v4/brandon-rig.glb')
rep=E.round_trip(path,parts,preset='gltf',use_active_scene=True,export_animation_mode='ACTIONS',export_anim_single_armature=True,export_skins=True,export_def_bones=False)
(ROOT/'outputs/brandon-v4/roundtrip.json').write_text(json.dumps(rep,indent=2))
print('ROUNDTRIP',json.dumps({'pass':rep['pass'],'diffs':rep['diffs']}),flush=True)
gate=A.deliverable([o for o in parts if o.type=='MESH'],profile='game')
(ROOT/'outputs/brandon-v4/delivery-gate.json').write_text(json.dumps(gate,indent=2))
print('DELIVERY',json.dumps({'pass':gate['pass'],'errors':gate['errors'],'warnings':gate['warnings']}),flush=True)
