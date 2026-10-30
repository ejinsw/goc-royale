import bpy
if bpy.data.objects["B4-Brandon rig"].get("bend_refinement"):
 raise RuntimeError("Joint surface refinement was already applied; edit the source instead.")
from pathlib import Path
saved_action=bpy.data.objects['B4-Brandon rig'].animation_data.action
src=Path('/Users/ejinsw/Documents/GitHub/GOC Royale/assets/3d/brandon-v4/test_bend_candidates.py').read_text();exec(src.split('results={}')[0]);reset();alter(.5,.85)

for side,start in [('L',110),('R',198)]:
 sh=rig.data.bones['upper_arm.'+side].head_local;el=rig.data.bones['forearm.'+side].head_local;wr=rig.data.bones['hand.'+side].head_local
 for ri,t in enumerate([.12,.28,.40,.46,.50,.54,.60,.76,.91,.97,1]):
  c=sh.lerp(el,t*2) if t<=.5 else el.lerp(wr,(t-.5)*2)
  for v in list(j.data.vertices)[start+ri*8:start+(ri+1)*8]:v.co.y=c.y+(v.co.y-c.y)*(.6 if .28<=t<=.76 else .8)
for v in list(p.data.vertices)[51:]:v.co.y=-.0125+(v.co.y+.0125)*.55
rig.animation_data.action=saved_action;scene.frame_set(1)
rig['bend_refinement']='Broader support weights; tapered elbow and knee depth for tested flexion'
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'assets/3d/brandon-v4/brandon-rig.blend'),copy=True)
result={'saved':True,'bones':len(rig.data.bones)}
