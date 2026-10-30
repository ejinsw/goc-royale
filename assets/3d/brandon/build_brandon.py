"""Reproducible Brandon low-poly cartoon prototype. Blender 4.1+."""
import bpy, math, json, os
from mathutils import Vector
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3]
OUT=ROOT/'client/public/art3d/brandon'; OUT.mkdir(parents=True,exist_ok=True)
SRC=ROOT/'assets/3d/brandon'; DELIVERY=ROOT/'outputs/brandon'
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
for a in list(bpy.data.actions): bpy.data.actions.remove(a)
M={}
colors={'skin':'DCA276','skinLight':'E7B58A','hair':'20242E','hairLight':'303441','blue':'346CBC','blueLight':'4D86CF','navy':'202E48','gold':'EABF55','cream':'F7EBD3','white':'FFF8EB','eye':'172032','pink':'AD5F53','sole':'CCBCA1'}
def material(k):
    h=colors[k]; rgb=[int(h[i:i+2],16)/255 for i in (0,2,4)]
    # Palette values are sRGB; Blender material inputs are linear.
    rgb=[c/12.92 if c<=.04045 else ((c+.055)/1.055)**2.4 for c in rgb]
    m=bpy.data.materials.new(k); m.diffuse_color=(*rgb,1); m.use_nodes=True
    bs=m.node_tree.nodes.get('Principled BSDF'); bs.inputs['Base Color'].default_value=(*rgb,1); bs.inputs['Roughness'].default_value=.78
    return m
for k in colors:M[k]=material(k)
parts=[]
def finish(o,name,mat,bone):
    o.name=name; o.data.materials.append(M[mat]); parts.append((o,bone)); return o

def box(name,loc,scale,mat,bone,bevel=.04):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc); o=bpy.context.object; o.scale=scale
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    if bevel:
        mod=o.modifiers.new('Broad toy bevel','BEVEL');mod.width=bevel;mod.segments=1
        bpy.ops.object.modifier_apply(modifier=mod.name)
    return finish(o,name,mat,bone)
def ico(name,loc,scale,mat,bone,sub=1):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=sub,radius=1,location=loc);o=bpy.context.object;o.scale=scale
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    return finish(o,name,mat,bone)
def sphere(name,loc,scale,mat,bone,segments=12,rings=8):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments,ring_count=rings,radius=1,location=loc);o=bpy.context.object;o.scale=scale
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    return finish(o,name,mat,bone)
def mesh(name,verts,faces,mat,bone):
    me=bpy.data.meshes.new(name);me.from_pydata(verts,[],faces);me.update();o=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(o)
    return finish(o,name,mat,bone)
def line(name,pts,r,mat,bone):
    cu=bpy.data.curves.new(name,'CURVE');cu.dimensions='3D';cu.resolution_u=1;cu.bevel_depth=r;cu.bevel_resolution=0;cu.resolution_u=1
    sp=cu.splines.new('POLY');sp.points.add(len(pts)-1)
    for p,co in zip(sp.points,pts):p.co=(*co,1)
    ob=bpy.data.objects.new(name,cu);bpy.context.collection.objects.link(ob);bpy.context.view_layer.objects.active=ob;ob.select_set(True)
    bpy.ops.object.convert(target='MESH');ob=bpy.context.object;ob.select_set(False);return finish(ob,name,mat,bone)
def segment(name,a,b,width,depth,mat,bone):
    mid=(Vector(a)+Vector(b))/2;ob=box(name,mid,(width,depth,(Vector(a)-Vector(b)).length+.035),mat,bone,.035)
    ob.rotation_mode='QUATERNION';ob.rotation_quaternion=(Vector(b)-Vector(a)).to_track_quat('Z','Y');return ob
