import { useEffect,useRef,useState } from "react";
import { getAssetSrc } from "../../lib/assets";
import { errorMessage } from "../../lib/platforms";
import type { Engine3D, Scene3D } from "@orillusion/core";
export function AssetThumbnail({path,name}:{path?:string;name:string}) {
 const [src,setSrc]=useState("");useEffect(()=>{let active=true;setSrc("");if(path)void getAssetSrc(path).then(url=>{if(active)setSrc(url)}).catch(()=>{});return()=>{active=false}},[path]);
 return src?<img src={src} alt={name} className="h-full w-full object-contain"/>:<div className="flex h-full min-h-36 items-center justify-center text-sm text-[#8b949e]">暂无缩略图</div>;
}
export default function AssetPreview({path}:{path:string}) {
 const host=useRef<HTMLDivElement>(null);const [error,setError]=useState("");
 useEffect(()=>{let disposed=false;let engine:Engine3D|undefined;let scene:Scene3D|undefined;let observer:ResizeObserver|undefined;
 const canvas=document.createElement("canvas");canvas.style.width="100%";canvas.style.height="100%";host.current!.appendChild(canvas);setError("");
 const cleanup=()=>{observer?.disconnect();engine?.pause();scene?.destroy(true);scene=undefined;engine?.dispose();engine=undefined;canvas.remove()};
 void(async()=>{const O=await import("@orillusion/core");if(disposed)return;engine=await O.Engine3D.init({canvasConfig:{canvas}});if(disposed){cleanup();return}scene=new O.Scene3D();const cameraObject=new O.Object3D();const camera=cameraObject.addComponent(O.Camera3D);camera.perspective(45,engine.aspect,0.01,100000);scene.addChild(cameraObject);
 const view=new O.View3D(0,0,engine.width,engine.height);view.scene=scene;view.camera=camera;engine.startRenderView(view);
 const source=await getAssetSrc(path);const model=await engine.res.loadGltf(source);if(disposed){model.destroy(true);return}scene.addChild(model);
 const bounds=O.BoundUtil.genMeshBounds(model);const center=bounds.center;const size=bounds.size;const radius=Math.max(size.x,size.y,size.z,0.1);
 const controller=cameraObject.addComponent(O.HoverCameraController);controller.setCamera(35,-20,radius*2.2,center);
 for(const pos of [[4,6,5],[-3,2,-4]]){const node=new O.Object3D();const light=node.addComponent(O.DirectLight);light.intensity=pos[0]>0?1.5:0.7;node.transform.lookAt(new O.Vector3(...pos),new O.Vector3());scene.addChild(node)}
 observer=new ResizeObserver(()=>{if(!engine||disposed)return;engine.context3D.updateSize();view.viewPort=new O.Vector4(0,0,engine.width,engine.height);camera.perspective(45,engine.aspect,0.01,100000)});observer.observe(host.current!);
 })().catch(e=>{cleanup();if(!disposed)setError(errorMessage(e))});return()=>{disposed=true;cleanup()};},[path]);
 return <div><div ref={host} className="h-72 overflow-hidden rounded-lg bg-[#0d1117]"/>{error?<p role="alert" className="text-sm text-[#ff7b72]">实时预览失败：{error}。源资产仍保留。</p>:<p className="text-xs text-[#8b949e]">拖动旋转，滚轮缩放。此处为静态模型检查，动作尚未验证。</p>}</div>
}
