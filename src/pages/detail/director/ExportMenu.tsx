import { useState, useCallback, type RefObject } from "react";
import type { CameraTrack, ConnectedScene } from "./types";
import { RESOLUTION_OPTIONS, DEFAULT_RESOLUTION } from "./types";
import { useRenderVideo } from "./useRenderVideo";
import { showToast } from "../../../lib/toast";
import { FilmIcon, CameraIcon, UploadIcon, DownloadIcon, LayoutIcon } from "./icons";

interface Props {
  projectId: string;
  cameraTrack: CameraTrack;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  onClose: () => void;
  onOutputToCanvas?: (videoAssetPath: string) => void;
  connectedScenes?: ConnectedScene[];
}

export default function ExportMenu({ projectId, cameraTrack, canvasRef, onClose, onOutputToCanvas, connectedScenes }: Props) {
  const [resolution, setResolution] = useState(DEFAULT_RESOLUTION);
  const [exporting, setExporting] = useState<string | null>(null);
  const { renderAnimation } = useRenderVideo();

  const trackDuration = cameraTrack.keyframes[cameraTrack.keyframes.length - 1]?.time ?? 5;

  const handleExportVideo = useCallback(async () => {
    setExporting("video");
    try {
      const canvas = canvasRef.current;
      if (!canvas) return;
      await renderAnimation(canvas, trackDuration, projectId);
      showToast("视频渲染完成", "success");
      setExporting(null);
    } catch (err) {
      console.error("Export video failed:", err);
      showToast("导出视频失败，请稍后重试", "error");
      setExporting(null);
    }
  }, [canvasRef, projectId, renderAnimation, trackDuration]);

  const handleOutputToCanvas = useCallback(async () => {
    if (!canvasRef.current) return;
    setExporting("output");
    try {
      const assetPath = await renderAnimation(canvasRef.current, trackDuration, projectId, "director_output");
      if (assetPath) {
        onOutputToCanvas?.(assetPath);
        showToast("已输出到画布", "success");
        onClose();
      }
    } catch {
      showToast("输出到画布失败", "error");
    } finally {
      setExporting(null);
    }
  }, [canvasRef, trackDuration, projectId, renderAnimation, onOutputToCanvas, onClose]);

  const handleExportFrame = useCallback(async () => {
    setExporting("frame");
    try {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const dataUrl = canvas.toDataURL("image/png");

      const base64 = dataUrl.split(",")[1];
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }

      const { getAssetDir } = await import("../../../lib/assets");
      const baseDir = await getAssetDir();
      if (baseDir) {
        const { writeFile, mkdir, exists } = await import("@tauri-apps/plugin-fs");
        const exportDir = `${baseDir}/${projectId}/exports`;
        if (!(await exists(exportDir))) {
          await mkdir(exportDir, { recursive: true });
        }
        await writeFile(`${exportDir}/frame_${Date.now()}.png`, bytes);
      }
      setExporting(null);
    } catch (err) {
      console.error("Export frame failed:", err);
      showToast("导出帧失败，请稍后重试", "error");
      setExporting(null);
    }
  }, [canvasRef, projectId]);

  const handleExportCameraData = useCallback(async () => {
    setExporting("camera");
    try {
      const data = {
        camera: cameraTrack.name,
        fov: cameraTrack.keyframes[0]?.fov ?? 45,
        easing: cameraTrack.easing,
        duration: cameraTrack.keyframes[cameraTrack.keyframes.length - 1]?.time ?? 0,
        keyframes: cameraTrack.keyframes.map((kf) => ({
          t: kf.time,
          pos: kf.position,
          lookAt: kf.lookAt,
        })),
      };

      const json = JSON.stringify(data, null, 2);
      const encoder = new TextEncoder();
      const bytes = encoder.encode(json);

      const { getAssetDir } = await import("../../../lib/assets");
      const baseDir = await getAssetDir();
      if (baseDir) {
        const { writeFile, mkdir, exists } = await import("@tauri-apps/plugin-fs");
        const exportDir = `${baseDir}/${projectId}/exports`;
        if (!(await exists(exportDir))) {
          await mkdir(exportDir, { recursive: true });
        }
        await writeFile(`${exportDir}/camera_${Date.now()}.json`, bytes);
      }
      setExporting(null);
    } catch (err) {
      console.error("Export camera data failed:", err);
      showToast("导出运镜数据失败，请稍后重试", "error");
      setExporting(null);
    }
  }, [cameraTrack, projectId]);

  const handleExportSequence = useCallback(async () => {
    if (!canvasRef.current || !connectedScenes) return;
    setExporting("sequence");
    try {
      const canvas = canvasRef.current;
      const label = (n: number) => `scene_${n}`;
      await renderAnimation(canvas, trackDuration, projectId, label(0));
      for (let i = 0; i < connectedScenes.length; i++) {
        const scene = connectedScenes[i];
        const sceneTrack = scene.data.cameraTracks[0];
        const sceneDuration = sceneTrack?.keyframes[sceneTrack.keyframes.length - 1]?.time ?? 5;
        await renderAnimation(canvas, sceneDuration, projectId, label(i + 1));
      }
      showToast(`场景序列渲染完成 (${connectedScenes.length + 1} 个场景)`, "success");
    } catch (err) {
      console.error("Sequence render failed:", err);
      showToast("场景序列渲染失败", "error");
    } finally {
      setExporting(null);
    }
  }, [canvasRef, connectedScenes, trackDuration, projectId, renderAnimation]);

  return (
    <>
      <style>{`
        .export-overlay { background: rgba(0, 0, 0, 0.6); }
        .export-modal { background: #161b22; border: 1px solid #21262d; border-radius: 12px; }
        .export-modal h3 { color: #58a6ff; margin: 0 0 20px; font-size: 18px; }
        .export-label { color: #8b949e; }
        .export-res-btn { background: #0d1117; border: 1px solid #30363d; border-radius: 6px; color: #8b949e; transition: background 0.15s; }
        .export-res-btn:hover { background: #21262d; }
        .export-res-btn span { display: block; font-size: 10px; color: #484f58; margin-top: 2px; }
        .export-res-btn.active { background: #1a3a5c; border-color: #58a6ff; color: #58a6ff; }
        .export-action-btn { background: #0d1117; border: 1px solid #30363d; border-radius: 8px; color: #c9d1d9; transition: background 0.15s; }
        .export-action-btn:hover:not(:disabled) { background: #21262d; border-color: #58a6ff; }
        .export-action-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .export-close-btn { background: transparent; border: 1px solid #30363d; border-radius: 6px; color: #8b949e; transition: background 0.15s; cursor: pointer; }
        .export-close-btn:hover { background: #21262d; color: #c9d1d9; }
      `}</style>
      <div className="export-overlay fixed inset-0 flex items-center justify-center" style={{ zIndex: 2000 }} onClick={onClose}>
        <div className="export-modal p-6 w-[480px] max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
          <h3 className="flex items-center gap-1.5"><DownloadIcon /> 导出</h3>

          <div className="mb-5">
            <div className="export-label text-sm mb-2">渲染分辨率</div>
            <div className="flex gap-2 flex-wrap">
              {RESOLUTION_OPTIONS.map((opt) => (
                <button
                  key={opt.label}
                  className={`export-res-btn px-3.5 py-2 text-xs text-center cursor-pointer${resolution.label === opt.label ? " active" : ""}`}
                  onClick={() => setResolution(opt)}
                >
                  {opt.width}×{opt.height}
                  <span>{opt.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2 mb-4">
            <button
              className="export-action-btn px-4 py-3 text-sm text-left cursor-pointer"
              disabled={exporting !== null}
              onClick={handleExportVideo}
            >
              <FilmIcon /> {exporting === "video" ? "渲染中..." : `渲染视频 (${trackDuration}s)`}
            </button>
            <button
              className="export-action-btn px-4 py-3 text-sm text-left cursor-pointer"
              disabled={exporting !== null}
              onClick={handleExportFrame}
            >
              <CameraIcon /> {exporting === "frame" ? "保存中..." : "截取参考帧"}
            </button>
            <button
              className="export-action-btn px-4 py-3 text-sm text-left cursor-pointer"
              disabled={exporting !== null}
              onClick={handleExportCameraData}
            >
              <DownloadIcon /> {exporting === "camera" ? "保存中..." : "导出运镜数据"}
            </button>
            {onOutputToCanvas && (
              <button
                className="export-action-btn px-4 py-3 text-sm text-left cursor-pointer"
                disabled={exporting !== null}
                onClick={handleOutputToCanvas}
              >
                <UploadIcon /> {exporting === "output" ? "输出中..." : "输出到画布"}
              </button>
            )}
          </div>

          {connectedScenes && connectedScenes.length > 0 && (
            <div className="mb-4">
              <div className="export-label text-sm mb-2">场景序列 ({connectedScenes.length + 1} 个场景)</div>
              <div className="flex flex-col gap-1 mb-3">
                <div className="flex items-center gap-2 px-2 py-1 rounded text-xs" style={{ background: "#1a1a2e" }}>
                  <span className="w-2 h-2 rounded-full" style={{ background: "#4ade80" }} />
                  {cameraTrack.name} (当前)
                </div>
                {connectedScenes.map((scene) => (
                  <div key={scene.nodeId} className="flex items-center gap-2 px-2 py-1 rounded text-xs" style={{ background: "#1a1a2e" }}>
                    <span className="w-2 h-2 rounded-full" style={{ background: "#60a5fa" }} />
                    {scene.data.label}
                  </div>
                ))}
              </div>
              <button
                className="export-action-btn px-4 py-3 text-sm text-left cursor-pointer w-full"
                disabled={exporting !== null}
                onClick={handleExportSequence}
              >
                <LayoutIcon /> {exporting === "sequence" ? "渲染场景序列中..." : "渲染完整场景序列"}
              </button>
            </div>
          )}

          <button className="export-close-btn w-full p-2 rounded-md cursor-pointer" onClick={onClose}>关闭</button>
        </div>
      </div>
    </>
  );
}
