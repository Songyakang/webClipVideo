import { useState, useCallback, useRef, useEffect } from "react";
import "./InpaintModal.css";

interface Region {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Props {
  videoAssetPath: string;
  nodeId: string;
  onClose: () => void;
  onReplaceVideo: (videoPath: string) => void;
}

type Step = "choose" | "region" | "processing" | "done" | "error";

export default function InpaintModal({
  videoAssetPath,
  nodeId: _nodeId,
  onClose,
  onReplaceVideo,
}: Props) {
  const [step, setStep] = useState<Step>("choose");
  const [mode, setMode] = useState<"hard" | "soft" | null>(null);

  // Region picking state
  const [frameUrl, setFrameUrl] = useState<string | null>(null);
  const [frameNaturalSize, setFrameNaturalSize] = useState({ w: 0, h: 0 });
  const [region, setRegion] = useState<Region>({ x: 0, y: 0, width: 0, height: 0 });
  const [dragging, setDragging] = useState<"corner" | "move" | "edge" | null>(null);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [regionStart, setRegionStart] = useState<Region>({ x: 0, y: 0, width: 0, height: 0 });
  const [timeInput, setTimeInput] = useState("0");

  // Processing state
  const [progress, setProgress] = useState({ percent: 0, frame: 0, total: 0 });
  const [processingMessage, setProcessingMessage] = useState("");

  // Result state
  const [outputPath, setOutputPath] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const imgRef = useRef<HTMLImageElement>(null);

  // Load frame via hidden video element + canvas capture
  const loadFrame = useCallback(async () => {
    try {
      const { getAssetSrc } = await import("../../../lib/assets");
      const src = await getAssetSrc(videoAssetPath);
      if (!src) {
        console.error("Failed to resolve asset URL");
        return;
      }

      const video = document.createElement("video");
      video.src = src;
      video.crossOrigin = "anonymous";
      video.preload = "metadata";

      await new Promise<void>((resolve, reject) => {
        video.onloadedmetadata = () => {
          video.currentTime = parseFloat(timeInput) || 1;
        };
        video.onseeked = () => {
          const canvas = document.createElement("canvas");
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          const ctx = canvas.getContext("2d")!;
          ctx.drawImage(video, 0, 0);
          const dataUrl = canvas.toDataURL("image/png");
          setFrameUrl(dataUrl);
          setFrameNaturalSize({ w: video.videoWidth, h: video.videoHeight });
          resolve();
        };
        video.onerror = () => reject(new Error("Failed to load video"));
      });
    } catch (err) {
      console.error("Failed to load frame:", err);
    }
  }, [videoAssetPath, timeInput]);

  useEffect(() => {
    if (step === "region") {
      loadFrame();
    }
  }, [step, loadFrame]);

  // Region picker mouse handlers
  const getDisplaySize = () => {
    const img = imgRef.current;
    if (!img) return { w: 0, h: 0, scaleX: 1, scaleY: 1 };
    const rect = img.getBoundingClientRect();
    const scaleX = frameNaturalSize.w / rect.width;
    const scaleY = frameNaturalSize.h / rect.height;
    return { w: rect.width, h: rect.height, scaleX, scaleY };
  };

  const handleMouseDown = (e: React.MouseEvent, action: "corner" | "move" | "edge") => {
    e.preventDefault();
    setDragging(action);
    setDragStart({ x: e.clientX, y: e.clientY });
    setRegionStart({ ...region });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragging) return;
    const { scaleX, scaleY } = getDisplaySize();
    const dx = (e.clientX - dragStart.x) * scaleX;
    const dy = (e.clientY - dragStart.y) * scaleY;

    const newRegion = { ...regionStart };

    if (dragging === "move") {
      newRegion.x = Math.max(0, Math.min(frameNaturalSize.w - newRegion.width, regionStart.x + dx));
      newRegion.y = Math.max(0, Math.min(frameNaturalSize.h - newRegion.height, regionStart.y + dy));
    } else if (dragging === "corner") {
      newRegion.width = Math.max(10, regionStart.width + dx);
      newRegion.height = Math.max(10, regionStart.height + dy);
    } else if (dragging === "edge") {
      newRegion.height = Math.max(10, regionStart.height + dy);
    }

    newRegion.x = Math.round(Math.max(0, Math.min(frameNaturalSize.w - newRegion.width, newRegion.x)));
    newRegion.y = Math.round(Math.max(0, Math.min(frameNaturalSize.h - newRegion.height, newRegion.y)));
    newRegion.width = Math.round(newRegion.width);
    newRegion.height = Math.round(newRegion.height);

    setRegion(newRegion);
  };

