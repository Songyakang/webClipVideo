import { useState, useCallback, type RefObject } from "react";
import type { CameraTrack } from "./types";
import { RESOLUTION_OPTIONS, DEFAULT_RESOLUTION } from "./types";
import { showToast } from "../../../lib/toast";

interface Props {
  projectId: string;
  cameraTrack: CameraTrack;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  onClose: () => void;
}

export default function ExportMenu({ projectId, cameraTrack, canvasRef, onClose }: Props) {
  const [resolution, setResolution] = useState(DEFAULT_RESOLUTION);
  const [exporting, setExporting] = useState<string | null>(null);

  const handleExportVideo = useCallback(async () => {
    setExporting("video");
    try {
      const canvas = canvasRef.current;
      if (!canvas) return;

      // Re-render at target resolution
      // For MVP: capture from current canvas at 1080p
      // Full implementation: re-render Orillusion at target res frame by frame
      const stream = canvas.captureStream(30);
      const recorder = new MediaRecorder(stream, { mimeType: "video/webm" });
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => chunks.push(e.data);
      recorder.onstop = async () => {
        const blob = new Blob(chunks, { type: "video/webm" });
        const arrayBuffer = await blob.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);

        // For MVP: save through Tauri FS plugin
        const { getAssetDir } = await import("../../../lib/assets");
        const baseDir = await getAssetDir();
        if (baseDir) {
          const { writeFile, mkdir, exists } = await import("@tauri-apps/plugin-fs");
          const exportDir = `${baseDir}/${projectId}/exports`;
          if (!(await exists(exportDir))) {
            await mkdir(exportDir, { recursive: true });
          }
          await writeFile(`${exportDir}/render_${Date.now()}.webm`, bytes);
        }
        setExporting(null);
      };
      recorder.start();
      setTimeout(() => recorder.stop(), 3000); // placeholder: record animation duration
    } catch (err) {
      console.error("Export video failed:", err);
      showToast("导出视频失败，请稍后重试", "error");
      setExporting(null);
    }
  }, [canvasRef, projectId]);

  const handleExportFrame = useCallback(async () => {
    setExporting("frame");
    try {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const dataUrl = canvas.toDataURL("image/png");

      // Convert base64 to bytes and save
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

  return (
    <>
      <style>{`
        .export-overlay { background: rgba(0, 0, 0, 0.6); }
        .export-modal { background: #12121e; border: 1px solid #2a2a4a; border-radius: 12px; }
        .export-modal h3 { color: #a78bfa; margin: 0 0 20px; font-size: 18px; }
        .export-label { color: #888; }
        .export-res-btn { background: #1a1a2e; border: 1px solid #333; border-radius: 6px; color: #999; }
        .export-res-btn span { display: block; font-size: 10px; color: #555; margin-top: 2px; }
        .export-res-btn.active { background: #2a2040; border-color: #7c3aed; color: #a78bfa; }
        .export-action-btn { background: #1a1a2e; border: 1px solid #333; border-radius: 8px; color: #ccc; }
        .export-action-btn:hover:not(:disabled) { background: #2a2a4a; border-color: #555; }
        .export-action-btn:disabled { opacity: 0.6; cursor: not-allowed; }
        .export-close-btn { background: transparent; border: 1px solid #333; border-radius: 6px; color: #888; }
      `}</style>
      <div className="export-overlay fixed inset-0 flex items-center justify-center" style={{ zIndex: 2000 }} onClick={onClose}>
        <div className="export-modal p-6 w-[480px] max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
          <h3>⬇ 导出</h3>

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
              {exporting === "video" ? "🎬 渲染中..." : "🎬 渲染视频"}
            </button>
            <button
              className="export-action-btn px-4 py-3 text-sm text-left cursor-pointer"
              disabled={exporting !== null}
              onClick={handleExportFrame}
            >
              {exporting === "frame" ? "🖼 保存中..." : "🖼 截取参考帧"}
            </button>
            <button
              className="export-action-btn px-4 py-3 text-sm text-left cursor-pointer"
              disabled={exporting !== null}
              onClick={handleExportCameraData}
            >
              {exporting === "camera" ? "📐 保存中..." : "📐 导出运镜数据"}
            </button>
          </div>

          <button className="export-close-btn w-full p-2 rounded-md cursor-pointer" onClick={onClose}>关闭</button>
        </div>
      </div>
    </>
  );
}