# Feet/legs have broad simple facets, all clothing keeps its original material when team changes.
for side,x in [('L',.24),('R',-.24)]:
    box('shoe_'+side,(x,-.12,.15),(.38,.64,.28),'cream','foot_'+side,.075)
    box('sole_'+side,(x,-.12,.065),(.39,.65,.10),'sole','foot_'+side,.035)
    box('shoe_blue_'+side,(x,-.145,.26),(.24,.27,.08),'blue','foot_'+side,.02)
    for j in range(3):line('lace_'+side+str(j),[(x-.09,-.27+j*.065,.305),(x+.09,-.27+j*.065,.305)],.012,'white','foot_'+side)
    segment('calf_'+side,(x,0,.27),(x,0,.72),.29,.33,'navy','shin_'+side)
    segment('thigh_'+side,(x,0,.70),(x,0,1.16),.34,.37,'navy','thigh_'+side)
box('hips',(0,.015,1.12),(.73,.43,.27),'navy','hips',.065)
# Jacket: tapered torso mesh, cream inset and two blue panels.
mesh('jacket_body',[(-.37,-.23,1.20),(.37,-.23,1.20),(.37,.23,1.20),(-.37,.23,1.20),(-.48,-.23,1.85),(.48,-.23,1.85),(.43,.23,1.85),(-.43,.23,1.85)],[(0,1,2,3),(0,4,5,1),(1,5,6,2),(2,6,7,3),(3,7,4,0),(4,7,6,5)],'blue','spine')
mesh('cream_shirt',[(-.19,-.245,1.23),(.19,-.245,1.23),(.22,-.25,1.83),(-.22,-.25,1.83)],[(0,1,2,3)],'cream','spine')
for sign in [-1,1]:
    line('gold_zip_'+str(sign),[(sign*.20,-.265,1.22),(sign*.22,-.265,1.81)],.016,'gold','spine')
    mesh('collar_'+str(sign),[(sign*.09,-.27,1.87),(sign*.24,-.28,1.70),(sign*.37,-.25,1.82),(sign*.25,-.18,1.94)],[(0,1,2,3)],'blueLight','spine')
    line('collar_trim_'+str(sign),[(sign*.09,-.28,1.87),(sign*.24,-.29,1.70),(sign*.37,-.26,1.82)],.012,'gold','spine')
line('jacket_hem',[(-.37,-.25,1.22),(-.20,-.26,1.22)],.022,'gold','spine');line('jacket_hem_R',[(.2,-.26,1.22),(.37,-.25,1.22)],.022,'gold','spine')
sphere('neck',(0,0,1.94),(.17,.16,.22),'skin','neck',10,5)
# Head is a small sculpted polygon surface, not photoreal skin.
sphere('face',(0,-.025,2.43),(.50,.405,.58),'skinLight','head',16,10)
for sign in [-1,1]:
    ico('ear_'+str(sign),(sign*.49,.015,2.42),(.105,.105,.17),'skin','head',2)
# Black curtain hair, intentionally broad facets.
sphere('hair_cap',(0,.075,2.76),(.54,.425,.34),'hair','head',12,6)
for i,(x,z,ang) in enumerate([(-.42,2.69,-.35),(-.29,2.83,-.28),(-.14,2.91,-.18),(.11,2.91,.18),(.27,2.82,.30),(.43,2.68,.40)]):
    o=ico('hair_lock_'+str(i),(x,-.28,z),(.175,.15,.25),'hairLight' if i in [1,4] else 'hair','head',1);o.rotation_euler[1]=ang
# Pointed fringe locks frame eyes, center opening exposes forehead.
for sign in [-1,1]:
    mesh('fringe_'+str(sign),[(sign*.06,-.43,2.88),(sign*.41,-.39,2.80),(sign*.45,-.37,2.46),(sign*.19,-.46,2.67),(sign*.28,-.22,2.95)],[(0,1,3),(1,2,3),(0,4,1),(4,2,1)],'hair','head')
