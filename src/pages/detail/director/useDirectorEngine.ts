import { useRef, useEffect, useCallback, type RefObject } from "react";
import type { SceneModel, CameraTrack, CameraKeyframe } from "./types";

interface UseDirectorEngineOptions {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  models: SceneModel[];
  cameraTrack: CameraTrack;
  sceneSettings: { backgroundColor: string; ambientLight: number; gridVisible: boolean };
}

export function updateCameraFromKeyframe(camObj: any, kf: CameraKeyframe) {
  camObj.transform.localPosition.set(kf.position[0], kf.position[1], kf.position[2]);
  camObj.transform.lookAt({ x: kf.lookAt[0], y: kf.lookAt[1], z: kf.lookAt[2] });
}

export function useDirectorEngine(options: UseDirectorEngineOptions) {
  const { canvasRef, models: _models, cameraTrack, sceneSettings } = options;
  const engineRef = useRef<any>(null);
  const sceneRef = useRef<any>(null);
  const modelObjectsRef = useRef<Map<string, any>>(new Map());
  const cameraObjRef = useRef<any>(null);
  const animFrameRef = useRef<number>(0);

  // Init engine
  const initEngine = useCallback(async () => {
    if (!canvasRef.current) return;
    const { Engine3D } = await import("@orillusion/core");
    await Engine3D.init({ canvasConfig: { canvas: canvasRef.current } } as any);
    engineRef.current = Engine3D;

    const scene = new (await import("@orillusion/core")).Scene3D();
    sceneRef.current = scene;

    // Camera
    const camObj = new (await import("@orillusion/core")).Object3D();
    camObj.addComponent((await import("@orillusion/core")).Camera3D);
    cameraObjRef.current = camObj;
    updateCameraFromKeyframe(camObj, cameraTrack.keyframes[0]);

    // Ambient light
    const lightObj = new (await import("@orillusion/core")).Object3D();
    lightObj.addComponent((await import("@orillusion/core")).DirectLight);

    // Grid
    if (sceneSettings.gridVisible) {
      // Grid helper - Orillusion built-in
    }

    scene.addChild(camObj);
    scene.addChild(lightObj);
  }, [canvasRef]);

  // Load model
  const loadModel = useCallback(async (model: SceneModel) => {
    if (!sceneRef.current || model.status !== "ready" || !model.modelPath) return;
    // Convert asset path -> full URL via Tauri convertFileSrc
    const { getAssetSrc: _getAssetSrc } = await import("../../../lib/assets");
    void _getAssetSrc(model.modelPath);

    // Load GLB
    // Note: Orillusion GLB loading API - actual method name depends on @orillusion/core version
    // Using generic loader pattern:
    try {
      // GLB loading placeholder — will load model mesh
      const obj = new (await import("@orillusion/core")).Object3D();
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

  // Cleanup
  useEffect(() => {
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      engineRef.current?.destroy?.();
    };
  }, []);

  return { initEngine, loadModel, engineRef, sceneRef, cameraObjRef };
}
