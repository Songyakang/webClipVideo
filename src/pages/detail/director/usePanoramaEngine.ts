import { useRef, useCallback, type RefObject } from "react";
import type { Engine3D, Camera3D } from "@orillusion/core";

interface UsePanoramaEngineOptions {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  imageUrl: string;
}

export function usePanoramaEngine({ canvasRef, imageUrl }: UsePanoramaEngineOptions) {
  const engineRef = useRef<Engine3D | null>(null);
  const cameraRef = useRef<Camera3D | null>(null);
  const initStartedRef = useRef(false);
  const disposedRef = useRef(false);

  const initEngine = useCallback(async () => {
    if (initStartedRef.current) return;
    initStartedRef.current = true;

    const canvas = canvasRef.current;
    if (!canvas) { initStartedRef.current = false; return; }

    if (!(navigator as Navigator & { gpu?: unknown }).gpu) {
      initStartedRef.current = false;
      return;
    }

    try {
      const orillusion = await import("@orillusion/core");

      const container = canvas.parentElement;
      if (container) {
        const dpr = window.devicePixelRatio || 1;
        canvas.width = container.clientWidth * dpr;
        canvas.height = container.clientHeight * dpr;
        canvas.style.width = `${container.clientWidth}px`;
        canvas.style.height = `${container.clientHeight}px`;
      }

      const engine = await orillusion.Engine3D.init({ canvasConfig: { canvas } });
      canvas.style.background = "#000";
      engineRef.current = engine;

      const scene = new orillusion.Scene3D();

      // Camera
      const camObj = new orillusion.Object3D();
      const cameraComp = camObj.addComponent(orillusion.Camera3D);
      cameraComp.perspective(55, engine.aspect, 0.1, 5000);
      cameraRef.current = cameraComp;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const Vector3 = (orillusion as any).Vector3;
      const ctrl = camObj.addComponent(orillusion.HoverCameraController);
      ctrl.setCamera(0, -20, 10, new Vector3(0, 0, 0));
      ctrl.minDistance = 10;
      ctrl.maxDistance = 10;
      ctrl.wheelStep = 0;
      ctrl.smooth = true;
      ctrl.dragSmooth = 0.2;
      scene.addChild(camObj);

      // Lights
      const keyObj = new orillusion.Object3D();
      const key = keyObj.addComponent(orillusion.DirectLight);
      key.intensity = 0.7;
      key.lightColor = new orillusion.Color(1, 0.95, 0.88, 1);
      scene.addChild(keyObj);

      const ambObj = new orillusion.Object3D();
      const amb = ambObj.addComponent(orillusion.PointLight);
      amb.intensity = 0.5;
      amb.lightColor = new orillusion.Color(0.5, 0.55, 0.65, 1);
      amb.range = 2000;
      ambObj.transform.localPosition.set(0, 0, 0);
      scene.addChild(ambObj);

      // Panorama sphere — material+texture must be ready BEFORE startRenderView
      const sphereGeo = new orillusion.SphereGeometry(480, 64, 32, 0, Math.PI * 2, 0, Math.PI);
      const sphereMat = new orillusion.UnLitMaterial(engine.context3D);
      sphereMat.doubleSide = true;
      sphereMat.baseColor = new orillusion.Color(1, 1, 1);

      try {
        const tex = new orillusion.BitmapTexture2D(true, engine.context3D, "srgb");
        await tex.load(imageUrl);
        sphereMat.baseMap = tex;
      } catch (err) {
        console.error("[PanoramaEngine] texture failed:", err);
        sphereMat.baseColor = new orillusion.Color(0.2, 0.2, 0.25);
      }

      const sphereObj = new orillusion.Object3D();
      const sr = sphereObj.addComponent(orillusion.MeshRenderer);
      sr.geometry = sphereGeo;
      sr.material = sphereMat;
      sphereObj.transform.localPosition.set(0, 0, 0);
      scene.addChild(sphereObj);

      // Start render AFTER all resources are ready
      const view = new orillusion.View3D(0, 0, engine.width, engine.height);
      view.scene = scene;
      view.camera = cameraComp;
      engine.startRenderView(view);

      // Resize handling — use window resize event (more reliable than ResizeObserver)
      const syncSize = () => {
        if (disposedRef.current) return;
        const w = window.innerWidth;
        const h = window.innerHeight - 48; // subtract topbar height
        const dpr = window.devicePixelRatio || 1;
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        canvas.style.width = `${w}px`;
        canvas.style.height = `${h}px`;
        if (cameraRef.current && h > 0) {
          cameraRef.current.perspective(55, w / h, 0.1, 5000);
        }
        if (engine.views[0]) {
          const vp = (engine.views[0] as any).viewPort as Record<string, number>;
          if (vp) { vp.x = 0; vp.y = 0; vp.z = w * dpr; vp.w = h * dpr; }
        }
      };
      // Sync initial size
      syncSize();
      window.addEventListener("resize", syncSize);
      (engine as any).__resizeCleanup = () => window.removeEventListener("resize", syncSize);
    } catch (err) {
      console.error("[PanoramaEngine] init error:", err);
      initStartedRef.current = false;
    }
  }, [canvasRef, imageUrl]);

  const dispose = useCallback(() => {
    disposedRef.current = true;
    try {
      const e = engineRef.current as any;
      e?.__resizeCleanup?.();
      engineRef.current?.dispose?.();
    } catch { /* */ }
    engineRef.current = null;
    cameraRef.current = null;
    initStartedRef.current = false;
  }, []);

  return { initEngine, dispose, engineRef };
}