# Facial pieces lie in front of skin. No transparent lenses or tiny textures.
for sign in [-1,1]:
    x=sign*.215
    sphere('eye_white_'+str(sign),(x,-.409,2.47),(.078,.018,.032),'white','head',10,5)
    sphere('pupil_'+str(sign),(x,-.43,2.47),(.034,.014,.030),'eye','head',8,5)
    line('brow_'+str(sign),[(x-.075,-.415,2.58),(x,-.431,2.60),(x+.07,-.414,2.58)],.018,'hair','head')
    pts=[(x-.155,-.43,2.55),(x+.145,-.43,2.55),(x+.16,-.435,2.51),(x+.14,-.435,2.34),(x+.08,-.44,2.31),(x-.10,-.44,2.31),(x-.155,-.435,2.36),(x-.17,-.43,2.50),(x-.155,-.43,2.55)]
    line('glasses_frame_'+str(sign),pts,.021,'eye','head')
    line('glasses_arm_'+str(sign),[(sign*.38,-.42,2.51),(sign*.49,-.05,2.50)],.018,'eye','head')
line('glasses_bridge',[(-.06,-.445,2.49),(0,-.47,2.505),(.06,-.445,2.49)],.018,'eye','head')
ico('nose',(0,-.425,2.34),(.073,.105,.10),'skin','head',1)
# Friendly broad smile with one clean ivory band.
mesh('smile',[(-.22,-.382,2.25),(-.11,-.421,2.22),(0,-.44,2.215),(.11,-.421,2.22),(.22,-.382,2.25),(.14,-.405,2.13),(0,-.43,2.10),(-.14,-.405,2.13)],[(0,1,2,3,4,5,6,7)],'pink','head')
mesh('teeth',[(-.19,-.395,2.235),(-.09,-.435,2.21),(0,-.451,2.205),(.09,-.435,2.21),(.19,-.395,2.235),(.10,-.433,2.17),(0,-.448,2.16),(-.10,-.433,2.17)],[(0,1,2,3,4,5,6,7)],'white','head')
# Arms angled down/out; rigid weighted limbs provide intentional articulated toy movement.
for side,sgn in [('L',1),('R',-1)]:
    a=(sgn*.43,0,1.78); b=(sgn*.63,-.015,1.47); c=(sgn*.71,-.13,1.24)
    segment('sleeve_upper_'+side,a,b,.30,.34,'blue','upper_arm_'+side)
    segment('sleeve_lower_'+side,b,c,.25,.29,'blue','forearm_'+side)
    box('cuff_'+side,(sgn*.71,-.13,1.28),(.265,.3,.08),'gold','forearm_'+side,.018)
    ico('hand_'+side,(sgn*.72,-.15,1.15),(.15,.16,.18),'skinLight','hand_'+side,2)
    ico('thumb_'+side,(sgn*.62,-.25,1.18),(.075,.095,.105),'skin','hand_'+side,1)
# Held pieces, parent weights make them follow the hands.
box('clipboard',( .80,-.32,1.22),(.43,.07,.59),'navy','hand_L',.035)
box('clipboard_paper',(.80,-.364,1.21),(.33,.015,.43),'cream','hand_L',.005)
box('clipboard_clip',(.80,-.38,1.49),(.16,.05,.09),'gold','hand_L',.012)
for i in range(3):box('clipboard_line_'+str(i),(.80,-.376,1.30-i*.07),(.22 if i<2 else .13,.01,.018),'blue','hand_L',0)
box('nametag',(-.76,-.34,1.13),(.40,.055,.25),'cream','hand_R',.025)
box('nametag_header',(-.76,-.373,1.215),(.36,.015,.065),'blue','hand_R',.008)
box('nametag_pin',(-.76,-.37,1.285),(.07,.05,.075),'gold','hand_R',.01)
# Rig.
bpy.ops.object.select_all(action='DESELECT'); arm=bpy.data.armatures.new('Brandon_Rig'); rig=bpy.data.objects.new('Brandon',arm);bpy.context.collection.objects.link(rig);bpy.context.view_layer.objects.active=rig;rig.select_set(True);bpy.ops.object.mode_set(mode='EDIT')
bones={}
def bone(name,head,tail,parent=None):
    b=arm.edit_bones.new(name);b.head=head;b.tail=tail
    if parent:b.parent=arm.edit_bones[parent]
    bones[name]=(head,tail)
