"""Brandon v4: continuous quad garments, compact FK deformation rig.
Run in the existing Blender session after v3. Own scene only; original studies remain.
Construction units are halved at creation, giving a roughly 1.9 m character.
"""
import bpy, bmesh, math, sys, json
from pathlib import Path
from mathutils import Vector, Matrix
from math import sin,cos,pi
ROOT=Path('/Users/ejinsw/Documents/GitHub/GOC Royale')
sys.path.append('/Users/ejinsw/.codex/skills/scenario-blender-rigging/scripts')
import bx_rig as R
NAME='Brandon v4 • Limb Rig'
if NAME in bpy.data.scenes:raise RuntimeError('Owned v4 scene already exists; refine rather than rebuild.')
scene=bpy.data.scenes.new(NAME);bpy.context.window.scene=scene
col=bpy.data.collections.new('Brandon v4 • character');scene.collection.children.link(col)
S=.5
parts=[];weight_data={}
def mat(name,h,rough=.5):
 m=bpy.data.materials.new('B4-'+name);rgb=[int(h[i:i+2],16)/255 for i in (0,2,4)]
 rgb=[c/12.92 if c<.04045 else ((c+.055)/1.055)**2.4 for c in rgb]
 m.diffuse_color=(*rgb,1);bs=m.node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=(*rgb,1);bs.inputs['Roughness'].default_value=rough;bs.inputs['Coat Weight'].default_value=.025
 return m
beige=mat('sand jacket','D4B78F',.54);tan=mat('rib knit','A98965',.6);cream=mat('cream tee','FFF0D9',.6);navy=mat('navy trousers','293446',.59);sole=mat('ivory sole','F0E6D4',.58);skin=mat('skin','EDB98D',.50)
def mesh(name,vs,fs,mats,weights=None,sub=0,mi=None):
 me=bpy.data.meshes.new('B4-'+name);me.from_pydata([tuple(Vector(v)*S) for v in vs],[],fs);me.update()
 ob=bpy.data.objects.new('B4-'+name,me);col.objects.link(ob);parts.append(ob)
 for m in mats:me.materials.append(m)
 if mi:
  for p,idx in zip(me.polygons,mi):p.material_index=idx
 bm=bmesh.new();bm.from_mesh(me);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(me);bm.free();me.shade_smooth()
 if weights:weight_data[ob.name]=weights
 if sub:
  mod=ob.modifiers.new('Surface smoothing','SUBSURF');mod.levels=sub;mod.render_levels=sub
 return ob

def mix(a,b,t):
 t=max(0,min(1,t));t=t*t*(3-2*t)
 return {a:1-t,b:t}
# Torso has shoulder openings whose vertices are shared by the attached sleeve loops.
levels=[(1.06,.42,.23),(1.13,.45,.25),(1.43,.49,.27),(1.72,.54,.29),(1.95,.56,.29),(2.18,.43,.24),(2.27,.21,.18)]
N=16;vs=[];fs=[];weights=[];mi=[]
for z,w,d in levels:
 for i in range(N):
  a=2*pi*i/N;vs.append((w*sin(a),-d*cos(a),z));weights.append(mix('spine','chest',(z-1.35)/.45))
for j in range(len(levels)-1):
 for i in range(N):
  if j in (3,4) and i in (3,4,11,12):continue
  fs.append((j*N+i,j*N+(i+1)%N,(j+1)*N+(i+1)%N,(j+1)*N+i));mi.append(2 if i in (0,15) else (1 if j==0 else 0))
fs.extend([tuple(reversed(range(N))),tuple((len(levels)-1)*N+i for i in range(N))]);mi.extend([1,1])
landmarks={}
for side,suffix in [(1,'L'),(-1,'R')]:
 k=4 if side==1 else 12
 boundary=[3*N+k-1,3*N+k,3*N+k+1,4*N+k+1,5*N+k+1,5*N+k,5*N+k-1,4*N+k-1]
 shoulder=Vector((side*.48,0,2.04));elbow=Vector((side*.88,-.03,1.70));wrist=Vector((side*1.13,-.07,1.22));palm=Vector((side*1.23,-.085,1.02))
 landmarks[suffix]=(shoulder,elbow,wrist,palm)
 angles=[math.atan2((vs[v][2]-1.95)/.23,-vs[v][1]/.29) for v in boundary]
 prev=boundary
 # Additional rings on both sides of each bend, using smooth 2-bone weights.
 rings=[(.12,.215),(.28,.205),(.40,.19),(.46,.185),(.50,.185),(.54,.18),(.60,.17),(.76,.15),(.91,.127),(.97,.123),(1,.123)]
 for t,rad in rings:
  c=shoulder.lerp(elbow,t*2) if t<=.5 else elbow.lerp(wrist,(t-.5)*2)
  tangent=(elbow-shoulder if t<.5 else wrist-elbow).normalized()
  up=Vector((-tangent.z*side,0,tangent.x*side));front=Vector((0,-1,0))
  ids=[]
  for a in angles:
   ids.append(len(vs));vs.append(tuple(c+rad*(front*cos(a)+up*sin(a))))
   wt=mix('upper_arm.'+suffix,'forearm.'+suffix,(t-.40)/.20)
   if t<.22:
    f=max(0,(.22-t)/.22)*.5;wt={k:v*(1-f) for k,v in wt.items()};wt['clavicle.'+suffix]=f
   weights.append(wt)
  for i in range(8):fs.append((prev[i],prev[(i+1)%8],ids[(i+1)%8],ids[i]));mi.append(1 if t>=.91 else 0)
  prev=ids
 fs.append(tuple(reversed(prev)));mi.append(1)
 for v in boundary:
  z=vs[v][2];f=.2 if z<1.8 else .45;weights[v]={'chest':1-f,'clavicle.'+suffix:f}
