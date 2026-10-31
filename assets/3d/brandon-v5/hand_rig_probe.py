"""Isolated 11-bone left-hand rig and clipboard contact experiment, not final game rig."""
import bpy,bmesh,sys,json,math
from mathutils import Vector,Matrix
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3];OUT=ROOT/'outputs/brandon-v5/hand-rig';OUT.mkdir(exist_ok=True)
sys.path.extend(['/Users/ejinsw/.codex/skills/scenario-blender-rigging/scripts','/Users/ejinsw/.codex/skills/scenario-blender-expert/scripts'])
import bx_rig as R,bx_audit as A
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'assets/3d/brandon-v5/brandon-primary.blend'))
scene=bpy.data.scenes.new('Brandon v5 — hand rig experiment');bpy.context.window.scene=scene
col=bpy.data.collections.new('B5 hand experiment');scene.collection.children.link(col)
old=bpy.data.objects['B5-hand.L'];hand=old.copy();hand.data=old.data.copy();hand.name='B5H-left hand';col.objects.link(hand)
M=Matrix(((.9165,0,.40),(0,1,0),(.40,0,-.9165)))
for v in hand.data.vertices:v.co=M.inverted()@(v.co-Vector((.565,-.035,.61)))
bm=bmesh.new();bm.from_mesh(hand.data);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(hand.data);bm.free()
arm=bpy.data.armatures.new('B5H articulation');rig=bpy.data.objects.new('B5H hand rig',arm);col.objects.link(rig);rig.show_in_front=True
bpy.context.view_layer.objects.active=rig;rig.select_set(True);bpy.ops.object.mode_set(mode='EDIT');eb=arm.edit_bones
palm=R.new_bone(eb,'palm',(0,0,0),(0,0,.065),deform=True,roll_z=(0,-1,0))
fingers=[('index',-.034,.076),('middle',-.011,.089),('ring',.013,.083),('little',.036,.066)]
points={}
for name,x,length in fingers:
 a=(x,0,.078);b=(x*1.1,-.004,.078+length*.5);c=(x*1.18,-.009,.074+length);points[name]=(Vector(a),Vector(b),Vector(c))
 one=R.new_bone(eb,name+'.01',a,b,parent=palm,deform=True,roll_z=(0,-1,0));R.new_bone(eb,name+'.02',b,c,parent=one,connect=True,deform=True,roll_z=(0,-1,0))
a=(-.028,0,.030);b=(-.057,-.008,.053);c=(-.072,-.012,.083);points['thumb']=(Vector(a),Vector(b),Vector(c))
one=R.new_bone(eb,'thumb.01',a,b,parent=palm,deform=True,roll_z=(0,-1,0));R.new_bone(eb,'thumb.02',b,c,parent=one,connect=True,deform=True,roll_z=(0,-1,0))
bpy.ops.object.mode_set(mode='OBJECT')
for name in [b.name for b in rig.data.bones]:hand.vertex_groups.new(name=name)
def smooth(t):
 t=max(0,min(1,t));return t*t*(3-2*t)
for v in hand.data.vertices:
 x,y,z=v.co
 name=min(fingers,key=lambda f:abs(x-f[1]*(1+.18*max(0,(z-.074)/f[2]))))[0];a,b,c=points[name]
 root=smooth((z-.070)/.025);dist=smooth((z-(b.z-.013))/.026)
 thumb=smooth((-x-.034)/.027)*(1-smooth((z-.094)/.020))
 ta,tb,tc=points['thumb'];t=(v.co-ta).dot(tc-ta)/(tc-ta).length_squared;td=smooth((t-.35)/.42)
 weights={'palm':(1-root)*(1-thumb),name+'.01':root*(1-dist)*(1-thumb),name+'.02':root*dist*(1-thumb),'thumb.01':thumb*(1-td),'thumb.02':thumb*td}
 weights=dict(sorted(weights.items(),key=lambda p:-p[1])[:4]);total=sum(weights.values())
 for n,w in weights.items():
  if w>1e-7:hand.vertex_groups[n].add([v.index],w/total,'REPLACE')
mod=hand.modifiers.new('Linear game-compatible skin','ARMATURE');mod.object=rig;mod.use_deform_preserve_volume=False
hand.parent=rig
R.smooth_weights(hand,rig,factor=.65,repeat=32,vertex_indices=[v.index for v in hand.data.vertices if .058<v.co.z<.12])
R.clean_weights(hand,rig,limit=.001,max_influences=4)
# Fitted board: all coordinates baked; rigid weight follows the palm.
def material(name,color):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);b=m.node_tree.nodes.get('Principled BSDF');b.inputs['Base Color'].default_value=(*color,1);b.inputs['Roughness'].default_value=.6;return m
navy=material('B5H board',(.025,.045,.085));paper=material('B5H paper',(.82,.76,.62));brass=material('B5H clip',(.43,.28,.09))
props=[]
def box(name,center,scale,mat,bevel=.002):
 bm=bmesh.new();bmesh.ops.create_cube(bm,size=1)
 for v in bm.verts:v.co=Vector(center)+Vector((v.co.x*scale[0],v.co.y*scale[1],v.co.z*scale[2]))
 me=bpy.data.meshes.new(name);bm.to_mesh(me);bm.free();o=bpy.data.objects.new(name,me);col.objects.link(o);me.materials.append(mat)
 b=o.modifiers.new('rounded edges','BEVEL');b.width=bevel;b.segments=3
 g=o.vertex_groups.new(name='palm');g.add(list(range(len(me.vertices))),1,'REPLACE');m=o.modifiers.new('rigid palm attachment','ARMATURE');m.object=rig;o.parent=rig;props.append(o);return o
