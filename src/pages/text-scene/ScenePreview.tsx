import { parseGlbPlayback, sampleGlbTrack } from "./glbPlayback";
import { findBlenderNode } from "./blenderNodes";
import { useEffect, useRef, useState } from "react";
import type { Engine3D, Object3D, Scene3D } from "@orillusion/core";
import { getAssetSrc } from "../../lib/assets";
import { errorMessage } from "../../lib/platforms";
import { scriptButton as button } from "../detail/script/ScriptControls";
import { blocksCamera, isArchitecture, sampleCamera } from "./camera";
import { sampleTransform, type BlenderResult, type SceneTransform, type TextScene } from "./types";

export function setTransform(object: Object3D, value: SceneTransform) {
  // Assign through setters: mutating the Vector3 alone does not dirty every engine transform.
  object.x = value.position[0]; object.y = value.position[1]; object.z = value.position[2];
  object.rotationX = value.rotation[0]; object.rotationY = value.rotation[1]; object.rotationZ = value.rotation[2];
  object.scaleX = value.scale[0]; object.scaleY = value.scale[1]; object.scaleZ = value.scale[2];
}

export default function ScenePreview({ scene, blender }: { scene: TextScene; blender?: BlenderResult }) {
  const host = useRef<HTMLDivElement>(null);
  const draw = useRef<(time: number) => void>(() => {});
  const timeRef = useRef(0);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(scene.duration);
  const [playing, setPlaying] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let disposed = false;
    let engine: Engine3D | undefined;
    let world: Scene3D | undefined;
    let resize: ResizeObserver | undefined;
    const container = host.current!;
    // Each initialization owns its canvas, including StrictMode's cancelled first setup.
    const canvas = document.createElement("canvas");
    canvas.className = "block h-full w-full";
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.setAttribute("aria-label", `${scene.title}的 3D 场景`);
    container.appendChild(canvas);
    setReady(false); setError(""); setPlaying(false); setTime(0); setDuration(scene.duration); timeRef.current = 0;
    const release = () => {
      resize?.disconnect();
      engine?.pause();
      world?.destroy(true);
      world = undefined;
      engine?.dispose();
      engine = undefined;
      canvas.remove();
    };
    void (async () => {
      const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
      if (!gpu || !await gpu.requestAdapter()) throw new Error("当前环境不支持 WebGPU，无法预览 3D 场景。请在支持 WebGPU 的桌面环境中打开。");
      if (disposed) return;
      const O = await import("@orillusion/core");
      if (disposed) return;
      engine = await O.Engine3D.init({ canvasConfig: { canvas } });
      if (disposed) { release(); return; }
      canvas.style.background = scene.background;
      world = new O.Scene3D();
      const cameraObject = new O.Object3D();
      let camera = cameraObject.addComponent(O.Camera3D);
      let fov = 45, near = 0.1, far = 1000;
      camera.perspective(45, engine.aspect, 0.1, 1000);
      const initialCamera = sampleCamera(scene.camera, 0);
      cameraObject.transform.lookAt(new O.Vector3(...initialCamera.position), new O.Vector3(...initialCamera.target));
      world.addChild(cameraObject);
      const view = new O.View3D(0, 0, engine.width, engine.height);
      view.scene = world; view.camera = camera;
      // Attach the scene to this engine before constructing lights and GPU resources.
      engine.startRenderView(view);
      const color = (hex: string) => new O.Color(parseInt(hex.slice(1,3),16)/255, parseInt(hex.slice(3,5),16)/255, parseInt(hex.slice(5,7),16)/255, 1);
      for (const [position, intensity] of [[[8,12,6], 1.5], [[-6,5,-4], 0.8]] as const) {
        const lightObject = new O.Object3D();
        const light = lightObject.addComponent(O.DirectLight);
        light.intensity = intensity;
        light.castShadow = intensity === 1.5;
        light.lightColor = new O.Color(1,1,1,1);
        lightObject.transform.lookAt(new O.Vector3(...position), new O.Vector3(0,0,0));
        world.addChild(lightObject);
      }
      // A camera fill keeps indoor subjects readable even when room surfaces block exterior light.
      const fillObject = new O.Object3D();
      const fill = fillObject.addComponent(O.PointLight);
      fill.intensity = 0.15; fill.range = 50;
      world.addChild(fillObject);
      let imported: Object3D | undefined;
      let drawImported: ((t: number) => void) | undefined;
      if (blender) {
        const source = await getAssetSrc(blender.modelPath);
        if (!source) throw new Error("无法解析 Blender 导出的模型路径");
        imported = await engine.res.loadGltf(source);
        if (disposed) { imported.destroy(true); return; }
        world.addChild(imported);
        const response = await fetch(source);
        if (!response.ok) throw new Error("无法读取 GLB 动画数据");
        const playback = parseGlbPlayback(await response.arrayBuffer());
        if (disposed) return;
        if (!imported.getComponentsInChild(O.MeshRenderer).length) throw new Error("GLB 中没有可渲染的网格");
        imported.getComponentsInChild(O.MeshRenderer).forEach(renderer => { renderer.castShadow = true; });
        const node = (index: number) => {
          const name = playback.nodes[index].name;
          const object = name ? findBlenderNode(imported!, name) : undefined;
          if (!object) throw new Error(`GLB 动画或相机节点加载失败：${index}`);
          return object;
        };
        // This Orillusion release imports geometry but not ordinary glTF TRS tracks/cameras.
        // Bind only the exported animation channels; never consult scene.objects.
        const tracks = playback.tracks.map(track => ({track, object:node(track.node)}));
        const cameraNode = node(playback.camera.node);
        const lens = playback.camera.perspective;
        fov = lens.yfov * 180 / Math.PI; near = lens.znear; far = lens.zfar ?? 1000;
        // glTF cameras look down -Z, whereas Orillusion cameras look down +Z.
        const opticalAxis = new O.Object3D();
        opticalAxis.rotationY = 180;
        cameraNode.addChild(opticalAxis);
        camera = opticalAxis.addComponent(O.Camera3D);
        camera.perspective(fov, engine.aspect, near, far);
        view.camera = camera;
        imported.getComponentsInChild(O.PropertyAnimation).forEach(animation => { animation.autoPlay = false; animation.stop(); });
        setDuration(playback.duration || scene.duration);
        drawImported = (t) => {
          for (const {track,object} of tracks) {
            const v = sampleGlbTrack(track,t);
            if (track.path === "translation") { object.x=v[0]; object.y=v[1]; object.z=v[2]; }
            else if (track.path === "scale") { object.scaleX=v[0]; object.scaleY=v[1]; object.scaleZ=v[2]; }
            else object.transform.localRotQuat = new O.Quaternion(v[0],v[1],v[2],v[3]);
          }
          const position = cameraNode.transform.worldPosition;
          fillObject.x=position.x; fillObject.y=position.y; fillObject.z=position.z;
        };
      }
      const objects = blender ? [] : scene.objects.map((spec) => {
        const group = new O.Object3D();
        group.name = spec.name;
        const meshes: Object3D[] = [];
        for (const part of spec.parts) {
          const mesh = new O.Object3D();
          const renderer = mesh.addComponent(O.MeshRenderer);
          switch (part.shape) {
            case "box": renderer.geometry = new O.BoxGeometry(1,1,1); break;
            case "sphere": renderer.geometry = new O.SphereGeometry(0.5,24,16); break;
            case "cylinder": renderer.geometry = new O.CylinderGeometry(0.5,0.5,1,24); break;
            case "cone": renderer.geometry = new O.CylinderGeometry(0,0.5,1,24); break;
          }
          const material = new O.LitMaterial(engine!.context3D);
          material.baseColor = color(part.color); material.roughness = 0.7; material.metallic = 0;
          renderer.material = material;
          setTransform(mesh, part);
          group.addChild(mesh);
          meshes.push(mesh);
        }
        setTransform(group, sampleTransform(spec, 0));
        world!.addChild(group);
        return { group, meshes };
      });
      draw.current = drawImported ?? ((t) => {
        const pose = sampleCamera(scene.camera, t);
        cameraObject.transform.lookAt(new O.Vector3(...pose.position), new O.Vector3(...pose.target));
        fillObject.x = pose.position[0]; fillObject.y = pose.position[1]; fillObject.z = pose.position[2];
        objects.forEach(({ group, meshes }, i) => {
          const spec = scene.objects[i];
          const transform = sampleTransform(spec, t);
          setTransform(group, transform);
          meshes.forEach((mesh, j) => {
            const visible = !(isArchitecture(spec) && blocksCamera(spec.parts[j], transform, pose));
            mesh.getComponents(O.MeshRenderer).forEach(renderer => { renderer.enable = visible; });
          });
        });
      });
      draw.current(0);
      resize = new ResizeObserver(() => {
        if (!engine || disposed) return;
        const width = Math.max(container.clientWidth, 1), height = Math.max(container.clientHeight, 1);
        engine.context3D.updateSize();
        view.viewPort = new O.Vector4(0, 0, engine.width, engine.height);
        camera.perspective(fov, width / height, near, far);
      });
      resize.observe(container);
      setReady(true);
    })().catch((reason) => {
      release();
      if (!disposed) { setError(errorMessage(reason)); setReady(false); }
    });
    return () => { disposed = true; draw.current = () => {}; release(); };
  }, [scene, blender, revision]);

  useEffect(() => {
    if (!playing || !ready) return;
    let frame = 0;
    const start = performance.now() - timeRef.current * 1000;
    const tick = (now: number) => {
      const t = Math.min(duration, (now - start) / 1000);
      timeRef.current = t; setTime(t); draw.current(t);
      if (t >= duration) setPlaying(false);
      else frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, ready, duration]);

  const seek = (t: number) => { setPlaying(false); timeRef.current = t; setTime(t); draw.current(t); };
  return <section aria-label="3D 场景预览" className="overflow-hidden rounded-xl border border-[#30363d] bg-[#161b22]">
    <div className="relative h-[420px] min-h-64 lg:h-[560px]">
      <div ref={host} className="absolute inset-0 overflow-hidden" />
      {!ready && <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-[#0d1117] p-8 text-center text-sm text-[#8b949e]">
        <p role={error ? "alert" : "status"}>{error || (blender ? "正在加载 Blender 导出的 GLB…" : "正在搭建模型并初始化 3D 预览…")}</p>
        {error && <button className={button} onClick={() => setRevision(r => r + 1)}>重试预览</button>}
      </div>}
    </div>
    <p className="m-0 px-4 py-2 text-xs text-[#8b949e]">{blender ? "播放 Blender 导出的场景、物体动画和镜头。" : "场景草稿预览；正式模型由 Blender 生成。"}</p>
    <div className="flex flex-wrap items-center gap-3 border-t border-[#30363d] p-4">
      <button className={button} disabled={!ready} onClick={() => {
        if (timeRef.current >= duration) { timeRef.current = 0; setTime(0); draw.current(0); }
        setPlaying(p => !p);
      }}>{playing ? "暂停" : time >= duration ? "重新播放" : "播放动画"}</button>
      <button className={button} disabled={!ready} onClick={() => seek(0)}>回到开头</button>
      <label className="flex min-w-40 flex-1 items-center gap-3 text-xs text-[#8b949e]">
        <span className="sr-only">动画进度</span>
        <input aria-label="动画进度" type="range" min="0" max={duration} step="0.01" value={time} disabled={!ready} onChange={e => seek(Number(e.target.value))} className="min-w-0 flex-1 accent-[#b69aff]" />
        <span className="tabular-nums">{time.toFixed(1)} / {duration.toFixed(1)} 秒</span>
      </label>
    </div>
  </section>;
}
