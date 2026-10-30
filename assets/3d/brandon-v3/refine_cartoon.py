import bpy,bmesh,sys,math,ast,json
from pathlib import Path
from mathutils import Vector
from math import sin,cos,pi,exp,sqrt
ROOT=Path('/Users/ejinsw/Documents/GitHub/GOC Royale')
sys.path.extend(['/Users/ejinsw/.codex/skills/scenario-blender-sculpting/scripts','/Users/ejinsw/.codex/skills/scenario-blender-expert/scripts'])
import bx_sculpt as S
import bx_gui as G
scene=bpy.data.scenes['Brandon v3 • Cartoon Beige'];bpy.context.window.scene=scene
COL=bpy.data.collections['Brandon v3 • owned geometry']
code=(ROOT/'assets/3d/brandon-v2/build_study.py').read_text().replace("'B2-'","'B3-'");tree=ast.parse(code)
exec(compile(ast.Module(body=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in ['mesh','sample']],type_ignores=[]),'<helpers>','exec'))
head=bpy.data.objects['B3-face']
def fy(x,z):
 hit,p,_,_=head.ray_cast(Vector((x,-2,z)),Vector((0,1,0)))
 return p.y if hit else -.35
# Calm the stare while retaining simple graphic pupils.
for side in [-1,1]:
 for label,amount,off in [('eye',.80,.012),('pupil',.88,.025)]:
  ob=bpy.data.objects['B3-'+label+' '+str(side)]
  for v in ob.data.vertices:
   v.co.z=2.14+(v.co.z-2.14)*amount
   v.co.y=fy(v.co.x,v.co.z)-off-.004
  ob.data.update()
# Soften sleeve lumps; the broad silhouette is retained as a single jacket mesh.
jacket=bpy.data.objects['B3-jacket continuous']
sc=S.Sculptor(jacket);sc.smooth(strength=.5,iterations=65,preserve_volume=True);sc.commit()
bpy.context.view_layer.update()
shirt=bpy.data.objects['B3-shirt inset']
for v in shirt.data.vertices:
 hit,p,_,_=jacket.ray_cast(Vector((v.co.x,-2,v.co.z)),Vector((0,1,0)))
 if hit:v.co.y=p.y-.012
shirt.data.update()
# Smooth closed elliptical collar volumes. No bevelled non-planar n-gons.
for side in [-1,1]:
 old=bpy.data.objects['B3-collar '+str(side)];bpy.data.objects.remove(old,do_unlink=True)
 P=S.bezier((side*.13,-.14,1.31),(side*.24,-.26,1.32),(side*.235,-.325,1.13),(side*.17,-.325,.99),36)
 vs=[];fs=[];N=16
 for j,p0 in enumerate(P):
  p=Vector(p0);t=j/35;tangent=(Vector(P[min(35,j+1)])-Vector(P[max(0,j-1)])).normalized()
  across=tangent.cross(Vector((0,1,0))).normalized();depth=across.cross(tangent).normalized()
  w=.035+.025*sin(pi*t);d=.019
  for i in range(N):
   a=2*pi*i/N;v=p+across*w*cos(a)+depth*d*sin(a);vs.append(tuple(v))
 for j in range(35):
  for i in range(N):
   a=j*N+i;b=j*N+(i+1)%N;fs.append((a,b,b+N,a+N))
 fs.extend([tuple(reversed(range(N))),tuple(35*N+i for i in range(N))])
 mesh('collar '+str(side),vs,fs,bpy.data.materials['B3-tan ribbing'],sub=1)
# Broader swept hair volumes and a gently fading part, with no pinched pole.
hair=bpy.data.objects['B3-molded hair'];N=128;R=50
for j in range(R+1):
 t=j/R
 for i in range(N):
  a=2*pi*i/N;aa=abs((a+pi)%(2*pi)-pi);front=max(0,cos(a))
  lower=sample([2.54,2.42,2.25,2.10,2.05,2.01,2.00],aa/pi)+.028*sin(a)*front
  phi0=math.acos(max(-.99,min(.99,(lower-2.34)/.67)));phi=phi0*(1-t)+.004
  x=(.69+.018*sin(a)*front)*sin(phi)*sin(a)
  y=-.515*sin(phi)*math.copysign(abs(cos(a))**.66,cos(a));z=2.34+.67*cos(phi)
  groove=.020*exp(-((x-.025)/.065)**2)*front*sin(phi)**1.5
  y+=groove*sin(phi);z-=groove*cos(phi)
  sweep=(.055*exp(-((x+.31)/.24)**2)+.035*exp(-((x-.35)/.22)**2))*front*sin(pi*t)**.75
  y-=sweep;z+=sweep*.5
  hair.data.vertices[j*N+i].co=(x,y,z)
hair.data.update()
bs=bpy.data.materials['B3-molded hair'].node_tree.nodes['Principled BSDF'];bs.inputs['Roughness'].default_value=.43;bs.inputs['Coat Weight'].default_value=.06
# Brush-check the sculpt surface in the live UI before saving the copy.
for o in bpy.context.selected_objects:o.select_set(False)
jacket.select_set(True);bpy.context.view_layer.objects.active=jacket
G.set_view('FRONT',frame=jacket);bpy.ops.object.mode_set(mode='SCULPT');G.activate_brush('SCULPT','Smooth')
checks=[]
for side in [-1,1]:
 P=[(side*(.47+.28*i/20),-.2,1.05-.47*i/20) for i in range(21)]
 r,missed=G.stroke('SCULPT',P,size=75,strength=.2);checks.append({'finished':'FINISHED' in r,'missed':len(missed)})
bpy.ops.object.mode_set(mode='OBJECT')
for o in bpy.context.selected_objects:o.select_set(False)
for o in COL.objects:
 if o.type=='MESH' and o.name!='B3-ground':o.select_set(True)
G.run('view3d.view_selected')
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'assets/3d/brandon-v3/brandon-cartoon.blend'),copy=True)
result={'saved':True,'sleeve_brushes':checks}
