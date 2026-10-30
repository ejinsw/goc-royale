import bpy,bmesh,sys,math,json,ast
from pathlib import Path
from mathutils import Vector
from math import sin,cos,pi,sqrt,exp
ROOT=Path('/Users/ejinsw/Documents/GitHub/GOC Royale');SKILLS=Path('/Users/ejinsw/.codex/skills')
sys.path.extend([str(SKILLS/'scenario-blender-sculpting/scripts'),str(SKILLS/'scenario-blender-expert/scripts')])
import bx_sculpt as S
import bx_gui as G
scene=bpy.data.scenes['Brandon v2 • Shape Study'];bpy.context.window.scene=scene
COL=bpy.data.collections['Brandon v2 • owned geometry']
# Reuse only construction functions, not the scene creation side effects.
tree=ast.parse((ROOT/'assets/3d/brandon-v2/build_study.py').read_text())
exec(compile(ast.Module(body=[n for n in tree.body if isinstance(n,ast.FunctionDef)],type_ignores=[]),'<study-functions>','exec'))
M=lambda n:bpy.data.materials['B2-'+n]
skin=M('warm skin');hair=M('soft black hair');hair2=M('hair plane');ink=M('frames');navy=M('ribbing');gold=M('gold trim');cream=M('cream cotton');white=M('eye white');iris=M('iris')
def remove_owned(name):
    ob=bpy.data.objects.get('B2-'+name)
    if ob is not None and ob.get('goc_study'): bpy.data.objects.remove(ob,do_unlink=True)
# Fix the iris intersection: the curve of a tiny iris must not equal a whole eyeball.
for side in [-1,1]:
 for label in ['iris','pupil','eye glint']:
    ob=bpy.data.objects['B2-'+label+' '+str(side)]
    cx=side*.245-(side*.008 if label!='eye glint' else .014)
    w={'iris':.046,'pupil':.024,'eye glint':.010}[label]
    base={'iris':-.435,'pupil':-.447,'eye glint':-.459}[label]
    for v in ob.data.vertices:
        u=(v.co.x-cx)/w;v.co.y=base+.006*u*u
    ob.data.update()
# Refine sleeve blends before adding surface detail.
jacket=bpy.data.objects['B2-jacket continuous']
sc=S.Sculptor(jacket);sc.smooth(strength=.4,iterations=10);sc.commit()
# Conform shirt directly to the new jacket front; it cannot cut through the chest.
remove_owned('shirt inset')
bpy.context.view_layer.update()
vs=[];fs=[];N=20;rows=36
for j in range(rows+1):
    t=j/rows;z=.06+1.29*t;w=.124+.038*sin(pi*t)
    for i in range(N+1):
        x=-w+2*w*i/N
        hit,p,normal,face=jacket.ray_cast(Vector((x,-2,z)),Vector((0,1,0)))
        y=p.y-.012 if hit else -.30
        vs.append((x,y,z))
for j in range(rows):
 for i in range(N):
    a=j*(N+1)+i;fs.append((a,a+1,a+N+2,a+N+1))
shirt=mesh('shirt inset',vs,fs,cream)
sol=shirt.modifiers.new('Cotton surface','SOLIDIFY');sol.thickness=.006
# Replace hard angular collar path with a continuous curved rolled collar.
for side in [-1,1]:
 remove_owned('collar '+str(side));remove_owned('gold piping '+str(side))
 P=S.bezier((side*.11,-.16,1.46),(side*.26,-.27,1.40),(side*.25,-.36,1.12),(side*.18,-.32,1.01),36)
 tube('collar '+str(side),P,[.054-.018*(j/35) for j in range(36)],navy,segments=18)
 P=[]
 for j in range(40):
    t=j/39;z=.07+.96*t;x=side*(.124+.038*sin(pi*(z-.06)/1.29))
    hit,p,_,_=jacket.ray_cast(Vector((x,-2,z)),Vector((0,1,0)));P.append((x,p.y-.018,z))
 tube('gold piping '+str(side),P,.01,gold)
# Raise the front hairline to expose forehead inside the curtain part.
cap=bpy.data.objects['B2-hair fitted cap'];n=96;rows=35
for j in range(rows+1):
 for i in range(n):
    a=2*pi*i/n;front=max(0,cos(a));side=abs(sin(a));back=max(0,-cos(a))
    lower=2.40+.35*front**3-.1*side-.23*back
    phi0=math.acos(max(-.99,min(.99,(lower-2.43)/.62)));phi=phi0*(1-j/rows)+.008
    cap.data.vertices[j*n+i].co=(.567*sin(phi)*sin(a),-.485*sin(phi)*cos(a),2.43+.62*cos(phi))
cap.data.update()
for mat in [hair,hair2]: mat.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=.64
# Softer transitions in the broad hair masses, maintain their designed outer curve.
# Model actual small palm/thumb shapes rather than leave cuff ends as blue stubs.
for side in [-1,1]:
    c=S.Clay((-1.2,-.32,-.22),(1.2,.2,.23),.009)
    c.add(S.sd_ellipsoid((side*.95,-.065,.015),(.12,.105,.19)))
    c.add(S.sd_cone((side*.87,-.10,.055),(side*.80,-.14,-.025),.065,.05),blend=.05)
    remove_owned('hand '+str(side))
    hand=c.to_object('B2-hand '+str(side),collection=COL,symmetric=False);hand.data.materials.append(skin);hand['goc_study']=True
# A low display pedestal supports this intentionally waist-cropped study.
for v in bpy.data.objects['B2-ground'].data.vertices:v.co.z=-.28
plinthmat=M('ribbing')
vs=[];fs=[]
for z,r in [(-.28,.52),(-.25,.54),(.015,.54),(.035,.50)]:
 for i in range(80):
    a=2*pi*i/80;vs.append((r*cos(a),r*.64*sin(a),z))
for j in range(3):
 for i in range(80):
    a=j*80+i;b=j*80+(i+1)%80;fs.append((a,b,b+80,a+80))
fs.append(tuple(reversed(range(80))));fs.append(tuple(240+i for i in range(80)))
remove_owned('study pedestal')
mesh('study pedestal',vs,fs,plinthmat)
# Real Blender sculpt brushes through the live connector; localized refinement.
for ob in bpy.context.selected_objects:ob.select_set(False)
jacket.select_set(True);bpy.context.view_layer.objects.active=jacket
G.set_view('FRONT',frame=jacket)
bpy.ops.object.mode_set(mode='SCULPT')
G.activate_brush('SCULPT','Smooth')
checks=[]
for side in [-1,1]:
    points=[(side*(.51+.30*t),-.20,1.20-.63*t) for t in [i/18 for i in range(19)]]
    r,missed=G.stroke('SCULPT',points,size=80,strength=.22)
    checks.append({'side':side,'result':list(r),'misses':len(missed)})
bpy.ops.object.mode_set(mode='OBJECT')
head=bpy.data.objects['B2-face'];G.set_view('FRONT',frame=head)
# Keep viewport framing on full study after editing.
for ob in bpy.context.selected_objects: ob.select_set(False)
for ob in COL.objects:
 if ob.type=='MESH' and ob.name!='B2-ground': ob.select_set(True)
G.run('view3d.view_selected')
for a in bpy.context.window.screen.areas:
 if a.type=='VIEW_3D':a.spaces.active.shading.type='MATERIAL'
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'assets/3d/brandon-v2/brandon-study.blend'),copy=True)
result={'gui_brush_checks':checks,'saved':True,'stage':'shape review; not retopologized or rigged'}
