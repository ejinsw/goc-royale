"""Profile review corrections: seated face details, fitted hair, rounded cuffs."""
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
tree=ast.parse((ROOT/'assets/3d/brandon-v2/build_study.py').read_text())
exec(compile(ast.Module(body=[n for n in tree.body if isinstance(n,ast.FunctionDef)],type_ignores=[]),'<study-functions>','exec'))
head=bpy.data.objects['B2-face']
# Seat the entire smile against the curved face rather than letting a flat graphic float.
for name,offset in [('smile interior',.008),('smile teeth band',.014),('lower lip',.012)]:
 ob=bpy.data.objects['B2-'+name]
 for v in ob.data.vertices:
    hit,p,_,_=head.ray_cast(Vector((v.co.x,-2,v.co.z)),Vector((0,1,0)))
    if hit:v.co.y=p.y-offset
 ob.data.update()
# Fitted cap covers the full cranial silhouette, including the rounded-square cross section.
cap=bpy.data.objects['B2-hair fitted cap'];n=96;rows=35
for j in range(rows+1):
 for i in range(n):
    a=2*pi*i/n;front=max(0,cos(a));side=abs(sin(a));back=max(0,-cos(a))
    lower=2.38+.37*front**3-.10*side-.23*back
    phi0=math.acos(max(-.99,min(.99,(lower-2.43)/.64)));phi=phi0*(1-j/rows)+.008
    sy=math.copysign(abs(cos(a))**.68,cos(a))
    cap.data.vertices[j*n+i].co=(.605*sin(phi)*sin(a),-.525*sin(phi)*sy,2.43+.64*cos(phi))
cap.data.update()
# Crown joins the sweeps into one sculptable hair surface.
crown=S.ellipsoid('B2-crown union',(0,-.025,2.81),(.53,.45,.27),collection=COL)
crown['goc_study']=True
parts=[cap,crown]+[bpy.data.objects['B2-'+n] for n in ['left curtain','right curtain','left outer sweep','right outer sweep']]
for o in bpy.context.selected_objects:o.select_set(False)
for o in parts:o.select_set(True)
bpy.context.view_layer.objects.active=cap
hair=S.union_remesh(parts,.010,name='B2-hair sculpt',relax=6)
hair['goc_study']=True;hair.data.materials.clear();hair.data.materials.append(bpy.data.materials['B2-soft black hair'])
# Gently bridge the old rim seam under the curtain with a live smooth pass.
G.set_view('FRONT',frame=hair);bpy.ops.object.mode_set(mode='SCULPT');G.activate_brush('SCULPT','Smooth')
checks=[]
for side in [-1,1]:
 pts=[(side*(.12+.36*i/25),-.55,2.91-.37*i/25) for i in range(26)]
 r,missed=G.stroke('SCULPT',pts,size=70,strength=.25);checks.append({'finished':'FINISHED' in r,'misses':len(missed)})
bpy.ops.object.mode_set(mode='OBJECT')
# Torus cuffs use a stable radial frame; avoid collapsed tube tangents at the sides.
for side in [-1,1]:
 for label in ['cuff','cuff stripe']:
    old=bpy.data.objects.get('B2-'+label+' '+str(side))
    if old:bpy.data.objects.remove(old,do_unlink=True)
 for label,minor,z,mat in [('cuff',.032,.18,'ribbing'),('cuff stripe',.008,.158,'gold trim')]:
    vs=[];fs=[];N=64;M=16
    for j in range(N):
     a=2*pi*j/N
     for i in range(M):
        b=2*pi*i/M;r=.14+minor*cos(b)
        vs.append((side*.94+r*cos(a),-.055+r*sin(a),z+minor*sin(b)))
    for j in range(N):
     for i in range(M):
        fs.append((j*M+i,j*M+(i+1)%M,((j+1)%N)*M+(i+1)%M,((j+1)%N)*M+i))
    mesh(label+' '+str(side),vs,fs,bpy.data.materials['B2-'+mat])
# Persist a review copy; original startup scene still exists separately.
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'assets/3d/brandon-v2/brandon-study.blend'),copy=True)
result={'hair_vertices':len(hair.data.vertices),'hair_gui_smoothing':checks,'saved':True}
