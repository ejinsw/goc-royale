import bpy,math,bmesh,sys,json
from pathlib import Path
from mathutils import Vector
ROOT=Path('/Users/ejinsw/Documents/GitHub/GOC Royale')
scene=bpy.data.scenes['Brandon v4 • Limb Rig'];bpy.context.window.scene=scene;scene.frame_set(1)
rig=bpy.data.objects['B4-Brandon rig'];col=bpy.data.collections['Brandon v4 • character']
# Correct FK shoulder directions. Local +Z lifts the left arm; -Z lifts the right.
fixes={41:{'clavicle.L':(0,0,12),'upper_arm.L':(0,0,55)},101:{'upper_arm.L':(0,0,35),'upper_arm.R':(0,0,-35)}}
for frame,pose in fixes.items():
 for name,angles in pose.items():
  pb=rig.pose.bones[name];pb.rotation_euler=[math.radians(a) for a in angles];pb.keyframe_insert('rotation_euler',frame=frame,group=name)
scene.frame_set(1)
# Shape small folded collar flaps with rounded bevels and weight them to the chest.
for side,suffix in [(1,'L'),(-1,'R')]:
 name='B4-collar.'+suffix
 if name in bpy.data.objects:continue
 outline=[(side*.085,-.086,1.137),(side*.145,-.13,1.096),(side*.112,-.151,1.006),(side*.067,-.146,1.043)]
 vs=[(x,y-.008,z) for x,y,z in outline]+[(x,y+.008,z) for x,y,z in outline]
 fs=[(0,1,2,3),(7,6,5,4)]+[(i,(i+1)%4,(i+1)%4+4,i+4) for i in range(4)]
 me=bpy.data.meshes.new(name);me.from_pydata(vs,[],fs);me.update();bm=bmesh.new();bm.from_mesh(me);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(me);bm.free();me.shade_smooth()
 ob=bpy.data.objects.new(name,me);col.objects.link(ob);me.materials.append(bpy.data.materials['B4-rib knit']);ob.parent=rig;vg=ob.vertex_groups.new(name='chest');vg.add(list(range(len(vs))),1,'REPLACE')
 mod=ob.modifiers.new('Game skin','ARMATURE');mod.object=rig
 mod=ob.modifiers.new('Soft collar edge','BEVEL');mod.width=.006;mod.segments=3
# A short idle loop uses bones only and keeps the feet and gameplay root stationary.
a=rig.animation_data.action
if not bpy.data.actions.get('idle'):
 rig.animation_data.action=None
 for pb in rig.pose.bones:pb.rotation_euler=(0,0,0)
 for frame in [1,31,61]:
  factor=1 if frame==31 else 0
  for pb in rig.pose.bones:
   values={'chest':(0,0,.6*factor),'head':(0,0,-.6*factor),'upper_arm.L':(0,0,1.5*factor),'upper_arm.R':(0,0,-1.5*factor)}.get(pb.name,(0,0,0))
   pb.rotation_euler=[math.radians(v) for v in values];pb.keyframe_insert('rotation_euler',frame=frame,group=pb.name)
 rig.animation_data.action.name='idle';rig.animation_data.action.use_fake_user=True
rig.animation_data.action=a;scene.frame_set(1)
# Post-skin subdivision isn't supported as runtime subdivision in glTF. Exporter
# evaluates it into a weighted render mesh; round-trip and browser check follow.
sys.path.append('/Users/ejinsw/.codex/skills/scenario-blender-export/scripts')
import bx_export as E
parts=[rig]+[o for o in col.objects if o.type=='MESH']
opts=dict(use_active_scene=True,export_animations=True,export_animation_mode='ACTIONS',export_anim_single_armature=True,export_force_sampling=True,export_skins=True,export_all_influences=False,export_def_bones=False,export_leaf_bone=False,export_armature_object_remove=False)
out=ROOT/'client/public/art3d/brandon-v4/brandon-rig.glb'
rep=E.export(str(out),'gltf',objects=parts,**opts)
summary=E.glb_summary(str(out));(ROOT/'outputs/brandon-v4/export.json').write_text(json.dumps({'export':rep,'summary':summary},indent=2))
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'assets/3d/brandon-v4/brandon-rig.blend'),copy=True)
result={'export':summary,'saved':True}
