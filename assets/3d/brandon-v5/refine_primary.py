"""Face/garment primary-form refinement. Reads the preserved v5 study; no runtime export."""
import bpy, bmesh, math, sys, json
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
import numpy as np
ROOT=Path(__file__).resolve().parents[3]
OUT=ROOT/'outputs/brandon-v5/refinement';OUT.mkdir(parents=True,exist_ok=True)
sys.path.extend(['/Users/ejinsw/.codex/skills/scenario-blender-expert/scripts','/Users/ejinsw/.codex/skills/scenario-blender-sculpting/scripts'])
import bx_sculpt as S, bx_audit as A, bx_review

def smooth(t):
 t=max(0,min(1,t));return t*t*(3-2*t)
def gauss(t):return math.exp(-t*t)
def tree(obj):return BVHTree.FromPolygons([v.co for v in obj.data.vertices],[list(p.vertices) for p in obj.data.polygons])
def front(tree,x,z,fallback=-.15):
 p,*_=tree.ray_cast(Vector((x,-2,z)),Vector((0,1,0)));return p.y if p is not None else fallback

def main():
 bpy.ops.wm.open_mainfile(filepath=str(ROOT/'assets/3d/brandon-v5/brandon-primary.blend'))
 scene=bpy.data.scenes['Brandon v5 — primary forms'];scene.name='Brandon v5 — face and garment refinement';bpy.context.window.scene=scene
 col=bpy.data.collections['B5 • primary geometry'];face=bpy.data.objects['B5-face'];before=tree(face)
 # Design landmarks, meters: H=.60; chin z=1.18, chin front=1.23, gonion=1.28,
 # cheekbone z=1.40, eyes z=1.51. Preserve skull/eyewear placement above the cheeks.
 # Rebuild the lower masses, with a broader chin platform and a deliberate jaw corner.
 rings=[(1.18,.043,.095,.078),(1.20,.092,.149,.105),(1.23,.122,.173,.132),
        (1.27,.175,.167,.152),(1.30,.201,.162,.164),(1.35,.224,.171,.176),
        (1.40,.246,.184,.183),(1.48,.254,.180,.200),(1.58,.249,.180,.205),
        (1.67,.220,.155,.180),(1.74,.155,.115,.120),(1.78,.025,.020,.025)]
 def interp(z,c):
  j=min(len(rings)-2,max(0,int(np.searchsorted([r[0] for r in rings],z)-1)))
  t=(z-rings[j][0])/(rings[j+1][0]-rings[j][0]);a=rings[j][c];b=rings[j+1][c]
  lo=max(j-1,0);hi=min(j+2,len(rings)-1)
  d0=(rings[j+1][c]-rings[lo][c])/(rings[j+1][0]-rings[lo][0])
  d1=(rings[hi][c]-rings[j][c])/(rings[hi][0]-rings[j][0]);dz=rings[j+1][0]-rings[j][0]
  return (2*t**3-3*t*t+1)*a+(t**3-2*t*t+t)*dz*d0+(-2*t**3+3*t*t)*b+(t**3-t*t)*dz*d1
 for v in face.data.vertices:
  z=v.co.z; a=2*math.pi*(v.index%96)/96;c=math.cos(a);w,fd,bd=[interp(z,i) for i in (1,2,3)];x=w*math.sin(a)
  jaw=smooth((z-1.19)/.035)*(1-smooth((z-1.33)/.07));power=.72-.31*jaw
  y=-(fd if c>=0 else bd)*math.copysign(abs(c)**power,c)
  f=max(c,0)**12
  y-=f*(.029*gauss(x/.029)*gauss((z-1.415)/.07)+.035*gauss(x/.040)*gauss((z-1.373)/.024)+.020*gauss(x/.078)*gauss((z-1.316)/.019))
  y+=f*.010*(gauss((x-.108)/.062)+gauss((x+.108)/.062))*gauss((z-1.465)/.05)
  v.co=(x,y,z)
 face.data.update();after=tree(face)
 # Keep existing attached feature studies seated after the underlying surface changes.
 features=[o for o in scene.objects if o.type=='MESH' and o.name.startswith(('B5-eye.','B5-iris.','B5-pupil.','B5-lid.','B5-brow.','B5-mouth aperture','B5-lip.'))]
 for obj in features:
  for v in obj.data.vertices:
   x,y,z=v.co;offset=y-front(before,x,z)
   if obj.name.startswith(('B5-eye.','B5-iris.','B5-pupil.','B5-lid.')):z=1.51+(z-1.51)*.84
   if obj.name.startswith('B5-iris.'):
    center=.119 if x>0 else -.119;x=center+(x-center)*1.24
    h=.033*.84 if z>=1.51 else .027*.84
    k=math.sqrt(((x-center)/.064)**2+((z-1.51)/(h*.98))**2)
    if k>1:x=center+(x-center)/k;z=1.51+(z-1.51)/k
   if obj.name.startswith('B5-pupil.'):
    center=.119 if x>0 else -.119;x=center+(x-center)*1.18
   v.co=(x,front(after,x,z)+offset,z)
  obj.data.update()
 jacket=bpy.data.objects['B5-jacket skin'];jacket.data.update()
 # Broad folds from identifiable constraints, not all-over procedural noise.
 for v in jacket.data.vertices:
  x,y,z=v.co;ax=abs(x);normal=v.normal.copy();amount=0
  torso=(1-smooth((ax-.20)/.07))*smooth((ax-.070)/.035)*smooth((z-.58)/.05)*(1-smooth((z-1.00)/.09))
  for center,width,amp,slope in [(.685,.021,.014,.34),(.755,.022,-.008,.45),(.86,.027,.010,.50)]:
   amount+=torso*amp*gauss((z-(center+slope*(ax-.12)))/width)*smooth((abs(y)-.035)/.05)
  if ax>.25:
   shoulder=Vector((.245,0,1.035));wrist=Vector((.565,-.035,.61));axis=wrist-shoulder
   p=Vector((ax,y,z));t=(p-shoulder).dot(axis)/axis.length_squared;rad=p-(shoulder+axis*t)
   elbow=gauss((t-.54)/.23);frontmask=.25+.75*smooth((-y+.015)/.10)
   # Offset the creases diagonally around the sleeve, fading before the rib cuff.
   q=t+.55*y
   amount+=elbow*frontmask*(.012*gauss((q-.40)/.05)-.009*gauss((q-.48)/.04)+.013*gauss((q-.59)/.055))
   amount*=1-smooth((t-.77)/.08)
  v.co+=normal*amount
 jacket.data.update();jt=tree(jacket)
 def mesh(name,vs,fs,mat):
  me=bpy.data.meshes.new(name);me.from_pydata(vs,[],fs);me.validate();me.update()
  bm=bmesh.new();bm.from_mesh(me);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(me);bm.free();me.shade_smooth()
  obj=bpy.data.objects.new(name,me);col.objects.link(obj);me.materials.append(mat);obj['stage']='garment construction study; unrigged';return obj
 # Replace the six identical sweeps with layered, unequal leaf-shaped locks.
 hairmat=bpy.data.materials['B5-hair']
 for obj in list(scene.objects):
  if obj.name.startswith('B5-hair sweep'):bpy.data.objects.remove(obj,do_unlink=True)
 cap=bpy.data.objects['B5-hair base']
 for v in cap.data.vertices:
  if v.co.z>1.74:v.co.z=1.74+(v.co.z-1.74)*.76
  # Taper the lower nape instead of leaving a horizontal bowl-cut lip.
  if v.co.y>0 and v.co.z<1.53:
   t=1-smooth((v.co.z-1.43)/.10);v.co.y-=.014*t;v.co.z-=.012*t*(.5+.5*math.cos(v.co.x*35))
 def leaf(name,controls,width,depth):
  vs=[];fs=[];N=14;K=40
  for j in range(K+1):
   t=j/K;u=1-t;a,b,c,d=[Vector(v) for v in controls]
   pos=a*u**3+b*3*u*u*t+c*3*u*t*t+d*t**3
   tangent=((b-a)*3*u*u+(c-b)*6*u*t+(d-c)*3*t*t).normalized()
   normal=Vector((pos.x,pos.y,(pos.z-1.54)*.7)).normalized();side=tangent.cross(normal).normalized();normal=side.cross(tangent).normalized()
   radius=.0008+width*math.sin(math.pi*(.06+.94*t))**.7
   for i in range(N):
    angle=2*math.pi*i/N;vs.append(pos+side*radius*math.cos(angle)+normal*depth*(radius/width)*math.sin(angle))
  for j in range(K):
   for i in range(N):a=j*N+i;b=j*N+(i+1)%N;fs.append((a,b,b+N,a+N))
  fs.extend([tuple(reversed(range(N))),tuple(K*N+i for i in range(N))]);mesh('B5-hair lock '+name,vs,fs,hairmat)
 for sign in [-1,1]:
  for k in range(4):
   # Front fringe, temple and side layers have different arcs and endpoints.
   extra=.018 if sign<0 else 0
   controls=[(sign*.025,-.060+k*.053,1.816-k*.009),
    (sign*(.105+k*.019),-.20+k*.075,1.872+extra-k*.015),
    (sign*(.228+k*.010),-.23+k*.085,1.72-k*.021),
    (sign*(.238+k*.014),-.205+k*.10,1.59-k*.024)]
   leaf(str(sign)+' '+str(k),controls,.066-k*.004,.016)
 # Short back layers follow the skull and end in tapered nape points.
 for sign in [-1,1]:
  for k in range(3):
   x=sign*(.035+k*.062)
   leaf('back '+str(sign)+' '+str(k),[(x,.08,1.79),(x*1.4,.20,1.80),(x*1.4,.23,1.57),(x*1.3,.185,1.427-k*.01)],.048,.012)
 cloth=jacket.data.materials[0]
 for suffix,sgn in [('L',1),('R',-1)]:
  old=bpy.data.objects['B5-collar.'+suffix];bpy.data.objects.remove(old,do_unlink=True)
  # Folded collar leaf, curved through its center; top tucked into the neckband.
  vs=[];fs=[];N=16;M=16
  corners=[Vector((.071,-.075,1.134)),Vector((.172,-.080,1.09)),Vector((.080,-.137,1.045)),Vector((.131,-.145,1.020))]
  for j in range(M+1):
   t=j/M
   for i in range(N+1):
    u=i/N;p=(corners[0]*(1-u)+corners[1]*u)*(1-t)+(corners[2]*(1-u)+corners[3]*u)*t
    p.y-=.007*math.sin(math.pi*u)*math.sin(math.pi*t);p.x*=sgn
    # The outer seam stays seated against the shoulder.
    if u>.85:p.y=(p.y*(1-smooth((u-.85)/.15))+(front(jt,p.x,p.z,p.y)-.004)*smooth((u-.85)/.15))
    vs.append(p)
  for j in range(M):
   for i in range(N):a=j*(N+1)+i;fs.append((a,a+1,a+N+2,a+N+1))
  o=mesh('B5-folded collar.'+suffix,vs,fs,cloth);m=o.modifiers.new('fabric thickness','SOLIDIFY');m.thickness=.003;m.offset=-1
 # Neckband connects the leaves around the side and back of the neck.
 vs=[];fs=[]
 for j in range(5):
  t=j/4
  for i in range(65):
   a=-2.39+4.78*i/64;vs.append(((.099+.007*t)*math.sin(a),(.087+.006*t)*math.cos(a),1.10+.040*t-.015*max(-math.cos(a),0)))
 for j in range(4):
  for i in range(64):a=j*65+i;fs.append((a,a+1,a+66,a+65))
 o=mesh('B5-collar neckband',vs,fs,cloth);m=o.modifiers.new('fabric thickness','SOLIDIFY');m.thickness=.003
 # Pocket welts are shaped fabric strips seated on the actual front surface.
 for sign in [-1,1]:
  vs=[];fs=[]
  for j in range(3):
   for i in range(17):
    t=i/16;x=sign*(.118+.072*t);z=.73+.073*t+(j-1)*.006;y=front(jt,x,z)-.0025-.0015*math.sin(math.pi*j/2);vs.append((x,y,z))
  for j in range(2):
   for i in range(16):a=j*17+i;fs.append((a,a+1,a+18,a+17))
  o=mesh('B5-pocket welt '+str(sign),vs,fs,cloth);m=o.modifiers.new('welt thickness','SOLIDIFY');m.thickness=.002;m.offset=-1
 bpy.context.view_layer.update()
 parts=[o for o in scene.objects if o.type=='MESH' and o.name!='B5-floor']
 cam=scene.camera;scene.render.resolution_x=720;scene.render.resolution_y=900;scene.cycles.samples=24
 def view(pos,target,scale):
  cam.data.type='ORTHO';cam.location=pos;cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.ortho_scale=scale
 for name,pos,target,scale in [('threequarter',(3,-6,2.4),(0,0,.94),2.12),('front',(0,-6,1.1),(0,0,.94),2.12),('profile',(6,0,1.1),(0,0,.94),2.12),('face',(1.5,-6,1.8),(0,-.02,1.49),.83),('jacket',(2,-6,2),(0,0,.85),.95)]:
  view(pos,target,scale);scene.render.filepath=str(OUT/(name+'.png'));bpy.ops.render.render(write_still=True)
 view((3,-6,2.4),(0,0,.94),2.12)
 bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'assets/3d/brandon-v5/brandon-refined.blend'))
 gate=A.deliverable(parts,profile='render');(OUT/'delivery-gate.json').write_text(json.dumps(gate,indent=2,default=str))
 probe=face.copy();probe.data=face.data.copy();scene.collection.objects.link(probe)
 for v in probe.data.vertices:v.co.z-=1.18
 form={'head':S.stage_report(face),'lower_face':S.lower_face_report(probe,.6),'profile_rhythm':S.profile_rhythm(face)};bpy.data.objects.remove(probe,do_unlink=True)
 dep=bpy.context.evaluated_depsgraph_get();counts={}
 for o in parts:
  ev=o.evaluated_get(dep);me=ev.to_mesh();me.calc_loop_triangles();counts[o.name]=len(me.loop_triangles);ev.to_mesh_clear()
 report={'stage':'primary face/garment refinement; unrigged source','triangles':sum(counts.values()),'parts':len(parts),'material_count':len({m.name for o in parts for m in o.data.materials}),'per_object_triangles':counts,'form':form,'gate':{'pass':gate['pass'],'errors':gate['errors'],'warnings':gate['warnings']},'pending':['eyelid/oral topology','hair refinement','retopology','full rig','textures','runtime export and acceptance']}
 (OUT/'refinement-report.json').write_text(json.dumps(report,indent=2,default=str))
 bx_review.review(parts,str(OUT/'review'),views=('front','right','threequarter'),modes=('silhouette','matcap'),res=350)
 print('RESULT '+json.dumps({'triangles':report['triangles'],'gate':report['gate'],'lower_face_ball':form['lower_face']['ball']}))
if __name__=='__main__':main()
