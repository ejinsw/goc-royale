"""User-directed toy/cartoon pass. Own scene, preserves v2. Blender 5.2."""
import bpy,bmesh,math,sys,json,ast
from pathlib import Path
from mathutils import Vector
from math import sin,cos,pi,exp,sqrt
ROOT=Path('/Users/ejinsw/Documents/GitHub/GOC Royale')
NAME='Brandon v3 • Cartoon Beige'
if NAME in bpy.data.scenes:raise RuntimeError('v3 exists; edit the owned scene rather than overwrite.')
source=bpy.data.scenes['Brandon v2 • Shape Study']
scene=bpy.data.scenes.new(NAME);bpy.context.window.scene=scene
COL=bpy.data.collections.new('Brandon v3 • owned geometry');scene.collection.children.link(COL)
# Retain the shaped body, copy every data block we edit.
keep=['jacket continuous','shirt inset','collar -1','collar 1','gold piping -1','gold piping 1','badge','cuff -1','cuff 1','cuff stripe -1','cuff stripe 1','hand -1','hand 1','study pedestal','ground']
for label in keep:
 old=bpy.data.objects['B2-'+label];ob=old.copy();ob.data=old.data.copy();ob.name='B3-'+label;COL.objects.link(ob);ob['goc_study']=True
 if label not in ['ground','study pedestal']:
  for v in ob.data.vertices:v.co.x*=.92;v.co.z*=.90
  ob.location.x*=.92;ob.location.z*=.90
# Load construction helpers only, with this pass's naming convention.
code=(ROOT/'assets/3d/brandon-v2/build_study.py').read_text().replace("'B2-'","'B3-'")
tree=ast.parse(code)
exec(compile(ast.Module(body=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in ['mesh','sample','tube','material']],type_ignores=[]),'<cartoon-helpers>','exec'))
skin=material('skin vinyl','EDB98D',.40)
beige=material('beige jacket','D4B78F',.36)
tan=material('tan ribbing','A98965',.44)
cream=material('cream tee','FFF1D7',.43)
ink=material('graphic ink','222332',.40)
hairmat=material('molded hair','252331',.32)
white=material('eye white','FFFAE9',.40)
smilemat=material('smile','6B3B2E',.48)
for m in [skin,beige,tan,cream,hairmat]:
 bs=m.node_tree.nodes.get('Principled BSDF');bs.inputs['Coat Weight'].default_value=.12;bs.inputs['Coat Roughness'].default_value=.35;bs.inputs['Subsurface Weight'].default_value=0
for ob in COL.objects:
 label=ob.name[3:]
 if label=='ground':continue
 mat=beige
 if any(k in label for k in ['collar','cuff','piping']):mat=tan
 if label=='shirt inset':mat=cream
 if label.startswith('hand'):mat=skin
 if label=='badge':mat=cream
 if label=='study pedestal':mat=ink
 ob.data.materials.clear();ob.data.materials.append(mat)
# Simplify the collar: a shallow folded band instead of round hose shapes.
for side in [-1,1]:
 old=bpy.data.objects['B3-collar '+str(side)];bpy.data.objects.remove(old,do_unlink=True)
 vs=[(side*.12,-.15,1.31),(side*.23,-.24,1.25),(side*.245,-.30,1.08),(side*.165,-.33,.98),(side*.15,-.30,1.17)]
 ob=mesh('collar '+str(side),vs,[(0,1,2,3,4)],tan)
 so=ob.modifiers.new('molded collar thickness','SOLIDIFY');so.thickness=.045
 be=ob.modifiers.new('rounded collar edges','BEVEL');be.width=.028;be.segments=4