# Remove the unused center vertices of the 2x2 shoulder openings.
used=sorted({i for f in fs for i in f});remap={old:i for i,old in enumerate(used)}
jacket=mesh('jacket skin', [vs[i] for i in used],[tuple(remap[i] for i in f) for f in fs],[beige,tan,cream],[weights[i] for i in used],2,mi)
# Pants: one closed pelvis surface, bifurcating into two connected leg tubes.
vs=[];fs=[];weights=[]
for z,w,d in [(1.16,.42,.23),(1.08,.45,.25),(.90,.45,.25)]:
 for i in range(16):a=2*pi*i/16;vs.append((w*sin(a),-d*cos(a),z));weights.append({'hips':1})
for j in range(2):
 for i in range(16):fs.append((j*16+i,j*16+(i+1)%16,(j+1)*16+(i+1)%16,(j+1)*16+i))
fs.append(tuple(reversed(range(16))))
crotch=[]
for y,z in [(.13,.79),(0,.76),(-.13,.79)]:crotch.append(len(vs));vs.append((0,y,z));weights.append({'hips':1})
for side,suffix in [(1,'L'),(-1,'R')]:
 if side==1:prev=list(range(32,41))+crotch
 else:prev=list(range(40,48))+[32]+list(reversed(crotch))
 angles=[math.atan2((vs[i][0]-side*.22)/.23,-vs[i][1]/.25) for i in prev]
 for z,r in [(.80,.224),(.71,.216),(.65,.202),(.61,.195),(.57,.190),(.53,.185),(.45,.174),(.30,.16),(.24,.16),(.215,.16)]:
  ids=[]
  for a in angles:
   ids.append(len(vs));vs.append((side*.24+r*sin(a),-.025-r*.88*cos(a),z))
   if z>.71:wt=mix('hips','thigh.'+suffix,(.90-z)/.19)
   else:wt=mix('thigh.'+suffix,'shin.'+suffix,(.67-z)/.14)
   weights.append(wt)
  for i in range(12):fs.append((prev[i],prev[(i+1)%12],ids[(i+1)%12],ids[i]))
  prev=ids
 fs.append(tuple(reversed(prev)))
pants=mesh('trousers skin',vs,fs,[navy],weights,2)
# Shoes have a curved upper, rounded toe and a separate sole material band.
for side,suffix in [(1,'L'),(-1,'R')]:
 vs=[];fs=[];mi=[];weights=[];N=24
 for z,rx,ry,cy in [(.025,.18,.29,-.105),(.045,.198,.31,-.105),(.09,.198,.31,-.105),(.13,.19,.29,-.105),(.20,.17,.23,-.07),(.26,.14,.15,-.015),(.28,.13,.13,0)]:
  for i in range(N):
   a=2*pi*i/N;vs.append((side*.24+rx*sin(a),cy-ry*cos(a),z));weights.append({'foot.'+suffix:1})
 for j in range(6):
  for i in range(N):fs.append((j*N+i,j*N+(i+1)%N,(j+1)*N+(i+1)%N,(j+1)*N+i));mi.append(1 if j<2 else 0)
 fs.extend([tuple(reversed(range(N))),tuple(6*N+i for i in range(N))]);mi.extend([1,0])
 mesh('sneaker.'+suffix,vs,fs,[beige,sole],weights,2,mi)
