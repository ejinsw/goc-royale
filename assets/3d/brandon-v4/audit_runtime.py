"""Check the actual baked browser mesh in authored poses, including bind weights."""
import bpy,sys,json,math
from pathlib import Path
ROOT=Path('/Users/ejinsw/Documents/GitHub/GOC Royale');OUT=ROOT/'outputs/brandon-v4'
sys.path.extend(['/Users/ejinsw/.codex/skills/scenario-blender-rigging/scripts','/Users/ejinsw/.codex/skills/scenario-blender-expert/scripts'])
import bx_rig as R,bx_audit as A
scene=bpy.data.scenes['Brandon v4 • Browser export'];bpy.context.window.scene=scene
rig=bpy.data.objects['Brandon'];parts=[o for o in scene.objects if o.type=='MESH'];action=rig.animation_data.action
weights={o.name:R.weight_report(o,rig,expect_inside=False) for o in parts}
rep={'weight_flags':{n:r for n,r in weights.items() if r['unweighted'] or r['sum_dev'] or r['over4'] or r['non_deform_groups']},'weights':weights,'clip_frames':{},'limitations':['Intersection checks are within each mesh; cross-mesh contacts are reviewed visually.','Foot planting, finger animation and facial animation are not implemented.']}
for frame in [1,21,41,61,81,101]:
 scene.frame_set(frame);vals={}
 for name in ['jacket skin runtime','trousers skin runtime','wrist skin.L runtime','wrist skin.R runtime']:
  ob=bpy.data.objects[name];bm=A._bm_from(ob,evaluated=True);vals[name]=A._self_intersections(bm);bm.free()
 rep['clip_frames'][str(frame)]=vals
# Conservative range tests against the final baked surface, both sides.
rig.animation_data.action=None;R.reset_pose(rig)
R.JOINTS={}
for s in ['L','R']:
 R.JOINTS['elbow.'+s]=('upper_arm.'+s+':head','forearm.'+s+':head','forearm.'+s+':tail')
 R.JOINTS['knee.'+s]=('thigh.'+s+':head','shin.'+s+':head','shin.'+s+':tail')
rep['stress']={}
for mesh,child,toward,angles,joint in [('jacket skin runtime','forearm',(0,-1,0),[90,110],'elbow'),('trousers skin runtime','shin',(0,1,0),[75,95],'knee')]:
 poses=[{'name':joint+str(a)+'.'+s,'side':s,'joints':[joint+'.'+s],'ops':[('hinge',child+'.'+s,a,toward)]} for s in ['L','R'] for a in angles]
 dr=R.deformation_report(rig,[bpy.data.objects[mesh]],poses,self_intersections=True);rep['stress'][mesh]={'results':dr,'flags':R.flag_report(dr)}
R.reset_pose(rig);rig.animation_data.action=action;scene.frame_set(1)
# Updated still images of the exported surface; studio setup copied for review.
source=bpy.data.scenes['Brandon v4 • Limb Rig']
for ob in source.objects:
 if ob.type in ['CAMERA','LIGHT'] or ob.name=='B4-floor':scene.collection.objects.link(ob)
scene.camera=source.camera;scene.world=source.world;scene.render.engine='CYCLES';scene.cycles.samples=16;scene.cycles.use_denoising=True;scene.render.resolution_x=720;scene.render.resolution_y=900;scene.render.resolution_percentage=100;scene.view_settings.view_transform='AgX'
from mathutils import Vector
for name,frame,pos in [('rest',1,(.5,-6,2.0)),('elbows',21,(3,-6,2.2)),('raised-arm',41,(1,-6,2.1)),('step',61,(3,-6,2.3))]:
 scene.frame_set(frame);cam=scene.camera;cam.location=pos;cam.rotation_euler=(Vector((0,0,.95))-cam.location).to_track_quat('-Z','Y').to_euler();scene.render.filepath=str(OUT/(name+'.png'));bpy.ops.render.render(write_still=True)
(OUT/'runtime-deformation.json').write_text(json.dumps(rep,indent=2))
print(json.dumps({'weight_flags':list(rep['weight_flags']),'clip_frames':rep['clip_frames'],'stress_flags':{n:x['flags'] for n,x in rep['stress'].items()}}),flush=True)