# Short, stout neck: little neck visible under the enlarged cartoon head.
rings=[(1.10,.20,.18,.18),(1.22,.20,.18,.18),(1.43,.22,.19,.19),(1.50,.23,.20,.20)]
def shaped_loft(name,rings,mat,face=False,n=80,steps=100):
 cols=list(zip(*rings));vs=[];fs=[]
 for j in range(steps+1):
  z,w,fd,bd=[sample(c,j/steps) for c in cols]
  for i in range(n):
   a=2*pi*i/n;c=cos(a);x=w*sin(a);y=-(fd if c>=0 else bd)*math.copysign(abs(c)**.66,c)
   if face:
    # One tiny rounded button, no long anatomical nose bridge or eye sockets.
    y-=.063*max(0,c)**10*exp(-(x/.10)**2-((z-1.99)/.068)**2)
   vs.append((x,y,z))
 for j in range(steps):
  for i in range(n):
   a=j*n+i;b=j*n+(i+1)%n;fs.append((a,b,b+n,a+n))
 fs.extend([tuple(reversed(range(n))),tuple(steps*n+i for i in range(n))])
 return mesh(name,vs,fs,mat)
neck=shaped_loft('neck',rings,skin,n=48,steps=20)
head=shaped_loft('face',[(1.35,.12,.12,.14),(1.39,.29,.29,.25),(1.48,.44,.365,.32),(1.65,.55,.405,.37),(1.85,.61,.42,.405),(2.05,.63,.425,.44),(2.25,.62,.42,.455),(2.45,.57,.40,.45),(2.62,.48,.35,.39),(2.75,.28,.22,.26),(2.81,.02,.02,.02)],skin,face=True)
bpy.context.view_layer.update()
def face_y(x,z):
 hit,p,_,_=head.ray_cast(Vector((x,-2,z)),Vector((0,1,0)))
 return p.y if hit else -.35

def face_patch(name,cx,cz,w,h,mat,offset=.012,tilt=0):
 # Coherent conforming surface, no glass iris/cornea layers.
 vs=[];fs=[];N=64;R=10
 vs.append((cx,face_y(cx,cz)-offset,cz))
 for j in range(1,R+1):
  r=j/R
  for i in range(N):
   a=2*pi*i/N;x=cx+w*r*cos(a);z=cz+h*r*sin(a)+tilt*(x-cx)
   y=face_y(x,z)-offset-.006*(1-r*r)
   vs.append((x,y,z))
 for i in range(N):fs.append((0,1+i,1+(i+1)%N))
 for j in range(R-1):
  for i in range(N):
   a=1+j*N+i;b=1+j*N+(i+1)%N;fs.append((a,b,b+N,a+N))
 return mesh(name,vs,fs,mat)
for side in [-1,1]:
 cx=side*.285
 face_patch('eye '+str(side),cx,2.14,.155,.105,white,.012)
 face_patch('pupil '+str(side),cx,2.14,.045,.076,ink,.025)
 # Graphic brows; fewer competing facial lines.
 P=[]
 for i in range(30):
  u=i/29;x=cx-.145+.29*u;z=2.385+.018*sin(pi*u)
  P.append((x,face_y(x,z)-.022,z))
 tube('brow '+str(side),P,[.012+.010*sin(pi*i/29) for i in range(30)],ink,segments=12)
 # Rounded glasses with soft square corners and a single readable dark frame.
 P=[]
 for i in range(96):
  a=2*pi*i/96;x=cx+.218*math.copysign(abs(cos(a))**.6,cos(a));z=2.15+.163*math.copysign(abs(sin(a))**.6,sin(a))
  P.append((x,face_y(x,z)-.041,z))
 tube('glasses rim '+str(side),P,.019,ink,segments=12,closed=True)
 tube('glasses temple '+str(side),[(side*.50,face_y(side*.5,2.20)-.04,2.20),(side*.62,-.20,2.20),(side*.65,.015,2.16)],.015,ink)
# Bridge sits just above the button nose.
P=[]
for i in range(20):
 x=-.067+.134*i/19;z=2.20+.015*sin(pi*i/19);P.append((x,face_y(x,z)-.04,z))
tube('glasses bridge',P,.017,ink)
# Compact friendly smile, no sculpted lips, teeth, gum or recessed mouth layers.
P=[]
for i in range(45):
 u=-1+2*i/44;x=.195*u;z=1.735+.052*u*u+.008*u
 P.append((x,face_y(x,z)-.013,z))