  const handleMouseUp = () => {
    setDragging(null);
  };

  // Preview
  const handlePreview = async () => {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const { resolveAssetPath } = await import("../../../lib/assets");
      const fullPath = videoAssetPath.startsWith("/")
        ? videoAssetPath
        : await resolveAssetPath(videoAssetPath);
      const timeSec = parseFloat(timeInput) || 0;
      const resultPath = await invoke<string>("preview_inpaint_frame", {
        videoPath: fullPath,
        timeSec,
        x: region.x,
        y: region.y,
        width: region.width,
        height: region.height,
      });
      setPreviewUrl(`file://${resultPath}`);
    } catch (err) {
      console.error("Preview failed:", err);
    }
  };

  // Process
  const handleStartProcess = async () => {
    setStep("processing");
    setProcessingMessage("正在擦除硬字幕...");

    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const { listen } = await import("@tauri-apps/api/event");
      const { resolveAssetPath } = await import("../../../lib/assets");
      const fullPath = videoAssetPath.startsWith("/")
        ? videoAssetPath
        : await resolveAssetPath(videoAssetPath);
      console.log("[inpaint] videoAssetPath:", videoAssetPath, "→ fullPath:", fullPath);

      const unlisten = await listen<{ frame: number; total: number; percent: number }>(
        "inpaint-progress",
        (event) => {
          setProgress(event.payload);
        }
      );

      const result = await invoke<string>("remove_hard_subtitles", {
        videoPath: fullPath,
        outputPath: "",
        x: region.x,
        y: region.y,
        width: region.width,
        height: region.height,
        stripSoftSubtitles: false,
      });

      unlisten();
      setOutputPath(result);
      setStep("done");
    } catch (err) {
      console.error("Inpainting failed:", err);
      setErrorMessage(String(err));
      setStep("error");
    }
  };

  const handleStripSoft = async () => {
    setStep("processing");
    setProcessingMessage("正在去除软字幕...");

    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const { resolveAssetPath } = await import("../../../lib/assets");
      const fullPath = videoAssetPath.startsWith("/")
        ? videoAssetPath
        : await resolveAssetPath(videoAssetPath);

      const result = await invoke<string>("strip_soft_subtitles", {
        videoPath: fullPath,
      });

      setOutputPath(result);
      setStep("done");
    } catch (err) {
      console.error("Soft subtitle removal failed:", err);
      setErrorMessage(String(err));
      setStep("error");
    }
  };

  const handleOpenFolder = async () => {
    try {
      const dir = outputPath.substring(0, outputPath.lastIndexOf("/"));
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("plugin:opener|open_path", { path: dir }).catch(() => {
        console.log("Output:", outputPath);
      });
    } catch {
      console.log("Output:", outputPath);
    }
  };

  // --- Render: Choose type ---
  if (step === "choose") {
    return (
      <div className="inpaint-overlay" onClick={onClose}>
        <div className="inpaint-card" onClick={(e) => e.stopPropagation()}>
          <h3 className="inpaint-title">字幕擦除</h3>
          <div className="inpaint-choices">
            <button
              className="inpaint-choice-btn"
              onClick={() => { setMode("hard"); setStep("region"); }}
            >
              <span className="inpaint-choice-label">去除硬字幕</span>
              <span className="inpaint-choice-desc">使用画面修复技术擦除视频中烧录的字幕</span>
            </button>
            <button
              className="inpaint-choice-btn"
              onClick={() => { setMode("soft"); handleStripSoft(); }}
            >
              <span className="inpaint-choice-label">去除软字幕</span>
              <span className="inpaint-choice-desc">剥离视频封装中的字幕轨道（秒级完成）</span>
            </button>
          </div>
          <button className="inpaint-cancel-btn" onClick={onClose}>取消</button>
        </div>
      </div>
    );
  }

  // --- Render: Region picker ---
  if (step === "region") {
    const display = getDisplaySize();
    const scaleX = display.w / Math.max(frameNaturalSize.w, 1);
    const scaleY = display.h / Math.max(frameNaturalSize.h, 1);
    const rx = region.x * scaleX;
    const ry = region.y * scaleY;
    const rw = region.width * scaleX;
    const rh = region.height * scaleY;

    return (
      <div className="inpaint-overlay" onClick={onClose}>
        <div
          className="inpaint-region-card"
          onClick={(e) => e.stopPropagation()}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
        >
          <h3 className="inpaint-title">框选字幕区域</h3>

          <div className="inpaint-frame-wrap">
            {frameUrl && (
              <img
                ref={imgRef}
                src={frameUrl}
                className="inpaint-frame-img"
                onLoad={(e) => {
                  const img = e.currentTarget;
                  setFrameNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
                  const h = Math.round(img.naturalHeight * 0.15);
                  const y = img.naturalHeight - h;
                  setRegion({ x: 0, y, width: img.naturalWidth, height: h });
                }}
                draggable={false}
              />
            )}

            {/* Selection overlay */}
            {frameNaturalSize.w > 0 && (
              <>
                <div className="inpaint-mask-top" style={{ height: ry }} />
                <div className="inpaint-mask-middle" style={{ top: ry, height: rh }}>
                  <div className="inpaint-mask-left" style={{ width: rx }} />
                  <div
                    className="inpaint-selection"
                    style={{ width: rw, height: rh }}
                    onMouseDown={(e) => handleMouseDown(e, "move")}
                  >
                    <div className="inpaint-sel-corner" onMouseDown={(e) => { e.stopPropagation(); handleMouseDown(e, "corner"); }} />
                    <div className="inpaint-sel-edge" onMouseDown={(e) => { e.stopPropagation(); handleMouseDown(e, "edge"); }} />
                  </div>
                  <div className="inpaint-mask-right" style={{ width: Math.max(0, display.w - rx - rw) }} />
                </div>
                <div className="inpaint-mask-bottom" style={{ top: ry + rh, height: Math.max(0, display.h - ry - rh) }} />
              </>
            )}
          </div>

          <div className="inpaint-region-info">
            <span>x={region.x} y={region.y} w={region.width} h={region.height}</span>
            <label>
              预览帧时间:
              <input
                type="number"
                className="inpaint-time-input"
                value={timeInput}
                onChange={(e) => setTimeInput(e.target.value)}
                min="0"
                step="1"
              />
              s
            </label>
            <button className="inpaint-btn secondary" onClick={handlePreview}>
              {previewUrl ? "刷新预览" : "预览效果"}
            </button>
          </div>

          {previewUrl && (
            <div className="inpaint-preview-row">
              <div>
                <span className="inpaint-preview-label">原图</span>
                <img src={frameUrl!} className="inpaint-preview-img" alt="original" />
              </div>
              <div>
                <span className="inpaint-preview-label">修复后</span>
                <img src={previewUrl} className="inpaint-preview-img" alt="preview" />
              </div>
            </div>
          )}

          <div className="inpaint-actions">
            <button className="inpaint-cancel-btn" onClick={() => setStep("choose")}>上一步</button>
            <button className="inpaint-btn primary" onClick={handleStartProcess}>开始擦除</button>
          </div>
        </div>
      </div>
    );
  }

  // --- Render: Processing ---
  if (step === "processing") {
    const isSoft = mode === "soft";
    return (
      <div className="inpaint-overlay">
        <div className="inpaint-card">
          {isSoft ? (
            <>
              <div className="inpaint-spinner" />
              <h3 className="inpaint-title">正在去除软字幕</h3>
              <p className="inpaint-message">{processingMessage}</p>
            </>
          ) : (
            <>
              <div className="inpaint-spinner" />
              <h3 className="inpaint-title">正在擦除硬字幕</h3>
              <div className="inpaint-progress-track">
                <div
                  className="inpaint-progress-fill"
                  style={{ width: `${Math.min(progress.percent, 100)}%`, animation: "none" }}
                />
              </div>
              <p className="inpaint-message">
                {progress.percent > 0
                  ? `处理中 ${progress.percent}% (第 ${progress.frame} / ${progress.total} 帧)`
                  : "正在启动处理..."}
              </p>
            </>
          )}
        </div>
      </div>
    );
  }

  // --- Render: Done ---
  if (step === "done") {
    return (
      <div className="inpaint-overlay" onClick={onClose}>
        <div className="inpaint-card" onClick={(e) => e.stopPropagation()}>
          <div className="inpaint-done-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <h3 className="inpaint-title">擦除完成</h3>
          <p className="inpaint-message">{outputPath.split("/").pop()}</p>
          <div className="inpaint-actions">
            <button className="inpaint-btn secondary" onClick={handleOpenFolder}>打开文件夹</button>
            <button className="inpaint-btn primary" onClick={() => { onReplaceVideo(outputPath); onClose(); }}>替换原视频</button>
          </div>
        </div>
      </div>
    );
  }

  // --- Render: Error ---
  return (
    <div className="inpaint-overlay" onClick={onClose}>
      <div className="inpaint-card" onClick={(e) => e.stopPropagation()}>
        <div className="inpaint-error-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </div>
        <h3 className="inpaint-title">擦除失败</h3>
        <p className="inpaint-message">{errorMessage}</p>
        <button className="inpaint-btn primary" onClick={onClose}>确定</button>
      </div>
    </div>
  );
}
