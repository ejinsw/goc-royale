import bpy,json
from pathlib import Path
from mathutils import Vector
root=Path('/Users/ejinsw/Documents/GitHub/GOC Royale');out=root/'outputs/brandon-v4'
scene=bpy.data.scenes['Brandon v4 • Limb Rig'];bpy.context.window.scene=scene
scene.cycles.samples=16;scene.render.resolution_x=720;scene.render.resolution_y=900
cam=scene.camera
for name,frame,pos in [('rest',1,(.5,-6,2.0)),('elbows',21,(3,-6,2.2)),('raised-arm',41,(1,-6,2.1)),('step',61,(3,-6,2.3))]:
 scene.frame_set(frame);cam.location=pos;cam.rotation_euler=(Vector((0,0,.95))-cam.location).to_track_quat('-Z','Y').to_euler();scene.render.filepath=str(out/(name+'.png'));bpy.ops.render.render(write_still=True)
print(json.dumps({'renders':str(out)}))
