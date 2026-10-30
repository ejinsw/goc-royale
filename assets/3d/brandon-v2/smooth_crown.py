import bpy,sys
from pathlib import Path
sys.path.append('/Users/ejinsw/.codex/skills/scenario-blender-sculpting/scripts')
import bx_sculpt as S
hair=bpy.data.objects['B2-hair sculpt']
sc=S.Sculptor(hair,symmetry_x=False);sc.smooth(strength=.5,iterations=55,preserve_volume=True);sc.commit()
bpy.ops.wm.save_as_mainfile(filepath='/Users/ejinsw/Documents/GitHub/GOC Royale/assets/3d/brandon-v2/brandon-study.blend',copy=True)
result={'crown_relaxation':True}
