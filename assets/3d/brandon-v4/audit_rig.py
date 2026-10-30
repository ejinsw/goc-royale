"""Read-only source audit of the saved Brandon v4 rig.

Run in a fresh background Blender process with brandon-rig.blend loaded.
Only audit JSON/review PNGs are written. The loaded .blend is never saved.
"""
import datetime
import json
import sys
import time
from pathlib import Path

import bpy

ROOT = Path('/Users/ejinsw/Documents/GitHub/GOC Royale')
OUT = ROOT / 'outputs/brandon-v4'
OUT.mkdir(parents=True, exist_ok=True)
sys.path.extend([
    '/Users/ejinsw/.codex/skills/scenario-blender-rigging/scripts',
    '/Users/ejinsw/.codex/skills/scenario-blender-expert/scripts',
])
import bx_rig as R

started = time.monotonic()
rig = bpy.data.objects['B4-Brandon rig']
scene = next(s for s in bpy.data.scenes if rig.name in s.objects)
bpy.context.window.scene = scene
jacket = bpy.data.objects['B4-jacket skin']
pants = bpy.data.objects['B4-trousers skin']
hands = {side: bpy.data.objects[f'B4-hand.{side}'] for side in ('L', 'R')}
shoes = {side: bpy.data.objects[f'B4-sneaker.{side}'] for side in ('L', 'R')}
meshes = [
    obj for obj in scene.objects if obj.type == 'MESH'
    and any(mod.type == 'ARMATURE' and mod.object == rig for mod in obj.modifiers)
]

# Deliberately detach animation on this disposable in-memory copy.
detached_actions = {}
for obj in [rig, *meshes]:
    ad = obj.animation_data
    if ad:
        detached_actions[obj.name] = {
            'action': ad.action.name if ad.action else None,
            'nla_tracks': [track.name for track in ad.nla_tracks],
        }
        ad.action = None
        ad.use_nla = False
rig.data.pose_position = 'POSE'
R.reset_pose(rig)

report = {
    'created_utc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'loaded_source': bpy.data.filepath,
    'blender_version': bpy.app.version_string,
    'scene': scene.name,
    'source_saved_by_audit': False,
    'detached_animation': detached_actions,
    'thresholds': {'collapse': .85, 'bulge': 1.25, 'leak': .001},
    'limitations': [
        'This audits the saved source snapshot, not later live changes or the exported GLB.',
        'Joint volume bands use the first mesh in each pass; required missing bands are reported.',
        'Leak values are normalized by the tallest individual mesh supplied in each pass.',
        'Self-intersection counts compare each mesh with itself; cross-mesh clothing/contact gaps are not measured.',
        'The numeric volume proxy is a screening threshold, not a visual quality verdict.',
        'No planted-foot squat, full animation cycle, facial deformation or individual finger test is included.',
        'Only structural constraint cycles are checked; no second Blender process is launched for runtime cycle checking.',
    ],
}

def save_report():
    report['elapsed_seconds'] = round(time.monotonic() - started, 2)
    (OUT / 'deformation.json').write_text(json.dumps(report, indent=2))

report['bones'] = [bone.name for bone in rig.data.bones]
report['roots'] = [bone.name for bone in rig.data.bones if bone.parent is None]
report['deform_bones'] = [bone.name for bone in rig.data.bones if bone.use_deform]
report['static_cycles'] = R.static_cycles(rig)
root_error, root_worst = R.root_test(rig, root='root')
report['root_test'] = {
    'max_matrix_error': float(root_error), 'worst_bone': root_worst,
    'pass': bool(root_error < 1e-4 and report['roots'] == ['root']),
}
report['weights'] = {
    obj.name: R.weight_report(obj, rig, expect_inside=obj in (jacket, pants))
    for obj in meshes
}
report['weight_flags'] = []
for name, weight in report['weights'].items():
    for field in ('unweighted', 'sum_dev', 'over4', 'non_deform_groups', 'empty_major'):
        if weight[field]:
            report['weight_flags'].append(f'{name}: {field} = {weight[field]}')
    if weight['mirror_err'] is not None and weight['mirror_err'] > .05:
        report['weight_flags'].append(f"{name}: mirrored weight difference {weight['mirror_err']}")
report['modifier_stacks'] = {
    obj.name: [
        {'name': mod.name, 'type': mod.type,
         **({'preserve_volume': mod.use_deform_preserve_volume} if mod.type == 'ARMATURE' else {})}
        for mod in obj.modifiers
    ] for obj in meshes
}
save_report()
print(json.dumps({'stage': 'weights_and_root', 'meshes': len(meshes),
                  'weight_flags': len(report['weight_flags']),
                  'root_test': report['root_test']}), flush=True)

