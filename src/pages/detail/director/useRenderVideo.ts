import { useCallback } from "react";
import { showToast } from "../../../lib/toast";

export function useRenderVideo() {
  const renderAnimation = useCallback(async (
    canvas: HTMLCanvasElement,
    duration: number,
    projectId: string,
    fileName?: string,
  ): Promise<string | null> => {
    const stream = canvas.captureStream(30);
    const recorder = new MediaRecorder(stream, { mimeType: "video/webm" });

    return new Promise((resolve) => {
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => chunks.push(e.data);
      recorder.onstop = async () => {
        try {
          const blob = new Blob(chunks, { type: "video/webm" });
          const arrayBuffer = await blob.arrayBuffer();
          const bytes = new Uint8Array(arrayBuffer);

          const { getAssetDir } = await import("../../../lib/assets");
          const baseDir = await getAssetDir();
          if (!baseDir) {
            showToast("无法获取导出目录", "error");
            resolve(null);
            return;
          }

          const { writeFile, mkdir, exists } = await import("@tauri-apps/plugin-fs");
          const exportDir = `${baseDir}/${projectId}/exports`;
          if (!(await exists(exportDir))) {
            await mkdir(exportDir, { recursive: true });
          }

          const name = fileName ? `${fileName}_${Date.now()}` : `render_${Date.now()}`;
          await writeFile(`${exportDir}/${name}.webm`, bytes);

          resolve(`${projectId}/exports/${name}.webm`);
        } catch (err) {
          console.error("Export video failed:", err);
          showToast("导出视频失败", "error");
          resolve(null);
        }
      };

      recorder.start();
      setTimeout(() => recorder.stop(), Math.max(duration * 1000, 500));
    });
  }, []);

  return { renderAnimation };
}
