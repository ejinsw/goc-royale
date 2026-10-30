import bpy,sys,json
from pathlib import Path
ROOT=Path('/Users/ejinsw/Documents/GitHub/GOC Royale')
sys.path.extend(['/Users/ejinsw/.codex/skills/scenario-blender-expert/scripts','/Users/ejinsw/.codex/skills/scenario-blender-sculpting/scripts'])
import bx_review
scene=bpy.data.scenes['Brandon v2 • Shape Study'];bpy.context.window.scene=scene
parts=[o for o in bpy.data.collections['Brandon v2 • owned geometry'].objects if o.type=='MESH' and o.name not in ['B2-ground','B2-study pedestal']]
sheet=bx_review.review(parts,str(ROOT/'outputs/brandon-v2/shape-review'),views=('front','right','threequarter','top'),modes=('silhouette','matcap'),res=400)
print(json.dumps({'review_sheet':sheet}))
