"""Brandon v2 shape study, Blender 5.2. Run in a separate owned scene.
Continuous designed surfaces and Scenario Clay shoulder blending; not a game mesh.
"""
import bpy, bmesh, math, sys, json
from mathutils import Vector
from pathlib import Path
from math import sin, cos, pi, sqrt, exp
ROOT=Path('/Users/ejinsw/Documents/GitHub/GOC Royale')
SKILLS=Path('/Users/ejinsw/.codex/skills')
sys.path.append(str(SKILLS/'scenario-blender-sculpting/scripts'))
sys.path.append(str(SKILLS/'scenario-blender-expert/scripts'))
import bx_sculpt as S
NAME='Brandon v2 • Shape Study'
if NAME in bpy.data.scenes:
    raise RuntimeError('Study scene already exists; refine it rather than overwrite.')
scene=bpy.data.scenes.new(NAME)
if bpy.context.window: bpy.context.window.scene=scene
COL=bpy.data.collections.new('Brandon v2 • owned geometry');scene.collection.children.link(COL)
def material(name,hexcode,rough=.6,metal=0):
    rgb=[int(hexcode[i:i+2],16)/255 for i in (0,2,4)]
    linear=[v/12.92 if v<.04045 else ((v+.055)/1.055)**2.4 for v in rgb]
    m=bpy.data.materials.new('B2-'+name);m.diffuse_color=(*linear,1)
    bs=m.node_tree.nodes.get('Principled BSDF')
    bs.inputs['Base Color'].default_value=(*linear,1);bs.inputs['Roughness'].default_value=rough
    bs.inputs['Metallic'].default_value=metal
    return m
skin=material('warm skin','E5AF82',.63)
hair=material('soft black hair','202536',.43)
hair2=material('hair plane','272D40',.48)
ink=material('frames','172337',.38)
blue=material('cobalt cloth','346DB4',.72)
navy=material('ribbing','203953',.78)
gold=material('gold trim','EDBF59',.53)
cream=material('cream cotton','F5EDDA',.78)
white=material('eye white','FFF6E9',.57)
iris=material('iris','34291F',.5)
mouth=material('mouth interior','713A31',.75)
lip=material('lip edge','BA7861',.72)

def mesh(name,vs,fs,mat,sub=0):
    me=bpy.data.meshes.new('B2-'+name);me.from_pydata(vs,[],fs);me.validate();me.update()
    bm=bmesh.new();bm.from_mesh(me);bmesh.ops.recalc_face_normals(bm,faces=bm.faces);bm.to_mesh(me);bm.free()
    ob=bpy.data.objects.new('B2-'+name,me);COL.objects.link(ob);ob['goc_study']=True
    me.materials.append(mat);me.shade_smooth()
    if sub:
        mod=ob.modifiers.new('Designed surface smoothing','SUBSURF');mod.levels=sub;mod.render_levels=sub
    return ob

def sample(vals,t):
    # Cubic Hermite interpolation with clamped endpoint slopes.
    n=len(vals);u=max(0,min(n-1.000001,t*(n-1)));i=int(u);f=u-i
    a=vals[max(0,i-1)];b=vals[i];c=vals[min(i+1,n-1)];d=vals[min(i+2,n-1)]
    return .5*((2*b)+(-a+c)*f+(2*a-5*b+4*c-d)*f*f+(-a+3*b-3*c+d)*f*f*f)

def loft(name,rings,mat,n=64,steps=80,sub=0):
    # Rings: z, width, front depth, back depth. Face is -Y.
    cols=list(zip(*rings));vs=[];fs=[]
    for j in range(steps+1):
        z,w,fd,bd=[sample(c,j/steps) for c in cols]
        for i in range(n):
            a=2*pi*i/n;co=cos(a);x=w*sin(a)
            y=-(fd if co>=0 else bd)*(abs(co)**.65)*(1 if co>=0 else -1)
            if name=='face':
                front=max(0,co)**8
                def g(xc,zc,wx,wz): return exp(-((x-xc)/wx)**2-((z-zc)/wz)**2)
                # Continuous nose bridge/tip, cheek lift, chin and eye sockets.
                y-=front*(.105*g(0,2.16,.095,.14)+.052*g(0,2.10,.15,.06)+.025*g(0,1.77,.20,.08))
                y-=front*(.018*g(.32,2.08,.16,.13)+.018*g(-.32,2.08,.16,.13))
                y+=front*.035*(g(.245,2.29,.16,.1)+g(-.245,2.29,.16,.1))
            vs.append((x,y,z))
    for j in range(steps):
        for i in range(n):
            a=j*n+i;b=j*n+(i+1)%n;fs.append((a,b,b+n,a+n))
    fs.append(tuple(reversed(range(n))));fs.append(tuple(steps*n+i for i in range(n)))
    return mesh(name,vs,fs,mat,sub)