# Retain the likeness study as head geometry, scaling it into full-body proportions.
headlabels=['face','eye -1','pupil -1','brow -1','glasses rim -1','glasses temple -1','eye 1','pupil 1','brow 1','glasses rim 1','glasses temple 1','glasses bridge','friendly smile','ear -1','ear 1','molded hair']
headmats={}
for label in headlabels:
 old=bpy.data.objects['B3-'+label];ob=old.copy();ob.data=old.data.copy();ob.name='B4-'+label;col.objects.link(ob);parts.append(ob);ob.animation_data_clear()
 for v in ob.data.vertices:v.co=(v.co.x*.84*S,v.co.y*.84*S,(2.36+(v.co.z-1.35)*.84)*S)
 for i,m in enumerate(ob.data.materials):
  if m.name not in headmats:
   cp=m.copy();cp.name='B4-'+m.name[3:];bs=cp.node_tree.nodes.get('Principled BSDF');bs.inputs['Roughness'].default_value=.5;bs.inputs['Coat Weight'].default_value=.025;headmats[m.name]=cp
  ob.data.materials[i]=headmats[m.name]
 # Hair solidify is authored in original sculpt scale.
 for mod in ob.modifiers:
  if mod.type=='SOLIDIFY':mod.thickness*=.84*S
 weight_data[ob.name]=[{'head':1} for v in ob.data.vertices]
# Neck has intermediate rings blending chest/neck/head, hidden under collar and chin.
vs=[];fs=[];weights=[];N=20
for z,r in [(2.17,.17),(2.22,.175),(2.30,.175),(2.39,.18),(2.46,.19)]:
 for i in range(N):
  a=2*pi*i/N;vs.append((r*sin(a),-r*.9*cos(a),z));weights.append(mix('neck','head',(z-2.25)/.18))
for j in range(4):
 for i in range(N):fs.append((j*N+i,j*N+(i+1)%N,(j+1)*N+(i+1)%N,(j+1)*N+i))
fs.extend([tuple(reversed(range(N))),tuple(4*N+i for i in range(N))]);mesh('neck skin',vs,fs,[skin],weights,1)
# Shaped mitten hands: wrist movement works; individual finger animation is a later pass.
for side,suffix in [(1,'L'),(-1,'R')]:
 old=bpy.data.objects['B3-hand '+str(side)];wrist=landmarks[suffix][2];direction=(landmarks[suffix][3]-wrist).normalized();rot=Vector((0,0,-1)).rotation_difference(direction)
 vs=[]
 for v in old.data.vertices:
  local=v.co-Vector((side*.84,-.07,.17));p=wrist+rot@local;vs.append(tuple(p))
 weights=[mix('forearm.'+suffix,'hand.'+suffix,max(0,(.17-old.data.vertices[i].co.z)/.08)) for i in range(len(vs))]
 ob=mesh('hand.'+suffix,vs,[tuple(p.vertices) for p in old.data.polygons],[skin],weights)
# Compact game skeleton: one root; no generated controllers exported.
arm=bpy.data.armatures.new('Brandon articulation');rig=bpy.data.objects.new('B4-Brandon rig',arm);col.objects.link(rig);rig.show_in_front=True;rig.data.display_type='OCTAHEDRAL'
for o in bpy.context.selected_objects:o.select_set(False)
rig.select_set(True);bpy.context.view_layer.objects.active=rig;bpy.ops.object.mode_set(mode='EDIT');eb=arm.edit_bones
bones={}
def bone(name,h,t,parent=None,connect=False,deform=True):
 b=R.new_bone(eb,name,Vector(h)*S,Vector(t)*S,parent=bones.get(parent),connect=connect,deform=deform,roll_z=(0,-1,0));bones[name]=b;return b
bone('root',(0,0,0),(0,0,.25),deform=False)
bone('hips',(0,0,.9),(0,0,1.2),'root');bone('spine',(0,0,1.2),(0,0,1.7),'hips',True);bone('chest',(0,0,1.7),(0,0,2.19),'spine',True);bone('neck',(0,0,2.19),(0,0,2.45),'chest',True);bone('head',(0,0,2.45),(0,0,3.47),'neck',True)
for side,suffix in [(1,'L'),(-1,'R')]:
 sh,el,wr,pa=landmarks[suffix]
 bone('clavicle.'+suffix,(0,0,2.08),sh,'chest');bone('upper_arm.'+suffix,sh,el,'clavicle.'+suffix,True);bone('forearm.'+suffix,el,wr,'upper_arm.'+suffix,True);bone('hand.'+suffix,wr,pa,'forearm.'+suffix,True)
 bone('thigh.'+suffix,(side*.24,0,.93),(side*.24,-.045,.60),'hips');bone('shin.'+suffix,(side*.24,-.045,.60),(side*.24,0,.24),'thigh.'+suffix,True);bone('foot.'+suffix,(side*.24,0,.24),(side*.24,-.22,.09),'shin.'+suffix,True);bone('toe.'+suffix,(side*.24,-.22,.09),(side*.24,-.36,.09),'foot.'+suffix,True)
