import { useRef, useEffect, useCallback, type RefObject } from "react";
import type { SceneModel, CameraTrack, CameraKeyframe } from "./types";
import type { Object3D, Scene3D, Engine3D } from "@orillusion/core";

interface UseDirectorEngineOptions {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  models: SceneModel[];
  cameraTrack: CameraTrack;
  sceneSettings: { backgroundColor: string; ambientLight: number; gridVisible: boolean };
}

export function updateCameraFromKeyframe(camObj: Object3D, kf: CameraKeyframe) {
  camObj.transform.localPosition.set(kf.position[0], kf.position[1], kf.position[2]);
  // The Transform's lookAt is typed with two Vector3 args, but the runtime
  // accepts a single { x, y, z } target via the lookTarget code path.
  (camObj.transform as unknown as { lookAt(target: { x: number; y: number; z: number }): void }).lookAt({
    x: kf.lookAt[0],
    y: kf.lookAt[1],
    z: kf.lookAt[2],
  });
}

export function useDirectorEngine(options: UseDirectorEngineOptions) {
  const { canvasRef, models: _models, cameraTrack, sceneSettings: _sceneSettings } = options;
  const engineRef = useRef<Engine3D | null>(null);
  const sceneRef = useRef<Scene3D | null>(null);
  const modelObjectsRef = useRef<Map<string, Object3D>>(new Map());
  const cameraObjRef = useRef<Object3D | null>(null);
  const animFrameRef = useRef<number>(0);

  // Init engine
  const initEngine = useCallback(async () => {
    if (!canvasRef.current) return;
    const orillusion = await import("@orillusion/core");
    const engine = await orillusion.Engine3D.init({ canvasConfig: { canvas: canvasRef.current } });
    engineRef.current = engine;

    const scene = new orillusion.Scene3D();
    sceneRef.current = scene;

    // Camera
    const camObj = new orillusion.Object3D();
    camObj.addComponent(orillusion.Camera3D);
    cameraObjRef.current = camObj;
    updateCameraFromKeyframe(camObj, cameraTrack.keyframes[0]);

    // Ambient light
    const lightObj = new orillusion.Object3D();
    lightObj.addComponent(orillusion.DirectLight);

    scene.addChild(camObj);
    scene.addChild(lightObj);
  }, [canvasRef, cameraTrack.keyframes]);

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

  // Cleanup
  useEffect(() => {
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      engineRef.current?.dispose?.();
    };
  }, []);

  return { initEngine, loadModel, engineRef, sceneRef, cameraObjRef };
}
