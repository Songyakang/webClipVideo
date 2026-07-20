import { useState, useCallback, type RefObject } from "react";
import type { CameraTrack } from "./types";
import { RESOLUTION_OPTIONS, DEFAULT_RESOLUTION } from "./types";
import { showToast } from "../../../lib/toast";
import styles from "./ExportMenu.module.css";

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
    <div className={styles["export-overlay"]} onClick={onClose}>
      <div className={styles["export-modal"]} onClick={(e) => e.stopPropagation()}>
        <h3>⬇ 导出</h3>

        <div className={styles["export-section"]}>
          <div className={styles["export-label"]}>渲染分辨率</div>
          <div className={styles["export-resolution-list"]}>
            {RESOLUTION_OPTIONS.map((opt) => (
              <button
                key={opt.label}
                className={`${styles["export-res-btn"]}${resolution.label === opt.label ? " active" : ""}`}
                onClick={() => setResolution(opt)}
              >
                {opt.width}×{opt.height}
                <span>{opt.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className={styles["export-actions"]}>
          <button
            className={styles["export-action-btn"]}
            disabled={exporting !== null}
            onClick={handleExportVideo}
          >
            {exporting === "video" ? "🎬 渲染中..." : "🎬 渲染视频"}
          </button>
          <button
            className={styles["export-action-btn"]}
            disabled={exporting !== null}
            onClick={handleExportFrame}
          >
            {exporting === "frame" ? "🖼 保存中..." : "🖼 截取参考帧"}
          </button>
          <button
            className={styles["export-action-btn"]}
            disabled={exporting !== null}
            onClick={handleExportCameraData}
          >
            {exporting === "camera" ? "📐 保存中..." : "📐 导出运镜数据"}
          </button>
        </div>

        <button className={styles["export-close-btn"]} onClick={onClose}>关闭</button>
      </div>
    </div>
  );
}
