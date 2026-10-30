"""Create a disposable export scene, bake surfaces at rest and verify a GLB round-trip.
Authoring geometry stays editable in the source scene. Run in background from saved rig.
"""
import bpy,bmesh,sys,json
from pathlib import Path
ROOT=Path('/Users/ejinsw/Documents/GitHub/GOC Royale');OUT=ROOT/'outputs/brandon-v4'
sys.path.extend(['/Users/ejinsw/.codex/skills/scenario-blender-export/scripts','/Users/ejinsw/.codex/skills/scenario-blender-expert/scripts'])
import bx_export as E,bx_audit as A
source=bpy.data.scenes['Brandon v4 • Limb Rig'];bpy.context.window.scene=source;source.frame_set(1)
scene=bpy.data.scenes.new('Brandon v4 • Browser export');bpy.context.window.scene=scene;scene.render.fps=30;scene.frame_start=1;scene.frame_end=121
oldrig=bpy.data.objects['B4-Brandon rig'];rig=oldrig.copy();rig.data=oldrig.data.copy();rig.name='Brandon';scene.collection.objects.link(rig)
for pb in rig.pose.bones:
 for c in pb.constraints:
  if getattr(c,'target',None)==oldrig:c.target=rig
parts=[rig]
def rebuild(ob,vs,fs):
 old=ob.data;me=bpy.data.meshes.new(ob.name+' surface');me.from_pydata(vs,[],fs);me.update()
 for m in old.materials:me.materials.append(m)
 bm=bmesh.new();bm.from_mesh(me);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(me);bm.free();me.shade_smooth();ob.data=me
 ob.vertex_groups.clear();g=ob.vertex_groups.new(name='head');g.add(list(range(len(vs))),1,'REPLACE')
def grid_reduce(ob,cols,rows):
 # Keep every second authored loop, preserving quads and the silhouette sampling.
 indices=[[r*cols+c for c in range(0,cols,2)] for r in range(0,rows,2)]
 n=len(indices[0]);vs=[tuple(ob.data.vertices[i].co) for row in indices for i in row];fs=[]
 for j in range(len(indices)-1):
  for i in range(n):fs.append((j*n+i,j*n+(i+1)%n,(j+1)*n+(i+1)%n,(j+1)*n+i))
 # Hair has an open lower edge which the solidify modifier rims.
 if 'hair' not in ob.name:fs.append(tuple(reversed(range(n))))
 fs.append(tuple((len(indices)-1)*n+i for i in range(n)));rebuild(ob,vs,fs)
def patch_reduce(ob):
 n=32;R=5;vs=[tuple(ob.data.vertices[0].co)]
 for r in range(2,11,2):
  for c in range(0,64,2):vs.append(tuple(ob.data.vertices[1+(r-1)*64+c].co))
 fs=[(0,1+i,1+(i+1)%n) for i in range(n)]
 for j in range(R-1):
  for i in range(n):a=1+j*n+i;b=1+j*n+(i+1)%n;fs.append((a,b,b+n,a+n))
 rebuild(ob,vs,fs)
for old in bpy.data.collections['Brandon v4 • character'].objects:
 if old.type!='MESH':continue
 ob=old.copy();ob.data=old.data.copy();ob.name=old.name.replace('B4-','')+' runtime';scene.collection.objects.link(ob);ob.parent=rig;parts.append(ob)
 for mod in ob.modifiers:
  if mod.type=='ARMATURE':mod.object=rig
 if old.name=='B4-face':grid_reduce(ob,80,101)
 elif old.name=='B4-molded hair':grid_reduce(ob,128,51)
 elif old.name.startswith(('B4-eye ','B4-pupil ')):patch_reduce(ob)
 elif old.name.startswith('B4-sneaker'):
  for mod in ob.modifiers:
   if mod.type=='SUBSURF':mod.levels=mod.render_levels=1
 # Bake subdivision/bevel/solidify on the neutral pose, retaining actual skin weights.
 bpy.context.view_layer.objects.active=ob;ob.select_set(True)
 arm=next(m for m in ob.modifiers if m.type=='ARMATURE');arm.show_viewport=False
 for mod in list(ob.modifiers):
  if mod.type!='ARMATURE':bpy.ops.object.modifier_apply(modifier=mod.name)
 arm.show_viewport=True;ob.select_set(False)
scene.frame_set(1);bpy.context.view_layer.update()
# No facial textures yet: flat-color materials, UV absence is an explicit warning.
gate=A.deliverable([o for o in parts if o.type=='MESH'],profile='game')
(OUT/'runtime-delivery-gate.json').write_text(json.dumps(gate,indent=2))
opts=dict(use_active_scene=True,export_animations=True,export_animation_mode='ACTIONS',export_anim_single_armature=True,export_force_sampling=True,export_skins=True,export_all_influences=False,export_def_bones=False,export_leaf_bone=False,export_armature_object_remove=False)
path=str(ROOT/'client/public/art3d/brandon-v4/brandon-rig.glb')
export=E.export(path,'gltf',objects=parts,**opts);summary=E.glb_summary(path)
(OUT/'export.json').write_text(json.dumps({'export':export,'summary':summary},indent=2))
rt=E.round_trip(path,parts,preset='gltf',**opts);(OUT/'roundtrip.json').write_text(json.dumps(rt,indent=2))
# Save only the export scene as an optional inspection artifact, preserving source file.
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'assets/3d/brandon-v4/brandon-runtime.blend'),copy=True)
print(json.dumps({'summary':summary,'gate_errors':gate['errors'],'roundtrip_pass':rt['pass'],'roundtrip_diffs':rt['diffs']}),flush=True)
