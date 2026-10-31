"""Reproducible v5 primary-form study; preserves v4; not a runtime asset or rig."""
import bpy,bmesh,math,sys,json
from pathlib import Path
from mathutils import Vector, Matrix
from math import sin,cos,pi,exp,sqrt
ROOT=Path(__file__).resolve().parents[3]; OUT=ROOT/'outputs/brandon-v5'; OUT.mkdir(exist_ok=True)
sys.path.extend(['/Users/ejinsw/.codex/skills/scenario-blender-sculpting/scripts','/Users/ejinsw/.codex/skills/scenario-blender-expert/scripts'])
import bx_sculpt as S

def main():
 source=ROOT/'assets/3d/brandon-v4/brandon-rig.blend'
 # Load the saved study into this isolated background process only.
 bpy.ops.wm.open_mainfile(filepath=str(source))
 scene=bpy.data.scenes.new('Brandon v5 — primary forms');bpy.context.window.scene=scene
 col=bpy.data.collections.new('B5 • primary geometry');scene.collection.children.link(col)
 parts=[]
 def mat(name,h,rough=.65):
  m=bpy.data.materials.new('B5-'+name);rgb=[int(h[i:i+2],16)/255 for i in (0,2,4)];rgb=[v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in rgb]
  m.diffuse_color=(*rgb,1);bs=m.node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=(*rgb,1);bs.inputs['Roughness'].default_value=rough;bs.inputs['Specular IOR Level'].default_value=.25
  return m
 skin=mat('skin','E8AC7D',.62);lip=mat('lip','BA7258');ink=mat('ink','24252C');hairmat=mat('hair','302B2C',.62);white=mat('eyes','FFF0DC');iris=mat('iris','67432E');dark=mat('mouth','653A31');beige=mat('jacket','D4B78F');cream=mat('tee','F5EDDA');gold=mat('zipper','B99657',.4)
 def mesh(name,vs,fs,m,sub=0):
  me=bpy.data.meshes.new('B5-'+name);me.from_pydata(vs,[],fs);me.validate();me.update()
  bm=bmesh.new();bm.from_mesh(me);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(me);bm.free();me.shade_smooth()
  o=bpy.data.objects.new('B5-'+name,me);col.objects.link(o);parts.append(o);o['stage']='primary form; not rigged';me.materials.append(m)
  if sub:md=o.modifiers.new('surface','SUBSURF');md.levels=sub
  return o
 def tube(name,points,radii,m,n=12,flatten=1):
  vs=[];fs=[]
  for j,p in enumerate(points):
   p=Vector(p);t=(Vector(points[min(j+1,len(points)-1)])-Vector(points[max(j-1,0)])).normalized();a=t.cross(Vector((0,1,0))).normalized()
   if a.length<.01:a=t.cross(Vector((1,0,0))).normalized()
   b=t.cross(a).normalized()
   for i in range(n):vs.append(tuple(p+radii[j]*(cos(i*2*pi/n)*a+flatten*sin(i*2*pi/n)*b)))
  for j in range(len(points)-1):
   for i in range(n):a=j*n+i;b=j*n+(i+1)%n;fs.append((a,b,b+n,a+n))
  fs.extend([tuple(reversed(range(n))),tuple((len(points)-1)*n+i for i in range(n))]);return mesh(name,vs,fs,m)
 # Copy evaluated neutral body surfaces. No inherited animation is implied.
 oldscene=bpy.data.scenes['Brandon v4 • Limb Rig'];oldscene.frame_set(1)
 for label in ['jacket skin','trousers skin','sneaker.L','sneaker.R','neck skin','ear -1','ear 1','glasses rim -1','glasses rim 1','glasses temple -1','glasses temple 1','glasses bridge','collar.L','collar.R']:
  bpy.context.window.scene=oldscene
  old=bpy.data.objects['B4-'+label];dep=bpy.context.evaluated_depsgraph_get()
  me=bpy.data.meshes.new_from_object(old.evaluated_get(dep),depsgraph=dep);bpy.context.window.scene=scene;o=bpy.data.objects.new('B5-'+label,me);col.objects.link(o);parts.append(o);o['stage']='neutral body carryover; re-rig required'
  # Preserve only owned material copies.
  for i,m in enumerate(me.materials):
   cp=m.copy();cp.name='B5-'+m.name;bs=cp.node_tree.nodes.get('Principled BSDF');bs.inputs['Roughness'].default_value=.7;bs.inputs['Coat Weight'].default_value=0;bs.inputs['Specular IOR Level'].default_value=.22;me.materials[i]=cp
  if label.startswith('collar'):
   for v in me.vertices:v.co.y+=.012
  if label=='jacket skin':
   # Broad relaxed fabric gathering; authoring study, not an animated corrective.
   for v in me.vertices:
    x,y,z=v.co
    if z<.82 and abs(x)<.25:
     w=.004*sin(49*x+8*z)*exp(-((z-.62)/.1)**2)
     v.co.y+=w*(1 if y>0 else -1)
  if label.startswith('sneaker'):
   for v in me.vertices:v.co.x=(v.co.x-(.12 if '.L' in label else -.12))*1.17+(.12 if '.L' in label else -.12);v.co.y*=1.13
 # Separate inset shirt from the jacket's front panel, with actual opening thickness.
 jacket=bpy.data.objects['B5-jacket skin'];jm=jacket.data
 shirt_faces=[list(p.vertices) for p in jm.polygons if p.material_index==2]
 if shirt_faces:
  used=sorted({v for f in shirt_faces for v in f});remap={v:i for i,v in enumerate(used)}
  sv=[tuple(jm.vertices[v].co+Vector((0,.010,0))) for v in used]
  shirt=mesh('shirt inset',sv,[tuple(remap[v] for v in f) for f in shirt_faces],cream)
  bm=bmesh.new();bm.from_mesh(jm);bmesh.ops.delete(bm,geom=[f for f in bm.faces if f.material_index==2],context='FACES');bm.to_mesh(jm);bm.free()
  shell=jacket.modifiers.new('jacket edge thickness','SOLIDIFY');shell.thickness=.004;shell.offset=-1
 # Head: a new continuous surface with tapered jaw, cheek planes and integrated nose.
 rings=[(1.18,.045,.07,.08),(1.20,.11,.12,.10),(1.25,.172,.164,.13),(1.31,.215,.177,.16),(1.39,.244,.183,.18),(1.48,.254,.18,.20),(1.58,.249,.18,.205),(1.67,.220,.155,.18),(1.74,.155,.115,.12),(1.78,.025,.02,.025)]
 vs=[];fs=[];N=96;K=110
 import numpy as np
 def smooth_ring(z,c):
  j=min(len(rings)-2,max(0,int(np.searchsorted([r[0] for r in rings],z)-1)))
  t=(z-rings[j][0])/(rings[j+1][0]-rings[j][0]);a=rings[j][c];b=rings[j+1][c]
  d0=(rings[min(j+1,len(rings)-1)][c]-rings[max(j-1,0)][c])/(rings[min(j+1,len(rings)-1)][0]-rings[max(j-1,0)][0])
  d1=(rings[min(j+2,len(rings)-1)][c]-rings[j][c])/(rings[min(j+2,len(rings)-1)][0]-rings[j][0]);dz=rings[j+1][0]-rings[j][0]
  return (2*t**3-3*t*t+1)*a+(t**3-2*t*t+t)*dz*d0+(-2*t**3+3*t*t)*b+(t**3-t*t)*dz*d1
 for j in range(K+1):
  z=1.18+.60*j/K;w,fd,bd=[smooth_ring(z,c) for c in [1,2,3]]
  for i in range(N):
   a=2*pi*i/N;c=cos(a);x=w*sin(a);y=-(fd if c>=0 else bd)*math.copysign(abs(c)**.72,c)
   front=max(c,0)**12
   # Connected bridge/tip, subtle philtrum and upper-lip volume.
   y-=front*(.029*exp(-(x/.029)**2-((z-1.415)/.07)**2)+.035*exp(-(x/.040)**2-((z-1.373)/.024)**2)+.009*exp(-(x/.07)**2-((z-1.322)/.025)**2))
   y+=front*.010*(exp(-((x-.108)/.062)**2-((z-1.465)/.05)**2)+exp(-((x+.108)/.062)**2-((z-1.465)/.05)**2))
   vs.append((x,y,z))
 for j in range(K):
  for i in range(N):a=j*N+i;b=j*N+(i+1)%N;fs.append((a,b,b+N,a+N))
 fs.extend([tuple(reversed(range(N))),tuple(K*N+i for i in range(N))]);face=mesh('face',vs,fs,skin)
 bpy.context.view_layer.update()
 def fy(x,z):
  hit,p,_,_=face.ray_cast(Vector((x,-2,z)),Vector((0,1,0)));return p.y if hit else -.15
 def patch(name,cx,cz,w,ht,hb,m,off):
  vs=[(cx,fy(cx,cz)-off-.005,cz)];fs=[];N=48;R=8
  for j in range(1,R+1):
   r=j/R
   for i in range(N):
    a=i*2*pi/N;x=cx+w*r*cos(a);z=cz+r*(ht if sin(a)>0 else hb)*sin(a)
    vs.append((x,fy(x,z)-off-.005*(1-r*r),z))
  for i in range(N):fs.append((0,1+i,1+(i+1)%N))
  for j in range(R-1):
   for i in range(N):a=1+j*N+i;b=1+j*N+(i+1)%N;fs.append((a,b,b+N,a+N))
  return mesh(name,vs,fs,m)
 for sign in [-1,1]:
  cx=sign*.119;cz=1.510
  patch('eye.'+str(sign),cx,cz,.065,.033,.027,white,.006)
  patch('iris.'+str(sign),cx,cz,.025,.030,.025,iris,.013)
  patch('pupil.'+str(sign),cx,cz,.010,.020,.018,ink,.018)
  # Upper and lower sculpted eyelid margins following the actual eye opening.
  for upper in [True,False]:
   ps=[];rs=[]
   for i in range(33):
    a=pi*i/32;x=cx+.067*cos(a);z=cz+(.035 if upper else -.029)*sin(a)
    ps.append((x,fy(x,z)-.010,z));rs.append(.002+.003*sin(a))
   tube('lid.'+str(sign)+str(upper),ps,rs,skin)
  ps=[]
  for i in range(25):
   t=i/24;x=cx-.058+t*.116;z=1.593+.011*sin(pi*t);ps.append((x,fy(x,z)-.008,z))
  tube('brow.'+str(sign),ps,[.002+.006*sin(pi*i/24) for i in range(25)],hairmat,n=10,flatten=.5)
 # Neutral mouth is a shape study with a shallow aperture; expression rig comes later.
 patch('mouth aperture',0,1.315,.062,.004,.004,dark,.004)
 for upper in [True,False]:
  ps=[]
  for i in range(33):
   t=i/32;x=-.061+.122*t;z=1.315+(.004 if upper else -.005)*sin(pi*t);ps.append((x,fy(x,z)-.007,z))
  tube('lip.'+str(upper),ps,[.001+.0025*sin(pi*i/32) for i in range(33)],lip,n=10,flatten=.6)
 # Hair base and broad tapered locks. Curved ribbons form volume rather than primitive beads.
 vs=[];fs=[];N=80;K=18
 for j in range(K+1):
  t=j/K
  for i in range(N):
   a=2*pi*i/N;front=max(cos(a),0);bottom=1.43+.15*front+.105*exp(-(sin(a)/.35)**2)*front
   z=bottom+(1.85-bottom)*sin(t*pi/2)
   if z<=1.74:
    rw=smooth_ring(z,1)+.014;rd=smooth_ring(z,2 if cos(a)>=0 else 3)+.014
   else:
    taper=cos(min(1,(z-1.74)/.11)*pi/2);rw=(smooth_ring(1.74,1)+.014)*taper;rd=(smooth_ring(1.74,2 if cos(a)>=0 else 3)+.014)*taper
   vs.append((rw*sin(a),-rd*math.copysign(abs(cos(a))**.72,cos(a)),z))
 for j in range(K):
  for i in range(N):a=j*N+i;b=j*N+(i+1)%N;fs.append((a,b,b+N,a+N))
 base=mesh('hair base',vs,fs,hairmat);so=base.modifiers.new('hair shell','SOLIDIFY');so.thickness=.008
 def lock(name,controls,width,depth):
  pts=[];r=[]
  for i in range(41):
   t=i/40;p=sum((Vector(v)*k for v,k in zip(controls,[(1-t)**3,3*t*(1-t)**2,3*t*t*(1-t),t**3])),Vector())
   pts.append(p);r.append(.002+width*(sin(pi*(.08+.92*t))**.8))
  return tube(name,pts,r,hairmat,n=14,flatten=depth/width)
 for side in [-1,1]:
  for k in range(3):
   lock('hair sweep '+str(side)+' '+str(k),[(side*.015,.005+k*.065,1.815-k*.018),(side*(.14+k*.025),-.14+k*.04,1.875-k*.012),(side*(.24+k*.020),-.205+k*.04,1.70-k*.035),(side*(.235+k*.020),-.19+k*.060,1.565-k*.008)],.068-k*.007,.016)
 # Both hands: connected palm, knuckle web, 4 distinct fingers + opposed thumb.
 hand_reports={}
 for side,suffix in [(1,'L'),(-1,'R')]:
  clay=S.Clay((-.095,-.05,-.015),(.095,.05,.205),voxel=.0016)
  clay.add(S.sd_round_box((0,0,.047),(.042,.019,.040),.012))
  clay.add(S.sd_cone((0,0,0),(0,0,.035),.029,.035),blend=.010)
  for k,(x,length,rad) in enumerate([(-.034,.076,.0115),(-.011,.089,.012),(.013,.083,.0115),(.036,.066,.010)]):
   p0=(x,0,.074);p1=(x*1.1,-.003,.10);p2=(x*1.18,-.009,.074+length)
   clay.add(S.sd_tube([p0,p1,p2],[rad*1.22,rad,rad*.76],blend=.005),blend=.004)
  clay.add(S.sd_tube([(-.028,0,.030),(-.057,-.008,.053),(-.072,-.012,.083)],[.021,.016,.012],blend=.008),blend=.008)
  hand=clay.to_object('B5-hand.'+suffix,collection=col,symmetric=False);hand.data.materials.append(skin);parts.append(hand)
  hand_reports[suffix]=S.stage_report(hand,.0016)
  # Orient down the forearm with thumb toward the body.
  wrist=Vector((side*.565,-.035,.61));down=Vector((side*.40,0,-.9165));across=Vector((side*.9165,0,.40));front=Vector((0,1,0))
  for v in hand.data.vertices:
   x,y,z=v.co;v.co=wrist+across*x+front*y+down*z
  bm=bmesh.new();bm.from_mesh(hand.data);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(hand.data);bm.free()
  hand['digit_count']=5;hand['rig_status']='unrigged sculpt; retopology required'
 # Jacket front construction: open zipper edges rather than a painted stripe alone.
 for side in [-1,1]:
  ps=[]
  edge_counts={}
  for poly in jacket.data.polygons:
   for a,b in poly.edge_keys:edge_counts[(a,b)]=edge_counts.get((a,b),0)+1
  ids={v for e,n in edge_counts.items() if n==1 for v in e}
  levels={}
  for i in ids:
   p=jacket.data.vertices[i].co
   if .005<side*p.x<.15 and p.y<-.05 and .56<p.z<1.08:
    key=round(p.z,4)
    if key not in levels or side*p.x<side*levels[key].x:levels[key]=p.copy()
  edge=sorted(levels.values(),key=lambda p:p.z)
  for i in range(31):
   z=.59+.43*i/30
   x=float(np.interp(z,[p.z for p in edge],[p.x for p in edge]));y=float(np.interp(z,[p.z for p in edge],[p.y for p in edge]))
   ps.append((x,y-.002,z))
  tube('zipper tape '+str(side),ps,[.004]*len(ps),gold,n=8)
 # Lighting and camera; not a game shader claim.
 scene.world=bpy.data.worlds.new('B5 neutral studio');scene.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.18,.21,.26,1);scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.5
 for name,loc,power,size in [('key',(-3,-4,5),500,4),('fill',(3,-2,3),180,3),('rim',(1,3,4),280,3)]:
  d=bpy.data.lights.new('B5-'+name,'AREA');d.energy=power;d.shape='DISK';d.size=size;o=bpy.data.objects.new('B5-'+name,d);scene.collection.objects.link(o);o.location=loc;o.rotation_euler=(Vector((0,0,1))-o.location).to_track_quat('-Z','Y').to_euler()
 d=bpy.data.cameras.new('B5 review');cam=bpy.data.objects.new('B5 review',d);scene.collection.objects.link(cam);scene.camera=cam;d.type='ORTHO';d.ortho_scale=2.12
 floor=mesh('floor',[(-100,-100,0),(100,-100,0),(100,100,0),(-100,100,0)],[(0,1,2,3)],mat('floor','969CA5'));parts.remove(floor)
 scene.render.engine='CYCLES';scene.cycles.samples=16;scene.cycles.use_denoising=True;scene.render.resolution_x=720;scene.render.resolution_y=900;scene.render.resolution_percentage=100;scene.view_settings.view_transform='AgX';scene.render.image_settings.file_format='PNG'
 def view(pos,target=(0,0,.94),scale=2.12):
  cam.location=pos;cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.ortho_scale=scale
 view((3,-6,2.4));bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'assets/3d/brandon-v5/brandon-primary.blend'))
 for name,pos in [('front',(0,-6,1.1)),('threequarter',(3,-6,2.4)),('profile',(6,0,1.1)),('back',(0,6,1.1))]:
  view(pos);scene.render.filepath=str(OUT/(name+'.png'));bpy.ops.render.render(write_still=True)
 view((1.5,-6,1.8),(0,-.02,1.49),.83);scene.render.filepath=str(OUT/'face.png');bpy.ops.render.render(write_still=True)
 view((1.1,-4,.85),(.60,-.03,.53),.36);scene.render.filepath=str(OUT/'hand.png');bpy.ops.render.render(write_still=True)
 # Neutral gray/silhouette review uses same exact mesh and proportions.
 import bx_review
 rep=bx_review.review(parts,str(OUT/'review'),views=('front','right','threequarter'),modes=('silhouette','matcap'),res=350)
 counts={}
 dep=bpy.context.evaluated_depsgraph_get()
 for o in parts:
  ev=o.evaluated_get(dep);me=ev.to_mesh();me.calc_loop_triangles();counts[o.name]=len(me.loop_triangles);ev.to_mesh_clear()
 report={'stage':'primary form in progress, not rigged or optimized','parts':len(parts),'triangles':sum(counts.values()),'per_object_triangles':counts,'hands':hand_reports,'head':S.stage_report(face),'review':str(rep),'unverified':['facial deformation','finger rig','prop grip','garment stress','game export','device performance']}
 (OUT/'primary-report.json').write_text(json.dumps(report,indent=2,default=str));print('RESULT '+json.dumps({'saved':True,'triangles':report['triangles'],'parts':len(parts)}))
if __name__=='__main__':main()