bpy.ops.object.mode_set(mode='OBJECT')
for ob in parts:
 ob.vertex_groups.clear()
 for i,wt in enumerate(weight_data[ob.name]):
  total=sum(w for w in wt.values() if w>1e-6)
  for name,w in wt.items():
   if w<=1e-6:continue
   vg=ob.vertex_groups.get(name) or ob.vertex_groups.new(name=name);vg.add([i],w/total,'REPLACE')
 mod=ob.modifiers.new('Game skin','ARMATURE');mod.object=rig;mod.use_deform_preserve_volume=False
 ob.modifiers.move(len(ob.modifiers)-1,0);ob.parent=rig
rig['stage']='Rigged prototype: FK controls, no facial rig or individual finger controls yet'
rig['axes']='Z up, front -Y; root stationary; all rotations local'
# A reversible joint test clip; limb poses are actual bone keys.
scene.render.fps=30;scene.frame_start=1;scene.frame_end=121
poses={1:{},21:{'forearm.L':(90,0,0),'forearm.R':(90,0,0)},41:{'clavicle.L':(0,0,-12),'upper_arm.L':(0,0,-55),'forearm.L':(105,0,0),'hand.L':(0,0,20),'forearm.R':(35,0,0)},61:{'thigh.L':(40,0,0),'shin.L':(-75,0,0),'foot.L':(15,0,0),'forearm.R':(75,0,0)},81:{'thigh.R':(40,0,0),'shin.R':(-75,0,0),'foot.R':(15,0,0),'forearm.L':(75,0,0)},101:{'upper_arm.L':(0,0,-35),'upper_arm.R':(0,0,35),'forearm.L':(60,0,0),'forearm.R':(60,0,0),'hand.L':(0,25,0),'hand.R':(0,-25,0)},121:{}}
for frame,pose in poses.items():
 for pb in rig.pose.bones:
  pb.rotation_mode='XYZ';pb.rotation_euler=[math.radians(a) for a in pose.get(pb.name,(0,0,0))];pb.keyframe_insert('rotation_euler',frame=frame,group=pb.name)
rig.animation_data.action.name='joint_demo';rig.animation_data.action.use_fake_user=True
scene.frame_set(1)
# Review lighting and ground are kept outside the exported character collection.
world=bpy.data.worlds.new('B4-studio');scene.world=world;world.color=(.22,.22,.22);world.use_nodes=True;world.node_tree.nodes['Background'].inputs['Color'].default_value=(.32,.36,.42,1);world.node_tree.nodes['Background'].inputs['Strength'].default_value=.5
for name,loc,power,size in [('key',(-3,-4,6),500,4),('fill',(3,-1,3),250,3),('rim',(1,3,4),400,3)]:
 data=bpy.data.lights.new('B4-'+name,'AREA');data.energy=power;data.shape='DISK';data.size=size;ob=bpy.data.objects.new('B4-'+name,data);scene.collection.objects.link(ob);ob.location=loc;ob.rotation_euler=(Vector((0,0,.9))-ob.location).to_track_quat('-Z','Y').to_euler()
camdata=bpy.data.cameras.new('B4-review');cam=bpy.data.objects.new('B4-review',camdata);scene.collection.objects.link(cam);scene.camera=cam;camdata.type='ORTHO';camdata.ortho_scale=2.35;cam.location=(3,-6,2.5);cam.rotation_euler=(Vector((0,0,.95))-cam.location).to_track_quat('-Z','Y').to_euler()
me=bpy.data.meshes.new('B4-floor');me.from_pydata([(-100,-100,0),(100,-100,0),(100,100,0),(-100,100,0)],[],[(0,1,2,3)]);floor=bpy.data.objects.new('B4-floor',me);scene.collection.objects.link(floor);me.materials.append(mat('floor','D5DBE1',.85))
scene.render.engine='CYCLES';scene.cycles.samples=24;scene.cycles.use_denoising=True;scene.render.resolution_x=900;scene.render.resolution_y=1100;scene.render.resolution_percentage=100;scene.view_settings.view_transform='AgX';scene.render.image_settings.file_format='PNG';scene.unit_settings.system='METRIC'
report={o.name:R.weight_report(o,rig,expect_inside=False) for o in parts}
(ROOT/'outputs/brandon-v4/weights.json').write_text(json.dumps(report,indent=2))
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'assets/3d/brandon-v4/brandon-rig.blend'),copy=True)
result={'scene':scene.name,'parts':len(parts),'bones':len(rig.data.bones),'all_weighted':all(v['unweighted']==0 and v['sum_dev']==0 and v['over4']==0 for v in report.values()),'saved':True}
