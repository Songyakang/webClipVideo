import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { TimelineData } from "./types";

interface Props {
  data: TimelineData;
  onClose: () => void;
}

export default function TimelineExportModal({ data, onClose }: Props) {
  const [width, setWidth] = useState(1920);
  const [height, setHeight] = useState(1080);
  const [fps, setFps] = useState(data.fps || 30);
  const [exporting, setExporting] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleExport = useCallback(async () => {
    setExporting(true);
    setError(null);

    // Collect all clips from all tracks
    const clips = data.tracks.flatMap((track) =>
      track.clips
        .filter((c) => c.assetPath)
        .map((c) => ({
          assetPath: c.assetPath!,
          sourceStart: c.sourceStart,
          sourceEnd: c.sourceEnd || c.sourceStart + c.duration,
          startTime: c.startTime,
          duration: c.duration,
          clipType: c.type,
          filter: c.filter || undefined,
        })),
    );

    if (clips.length === 0) {
      setError("时间线上没有可导出的素材片段");
      setExporting(false);
      return;
    }

    try {
      const outputPath = await invoke<string>("render_timeline", {
        request: {
          clips,
          outputWidth: width,
          outputHeight: height,
          fps,
        },
      });
      setResult(outputPath);
    } catch (e: any) {
      setError(typeof e === "string" ? e : e.message || "导出失败");
    } finally {
      setExporting(false);
    }
  }, [data, width, height, fps]);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1200,
        background: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 400,
          background: "#161b22",
          borderRadius: 8,
          border: "1px solid #30363d",
          padding: 20,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 16,
          }}
        >
          <span style={{ color: "#c9d1d9", fontWeight: 600, fontSize: 15 }}>
            导出视频
          </span>
          <button onClick={onClose} style={closeBtn}>✕</button>
        </div>

        {result ? (
          <div>
            <div style={{ color: "#2ea043", fontSize: 13, marginBottom: 8 }}>
              ✅ 导出成功！
            </div>
            <div
              style={{
                color: "#8b949e",
                fontSize: 11,
                fontFamily: "monospace",
                wordBreak: "break-all",
                marginBottom: 12,
                padding: "6px 8px",
                background: "#0d1117",
                borderRadius: 4,
                border: "1px solid #21262d",
              }}
            >
              {result}
            </div>
            <button
              onClick={onClose}
              style={{
                width: "100%",
                padding: "8px",
                background: "#238636",
                border: "none",
                borderRadius: 6,
                color: "#fff",
                cursor: "pointer",
                fontSize: 13,
              }}
            >
              完成
            </button>
          </div>
        ) : (
          <>
            {/* Resolution */}
            <div style={{ marginBottom: 12 }}>
              <label style={{ color: "#8b949e", fontSize: 11, display: "block", marginBottom: 4 }}>
                分辨率
              </label>
              <select
                value={`${width}x${height}`}
                onChange={(e) => {
                  const [w, h] = e.target.value.split("x").map(Number);
                  setWidth(w);
                  setHeight(h);
                }}
                style={{
                  width: "100%",
                  padding: "6px 8px",
                  background: "#0d1117",
                  border: "1px solid #30363d",
                  borderRadius: 4,
                  color: "#c9d1d9",
                  fontSize: 12,
                  outline: "none",
                }}
              >
                <option value="1920x1080">1080p (1920×1080)</option>
                <option value="1280x720">720p (1280×720)</option>
                <option value="3840x2160">4K (3840×2160)</option>
              </select>
            </div>

            {/* FPS */}
            <div style={{ marginBottom: 12 }}>
              <label style={{ color: "#8b949e", fontSize: 11, display: "block", marginBottom: 4 }}>
                帧率 (FPS)
              </label>
              <select
                value={fps}
                onChange={(e) => setFps(Number(e.target.value))}
                style={{
                  width: "100%",
                  padding: "6px 8px",
                  background: "#0d1117",
                  border: "1px solid #30363d",
                  borderRadius: 4,
                  color: "#c9d1d9",
                  fontSize: 12,
                  outline: "none",
                }}
              >
                <option value={24}>24 fps</option>
                <option value={30}>30 fps</option>
                <option value={60}>60 fps</option>
              </select>
            </div>

            {/* Clip count */}
            <div style={{ color: "#484f58", fontSize: 11, marginBottom: 16 }}>
              共 {data.tracks.reduce((s, t) => s + t.clips.length, 0)} 个片段
            </div>

            {error && (
              <div style={{ color: "#f85149", fontSize: 12, marginBottom: 12 }}>{error}</div>
            )}

            <button
              onClick={handleExport}
              disabled={exporting}
              style={{
                width: "100%",
                padding: "8px",
                background: exporting ? "#21262d" : "#f0883e",
                border: "none",
                borderRadius: 6,
                color: "#fff",
                cursor: exporting ? "not-allowed" : "pointer",
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              {exporting ? "导出中..." : "开始导出"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

const closeBtn: React.CSSProperties = {
  background: "none",
  border: "none",
  color: "#8b949e",
  cursor: "pointer",
  fontSize: 16,
};