bone('root',(0,0,0),(0,0,.25));bone('hips',(0,0,1.10),(0,0,1.30),'root');bone('spine',(0,0,1.30),(0,0,1.83),'hips');bone('neck',(0,0,1.83),(0,0,2.02),'spine');bone('head',(0,0,2.02),(0,0,2.80),'neck')
for side,sgn in [('L',1),('R',-1)]:
    bone('thigh_'+side,(sgn*.24,0,1.14),(sgn*.24,0,.72),'hips');bone('shin_'+side,(sgn*.24,0,.72),(sgn*.24,0,.24),'thigh_'+side);bone('foot_'+side,(sgn*.24,0,.24),(sgn*.24,-.32,.12),'shin_'+side)
    bone('upper_arm_'+side,(sgn*.43,0,1.78),(sgn*.63,-.015,1.47),'spine');bone('forearm_'+side,(sgn*.63,-.015,1.47),(sgn*.71,-.13,1.24),'upper_arm_'+side);bone('hand_'+side,(sgn*.71,-.13,1.24),(sgn*.72,-.15,1.09),'forearm_'+side)
bpy.ops.object.mode_set(mode='OBJECT')
# Consolidate all geometry to one skinned mesh, retaining separate named rigid bone weights.
for ob,b in parts:
    group=ob.vertex_groups.new(name=b);group.add(list(range(len(ob.data.vertices))),1.0,'REPLACE')
bpy.ops.object.select_all(action='DESELECT')
for ob,_ in parts:ob.select_set(True)
bpy.context.view_layer.objects.active=parts[0][0];bpy.ops.object.join();body=bpy.context.object;body.name='Brandon_Mesh'
bpy.ops.object.transform_apply(location=False,rotation=True,scale=True)
mod=body.modifiers.new('Toy articulation','ARMATURE');mod.object=rig;body.parent=rig
# Named animation actions, in-place. NLA tracks export as separate clips.
scene=bpy.context.scene;scene.render.fps=30
for pb in rig.pose.bones:pb.rotation_mode='XYZ'
clips={}
def make_clip(name,frames,loop,pose):
    rig.animation_data_create();a=bpy.data.actions.new(name);rig.animation_data.action=a
    for frame in frames:
        for pb in rig.pose.bones:pb.rotation_euler=(0,0,0);pb.location=(0,0,0);pb.scale=(1,1,1)
        pose(frame/frames[-1] if frames[-1] else 0)
        for pb in rig.pose.bones:
            pb.keyframe_insert('rotation_euler',frame=frame);pb.keyframe_insert('location',frame=frame)
    for fc in a.fcurves:
        for kp in fc.keyframe_points:kp.interpolation='BEZIER'
    track=rig.animation_data.nla_tracks.new();track.name=name;strip=track.strips.new(name,0,a);track.mute=True
    rig.animation_data.action=None;clips[name]={'seconds':frames[-1]/30,'loop':loop}
def rot(n,x=0,y=0,z=0):rig.pose.bones[n].rotation_euler=(math.radians(x),math.radians(y),math.radians(z))
def idle(t):
    w=math.sin(t*math.tau);rot('spine',x=w*1.5);rot('head',z=w*2);rot('forearm_R',x=-5+w*3);rig.pose.bones['hips'].location.z=.012*w
def run(t):
    w=math.sin(t*math.tau);rot('thigh_L',x=30*w);rot('thigh_R',x=-30*w);rot('shin_L',x=-max(0,w)*35);rot('shin_R',x=-max(0,-w)*35);rot('upper_arm_L',x=-17*w);rot('upper_arm_R',x=25*w);rot('spine',x=6);rig.pose.bones['hips'].location.z=.035*(1-math.cos(t*math.tau*2))
