import bpy,json,sys
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
ROOT=Path(__file__).resolve().parents[3];OUT=ROOT/'outputs/brandon-v5/hand-rig'
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'assets/3d/brandon-v5/brandon-hand-rig.blend'))
scene=bpy.data.scenes['Brandon v5 — hand rig experiment'];bpy.context.window.scene=scene
hand=bpy.data.objects['B5H-left hand'];board=bpy.data.objects['B5H clipboard'];bpy.context.view_layer.update();dg=bpy.context.evaluated_depsgraph_get()
ev=hand.evaluated_get(dg);me=ev.to_mesh();bv=board.evaluated_get(dg);bm=bv.to_mesh();tree=BVHTree.FromPolygons([v.co for v in bm.vertices],[list(p.vertices) for p in bm.polygons])
hand_tree=BVHTree.FromPolygons([hand.matrix_world @ v.co for v in me.vertices],[list(p.vertices) for p in me.polygons])
cross_mesh={}
for prop_name in ['B5H clipboard','B5H paper','B5H clip']:
 obj=bpy.data.objects[prop_name];evaluated=obj.evaluated_get(dg);mesh=evaluated.to_mesh()
 prop_tree=BVHTree.FromPolygons([obj.matrix_world @ v.co for v in mesh.vertices],[list(p.vertices) for p in mesh.polygons])
 cross_mesh[prop_name]=len(hand_tree.overlap(prop_tree));evaluated.to_mesh_clear()
contacts={}
for name in ['index','middle','ring','little','thumb']:
 g=hand.vertex_groups[name+'.02'].index;ids=[v.index for v in hand.data.vertices if any(w.group==g and w.weight>.7 for w in v.groups)]
 ds=[tree.find_nearest(me.vertices[i].co)[3] for i in ids]
 contacts[name]={'sample_vertices':len(ids),'nearest_board_distance':min(ds) if ds else None}
inside=[v.index for v in me.vertices if abs(v.co.x)<.080 and -.223<v.co.y<-.036 and .0955<v.co.z<.1025]
rep={'units':'meters, isolated study scale','distal_contact_samples':contacts,'vertices_inside_unbeveled_board_interior':len(inside),'hand_prop_surface_overlap_pairs':cross_mesh,'note':'A minimum surface distance is not a pressure/contact-area or motion-stability test. Interior test excludes 5 mm edge bands; visual review still required.'}
(OUT/'contact-report.json').write_text(json.dumps(rep,indent=2));ev.to_mesh_clear();bv.to_mesh_clear()
cam=scene.camera;cam.location=(-.32,-.25,-.12);cam.rotation_euler=(Vector((0,-.06,.09))-cam.location).to_track_quat('-Z','Y').to_euler();scene.render.filepath=str(OUT/'clipboard-underside.png');bpy.ops.render.render(write_still=True)
print('RESULT '+json.dumps(rep))
