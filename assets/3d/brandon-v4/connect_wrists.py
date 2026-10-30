import bpy,bmesh,math
from pathlib import Path
from mathutils import Vector
ROOT=Path('/Users/ejinsw/Documents/GitHub/GOC Royale');scene=bpy.data.scenes['Brandon v4 • Limb Rig'];bpy.context.window.scene=scene;scene.frame_set(1)
rig=bpy.data.objects['B4-Brandon rig'];col=bpy.data.collections['Brandon v4 • character']
for suffix in ['L','R']:
 name='B4-wrist skin.'+suffix
 if name in bpy.data.objects:continue
 bone=rig.data.bones['hand.'+suffix];origin=bone.head_local;d=(bone.tail_local-origin).normalized();front=Vector((0,-1,0));across=d.cross(front).normalized();front=across.cross(d).normalized()
 vs=[];fs=[];weights=[];N=16
 for t,r in [(-.045,.040),(-.020,.046),(0,.046),(.025,.044),(.048,.044)]:
  c=origin+d*t
  for i in range(N):
   a=2*math.pi*i/N;vs.append(tuple(c+r*(front*math.cos(a)+across*math.sin(a))));weights.append(max(0,min(1,(t+.015)/.05)))
 for j in range(4):
  for i in range(N):fs.append((j*N+i,j*N+(i+1)%N,(j+1)*N+(i+1)%N,(j+1)*N+i))
 fs.extend([tuple(reversed(range(N))),tuple(4*N+i for i in range(N))])
 me=bpy.data.meshes.new(name);me.from_pydata(vs,[],fs);me.update();bm=bmesh.new();bm.from_mesh(me);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(me);bm.free();me.shade_smooth()
 ob=bpy.data.objects.new(name,me);col.objects.link(ob);ob.parent=rig;me.materials.append(bpy.data.materials['B4-skin']);g1=ob.vertex_groups.new(name='forearm.'+suffix);g2=ob.vertex_groups.new(name='hand.'+suffix)
 for i,w in enumerate(weights):
  if w<1:g1.add([i],1-w,'REPLACE')
  if w>0:g2.add([i],w,'REPLACE')
 mod=ob.modifiers.new('Game skin','ARMATURE');mod.object=rig
 mod=ob.modifiers.new('Wrist smoothing','SUBSURF');mod.levels=mod.render_levels=1
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'assets/3d/brandon-v4/brandon-rig.blend'),copy=True)
result={'wrists_connected':True,'saved':True}
