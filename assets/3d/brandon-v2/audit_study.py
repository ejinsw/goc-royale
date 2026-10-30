import bpy,sys,json
from pathlib import Path
sys.path.append('/Users/ejinsw/.codex/skills/scenario-blender-sculpting/scripts')
import bx_sculpt as S
out=Path('/Users/ejinsw/Documents/GitHub/GOC Royale/outputs/brandon-v2/shape-audit.json')
reports={}
for name,voxel in [('B2-face',None),('B2-jacket continuous',.014),('B2-hair sculpt',.010)]:
 reports[name]=S.stage_report(bpy.data.objects[name],voxel)
reports['status']='shape study only; no rig, deformation topology, UV, GLB, gameplay or device acceptance'
reports['observations']='Separate accessories are intentional; continuity checks apply to face, jacket, and hair individually.'
out.write_text(json.dumps(reports,indent=2))
result=reports