def attack(t):
    a=math.sin(math.pi*t);rot('upper_arm_R',x=-62*a,z=-15*a);rot('forearm_R',x=-25*a);rot('hand_R',z=25*a);rot('spine',z=7*a)
def superpose(t):
    a=math.sin(math.pi*t);rot('upper_arm_R',x=-95*a,z=-30*a);rot('upper_arm_L',x=-45*a,z=25*a);rot('head',x=-12*a);rig.pose.bones['hips'].location.z=.08*a
make_clip('idle',[0,15,30,45,60,75,90],True,idle)
make_clip('run_forward',[0,4,8,12,16,20,24],True,run)
def back(t):run(1-t);rot('spine',x=-3)
make_clip('run_backward',[0,4,8,12,16,20,24],True,back)
for side,sgn in [('left',1),('right',-1)]:
    def strafe(t,sgn=sgn):
        w=math.sin(t*math.tau);rot('thigh_L',z=sgn*w*17);rot('thigh_R',z=-sgn*w*17);rot('spine',z=-sgn*5);rig.pose.bones['hips'].location.z=.025*(1-math.cos(t*math.tau*2))
    make_clip('strafe_'+side,[0,4,8,12,16,20,24],True,strafe)
make_clip('basic_attack',[0,2,4,6,9,12],False,attack)
make_clip('super',[0,4,8,12,18,24],False,superpose)
def hit(t):a=math.sin(t*math.pi);rot('spine',x=-12*a);rot('head',x=-8*a)
make_clip('hit',[0,2,4,6],False,hit)
def eliminated(t):rot('root',x=-75*t,z=12*t);rig.pose.bones['root'].location.z=.16*math.sin(math.pi*t)
make_clip('eliminated',[0,5,10,15,20],False,eliminated)
def victory(t):
    a=math.sin(math.pi*t);rot('upper_arm_R',x=-130*a,z=-30*a);rot('forearm_R',x=-20*a);rot('head',z=8*math.sin(t*math.tau*2));rig.pose.bones['hips'].location.z=.10*abs(math.sin(t*math.tau))
make_clip('victory',[0,8,16,24,32,40,48,60],False,victory)
# Additional states complete the first shared toy-animation vocabulary.
def carry(t):
    run(t);rot('upper_arm_R',x=-42,z=-12);rot('upper_arm_L',x=-42,z=12);rot('forearm_R',x=-48);rot('forearm_L',x=-48)
make_clip('carry_ball',[0,4,8,12,16,20,24],True,carry)
def shot(t):
    a=math.sin(math.pi*t);rot('upper_arm_R',x=-60*a);rot('upper_arm_L',x=-60*a);rot('thigh_R',x=-35*a);rot('shin_R',x=-15*a)
make_clip('ball_shot',[0,3,6,9,12],False,shot)
def stunned(t):
    rot('head',z=12*math.sin(t*math.tau));rot('spine',x=-5,z=3*math.sin(t*math.tau));rot('upper_arm_R',z=-15);rot('upper_arm_L',z=15)
make_clip('stunned',[0,8,16,24,32,40,48],True,stunned)
def respawn(t):
    a=math.sin(math.pi*t);rig.pose.bones['hips'].location.z=-.15*(1-t);rot('thigh_L',x=-16*(1-t));rot('thigh_R',x=-16*(1-t));rot('shin_L',x=-25*(1-t));rot('shin_R',x=-25*(1-t));rot('head',x=10*a)
make_clip('respawn',[0,3,6,9,12,15,18],False,respawn)
def defeat(t):
    rot('head',x=18*t);rot('spine',x=7*t);rot('upper_arm_R',z=8*t);rot('upper_arm_L',z=-8*t)