def tube(name,points,radii,mat,segments=14,closed=False):
    vs=[];fs=[];P=[Vector(p) for p in points]
    for j,p in enumerate(P):
        if closed: tangent=(P[(j+1)%len(P)]-P[(j-1)%len(P)]).normalized()
        else: tangent=(P[min(j+1,len(P)-1)]-P[max(0,j-1)]).normalized()
        axis=Vector((0,1,0));side=tangent.cross(axis).normalized();up=side.cross(tangent).normalized()
        r=radii[j] if hasattr(radii,'__len__') else radii
        for i in range(segments):
            v=p+r*(side*cos(2*pi*i/segments)+up*sin(2*pi*i/segments));vs.append(tuple(v))
    for j in range(len(P) if closed else len(P)-1):
        for i in range(segments): fs.append((j*segments+i,j*segments+(i+1)%segments,((j+1)%len(P))*segments+(i+1)%segments,((j+1)%len(P))*segments+i))
    if not closed: fs.extend([tuple(reversed(range(segments))),tuple((len(P)-1)*segments+i for i in range(segments))])
    return mesh(name,vs,fs,mat)

def disk(name,cx,cz,w,h,y,mat,upper=1,lower=1):
    vs=[(cx,y-.008,cz)];N=64
    for i in range(N):
        a=2*pi*i/N;dx=w*cos(a);dz=h*sin(a)*(upper if sin(a)>=0 else lower)
        # Surface wraps around face; thickest at center, flush at outside.
        vs.append((cx+dx,y+.11*(dx/w)**2,cz+dz))
    fs=[(0,i+1,(i+1)%N+1) for i in range(N)]
    ob=mesh(name,vs,fs,mat)
    solid=ob.modifiers.new('Thin face inset','SOLIDIFY');solid.thickness=.008
    return ob

head=loft('face',[(1.60,.06,.09,.10),(1.65,.18,.25,.18),(1.75,.29,.32,.25),(1.88,.42,.375,.32),(2.05,.50,.405,.365),(2.22,.535,.405,.40),(2.40,.53,.405,.43),(2.59,.51,.385,.44),(2.77,.43,.32,.365),(2.9,.25,.20,.24),(2.94,.025,.025,.025)],skin)
neck=loft('neck',[(1.22,.20,.18,.19),(1.35,.185,.18,.19),(1.55,.17,.16,.17),(1.71,.19,.17,.18)],skin,n=40,steps=24)
# A continuous jacket surface, shaped at chest, waist and arms with smooth unions.
c=S.Clay((-1.4,-.65,-.1),(1.4,.6,1.55),voxel=.014)
c.add(S.sd_round_box((0,.025,.68),(.52,.28,.64),.19))
c.add(S.sd_ellipsoid((0,.02,1.08),(.62,.31,.37)),blend=.18)
for side in [-1,1]:
    c.add(S.sd_cone((side*.42,.025,1.19),(side*.73,.015,.91),.27,.225),blend=.18)
    c.add(S.sd_cone((side*.73,.015,.91),(side*.89,-.02,.51),.225,.185),blend=.16)
    c.add(S.sd_cone((side*.89,-.02,.51),(side*.94,-.055,.17),.185,.135),blend=.13)
# Flat bust base, no disconnected shoulder caps.
c.intersect(S.sd_halfspace((0,0,.04),(0,0,-1)),blend=.035)
jacket=c.to_object('B2-jacket continuous',collection=COL);jacket.data.materials.append(blue);jacket['goc_study']=True
smooth=jacket.modifiers.new('Cloth surface relax','SMOOTH');smooth.factor=.35;smooth.iterations=3
# Tee lies over the front, framed by actual collar curves.
vs=[(-.12,-.307,1.32),(.12,-.307,1.32),(.19,-.31,.95),(.125,-.292,.08),(-.125,-.292,.08),(-.19,-.31,.95)]
tee=mesh('shirt inset',vs,[(0,1,2,3,4,5)],cream)
sol=tee.modifiers.new('Cotton thickness','SOLIDIFY');sol.thickness=.012
bev=tee.modifiers.new('Soft garment boundary','BEVEL');bev.width=.015;bev.segments=3
for side in [-1,1]:
    pts=[(side*x,y,z) for x,y,z in [(.10,-.16,1.46),(.20,-.26,1.36),(.23,-.335,1.15),(.18,-.32,.96)]]
    tube('collar '+str(side),pts,[.067,.065,.06,.033],navy)
    tube('gold piping '+str(side),[(side*.19,-.328,.94),(side*.145,-.31,.60),(side*.13,-.31,.09)],.012,gold)
    # cuffs follow the angle of the shaped sleeves.
    pts=[]
    for i in range(48):
        a=2*pi*i/48;pts.append((side*.94+.14*cos(a),-.055+.145*sin(a),.18))
    tube('cuff '+str(side),pts,.042,navy,closed=True)
    tube('cuff stripe '+str(side),[(p[0],p[1],p[2]-.019) for p in pts],.012,gold,closed=True)
