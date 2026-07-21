import { useRef, useEffect, useState, useCallback } from "react";
import type { DirectorNodeData, SceneModel, TransformMode } from "./types";
import { useDirectorEngine, updateCameraFromKeyframe } from "./useDirectorEngine";
import { useCameraAnimation } from "./useCameraAnimation";
import ScenePanel from "./ScenePanel";
import KeyframeTimeline from "./KeyframeTimeline";
import ExportMenu from "./ExportMenu";
import WebGPUGuard from "./WebGPUCheck";

interface Props {
  data: DirectorNodeData;
  onClose: () => void;
  onUpdate: (data: DirectorNodeData) => void;
  projectId: string;
}

export default function DirectorView({ data, onClose, onUpdate, projectId }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [transformMode, setTransformMode] = useState<TransformMode>("translate");
  const [showExport, setShowExport] = useState(false);
  const [activeCameraId, setActiveCameraId] = useState(data.cameraTracks[0]?.id ?? "");
  const [activeModelId, setActiveModelId] = useState<string | null>(null);

  const activeTrack = data.cameraTracks.find((t) => t.id === activeCameraId) ?? data.cameraTracks[0];

  const { initEngine, loadModel, cameraObjRef } = useDirectorEngine({
    canvasRef,
    models: data.models,
    cameraTrack: activeTrack,
    sceneSettings: data.sceneSettings,
  });

  const { playing, currentTime, duration, play, pause, seek, getCameraAtTime } = useCameraAnimation({
    track: activeTrack,
    onFrame: (time: number) => {
      const kf = getCameraAtTime(time);
      if (kf && cameraObjRef.current) {
        updateCameraFromKeyframe(cameraObjRef.current, kf);
      }
    },
  });

  useEffect(() => {
    initEngine();
  }, [initEngine]);

  useEffect(() => {
    data.models
      .filter((m: SceneModel) => m.status === "ready" && m.modelPath)
      .forEach((m: SceneModel) => loadModel(m));
  }, [data.models, loadModel]);

  const handleModelTransformUpdate = useCallback((modelId: string, transform: SceneModel["transform"]) => {
    onUpdate({
      ...data,
      models: data.models.map((m) =>
        m.id === modelId ? { ...m, transform } : m
      ),
    });
  }, [data, onUpdate]);

  return (
    <WebGPUGuard>
      <style>{`
        .director-view-overlay { background: #0a0a14; color: #e0e0e0; font-family: system-ui, sans-serif; }
        .dv-toolbar { background: #12121e; border-bottom: 1px solid #2a2a4a; height: 44px; }
        .dv-title { color: #a78bfa; }
        .dv-mode-btn { background: transparent; border: 1px solid #333; border-radius: 4px; color: #888; }
        .dv-mode-btn.active { background: #2a2040; border-color: #7c3aed; color: #a78bfa; }
        .dv-btn { background: #1a1a2e; border: 1px solid #333; border-radius: 4px; color: #ccc; }
        .dv-btn:hover { background: #2a2a4a; }
        .dv-btn-close:hover { background: #4a2020; border-color: #ef4444; color: #ef4444; }
        .dv-viewport { background: radial-gradient(ellipse at center, #1a1a3e 0%, #0a0a14 100%); }
        .dv-viewport-label { color: #555; }
      `}</style>
      <div className="director-view-overlay fixed inset-0 flex flex-col" style={{ zIndex: 1000 }}>
        {/* Toolbar */}
        <div className="dv-toolbar flex items-center justify-between px-4 py-2 shrink-0">
          <div className="flex items-center gap-4">
            <span className="dv-title font-semibold">🎬 {data.label}</span>

            <div className="flex gap-1">
              <button
                className={`dv-mode-btn${transformMode === "translate" ? " active" : ""} px-2.5 py-1 cursor-pointer text-xs`}
                onClick={() => setTransformMode("translate")}
              >
                🖐 移动
              </button>
              <button
                className={`dv-mode-btn${transformMode === "rotate" ? " active" : ""} px-2.5 py-1 cursor-pointer text-xs`}
                onClick={() => setTransformMode("rotate")}
              >
                🔄 旋转
              </button>
              <button
                className={`dv-mode-btn${transformMode === "scale" ? " active" : ""} px-2.5 py-1 cursor-pointer text-xs`}
                onClick={() => setTransformMode("scale")}
              >
                🔍 缩放
              </button>
            </div>
          </div>

          <div className="flex gap-2">
            <button className="dv-btn px-3 py-1 cursor-pointer text-xs" onClick={() => setShowExport(true)}>⬇ 导出</button>
            <button className="dv-btn dv-btn-close px-3 py-1 cursor-pointer text-xs" onClick={onClose}>✕ 关闭</button>
          </div>
        </div>

        {/* Main area */}
        <div className="flex flex-1 min-h-0">
          <div className="dv-viewport flex-1 relative">
            <canvas ref={canvasRef} className="w-full h-full block" />
            <div className="dv-viewport-label absolute bottom-3 left-3 text-xs">透视图</div>
          </div>

          <ScenePanel
            models={data.models}
            activeModelId={activeModelId}
            cameraTracks={data.cameraTracks}
            activeCameraId={activeCameraId}
            onActiveCameraChange={setActiveCameraId}
            onModelSelect={setActiveModelId}
            onModelTransformUpdate={handleModelTransformUpdate}
          />
        </div>

        {/* Timeline */}
        <KeyframeTimeline
          tracks={data.cameraTracks}
          activeCameraId={activeCameraId}
          playing={playing}
          currentTime={currentTime}
          duration={duration}
          onPlay={play}
          onPause={pause}
          onSeek={seek}
          onKeyframesChange={(trackId, keyframes) => {
            onUpdate({
              ...data,
              cameraTracks: data.cameraTracks.map((t) =>
                t.id === trackId ? { ...t, keyframes } : t
              ),
            });
          }}
        />

        {/* Export modal */}
        {showExport && (
          <ExportMenu
            projectId={projectId}
            cameraTrack={activeTrack}
            canvasRef={canvasRef}
            onClose={() => setShowExport(false)}
          />
        )}
      </div>
    </WebGPUGuard>
  );
}
