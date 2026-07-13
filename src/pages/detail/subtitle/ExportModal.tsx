import { useState } from "react";
import type { SubtitleItem, SubtitleStyle } from "../../../lib/types";
import BurnProgressOverlay from "./BurnProgressOverlay";
import "./ExportModal.css";

interface Props {
  items: SubtitleItem[];
  style: SubtitleStyle;
  nodeId: string;
  onClose: () => void;
}

type ExportFormat = "srt" | "ass" | "burn";

export default function ExportModal({ items, style, nodeId, onClose }: Props) {
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
        const assContent = toASS(items, style);
        const outputPath = await invoke<string>("export_with_subtitles", {
          videoPath: "",
          assContent,
          outputPath: "",
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
      <div className="export-modal-backdrop" onClick={onClose}>
        <div className="export-modal" onClick={(e) => e.stopPropagation()}>
          <h3>导出字幕</h3>

          <div className="export-option-group">
            <label>格式</label>
            <select value={format} onChange={(e) => setFormat(e.target.value as ExportFormat)}>
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

          <div className="export-actions">
            <button className="export-btn" onClick={onClose}>取消</button>
            <button className="export-btn primary" onClick={handleExport}>
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
