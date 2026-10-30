"""Small exported bend bones avoid collapsing a 90-degree blend into a flat seam."""
import bpy,sys,json
from pathlib import Path
ROOT=Path('/Users/ejinsw/Documents/GitHub/GOC Royale');scene=bpy.data.scenes['Brandon v4 • Limb Rig'];bpy.context.window.scene=scene;scene.frame_set(1)
rig=bpy.data.objects['B4-Brandon rig'];a=rig.animation_data.action;rig.animation_data.action=None
for pb in rig.pose.bones:pb.rotation_euler=(0,0,0)
for o in bpy.context.selected_objects:o.select_set(False)
rig.select_set(True);bpy.context.view_layer.objects.active=rig;bpy.ops.object.mode_set(mode='EDIT')
eb=rig.data.edit_bones
for suffix in ['L','R']:
 for name,child,parent in [('elbow_bend','forearm','upper_arm'),('knee_bend','shin','thigh')]:
  name+='.'+suffix;child+='.'+suffix;parent+='.'+suffix
  if name in eb:continue
  src=eb[child];b=eb.new(name);b.head=src.head;b.tail=src.head+(src.tail-src.head)*.35;b.roll=src.roll;b.parent=eb[parent];b.use_deform=True
bpy.ops.object.mode_set(mode='OBJECT')
for suffix in ['L','R']:
 for name,child in [('elbow_bend','forearm'),('knee_bend','shin')]:
  pb=rig.pose.bones[name+'.'+suffix];c=pb.constraints.get('Half bend') or pb.constraints.new('COPY_ROTATION');c.name='Half bend';c.target=rig;c.subtarget=child+'.'+suffix;c.target_space='LOCAL';c.owner_space='LOCAL';c.influence=.5
for label,prefix,distal in [('jacket skin','elbow_bend','forearm'),('trousers skin','knee_bend','shin')]:
 ob=bpy.data.objects['B4-'+label]
 if ob.get('bend_weighted'):continue
 for side in ['L','R']:
  middle=ob.vertex_groups.new(name=prefix+'.'+side)
  child=ob.vertex_groups[distal+'.'+side];parent=ob.vertex_groups[('upper_arm' if distal=='forearm' else 'thigh')+'.'+side]
  for v in ob.data.vertices:
   w={g.group:g.weight for g in v.groups};f=w.get(child.index,0);u=w.get(parent.index,0)
   if f>1e-6 and u>1e-6:
    m=2*min(f,u);middle.add([v.index],m,'REPLACE');parent.add([v.index],max(0,u-f),'REPLACE');child.add([v.index],max(0,f-u),'REPLACE')
 ob['bend_weighted']=True
rig.animation_data.action=a;scene.frame_set(1)
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'assets/3d/brandon-v4/brandon-rig.blend'),copy=True)
result={'bend_bones':4,'total_bones':len(rig.data.bones),'saved':True}