make_clip('defeat',[0,10,20,30,45],False,defeat)
# One vertex-color material keeps the toy palette to a single draw primitive.
colors_attr=body.data.color_attributes.new(name='Color',type='FLOAT_COLOR',domain='CORNER')
for poly in body.data.polygons:
    c=body.data.materials[poly.material_index].diffuse_color
    for index in poly.loop_indices:colors_attr.data[index].color=c
paint=bpy.data.materials.new('Painted toy palette');paint.use_nodes=True
nodes=paint.node_tree.nodes;bs=nodes.get('Principled BSDF');bs.inputs['Roughness'].default_value=.78
vc=nodes.new('ShaderNodeVertexColor');vc.layer_name='Color';paint.node_tree.links.new(vc.outputs['Color'],bs.inputs['Base Color'])
body.data.materials.clear();body.data.materials.append(paint)
for poly in body.data.polygons:poly.material_index=0
# Export neutral pose, rig and mesh only.
for pb in rig.pose.bones:pb.rotation_euler=(0,0,0);pb.location=(0,0,0)
scene.frame_set(0);bpy.ops.object.select_all(action='DESELECT');rig.select_set(True);body.select_set(True);bpy.context.view_layer.objects.active=rig
bpy.ops.export_scene.gltf(filepath=str(OUT/'brandon.glb'),export_format='GLB',use_selection=True,export_animations=True,export_nla_strips=True,export_force_sampling=True,export_def_bones=True)
# Studio turntable scene for source and renders (not exported).
world=bpy.data.worlds.new('Warm studio');scene.world=world;world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.55,.62,.72,1);world.node_tree.nodes['Background'].inputs[1].default_value=.4
bpy.ops.mesh.primitive_cylinder_add(vertices=64,radius=1.35,depth=.10,location=(0,0,-.055));ped=bpy.context.object;ped.name='Studio pedestal';ped.data.materials.append(M['cream'])
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.11));bpy.context.object.data.materials.append(M['sole'])
def light(name,loc,power,size):
    bpy.ops.object.light_add(type='AREA',location=loc);o=bpy.context.object;o.name=name;o.data.energy=power;o.data.shape='DISK';o.data.size=size;o.rotation_euler=(Vector((0,0,1.5))-o.location).to_track_quat('-Z','Y').to_euler()
light('Key',(-3,-5,7),450,5);light('Fill',(4,-2,4),220,4);light('Rim',(1,4,6),500,3)
bpy.ops.object.camera_add(location=(4,-7,3.8));cam=bpy.context.object;cam.name='Portrait Camera';cam.rotation_euler=(Vector((0,0,1.5))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=4.3;scene.camera=cam
scene.render.engine='CYCLES';scene.cycles.samples=48;scene.render.resolution_x=900;scene.render.resolution_y=1000;scene.render.resolution_percentage=100
scene.view_settings.view_transform='Standard';scene.render.image_settings.file_format='PNG'
# Save source with an idle action selected for immediate playback.
rig.animation_data.action=bpy.data.actions['idle'];scene.frame_start=0;scene.frame_end=90;scene.frame_set(0)
bpy.ops.wm.save_as_mainfile(filepath=str(SRC/'brandon.blend'))
scene.render.filepath=str(DELIVERY/'brandon-preview.png');bpy.ops.render.render(write_still=True)
tris=sum(len(p.vertices)-2 for p in body.data.polygons)
manifest={'character':'Brandon Kam','version':'0.2 playable prototype','style':'low-poly cartoon','triangles':tris,'vertices':len(body.data.vertices),'materials':len(body.data.materials),'bones':len(arm.bones),'clips':clips,'textures':0,'source':'Procedurally authored original Blender geometry; likeness guided by user-supplied photos.','limitations':['Rigid weighted articulated toy limbs; not final smooth deformation.','No gameplay integration or collision changes.','Broomball and status clips are authored; multiplayer animation integration remains pending.','Single vertex-color material; facial geometry and silhouette still need user review.']}
(OUT/'manifest.json').write_text(json.dumps(manifest,indent=2));print('BRANDON_MANIFEST',json.dumps(manifest))
