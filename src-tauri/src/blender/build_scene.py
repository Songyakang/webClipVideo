"""Trusted scene-plan interpreter, sent to the local Blender MCP add-on.

No model-generated Python is executed. Each job owns a separate Blender scene.
The project uses Y-up; Blender uses Z-up. Export converts back to glTF Y-up.
"""
import bpy
import math
import json
from mathutils import Matrix, Euler, Vector


def build_editor_scene(payload):
    plan = payload['scene']
    job = payload['jobId']
    prefix = 'ET_' + job + '_'
    original_scene = bpy.context.window.scene
    original_selection = list(bpy.context.selected_objects)
    original_active = bpy.context.view_layer.objects.active
    scene = bpy.data.scenes.new(prefix + 'Scene')
    basis = Matrix.Rotation(math.pi / 2, 4, 'X')
    inverse_basis = basis.inverted()
    created = []
    materials = []
    success = False

    def vector(v):
        return basis.to_3x3() @ Vector(v)

    def transform(obj, spec):
        rotation = Euler([math.radians(v) for v in spec['rotation']], 'XYZ').to_matrix().to_4x4()
        scale = Matrix.Diagonal(Vector([*spec['scale'], 1]))
        obj.matrix_local = basis @ (Matrix.Translation(Vector(spec['position'])) @ rotation @ scale) @ inverse_basis
        obj.rotation_mode = 'QUATERNION'

    def sample(keys, time, default):
        if not keys:
            return default
        if time <= keys[0]['time']:
            return keys[0]
        for a, b in zip(keys, keys[1:]):
            if time <= b['time']:
                fraction = (time - a['time']) / (b['time'] - a['time'])
                return {key: [v + (b[key][axis] - v) * fraction for axis, v in enumerate(a[key])]
                        for key in a if key != 'time'}
        return keys[-1]

    def insert(obj, frame, properties):
        for prop in properties:
            obj.keyframe_insert(data_path=prop, frame=frame, group='Scene animation')

    def curves_linear(obj):
        action = obj.animation_data.action if obj.animation_data else None
        if not action:
            return
        # Blender 4.4+ stores curves in action slots; older releases expose fcurves.
        if hasattr(action, 'layers'):
            for layer in action.layers:
                for strip in layer.strips:
                    for bag in strip.channelbags:
                        for curve in bag.fcurves:
                            for point in curve.keyframe_points:
                                point.interpolation = 'LINEAR'
        elif hasattr(action, 'fcurves'):
            for curve in action.fcurves:
                for point in curve.keyframe_points:
                    point.interpolation = 'LINEAR'

    try:
        bpy.context.window.scene = scene
        scene.render.fps = 24
        scene.frame_start = 1
        scene.frame_end = math.ceil(plan['duration'] * 24) + 1
        scene.render.resolution_x = 1280
        scene.render.resolution_y = 720
        scene.render.resolution_percentage = 100
        scene.world = bpy.data.worlds.new(prefix + 'World')
        scene.world.use_nodes = True
        bg = plan['background']
        background_node = next((node for node in scene.world.node_tree.nodes if node.type == 'BACKGROUND'), None)
        if background_node is None: raise ValueError('World background node missing')
        background_inputs = getattr(background_node, 'inputs', None)
        if background_inputs is None or len(background_inputs) < 2: raise ValueError('World background inputs missing')
        background_inputs[0].default_value = tuple(int(bg[i:i+2],16)/255 for i in (1,3,5)) + (1,)
        background_inputs[1].default_value = 0.35
        groups = []
        for index, spec in enumerate(plan['objects']):
            group = bpy.data.objects.new(prefix + 'Object_%03d' % index, None)
            scene.collection.objects.link(group)
            created.append(group)
            group['display_name'] = spec['name']
            group['role'] = spec.get('role') or 'prop'
            transform(group, spec)
            groups.append(group)
            for part_index, part in enumerate(spec['parts']):
                shape = part['shape']
                if shape == 'box':
                    bpy.ops.mesh.primitive_cube_add(size=1)
                elif shape == 'sphere':
                    bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=16, radius=0.5)
                elif shape == 'cylinder':
                    bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=0.5, depth=1)
                elif shape == 'cone':
                    bpy.ops.mesh.primitive_cone_add(vertices=24, radius1=0.5, radius2=0, depth=1)
                else:
                    raise ValueError('Unsupported shape')
                obj = bpy.context.object
                created.append(obj)
                obj.name = prefix + 'Part_%03d_%03d' % (index, part_index)
                obj.parent = group
                transform(obj, part)
                # Bake dimensions into the mesh before beveling so thin planks and
                # long limbs retain consistent world-unit edge widths.
                dimensions = obj.scale.copy()
                obj.data.transform(Matrix.Diagonal(Vector([*dimensions, 1])))
                obj.scale = (1, 1, 1)
                if shape in ('box', 'cylinder'):
                    requested = part.get('bevel')
                    width = min(dimensions) * 0.06 if requested is None else requested
                    if width > 0:
                        modifier = obj.modifiers.new('Edge bevel', 'BEVEL')
                        modifier.width = min(width, min(dimensions) * 0.2)
                        modifier.segments = 3
                        bpy.context.view_layer.objects.active = obj
                        bpy.ops.object.modifier_apply(modifier=modifier.name)
                material = bpy.data.materials.new(obj.name + '_Material')
                materials.append(material)
                # glTF PBR values use linear RGB, not UI sRGB hex values.
                def linear(v):
                    return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4
                rgb = tuple(linear(int(part['color'][i:i+2],16)/255) for i in (1,3,5))
                material.diffuse_color = (*rgb, 1)
                material.use_nodes = True
                shader = next((node for node in material.node_tree.nodes if node.type == 'BSDF_PRINCIPLED'), None)
                if shader is not None:
                    shader.inputs['Base Color'].default_value = (*rgb, 1)
                    shader.inputs['Roughness'].default_value = part.get('roughness') if part.get('roughness') is not None else 0.65
                    shader.inputs['Metallic'].default_value = part.get('metallic') or 0
                obj.data.materials.append(material)
                if shape == 'sphere':
                    for polygon in obj.data.polygons:
                        polygon.use_smooth = True

        camera_data = bpy.data.cameras.new(prefix + 'Camera')
        camera_data.type = 'PERSP'
        camera_data.lens_unit = 'FOV'
        camera_data.sensor_fit = 'VERTICAL'
        camera_data.angle = math.radians(45)
        camera = bpy.data.objects.new(prefix + 'Camera', camera_data)
        scene.collection.objects.link(camera)
        created.append(camera)
        scene.camera = camera

        # Bake full rotations into small quaternion steps so glTF never collapses a 360-degree turn.
        times = [i / 24 for i in range(math.ceil(plan['duration'] * 24))] + [plan['duration']]
        for time in times:
            frame = 1 + time * 24
            for group, spec in zip(groups, plan['objects']):
                if spec['keyframes']:
                    transform(group, sample(spec['keyframes'], time, spec))
                    insert(group, frame, ['location', 'rotation_quaternion', 'scale'])
            pose = sample(plan['camera'].get('keyframes', []), time, plan['camera'])
            camera.location = vector(pose['position'])
            direction = vector(pose['target']) - camera.location
            camera.rotation_mode = 'QUATERNION'
            camera.rotation_quaternion = direction.to_track_quat('-Z', 'Y')
            insert(camera, frame, ['location', 'rotation_quaternion'])
        for obj in [*groups, camera]:
            curves_linear(obj)
        for i, (position, energy) in enumerate([((8,12,6),1500),((-6,5,-4),800)]):
            data = bpy.data.lights.new(prefix + 'Light_%d' % i, 'AREA')
            data.energy = energy
            data.shape = 'DISK'
            data.size = 5
            light = bpy.data.objects.new(data.name, data)
            scene.collection.objects.link(light)
            created.append(light)
            light.location = vector(position)
            light.rotation_euler = (-light.location).to_track_quat('-Z','Y').to_euler()

        scene.frame_set(1)
        bpy.ops.object.select_all(action='DESELECT')
        bpy.ops.export_scene.gltf(filepath=payload['glbPath'], export_format='GLB',
                                  use_active_scene=True, export_yup=True,
                                  export_animations=True, export_frame_range=True,
                                  export_force_sampling=True, export_cameras=True,
                                  export_lights=False, export_animation_mode='SCENE')
        # Save only this job's scene and dependencies; never overwrite the user's open .blend.
        bpy.data.libraries.write(payload['blendPath'], {scene}, fake_user=True, compress=True)
        success = True
        return {'jobId':job, 'objects':len(groups), 'parts':sum(len(s['parts']) for s in plan['objects']), 'prefix':prefix}
    finally:
        bpy.context.window.scene = original_scene
        for obj in original_selection:
            if obj.name in original_scene.objects:
                obj.select_set(True)
        bpy.context.view_layer.objects.active = original_active
        # Disk artifacts own the result; remove the job scene so repeated generation does not leak memory.
        job_world = scene.world
        bpy.data.scenes.remove(scene)
        for obj in created:
            data = obj.data
            bpy.data.objects.remove(obj, do_unlink=True)
            if data and data.users == 0:
                if isinstance(data, bpy.types.Mesh): bpy.data.meshes.remove(data)
                elif isinstance(data, bpy.types.Camera): bpy.data.cameras.remove(data)
                elif isinstance(data, bpy.types.Light): bpy.data.lights.remove(data)
        for material in materials:
            if material.users == 0: bpy.data.materials.remove(material)
        if job_world and job_world.users == 0: bpy.data.worlds.remove(job_world)
        for action in list(bpy.data.actions):
            if action.name.startswith(prefix) and action.users == 0: bpy.data.actions.remove(action)
        if not success:
            print('Blender scene build failed; original scene restored')
