"""Audit this work-in-progress study without treating it as a game asset."""
import bpy,sys,json
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[3];OUT=ROOT/'outputs/brandon-v5'
sys.path.extend(['/Users/ejinsw/.codex/skills/scenario-blender-expert/scripts','/Users/ejinsw/.codex/skills/scenario-blender-sculpting/scripts'])
import bx_audit as A,bx_sculpt as S
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'assets/3d/brandon-v5/brandon-primary.blend'))
scene=bpy.data.scenes['Brandon v5 — primary forms'];bpy.context.window.scene=scene
parts=[o for o in scene.objects if o.type=='MESH' and o.name!='B5-floor']
rep=A.deliverable(parts,profile='render');(OUT/'delivery-gate.json').write_text(json.dumps(rep,indent=2,default=str))
face=bpy.data.objects['B5-face'];form={'head':S.stage_report(face),'profile_rhythm':S.profile_rhythm(face)}
# The lower-face helper assumes chin at local z=0; normalize an isolated audit copy.
probe=face.copy();probe.data=face.data.copy();scene.collection.objects.link(probe)
for v in probe.data.vertices:v.co.z-=1.18
form['lower_face']=S.lower_face_report(probe,.6)
bpy.data.objects.remove(probe,do_unlink=True)
(OUT/'form-check.json').write_text(json.dumps(form,indent=2,default=str))
cam=scene.camera;cam.data.type='PERSP';cam.data.lens=90;scene.render.resolution_x=720;scene.render.resolution_y=900
for name,pos,target in [('face-long-lens',(1.15,-2.8,1.9),(0,0,1.49)),('face-below',(.5,-2.8,1.0),(0,0,1.49)),('overhead',(2.1,-3.2,4.4),(0,0,1.0))]:
 cam.location=pos;cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler();scene.render.filepath=str(OUT/(name+'.png'));bpy.ops.render.render(write_still=True)
print('RESULT '+json.dumps({'pass':rep['pass'],'errors':rep['errors'],'warnings':rep['warnings'],'form':form},default=str))
