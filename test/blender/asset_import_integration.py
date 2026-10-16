"""Real Blender integration checks. Only uses a temporary directory, never user assets.
Run: python3 test/blender/asset_import_integration.py --blender /path/to/blender
"""
import argparse
import hashlib
import json
import shutil
import subprocess
import tempfile
from pathlib import Path

parser=argparse.ArgumentParser();parser.add_argument('--blender',required=True);args=parser.parse_args()
root=Path(tempfile.mkdtemp(prefix='assets3d-tests-')).resolve()
worker=Path(__file__).resolve().parents[2]/'src-tauri/src/blender/import_asset.py'

def blender(script,*extra):
    result=subprocess.run([args.blender,'--background','--factory-startup','--disable-autoexec','--python',str(script),'--',*map(str,extra)],capture_output=True,text=True,timeout=180)
    if result.returncode:
        raise AssertionError(result.stdout[-2000:]+result.stderr[-2000:])

def digest(path):return hashlib.sha256(path.read_bytes()).hexdigest()
fixture=root/'fixture.py'
fixture.write_text('''import bpy, sys
from pathlib import Path
root=Path(sys.argv[sys.argv.index('--')+1])
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
image=bpy.data.images.new('Wood',width=16,height=16);image.generated_color=(0.4,0.2,0.1,1)
image.filepath_raw=str(root/'wood.png');image.file_format='PNG';image.save()
mat=bpy.data.materials.new('Wood');mat.use_nodes=True
tex=mat.node_tree.nodes.new('ShaderNodeTexImage');tex.image=image
mat.node_tree.links.new(tex.outputs['Color'],mat.node_tree.nodes.get('Principled BSDF').inputs['Base Color'])
for name,x in [('Bench',0),('Other',100)]:
 c=bpy.data.collections.new(name);bpy.context.scene.collection.children.link(c)
 bpy.ops.mesh.primitive_cube_add(size=2,location=(x,0,1));obj=bpy.context.object
 for old in list(obj.users_collection):old.objects.unlink(obj)
 c.objects.link(obj);obj.data.materials.append(mat)
bpy.ops.wm.save_as_mainfile(filepath=str(root/'source.blend'))
''')
blender(fixture,root)
source=root/'source.blend';before=digest(source)

def run(name,**changes):
    request={'path':str(source),'operation':'inspect','collection':'Bench','scale':1,'rotation':0,'ground':True,'replacements':{}}
    request.update(changes)
    job=root/name;job.mkdir();(job/'request.json').write_text(json.dumps(request))
    blender(worker,job/'request.json',job/'result.json',job/'payload')
    result=json.loads((job/'result.json').read_text());assert result['ok'],result
    return result['report'],job

report,_=run('inspect');assert report['meshes']==1,report
assert all(abs(v-2)<0.001 for v in report['dimensions']),report
(root/'wood.png').rename(root/'replacement.png')
missing,_=run('missing');assert len(missing['missing'])==1,missing
repaired,job=run('prepare',operation='prepare',scale=0.5,replacements={str(root/'wood.png'):str(root/'replacement.png')})
assert not repaired['missing'],repaired
assert repaired['renderStatus']=='ready' and repaired['previewStatus']=='ready',repaired
assert (job/'payload/preview/thumbnail.png').is_file(),repaired
assert all(abs(v-1)<0.001 for v in repaired['dimensions']),repaired
assert digest(source)==before,'source was changed'
# Relocate the entire payload and remove external dependencies. Packed preparation must reopen.
relocated=root/'published';shutil.move(str(job/'payload'),relocated)
(root/'replacement.png').rename(root/'hidden.png')
check=root/'check.py';check.write_text('''import bpy,sys,json
from pathlib import Path
root=Path(sys.argv[sys.argv.index('--')+1]);bpy.ops.wm.open_mainfile(filepath=str(root/'prepared/model.blend'),use_scripts=False)
assert len([o for o in bpy.context.scene.objects if o.type=='MESH'])==1
assert all(i.packed_file for i in bpy.data.images if i.source=='FILE' and i.users)
''')
blender(check,relocated)
# Dependency content participates in version identity, even if the blend file is unchanged.
(root/'hidden.png').rename(root/'replacement.png')
with (root/'replacement.png').open('ab') as f:f.write(b'changed')
changed,_=run('changed',scale=0.5,replacements={str(root/'wood.png'):str(root/'replacement.png')})
assert changed['fingerprint']!=repaired['fingerprint']
print(json.dumps({'ok':True,'checks':['collection isolation','missing texture','replacement repair','scale correction','source preserved','GLB export','thumbnail','relocated prepared file','dependency fingerprint'],'directory':str(root)}))