# Ear cartilage is built into a single closed surface on each side.
for side in [-1,1]:
    ec=S.Clay((-0.72,-.24,1.94),(.72,.20,2.45),.009)
    ec.add(S.sd_ellipsoid((side*.53,-.015,2.18),(.115,.09,.19)))
    ec.sub(S.sd_ellipsoid((side*.585,-.093,2.205),(.047,.048,.095)),blend=.018)
    ob=ec.to_object('B2-ear '+str(side),collection=COL,symmetric=False);ob.data.materials.append(skin);ob['goc_study']=True
# Almond eyes with an expressive upper lid, fitted to the facial surface.
for side in [-1,1]:
    x=side*.245
    disk('eye '+str(side),x,2.29,.154,.077,-.414,white,upper=.75,lower=.82)
    disk('iris '+str(side),x-side*.008,2.286,.046,.050,-.425,iris)
    disk('pupil '+str(side),x-side*.008,2.287,.024,.039,-.437,ink)
    disk('eye glint '+str(side),x-.014,2.309,.010,.012,-.449,white)
    points=[]
    for i in range(25):
        u=i/24;dx=-.154+.308*u;z=2.29+.077*.75*sin(pi*u)
        points.append((x+dx,-.422+.11*(dx/.154)**2,z))
    tube('upper lid '+str(side),points,[.008+.007*sin(pi*i/24) for i in range(25)],ink)
    points=[(x-.145+.29*i/24,-.41+.075*((-.145+.29*i/24)/.154)**2,2.425+.026*sin(pi*i/24)) for i in range(25)]
    tube('brow '+str(side),points,[.012+.008*sin(pi*i/24) for i in range(25)],hair)
# Smile wraps the lower face, wider at the lifted corners.
N=60;vs=[];fs=[]
for row in range(5):
    t=row/4
    for i in range(N+1):
        u=-1+2*i/N;x=.265*u
        ztop=1.968+.053*u*u;zbot=1.865+.156*u*u
        z=ztop*(1-t)+zbot*t;y=-.403+.104*u*u-.012*sin(pi*t)
        vs.append((x,y,z))
for j in range(4):
 for i in range(N):
    a=j*(N+1)+i;fs.append((a,a+1,a+N+2,a+N+1))
mesh('smile interior',vs,fs,mouth)
vs=[];fs=[]
for row in range(3):
 for i in range(N+1):
    u=-1+2*i/N;top=1.969+.052*u*u;bot=1.922+.099*u*u
    vs.append((.255*u,-.417+.1*u*u,top+(bot-top)*row/2))
for j in range(2):
 for i in range(N):
    a=j*(N+1)+i;fs.append((a,a+1,a+N+2,a+N+1))
mesh('smile teeth band',vs,fs,cream)
tube('lower lip',[(-.257+.514*i/40,-.414+.10*(-1+2*i/40)**2,1.865+.156*(-1+2*i/40)**2) for i in range(41)],[.007+.008*sin(pi*i/40) for i in range(41)],lip)
# Thin rounded-square spectacles; front contour wraps toward the temples.
for side in [-1,1]:
    P=[]
    for i in range(80):
        a=2*pi*i/80;dx=.192*math.copysign(abs(cos(a))**.65,cos(a));dz=.135*math.copysign(abs(sin(a))**.65,sin(a))
        x=side*.245+dx;y=-.466+.105*(abs(x)/.46)**2
        P.append((x,y,2.30+dz))
    tube('glasses rim '+str(side),P,.014,ink,segments=12,closed=True)
    tube('glasses temple '+str(side),[(side*.432,-.37,2.34),(side*.525,-.20,2.34),(side*.565,.035,2.31),(side*.557,.08,2.23)],.012,ink)
tube('glasses bridge',S.bezier((-.054,-.464,2.32),(-.026,-.49,2.36),(.026,-.49,2.36),(.054,-.464,2.32),20),.014,ink)
# Hair is a fitted cap plus broad swept ribbon volumes, not sphere clusters.
vs=[];fs=[];nn=96;rows=35
for j in range(rows+1):
 for i in range(nn):
    a=2*pi*i/nn;front=max(0,cos(a));side=abs(sin(a));back=max(0,-cos(a))
    lower=2.40+.17*front-.10*side-.23*back
    phi0=math.acos(max(-.99,min(.99,(lower-2.43)/.62)))
    phi=phi0*(1-j/rows)+.008
    x=.567*sin(phi)*sin(a);y=-.485*sin(phi)*cos(a);z=2.43+.62*cos(phi)
    vs.append((x,y,z))
