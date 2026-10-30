import bpy,bmesh,sys,json,ast,math
from pathlib import Path
from mathutils import Vector
from math import sin,cos,pi,sqrt,exp
ROOT=Path('/Users/ejinsw/Documents/GitHub/GOC Royale')
sys.path.extend(['/Users/ejinsw/.codex/skills/scenario-blender-expert/scripts','/Users/ejinsw/.codex/skills/scenario-blender-sculpting/scripts'])
import bx_gui as G
import bx_sculpt as S
COL=bpy.data.collections['Brandon v2 • owned geometry'];scene=bpy.data.scenes['Brandon v2 • Shape Study'];bpy.context.window.scene=scene
tr=ast.parse((ROOT/'assets/3d/brandon-v2/build_study.py').read_text());exec(compile(ast.Module(body=[n for n in tr.body if isinstance(n,ast.FunctionDef)],type_ignores=[]),'<study-functions>','exec'))
# Replace the flattened double-sided lip with a clean fitted curve.
old=bpy.data.objects['B2-lower lip'];bpy.data.objects.remove(old,do_unlink=True)
head=bpy.data.objects['B2-face'];P=[]
for i in range(51):
 u=-1+2*i/50;x=.257*u;z=1.865+.156*u*u
 hit,p,_,_=head.ray_cast(Vector((x,-2,z)),Vector((0,1,0)))
 P.append((x,p.y-.014,z))
tube('lower lip',P,[.003+.005*sin(pi*i/50) for i in range(51)],bpy.data.materials['B2-lip edge'],segments=10)
# Work the crown connection with actual live Smooth strokes, then inspect the result.
hair=bpy.data.objects['B2-hair sculpt']
sc=S.Sculptor(hair,symmetry_x=False)
sc.smooth(center=(0,-.48,2.83),radius=.27,strength=.45,iterations=18,preserve_volume=True);sc.commit()
for o in bpy.context.selected_objects:o.select_set(False)
hair.select_set(True);bpy.context.view_layer.objects.active=hair
G.set_view('FRONT',frame=hair);bpy.ops.object.mode_set(mode='SCULPT');G.activate_brush('SCULPT','Smooth')
r,misses=G.stroke('SCULPT',[(x,-.65,z) for x in [-.09,0,.09] for z in [2.65+i*.015 for i in range(23)]],size=90,strength=.24)
bpy.ops.object.mode_set(mode='OBJECT')
# Simple colored studio is only for evaluating the mesh; the browser palette comes later.
scene['review_notes']='Continuous shapes established. Hair part and likeness still need art review. Not game-ready.'
# Frame the study in material preview, preserving the user startup scene separately.
for o in bpy.context.selected_objects:o.select_set(False)
for o in COL.objects:
 if o.type=='MESH' and o.name!='B2-ground':o.select_set(True)
G.run('view3d.view_selected')
for a in bpy.context.window.screen.areas:
 if a.type=='VIEW_3D':
    a.spaces.active.shading.type='MATERIAL'
    a.spaces.active.overlay.show_overlays=False
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'assets/3d/brandon-v2/brandon-study.blend'),copy=True)
result={'hair_brush':list(r),'misses':len(misses),'saved':True}
