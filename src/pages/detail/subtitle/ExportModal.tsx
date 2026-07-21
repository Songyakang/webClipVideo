import { useState } from "react";
import type { SubtitleItem, SubtitleStyle, AudioReplacement } from "../../../lib/types";
import BurnProgressOverlay from "./BurnProgressOverlay";

interface Props {
  items: SubtitleItem[];
  style: SubtitleStyle;
  nodeId: string;
  videoAssetPath: string;
  audioMap: Map<string, string>;
  onClose: () => void;
}

type ExportFormat = "srt" | "ass" | "burn";

export default function ExportModal({ items, style, nodeId, videoAssetPath, audioMap, onClose }: Props) {
  const [format, setFormat] = useState<ExportFormat>("srt");
  const [burnStatus, setBurnStatus] = useState<"encoding" | "done" | "error" | null>(null);
  const [burnMessage, setBurnMessage] = useState("");

  const handleExport = async () => {
    if (format === "srt") {
      const { toSRT } = await import("./utils");
      const content = toSRT(items);
      downloadFile(content, `subtitle-${nodeId}.srt`);
    } else if (format === "ass") {
      const { toASS } = await import("./utils");
      const content = toASS(items, style);
      downloadFile(content, `subtitle-${nodeId}.ass`);
    } else {
      setBurnStatus("encoding");
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const { toASS } = await import("./utils");
        const { resolveAssetPath } = await import("../../../lib/assets");
        const assContent = toASS(items, style);
        const fullVideoPath = await resolveAssetPath(videoAssetPath);

        // 构造 AudioReplacement 列表
        const replacements: AudioReplacement[] = [];
        audioMap.forEach((wavPath, itemId) => {
          const item = items.find((it) => it.id === itemId);
          if (item) {
            replacements.push({
              startTime: item.startTime,
              endTime: item.endTime,
              wavPath,
            });
          }
        });

        const outputPath = await invoke<string>("burn_with_synthetic_audio", {
          videoPath: fullVideoPath,
          assContent,
          replacements,
        });
        setBurnMessage(`已保存至: ${outputPath}`);
        setBurnStatus("done");
      } catch (err) {
        console.error("Export failed:", err);
        setBurnMessage(err instanceof Error ? err.message : "FFmpeg 编码失败");
        setBurnStatus("error");
      }
      return; // don't call onClose yet — wait for user to dismiss progress overlay
    }
    onClose();
  };

  return (
    <>
      <style>{`
        .export-btn { background: #21262d; color: #c9d1d9; border: 1px solid #30363d; }
        .export-btn:hover { background: #30363d; }
        .export-btn.primary { background: #238636; color: #fff; border: 1px solid rgba(240, 246, 252, 0.1); }
        .export-btn.primary:hover { background: #2ea043; }
        .exp-select { background: #0d1117; border: 1px solid #30363d; color: #e6edf3; }
        .exp-select:focus { border-color: #58a6ff; }
      `}</style>
      <div className="fixed inset-0 z-[200] flex items-center justify-center" style={{ background: "rgba(0,0,0,0.6)" }} onClick={onClose}>
        <div
          className="flex flex-col gap-4 p-6 w-[400px] max-w-[90vw] rounded-xl"
          style={{ background: "#161b22", border: "1px solid #30363d" }}
          onClick={(e) => e.stopPropagation()}
        >
          <h3 className="m-0 text-base" style={{ color: "#e6edf3" }}>
            导出字幕
          </h3>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-[0.5px]" style={{ color: "#8b949e" }}>
              格式
            </label>
            <select
              className="exp-select px-2.5 py-1.5 rounded text-[13px] cursor-pointer outline-none"
              value={format}
              onChange={(e) => setFormat(e.target.value as ExportFormat)}
            >
              <option value="srt">SRT 字幕文件</option>
              <option value="ass">ASS 字幕文件（带样式）</option>
              <option value="burn">烧录到视频（硬字幕）</option>
            </select>
          </div>

          {format === "burn" && (
            <p style={{ fontSize: 12, color: "#8b949e", margin: 0 }}>
              将通过 FFmpeg 将字幕烧录到视频中，需要重新编码，耗时较长。
            </p>
          )}

          <div className="flex justify-end gap-2 mt-1">
            <button
              className="export-btn px-5 py-2 rounded text-[13px] cursor-pointer transition-colors duration-150"
              onClick={onClose}
            >
              取消
            </button>
            <button
              className="export-btn primary px-5 py-2 rounded text-[13px] cursor-pointer transition-colors duration-150"
              onClick={handleExport}
            >
              导出
            </button>
          </div>
        </div>
      </div>
      {burnStatus && (
        <BurnProgressOverlay
          status={burnStatus}
          message={burnMessage}
          onClose={() => {
            setBurnStatus(null);
            onClose();
          }}
        />
      )}
    </>
  );
}

function downloadFile(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