for j in range(rows):
 for i in range(nn):
    a=j*nn+i;b=j*nn+(i+1)%nn;fs.append((a,b,b+nn,a+nn))
cap=mesh('hair fitted cap',vs,fs,hair)
sol=cap.modifiers.new('Hair base thickness','SOLIDIFY');sol.thickness=.028

def lock(name,control,width,depth,mat):
    P=S.bezier(*control,n=52);vs=[];fs=[];M=16
    for j,pp in enumerate(P):
        p=Vector(pp);t=j/(len(P)-1)
        tangent=(Vector(P[min(j+1,len(P)-1)])-Vector(P[max(0,j-1)])).normalized()
        across=Vector((tangent.z,0,-tangent.x)).normalized()
        # roots broaden into a swept mass, tips taper smoothly.
        fac=max(.015,sin(pi*(.12+.88*t))**.65)
        for i in range(M):
            a=2*pi*i/M;v=p+across*(width*fac*cos(a))+Vector((0,depth*fac*sin(a),0));vs.append(tuple(v))
    for j in range(len(P)-1):
     for i in range(M):
        a=j*M+i;b=j*M+(i+1)%M;fs.append((a,b,b+M,a+M))
    fs.extend([tuple(reversed(range(M))),tuple((len(P)-1)*M+i for i in range(M))])
    return mesh(name,vs,fs,mat,sub=1)
lock('left curtain',[(.025,-.25,3.025),(-.25,-.52,3.13),(-.64,-.55,2.79),(-.46,-.38,2.42)],.18,.075,hair)
lock('right curtain',[(.065,-.22,3.02),(.32,-.51,3.08),(.66,-.52,2.79),(.48,-.36,2.43)],.18,.07,hair)
lock('left outer sweep',[(-.04,-.02,3.02),(-.40,-.20,3.09),(-.65,-.28,2.71),(-.54,-.16,2.30)],.15,.065,hair2)
lock('right outer sweep',[(.14,.03,3.0),(.42,-.08,3.04),(.64,-.24,2.72),(.55,-.10,2.31)],.13,.06,hair2)
# Small sewn badge, restrained gold accent.
badge=loft('badge',[(.79,.055,.015,.015),(.80,.07,.02,.02),(.91,.07,.02,.02),(.92,.055,.015,.015)],gold,n=32,steps=12)
badge.location=(.35,-.30,0)
# Studio, all isolated from the original scene.
bg=material('studio ground','D8DFE5',.85)
mesh('ground',[(-200,-200,0),(200,-200,0),(200,200,0),(-200,200,0)],[(0,1,2,3)],bg)
world=bpy.data.worlds.new('B2-world');world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.32,.38,.48,1);world.node_tree.nodes['Background'].inputs[1].default_value=.4;scene.world=world
for name,loc,power,size in [('key',(-3,-4,6),480,4),('fill',(4,-2,3),240,3),('rim',(1,3,5),650,3)]:
    data=bpy.data.lights.new('B2-'+name,'AREA');data.energy=power;data.shape='DISK';data.size=size
    ob=bpy.data.objects.new('B2-'+name,data);scene.collection.objects.link(ob);ob.location=loc;ob.rotation_euler=(Vector((0,0,1.5))-ob.location).to_track_quat('-Z','Y').to_euler()
camdata=bpy.data.cameras.new('B2-Camera');cam=bpy.data.objects.new('B2-Camera',camdata);scene.collection.objects.link(cam)
cam.location=(3,-8,3.0);target=Vector((0,0,1.55));cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();camdata.type='ORTHO';camdata.ortho_scale=3.75;camdata.lens=90;scene.camera=cam
scene.render.engine='CYCLES';scene.cycles.samples=32;scene.cycles.use_denoising=True
scene.render.resolution_x=1000;scene.render.resolution_y=1100;scene.render.resolution_percentage=100
scene.view_settings.view_transform='AgX';scene.view_settings.look='AgX - Medium High Contrast'
scene.render.image_settings.file_format='PNG';scene.render.film_transparent=False
scene['study_status']='Shape study. No rig, retopology or game export yet.'
scene['authoring_workflow']='Scenario sculpting Clay + custom shaped surfaces + live brush refinement.'
for ob in bpy.context.selected_objects: ob.select_set(False)
head.select_set(True);bpy.context.view_layer.objects.active=head
bpy.context.view_layer.update()
if bpy.context.window:
 import bx_gui as G
 G.set_view('FRONT',frame=head)
 for a in bpy.context.window.screen.areas:
  if a.type=='VIEW_3D': a.spaces.active.shading.type='MATERIAL'
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'assets/3d/brandon-v2/brandon-study.blend'),copy=True)
print(json.dumps({'scene':scene.name,'objects':len(COL.objects),'head_vertices':len(head.data.vertices),'jacket_vertices':len(jacket.data.vertices)}))
