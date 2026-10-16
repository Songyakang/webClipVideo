"""Isolated Blender worker. Never executed in the user's interactive scene.
Requests/results are task-local files; no model-generated Python is executed.
"""
import bpy
import sys
import json
import os
import math
import shutil
import threading
import time
import hashlib
from pathlib import Path
from mathutils import Vector, Matrix


def digest(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for block in iter(lambda: f.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def run(request, root):
    # Probe as the Blender process before loading any model or starting conversion.
    root = Path(root)
    try:
        root.mkdir(parents=True, exist_ok=True)
        probe = root / '.write-probe'
        probe.write_bytes(b'blender')
        probe.unlink()
    except OSError as e:
        identity = os.getuid() if hasattr(os, 'getuid') else os.getpid()
        raise RuntimeError(f'Blender 无法写入资产任务目录 {root}（进程身份 {identity}）：{e}') from e
    source = Path(request['path']).resolve(strict=True)
    bpy.context.preferences.filepaths.use_scripts_auto_execute = False
    if source.suffix.lower() == '.blend':
        bpy.ops.wm.open_mainfile(filepath=str(source), load_ui=False, use_scripts=False)
    elif source.suffix.lower() == '.glb':
        bpy.ops.object.select_all(action='SELECT')
        bpy.ops.object.delete(use_global=False)
        bpy.ops.import_scene.gltf(filepath=str(source))
    else:
        raise ValueError('仅支持 .blend 和 .glb')
    scene = bpy.context.scene
    scene.frame_set(scene.frame_start)
    report = {'collections': sorted(c.name for c in bpy.data.collections), 'missing': [], 'dependencies': [], 'warnings': [], 'animations': [], 'renderStatus': 'unverified', 'previewStatus': 'pending', 'animationStatus': 'unverified'}
    if request.get('collection'):
        collection = bpy.data.collections.get(request['collection'])
        if collection is None:
            raise ValueError('所选 Collection 不存在')
        selected = set(collection.all_objects)
        for obj in selected:
            if obj.name not in scene.objects:
                scene.collection.objects.link(obj)
        # Preserve ancestors so selection does not sever transforms or rigs.
        for obj in list(selected):
            p = obj.parent
            while p:
                selected.add(p)
                p = p.parent
        for obj in list(scene.objects):
            if obj not in selected:
                bpy.data.objects.remove(obj, do_unlink=True)
    geometry = [o for o in scene.objects if o.type in {'MESH', 'CURVE', 'SURFACE', 'FONT', 'META'}]
    if not geometry:
        raise ValueError('所选内容没有可用几何体')
    replacements = request.get('replacements', {})
    dependencies = []
    # Existing images/libraries not referenced by the selected scene are excluded where possible.
    for item in [*bpy.data.libraries, *bpy.data.images]:
        if not item.users:
            continue
        if isinstance(item, bpy.types.Image):
            if item.packed_file or item.source in {'GENERATED', 'VIEWER'} or not item.filepath:
                continue
            if item.source in {'TILED', 'SEQUENCE', 'MOVIE'}:
                report['missing'].append({'path': item.filepath, 'reason': '首版暂不支持 UDIM、序列或视频纹理，请先打包为普通图片材质'})
                continue
        raw = bpy.path.abspath(item.filepath, library=getattr(item, 'library', None))
        resolved = Path(replacements.get(raw, raw)).expanduser()
        if not resolved.is_file():
            report['missing'].append({'path': raw, 'reason': '依赖文件不存在'})
        else:
            dependencies.append((item, resolved.resolve(), raw))
            if raw in replacements:
                item.filepath = str(resolved)
                if isinstance(item, bpy.types.Image):
                    item.reload()
    bpy.context.view_layer.update()
    points = [o.matrix_world @ Vector(corner) for o in geometry for corner in o.bound_box]
    low = Vector(tuple(min(p[i] for p in points) for i in range(3)))
    high = Vector(tuple(max(p[i] for p in points) for i in range(3)))
    factor = request.get('scale', 1.0) * (scene.unit_settings.scale_length if scene.unit_settings.system != 'NONE' else 1.0)
    report['dimensions'] = list((high-low)*factor)
    report['meshes'] = len([o for o in geometry if o.type == 'MESH'])
    report['vertices'] = sum(len(o.data.vertices) for o in geometry if o.type == 'MESH')
    report['armatures'] = len([o for o in scene.objects if o.type == 'ARMATURE'])
    report['animations'] = [{'name': a.name, 'duration': (a.frame_range[1]-a.frame_range[0])/scene.render.fps} for a in bpy.data.actions]
    report['sourceFingerprint'] = digest(source)
    entries = [{'path': raw, 'hash': digest(path)} for _,path,raw in dependencies]
    report['dependencies'] = entries
    identity = {'source': report['sourceFingerprint'], 'dependencies': sorted(entries, key=lambda e:e['path']), 'collection':request.get('collection',''), 'scale':factor, 'rotation':request.get('rotation',0), 'ground':request.get('ground',True), 'processor':1, 'blender':bpy.app.version_string}
    report['fingerprint'] = hashlib.sha256(json.dumps(identity,sort_keys=True).encode()).hexdigest()
    if request['operation'] == 'inspect' or report['missing']:
        return report
    root = Path(root)
    for d in ['source/dependencies', 'prepared', 'preview']:
        (root/d).mkdir(parents=True,exist_ok=True)
    original = root/'source'/('original'+source.suffix.lower())
    shutil.copy2(source, original)
    if digest(original) != report['sourceFingerprint']:
        raise ValueError('源文件在导入期间发生变化，请重新检查后导入')
    for (item,path,raw), entry in zip(dependencies, entries):
        dest=root/'source/dependencies'/(entry['hash'][:16]+'-'+path.name)
        shutil.copy2(path,dest)
        if digest(dest) != entry['hash']:
            raise ValueError('依赖在导入期间发生变化，请重新检查：'+raw)
        item.filepath=str(dest)
        if isinstance(item,bpy.types.Image):
            item.pack()
    # Pack external libraries when supported, so the prepared file survives relocation.
    if bpy.data.libraries:
        bpy.ops.file.pack_libraries()
    bpy.ops.file.pack_all()
    scene.unit_settings.system='METRIC'
    scene.unit_settings.scale_length=1.0
    anchor=bpy.data.objects.new('AssetPlacement',None)
    scene.collection.objects.link(anchor)
    for obj in list(scene.objects):
        if obj != anchor and obj.parent is None:
            matrix=obj.matrix_world.copy()
            obj.parent=anchor
            obj.matrix_world=matrix
    anchor.scale=(factor,)*3
    anchor.rotation_euler.z=math.radians(request.get('rotation',0))
    if request.get('ground',True):
        # Translate in the asset's original horizontal plane before rotation/scaling.
        center=Vector(((low.x+high.x)/2,(low.y+high.y)/2,low.z))
        anchor.location=-(Matrix.Rotation(anchor.rotation_euler.z,3,'Z') @ center)*factor
    bpy.context.view_layer.update()
    bpy.data.libraries.write(str(root/'prepared/model.blend'),{scene},fake_user=True,compress=True)
    report['renderStatus']='ready'
    try:
        bpy.ops.export_scene.gltf(filepath=str(root/'preview/model.glb'),export_format='GLB',use_active_scene=True,export_animations=True,export_force_sampling=True,export_cameras=False,export_lights=False)
        report['previewStatus']='ready'
    except Exception as e:
        report['previewStatus']='unavailable'
        report['warnings'].append('GLB 预览转换失败：'+str(e))
    (root/'source/dependencies.json').write_text(json.dumps(report['dependencies'],ensure_ascii=False))
    # Thumbnail camera/lights are not written into the reusable prepared asset.
    try:
        bpy.context.view_layer.update()
        points=[o.matrix_world @ Vector(c) for o in geometry for c in o.bound_box]
        center=sum(points,Vector())/len(points)
        radius=max((p-center).length for p in points)
        camera_data=bpy.data.cameras.new('LibraryPreviewCamera')
        camera=bpy.data.objects.new(camera_data.name,camera_data)
        scene.collection.objects.link(camera)
        camera.location=center+Vector((1.4,-1.8,1.1)).normalized()*max(radius*3.5,1)
        camera.rotation_euler=(center-camera.location).to_track_quat('-Z','Y').to_euler()
        camera_data.clip_end=max(radius*20,1000)
        scene.camera=camera
        for i,offset in enumerate([(2,-3,4),(-3,-1,2)]):
            data=bpy.data.lights.new('LibraryPreviewLight'+str(i),'AREA')
            obj=bpy.data.objects.new(data.name,data);scene.collection.objects.link(obj)
            obj.location=center+Vector(offset)*max(radius,1)
            obj.rotation_euler=(center-obj.location).to_track_quat('-Z','Y').to_euler()
            data.energy=(1000 if i==0 else 600)*max(radius,1)**2;data.shape='DISK';data.size=max(radius*2,1)
        scene.render.engine='CYCLES';scene.cycles.samples=16
        scene.render.resolution_x=512;scene.render.resolution_y=512;scene.render.resolution_percentage=100
        scene.render.image_settings.file_format='PNG';scene.render.filepath=str(root/'preview/thumbnail.png')
        bpy.ops.render.render(write_still=True)
    except Exception as e:
        report['warnings'].append('缩略图生成失败：'+str(e))
    return report


# Exit if the owning application dies; do not leave an orphan importing worker.
def watch_parent(parent):
    while True:
        time.sleep(1)
        if os.getppid() != parent:
            os._exit(2)

threading.Thread(target=watch_parent, args=(os.getppid(),), daemon=True).start()
args=sys.argv[sys.argv.index('--')+1:]
request_path,result_path,root=args
try:
    request=json.loads(Path(request_path).read_text())
    result={'ok':True,'report':run(request,root)}
except Exception as e:
    import traceback
    result={'ok':False,'error':str(e),'trace':traceback.format_exc()}
Path(result_path).write_text(json.dumps(result,ensure_ascii=False))