board=box('B5H clipboard',(0,-.1295,.099),(.17,.197,.008),navy)
box('B5H paper',(0,-.13,.1035),(.145,.175,.001),paper,.0003)
box('B5H clip',(0,-.208,.107),(.045,.016,.006),brass)
thumbtarget=bpy.data.objects.new('B5H thumb grip target',None);col.objects.link(thumbtarget);thumbtarget.location=(-.055,-.032,.084);thumbtarget.empty_display_size=.008;thumbtarget.empty_display_type='SPHERE'
ik=rig.pose.bones['thumb.02'].constraints.new('IK');ik.name='authoring thumb opposition';ik.target=thumbtarget;ik.chain_count=2;ik.use_stretch=False
rig['purpose']='Isolated hand fit probe; no final clip, no runtime export. Thumb IK must be baked for export.'
# Render studio and camera.
scene.world=bpy.data.worlds.new('B5H world');scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.45
for name,loc,power,size in [('key',(-.3,-.4,.6),18,.45),('fill',(.4,.1,.4),9,.4)]:
 d=bpy.data.lights.new('B5H '+name,'AREA');d.energy=power;d.size=size;o=bpy.data.objects.new(d.name,d);scene.collection.objects.link(o);o.location=loc;o.rotation_euler=(Vector((0,-.04,.10))-o.location).to_track_quat('-Z','Y').to_euler()
d=bpy.data.cameras.new('B5H camera');cam=bpy.data.objects.new(d.name,d);scene.collection.objects.link(cam);scene.camera=cam;d.type='ORTHO';d.ortho_scale=.34
scene.render.engine='CYCLES';scene.cycles.samples=20;scene.cycles.use_denoising=True;scene.render.resolution_x=800;scene.render.resolution_y=700;scene.render.resolution_percentage=100;scene.view_settings.view_transform='AgX'
scene.render.image_settings.file_format='PNG'
weights=R.weight_report(hand,rig,expect_inside=False)
report={'bones':len(arm.bones),'weights':weights,'purpose':'isolated left hand test, not runtime qualification','poses':{},'pending':['retopology','right hand rig','arm integration','dynamic prop contact','export','phone profiling']}
poses={'open':(0,0,0),'curl':(25,45,0),'clipboard':(12,65,1)}
for name,(prox,dist,opp) in poses.items():
 for b in rig.pose.bones:b.rotation_mode='XYZ';b.rotation_euler=(0,0,0)
 for finger,_,_ in fingers:
  rig.pose.bones[finger+'.01'].rotation_euler.x=math.radians(prox);rig.pose.bones[finger+'.02'].rotation_euler.x=math.radians(dist)
 ik.influence=opp
 if name=='clipboard':
  import numpy as np
  dg=bpy.context.evaluated_depsgraph_get()
  def posed():
   bpy.context.view_layer.update();ev=hand.evaluated_get(dg);me=ev.to_mesh();co=np.empty(len(me.vertices)*3,dtype=np.float32);me.vertices.foreach_get('co',co);ev.to_mesh_clear();return co.reshape((-1,3))
  fitted={}
  for finger,_,_ in fingers:
   group=hand.vertex_groups[finger+'.02'].index;ids=np.array([v.index for v in hand.data.vertices if any(w.group==group and w.weight>.7 for w in v.groups)],dtype=int)
   lo,hi=0.,45.
   for _ in range(14):
    angle=(lo+hi)/2;rig.pose.bones[finger+'.01'].rotation_euler.x=math.radians(angle);co=posed()[ids];co=co[(co[:,1]<-.036)&(co[:,1]>-.22)]
    gap=float(co[:,2].min()-.104) if len(co) else 1
    if gap>.0003:lo=angle
    else:hi=angle
   angle=(lo+hi)/2;rig.pose.bones[finger+'.01'].rotation_euler.x=math.radians(angle);fitted[finger]=angle
  # Move the thumb contact to the underside rather than into the board.
  group=hand.vertex_groups['thumb.02'].index;ids=np.array([v.index for v in hand.data.vertices if any(w.group==group and w.weight>.7 for w in v.groups)],dtype=int)
  for _ in range(16):
   co=posed()[ids];co=co[(co[:,1]<-.036)&(co[:,1]>-.22)]
   if len(co) and float(co[:,2].max())<=.0945:break
   thumbtarget.location.z-=.0007
  report['fitted_proximal_degrees']=fitted;report['thumb_target']=list(thumbtarget.location)
 for o in props:o.hide_render=name!='clipboard';o.hide_set(name!='clipboard')
 bpy.context.view_layer.update()
 cam.location=(.32,-.45,.34);target=Vector((0,-.07,.09));cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();scene.render.filepath=str(OUT/(name+'.png'));bpy.ops.render.render(write_still=True)
 if name=='clipboard':
  cam.location=(.36,-.05,.14);cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();scene.render.filepath=str(OUT/'clipboard-side.png');bpy.ops.render.render(write_still=True)
 # Probe self-intersections on the posed mesh; report, don't infer from weights.
 audit=A.audit(hand,evaluated=True);report['poses'][name]=audit
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'assets/3d/brandon-v5/brandon-hand-rig.blend'))
(OUT/'rig-report.json').write_text(json.dumps(report,indent=2,default=str));print('RESULT '+json.dumps({'bones':len(arm.bones),'weights':weights,'reports':str(OUT)}))