tube('friendly smile',P,[.005+.005*sin(pi*i/44) for i in range(45)],smilemat,segments=10)
# Simple ear silhouettes without realistic cartilage recesses.
import bmesh
for side in [-1,1]:
 me=bpy.data.meshes.new('B3-ear');bm=bmesh.new();bmesh.ops.create_uvsphere(bm,u_segments=32,v_segments=20,radius=1);bm.to_mesh(me);bm.free()
 for v in me.vertices:v.co=(side*.61+v.co.x*.11,v.co.y*.075,1.99+v.co.z*.16)
 ob=bpy.data.objects.new('B3-ear '+str(side),me);COL.objects.link(ob);ob['goc_study']=True;me.materials.append(skin);me.shade_smooth()
# One molded haircut, designed perimeter and an integrated center-part groove.
# No separate petal/ribbon pieces, no textured strands.
N=128;R=50;vs=[];fs=[]
for j in range(R+1):
 t=j/R
 for i in range(N):
  a=2*pi*i/N;aa=abs((a+pi)%(2*pi)-pi)
  lower=sample([2.54,2.42,2.25,2.10,2.05,2.01,2.00],aa/pi)
  # A little asymmetry in the sweep avoids mirrored helmet halves.
  lower+=.025*sin(a)*max(0,cos(a))
  phi0=math.acos(max(-.99,min(.99,(lower-2.34)/.67)))
  phi=phi0*(1-t)+.004
  x=.69*sin(phi)*sin(a);y=-.515*sin(phi)*math.copysign(abs(cos(a))**.66,cos(a));z=2.34+.67*cos(phi)
  # Groove follows the top center into the front, shallow enough to feel molded.
  front=max(0,cos(a));groove=.032*exp(-((x-.025)/.045)**2)*front
  y+=groove*sin(phi);z-=groove*cos(phi)
  # Chunky side sweeps influence the actual surface, not attached objects.
  swell=.025*exp(-((abs(x)-.32)/.23)**2)*front*sin(pi*t)
  y-=swell;z+=swell*.6
  vs.append((x,y,z))
for j in range(R):
 for i in range(N):
  a=j*N+i;b=j*N+(i+1)%N;fs.append((a,b,b+N,a+N))
fs.append(tuple(R*N+i for i in range(N)))
hair=mesh('molded hair',vs,fs,hairmat)
so=hair.modifiers.new('Molded hair shell','SOLIDIFY');so.thickness=.04;so.offset=-1
# Studio: bright product-style light, broad highlights and a restrained background.
world=source.world.copy();world.name='B3-world';scene.world=world
world.node_tree.nodes['Background'].inputs[0].default_value=(.55,.60,.68,1);world.node_tree.nodes['Background'].inputs[1].default_value=.5
for name in ['key','fill','rim']:
 old=bpy.data.objects['B2-'+name];ob=old.copy();ob.data=old.data.copy();ob.name='B3-'+name;scene.collection.objects.link(ob)
ob=bpy.data.objects['B3-fill'];ob.data.energy=310
cam=source.camera.copy();cam.data=source.camera.data.copy();cam.name='B3-Camera';scene.collection.objects.link(cam);scene.camera=cam
cam.location=(3,-8,2.9);cam.rotation_euler=(Vector((0,0,1.42))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.ortho_scale=3.60
scene.render.engine='CYCLES';scene.cycles.samples=32;scene.cycles.use_denoising=True
scene.render.resolution_x=1000;scene.render.resolution_y=1100;scene.render.resolution_percentage=100
scene.view_settings.view_transform='AgX';scene.view_settings.look='AgX - Medium High Contrast'
scene.render.image_settings.file_format='PNG'
scene['study_status']='Beige cartoon art study; no rig or game integration.'
scene['user_direction']='Less realistic; plasticy cartoon; friendlier face; beige jacket.'
for o in bpy.context.selected_objects:o.select_set(False)
head.select_set(True);bpy.context.view_layer.objects.active=head
sys.path.append('/Users/ejinsw/.codex/skills/scenario-blender-expert/scripts')
import bx_gui as G
G.set_view('FRONT',frame=head)
for o in COL.objects:
 if o.type=='MESH' and o.name!='B3-ground':o.select_set(True)
G.run('view3d.view_selected')
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'assets/3d/brandon-v3/brandon-cartoon.blend'),copy=True)
result={'scene':scene.name,'new_head':len(head.data.vertices),'new_hair':len(hair.data.vertices),'saved':True}
