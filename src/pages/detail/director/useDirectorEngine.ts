import { useRef, useEffect, useCallback, type RefObject } from "react";
import type { SceneModel, CameraTrack, CameraKeyframe } from "./types";
import type { Object3D, Scene3D, Engine3D } from "@orillusion/core";

interface UseDirectorEngineOptions {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  models: SceneModel[];
  cameraTrack: CameraTrack;
  sceneSettings: { backgroundColor: string; ambientLight: number; gridVisible: boolean };
}

// lookAt(pos: Vector3, target: Vector3, up?: Vector3) — 需要传 Vector3 实例
let _Vector3Ctor: new (x?: number, y?: number, z?: number) => unknown;

export function updateCameraFromKeyframe(camObj: Object3D, kf: CameraKeyframe) {
  if (!_Vector3Ctor) return;
  const pos = new _Vector3Ctor(kf.position[0], kf.position[1], kf.position[2]);
  const target = new _Vector3Ctor(kf.lookAt[0], kf.lookAt[1], kf.lookAt[2]);
  (camObj.transform as unknown as { lookAt(p: unknown, t: unknown, u?: unknown): void }).lookAt(pos, target);
}

export function useDirectorEngine(options: UseDirectorEngineOptions) {
  const { canvasRef, models: _models, cameraTrack, sceneSettings } = options;
  const engineRef = useRef<Engine3D | null>(null);
  const sceneRef = useRef<Scene3D | null>(null);
  const modelObjectsRef = useRef<Map<string, Object3D>>(new Map());
  const cameraObjRef = useRef<Object3D | null>(null);
  const gridObjRef = useRef<Object3D | null>(null);
  const animFrameRef = useRef<number>(0);
  const gridVisibleRef = useRef(sceneSettings.gridVisible);
  const initStartedRef = useRef(false);
  gridVisibleRef.current = sceneSettings.gridVisible;

  const initEngine = useCallback(async () => {
    if (initStartedRef.current) return;
    initStartedRef.current = true;
    console.log("[initEngine] 开始初始化...");

    if (!canvasRef.current) {
      console.warn("[initEngine] canvasRef.current 为空，退出");
      return;
    }
    console.log("[initEngine] canvas 就绪:", canvasRef.current.width, "x", canvasRef.current.height);

    // ---- 检测 WebGPU ----
    const gpu = (navigator as Navigator & { gpu?: unknown }).gpu;
    console.log("[WebGPU] navigator.gpu:", !!gpu);
    console.log("[WebGPU] userAgent:", navigator.userAgent);
    if (!gpu) {
      console.error("[WebGPU] 不支持，Orillusion 需要 Chrome 113+ / Edge 113+");
      return;
    }

    console.log("[initEngine] 导入 Orillusion...");
    const orillusion = await import("@orillusion/core");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    _Vector3Ctor = (orillusion as any).Vector3;

    // 确保 canvas 像素尺寸与容器匹配
    const canvas = canvasRef.current;
    const container = canvas.parentElement;
    if (container) {
      canvas.width = container.clientWidth * window.devicePixelRatio;
      canvas.height = container.clientHeight * window.devicePixelRatio;
      canvas.style.width = `${container.clientWidth}px`;
      canvas.style.height = `${container.clientHeight}px`;
    }

    console.log("[initEngine] Orillusion 导入成功，Engine3D.init...");
    const engine = await orillusion.Engine3D.init({ canvasConfig: { canvas } });
    canvas.style.background = "#000"; // Orillusion 默认设 transparent，覆盖为黑色
    console.log("[initEngine] Engine3D 初始化完成, canvas:", engine.width, "x", engine.height);
    engineRef.current = engine;

    // 1. Scene
    console.log("[initEngine] 创建 Scene3D...");
    const scene = new orillusion.Scene3D();
    sceneRef.current = scene;

    // 2. Camera
    console.log("[initEngine] 创建 Camera3D... (aspect:", engine.aspect, ")");
    const camObj = new orillusion.Object3D();
    const cameraComp = camObj.addComponent(orillusion.Camera3D);
    cameraComp.perspective(55, engine.aspect, 0.1, 5000);
    cameraObjRef.current = camObj;
    updateCameraFromKeyframe(camObj, cameraTrack.keyframes[0]);
    scene.addChild(camObj);

    // 相机旋转控制器
    const ctrlComp = camObj.addComponent(orillusion.HoverCameraController);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ctrlComp.setCamera(0, -20, 15, new _Vector3Ctor(0, 0, 0) as any);
    ctrlComp.minDistance = 1;
    ctrlComp.maxDistance = 100;

    // 3. View — viewport 匹配 canvas 像素尺寸
    console.log("[initEngine] 创建 View3D...");
    const view = new orillusion.View3D(0, 0, engine.width, engine.height);
    view.scene = scene;
    view.camera = cameraComp;
    engine.startRenderView(view);
    console.log("[initEngine] View3D 已启动, viewport:", engine.width, "x", engine.height);

    // 4. Lights
    const aimLight = (obj: Object3D, px: number, py: number, pz: number, tx: number, ty: number, tz: number) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (obj.transform as any).lookAt(new _Vector3Ctor(px, py, pz), new _Vector3Ctor(tx, ty, tz));
    };

    const keyLightObj = new orillusion.Object3D();
    const keyLight = keyLightObj.addComponent(orillusion.DirectLight);
    keyLight.intensity = 0.7;
    keyLight.lightColor = new orillusion.Color(1, 0.95, 0.88, 1);
    aimLight(keyLightObj, 8, 12, 6, 0, 0, 0);
    scene.addChild(keyLightObj);

    const fillLightObj = new orillusion.Object3D();
    const fillLight = fillLightObj.addComponent(orillusion.DirectLight);
    fillLight.intensity = 0.4;
    fillLight.lightColor = new orillusion.Color(0.75, 0.82, 1, 1);
    aimLight(fillLightObj, -6, 3, -4, 0, 0, 0);
    scene.addChild(fillLightObj);

    const rimLightObj = new orillusion.Object3D();
    const rimLight = rimLightObj.addComponent(orillusion.DirectLight);
    rimLight.intensity = 0.6;
    rimLight.lightColor = new orillusion.Color(0.9, 0.9, 1, 1);
    aimLight(rimLightObj, 0, 5, -8, 0, 0, 0);
    scene.addChild(rimLightObj);

    const ambientObj = new orillusion.Object3D();
    const ambientLight = ambientObj.addComponent(orillusion.PointLight);
    ambientLight.intensity = 0.15;
    ambientLight.lightColor = new orillusion.Color(0.5, 0.55, 0.65, 1);
    ambientLight.range = 30;
    ambientObj.transform.localPosition.set(0, 2, 0);
    scene.addChild(ambientObj);

    // 5. Test boxes — 验证材质和位置
    try {
      // 中心大盒子 (红色，UnLit)
      const centerGeo = new orillusion.BoxGeometry(1.5, 1.5, 1.5);
      const centerMat = new orillusion.UnLitMaterial(engine.context3D);
      centerMat.baseColor = new orillusion.Color(1, 0.1, 0.1); // 红色
      const centerObj = new orillusion.Object3D();
      const cmr = centerObj.addComponent(orillusion.MeshRenderer);
      cmr.geometry = centerGeo;
      cmr.material = centerMat;
      centerObj.transform.localPosition.set(0, 1, 0);
      scene.addChild(centerObj);

      // 上方盒子 (绿色)
      const topGeo = new orillusion.BoxGeometry(0.8, 0.8, 0.8);
      const topMat = new orillusion.UnLitMaterial(engine.context3D);
      topMat.baseColor = new orillusion.Color(0.1, 1, 0.1);
      const topObj = new orillusion.Object3D();
      const tmr = topObj.addComponent(orillusion.MeshRenderer);
      tmr.geometry = topGeo;
      tmr.material = topMat;
      topObj.transform.localPosition.set(0, 3, 0);
      scene.addChild(topObj);

      // 前方盒子 (蓝色)
      const frontGeo = new orillusion.BoxGeometry(0.8, 0.8, 0.8);
      const frontMat = new orillusion.UnLitMaterial(engine.context3D);
      frontMat.baseColor = new orillusion.Color(0.1, 0.1, 1);
      const frontObj = new orillusion.Object3D();
      const fmr = frontObj.addComponent(orillusion.MeshRenderer);
      fmr.geometry = frontGeo;
      fmr.material = frontMat;
      frontObj.transform.localPosition.set(0, 1, 3);
      scene.addChild(frontObj);

      console.log("[initEngine] 三个测试盒子创建完成 (红/绿/蓝, UnLitMaterial)");
    } catch (err) {
      console.warn("[initEngine] 测试盒子失败:", err);
    }
    console.log("[initEngine] 全部初始化完成！");
  }, [canvasRef, cameraTrack.keyframes]);

  // Sync grid visibility
  useEffect(() => {
    const gridObj = gridObjRef.current;
    const scene = sceneRef.current;
    if (!gridObj || !scene) return;
    if (sceneSettings.gridVisible) {
      try { scene.addChild(gridObj); } catch { /* already in scene */ }
    } else {
      try { scene.removeChild(gridObj); } catch { /* already removed */ }
    }
  }, [sceneSettings.gridVisible]);

  // Load model
  const loadModel = useCallback(async (model: SceneModel) => {
    if (!sceneRef.current || model.status !== "ready" || !model.modelPath) return;
    // Convert asset path -> full URL via Tauri convertFileSrc
    const { getAssetSrc: _getAssetSrc } = await import("../../../lib/assets");
    void _getAssetSrc(model.modelPath);

    // Load GLB
    try {
      // GLB loading placeholder — will load model mesh
      const orillusion = await import("@orillusion/core");
      const obj = new orillusion.Object3D();
      obj.transform.localPosition.set(
        model.transform.position[0],
        model.transform.position[1],
        model.transform.position[2]
      );
      sceneRef.current.addChild(obj);
      modelObjectsRef.current.set(model.id, obj);
    } catch (err) {
      console.error("Failed to load model:", model.id, err);
    }
  }, []);

  // Clear all loaded model objects from scene
  const clearAllModels = useCallback(() => {
    modelObjectsRef.current.forEach((obj) => {
      sceneRef.current?.removeChild(obj);
    });
    modelObjectsRef.current.clear();
  }, []);

  // Load a set of models into the scene (clears existing first)
  const loadModelsForScene = useCallback(async (sceneModels: SceneModel[]) => {
    clearAllModels();
    const readyModels = sceneModels.filter((m) => m.status === "ready" && m.modelPath);
    for (const model of readyModels) {
      await loadModel(model);
    }
  }, [clearAllModels, loadModel]);

  // Resize canvas + viewport when container changes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const container = canvas.parentElement;
    if (!container) return;

    const syncSize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      const engine = engineRef.current;
      if (engine) {
        const view = engine.views[0];
        if (view) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const vp = view.viewPort as any;
        vp.x = 0; vp.y = 0; vp.z = w * dpr; vp.w = h * dpr;
        }
      }
    };

    const ro = new ResizeObserver(syncSize);
    ro.observe(container);
    return () => {
      ro.disconnect();
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      engineRef.current?.dispose?.();
    };
  }, []);

  return { initEngine, loadModel, clearAllModels, loadModelsForScene, engineRef, sceneRef, cameraObjRef };
}
