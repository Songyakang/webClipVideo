import { useRef, useEffect, useState, useCallback } from "react";
import type { DirectorNodeData, SceneModel, TransformMode } from "./types";
import { useDirectorEngine, updateCameraFromKeyframe } from "./useDirectorEngine";
import { useCameraAnimation } from "./useCameraAnimation";
import ScenePanel from "./ScenePanel";
import KeyframeTimeline from "./KeyframeTimeline";
import ExportMenu from "./ExportMenu";
import WebGPUGuard from "./WebGPUCheck";
import styles from "./DirectorView.module.css";

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
      <div className={styles["director-view-overlay"]}>
      {/* Toolbar */}
      <div className={styles["dv-toolbar"]}>
        <div className={styles["dv-toolbar-left"]}>
          <span className={styles["dv-title"]}>🎬 {data.label}</span>

          <div className={styles["dv-transform-modes"]}>
            <button
              className={`${styles["dv-mode-btn"]}${transformMode === "translate" ? " active" : ""}`}
              onClick={() => setTransformMode("translate")}
            >
              🖐 移动
            </button>
            <button
              className={`${styles["dv-mode-btn"]}${transformMode === "rotate" ? " active" : ""}`}
              onClick={() => setTransformMode("rotate")}
            >
              🔄 旋转
            </button>
            <button
              className={`${styles["dv-mode-btn"]}${transformMode === "scale" ? " active" : ""}`}
              onClick={() => setTransformMode("scale")}
            >
              🔍 缩放
            </button>
          </div>
        </div>

        <div className={styles["dv-toolbar-right"]}>
          <button className={styles["dv-btn"]} onClick={() => setShowExport(true)}>⬇ 导出</button>
          <button className={`${styles["dv-btn"]} ${styles["dv-btn-close"]}`} onClick={onClose}>✕ 关闭</button>
        </div>
      </div>

      {/* Main area */}
      <div className={styles["dv-main"]}>
        <div className={styles["dv-viewport"]}>
          <canvas ref={canvasRef} className={styles["dv-canvas"]} />
          <div className={styles["dv-viewport-label"]}>透视图</div>
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