R.JOINTS = {}
for side in ('L', 'R'):
    R.JOINTS.update({
        f'shoulder.{side}': (f'clavicle.{side}:head', f'upper_arm.{side}:head', f'upper_arm.{side}:tail'),
        f'elbow.{side}': (f'upper_arm.{side}:head', f'forearm.{side}:head', f'forearm.{side}:tail'),
        f'wrist.{side}': (f'forearm.{side}:head', f'hand.{side}:head', f'hand.{side}:tail'),
        f'hip.{side}': ('hips:head', f'thigh.{side}:head', f'thigh.{side}:tail'),
        f'knee.{side}': (f'thigh.{side}:head', f'shin.{side}:head', f'shin.{side}:tail'),
        f'ankle.{side}': (f'shin.{side}:head', f'foot.{side}:head', f'foot.{side}:tail'),
    })
report['joint_definitions'] = R.JOINTS
upper = [{'name': 'rest', 'ops': []}]
lower = [{'name': 'rest', 'ops': []}]
wrist_poses = {side: [{'name': 'rest', 'ops': []}] for side in ('L', 'R')}

def pose(name, side, joint, ops):
    return {'name': f'{name}.{side}', 'side': side,
            'joints': [f'{joint}.{side}'], 'ops': ops}

for side, sign in (('L', 1), ('R', -1)):
    upper.append(pose('shoulder_outward_up', side, 'shoulder', [
        ('aim', f'upper_arm.{side}', (sign * .8, -.05, .6)),
    ]))
    for angle in (90, 110):
        upper.append(pose(f'elbow_{angle}', side, 'elbow', [
            ('hinge', f'forearm.{side}', angle, (0, -1, 0)),
        ]))
    for angle in (-25, 25):
        wrist_pose = pose(f'wrist_twist_{angle:+d}', side, 'wrist', [
            ('twist', f'hand.{side}', angle),
        ])
        upper.append(wrist_pose)
        wrist_poses[side].append(wrist_pose)
    lower.append(pose('hip_40', side, 'hip', [
        ('hinge', f'thigh.{side}', 40, (0, -1, 0)),
    ]))
    for angle in (75, 95):
        lower.append(pose(f'knee_{angle}', side, 'knee', [
            ('hinge', f'shin.{side}', angle, (0, 1, 0)),
        ]))
    lower.append(pose('ankle_25', side, 'ankle', [
        ('hinge', f'foot.{side}', 25, (0, 0, 1)),
    ]))

report['deformation'] = {}
report['deformation_flags'] = []
report['missing_measurements'] = []
passes = [
    ('jacket', [jacket, hands['L'], hands['R']], upper),
    ('trousers', [pants, shoes['L'], shoes['R']], lower),
    ('hand.L', [hands['L']], wrist_poses['L']),
    ('hand.R', [hands['R']], wrist_poses['R']),
]
for name, measured, poses in passes:
    result = R.deformation_report(rig, measured, poses, self_intersections=True)
    flags = R.flag_report(result)
    missing = []
    for spec in poses:
        present = result[spec['name']].get('joints', {})
        for joint in spec.get('joints', []):
            if joint not in present:
                missing.append(f"{spec['name']}: no volume band for {joint}")
            elif present[joint]['min_ring'] is None:
                missing.append(f"{spec['name']}: no populated sub-band for {joint}")
    report['deformation'][name] = {
        'primary_mesh': measured[0].name, 'meshes': [o.name for o in measured],
        'poses': poses, 'results': result, 'flags': flags,
        'missing_measurements': missing,
    }
    report['deformation_flags'].extend(f'{name}: {flag}' for flag in flags)
    report['missing_measurements'].extend(f'{name}: {item}' for item in missing)
    save_report()
    print(json.dumps({'stage': name, 'poses': len(poses), 'flags': len(flags),
                      'missing_measurements': len(missing)}), flush=True)

# A compact sheet samples four stress poses; it does not replace full range review.
selected = [
    next(p for p in upper if p['name'] == 'shoulder_outward_up.L'),
    next(p for p in upper if p['name'] == 'elbow_110.L'),
    next(p for p in upper if p['name'] == 'wrist_twist_+25.L'),
    next(p for p in lower if p['name'] == 'knee_95.L'),
]
try:
    report['joint_review_sheet'] = R.joint_sheet(
        rig, meshes, selected, str(OUT), views=('front', 'threequarter'),
        res=320, size_factor=.27, name='conservative_joints')
except Exception as error:
    report['joint_review_sheet_error'] = f'{type(error).__name__}: {error}'
finally:
    R.reset_pose(rig)
    report['numeric_checks_pass'] = bool(
        report['root_test']['pass'] and not report['static_cycles']
        and not report['weight_flags'] and not report['deformation_flags']
        and not report['missing_measurements'])
    save_report()

print(json.dumps({
    'audit_complete': True,
    'output': str(OUT / 'deformation.json'),
    'numeric_checks_pass': report['numeric_checks_pass'],
    'weight_flags': len(report['weight_flags']),
    'deformation_flags': len(report['deformation_flags']),
    'missing_measurements': len(report['missing_measurements']),
    'elapsed_seconds': report['elapsed_seconds'],
}), flush=True)
