import bpy,json,sys
from pathlib import Path
from mathutils import Vector
ROOT=Path('/Users/ejinsw/Documents/GitHub/GOC Royale')
scene=bpy.data.scenes['Brandon v2 • Shape Study']
bpy.context.window.scene=scene
cam=scene.camera
out=ROOT/'outputs/brandon-v2';out.mkdir(exist_ok=True)
views={'three-quarter':(3,-8,3.0),'front':(0,-8,2.45),'profile':(8,-.25,2.45)}
args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
for name,pos in views.items():
 if args and name not in args: continue
 cam.location=pos;cam.rotation_euler=(Vector((0,0,1.55))-cam.location).to_track_quat('-Z','Y').to_euler()
 scene.render.filepath=str(out/(name+'.png'))
 bpy.ops.render.render(write_still=True,scene=scene.name)
print(json.dumps({'renders':str(out)}))
