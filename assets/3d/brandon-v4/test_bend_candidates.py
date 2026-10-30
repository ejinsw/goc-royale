import bpy,sys,json,math
from pathlib import Path
ROOT=Path('/Users/ejinsw/Documents/GitHub/GOC Royale');OUT=ROOT/'outputs/brandon-v4'
sys.path.append('/Users/ejinsw/.codex/skills/scenario-blender-rigging/scripts')
import bx_rig as R
scene=bpy.data.scenes['Brandon v4 • Limb Rig'];bpy.context.window.scene=scene
rig=bpy.data.objects['B4-Brandon rig'];rig.animation_data.action=None
j=bpy.data.objects['B4-jacket skin'];p=bpy.data.objects['B4-trousers skin']
base={o.name:([v.co.copy() for v in o.data.vertices],[{o.vertex_groups[g.group].name:g.weight for g in v.groups} for v in o.data.vertices]) for o in [j,p]}
R.JOINTS={'elbow.L':('upper_arm.L:head','forearm.L:head','forearm.L:tail'),'knee.L':('thigh.L:head','shin.L:head','shin.L:tail')}
posesj=[{'name':'elbow'+str(a),'joints':['elbow.L'],'ops':[('hinge','forearm.L',a,(0,-1,0))]} for a in [90,110]]
posesp=[{'name':'knee'+str(a),'joints':['knee.L'],'ops':[('hinge','shin.L',a,(0,1,0))]} for a in [75,95]]
def reset():
 R.reset_pose(rig)
 for ob in [j,p]:
  vs,ws=base[ob.name];ob.vertex_groups.clear()
  for v,co,wt in zip(ob.data.vertices,vs,ws):
   v.co=co
   for name,w in wt.items():
    if w<=1e-6:continue
    vg=ob.vertex_groups.get(name) or ob.vertex_groups.new(name=name);vg.add([v.index],w,'REPLACE')
  ob.data.update()
def weights(ob,idx,names,f):
 f=max(0,min(1,f));f=f*f*(3-2*f)
 for g in ob.vertex_groups:g.remove([idx])
 for name,w in zip(names,[max(0,1-2*f),1-abs(2*f-1),max(0,2*f-1)]):
  if w>1e-6:(ob.vertex_groups.get(name) or ob.vertex_groups.new(name=name)).add([idx],w,'REPLACE')
def alter(width,slim):
 for side,suffix,start in [(1,'L',110),(-1,'R',198)]:
  ts=[.12,.28,.40,.46,.50,.54,.60,.76,.91,.97,1]
  sh=rig.data.bones['upper_arm.'+suffix].head_local;el=rig.data.bones['forearm.'+suffix].head_local;wr=rig.data.bones['hand.'+suffix].head_local
  for ring,t in enumerate(ts):
   c=sh.lerp(el,t*2) if t<=.5 else el.lerp(wr,(t-.5)*2)
   for idx in range(start+ring*8,start+(ring+1)*8):
    if t>.22:weights(j,idx,['upper_arm.'+suffix,'elbow_bend.'+suffix,'forearm.'+suffix],(t-(.5-width/2))/width)
    fac=1-(1-slim)*max(0,1-abs(t-.5)/.25);j.data.vertices[idx].co=c+(j.data.vertices[idx].co-c)*fac
 for suffix,start in [('L',51),('R',171)]:
  for idx in range(start,start+120):
   v=p.data.vertices[idx];z=v.co.z*2
   if z<=.71:weights(p,idx,['thigh.'+suffix,'knee_bend.'+suffix,'shin.'+suffix],(.78-z)/.36)
   fac=1-(1-slim)*max(0,1-abs(z-.60)/.20);cx=.12 if suffix=='L' else -.12
   v.co.x=cx+(v.co.x-cx)*fac;v.co.y=-.0125+(v.co.y+.0125)*fac
 for ob in [j,p]:ob.data.update()
results={}
for label,width,slim in [('support_baseline',0,1),('wide',.5,1),('wide_slim',.5,.85),('medium_slim',.4,.9)]:
 reset()
 if width:alter(width,slim)
 result={}
 for ob,poses in [(j,posesj),(p,posesp)]:
  r=R.deformation_report(rig,[ob],poses,self_intersections=True);result[ob.name]={'results':r,'flags':R.flag_report(r)}
 results[label]=result;print(label,json.dumps(result),flush=True)
(OUT/'bend-candidates.json').write_text(json.dumps(results,indent=2))
