import { useState, useCallback, useRef, useEffect } from "react";

interface Region {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Props {
  videoAssetPath: string;
  nodeId: string;
  projectId: string;
  onClose: () => void;
  onReplaceVideo: (videoPath: string) => void;
}

type Step = "choose" | "region" | "processing" | "done" | "error";

export default function InpaintModal({
  videoAssetPath,
  nodeId: _nodeId,
  projectId,
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
      console.log("[inpaint] videoAssetPath:", videoAssetPath, "-> fullPath:", fullPath);

      const unlisten = await listen<{ frame: number; total: number; percent: number }>(
        "inpaint-progress",
        (event) => {
          setProgress(event.payload);
        }
      );

      const result = await invoke<string>("remove_hard_subtitles", {
        videoPath: fullPath,
        outputPath: "",
        projectId,
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
      <>
        <style>{`
          @keyframes inpaintFadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
          }
          .inpaint-choice-btn { background: #0d1117; border: 1px solid #30363d; }
          .inpaint-choice-btn:hover { border-color: #58a6ff; background: #161b22; }
          .inpaint-cancel-btn { border: 1px solid #30363d; background: transparent; color: #8b949e; }
          .inpaint-cancel-btn:hover { color: #e6edf3; }
        `}</style>
        <div
          className="fixed inset-0 z-[250] flex flex-col items-center justify-center"
          style={{
            background: "rgba(0,0,0,0.5)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            animation: "inpaintFadeIn 0.3s ease-out",
          }}
          onClick={onClose}
        >
          <div
            className="flex flex-col items-center gap-5 min-w-[360px] max-w-[800px] rounded-2xl px-10 py-8"
            style={{
              background: "#161b22",
              border: "1px solid #30363d",
              boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold m-0" style={{ color: "#e6edf3" }}>
              字幕擦除
            </h3>
            <div className="flex flex-col gap-3 w-full">
              <button
                className="inpaint-choice-btn flex flex-col gap-1 p-4 rounded-xl cursor-pointer text-left transition-colors duration-150"
                onClick={() => { setMode("hard"); setStep("region"); }}
              >
                <span className="text-sm font-semibold" style={{ color: "#e6edf3" }}>去除硬字幕</span>
                <span className="text-xs" style={{ color: "#8b949e" }}>使用画面修复技术擦除视频中烧录的字幕</span>
              </button>
              <button
                className="inpaint-choice-btn flex flex-col gap-1 p-4 rounded-xl cursor-pointer text-left transition-colors duration-150"
                onClick={() => { setMode("soft"); handleStripSoft(); }}
              >
                <span className="text-sm font-semibold" style={{ color: "#e6edf3" }}>去除软字幕</span>
                <span className="text-xs" style={{ color: "#8b949e" }}>剥离视频封装中的字幕轨道（秒级完成）</span>
              </button>
            </div>
            <button className="inpaint-cancel-btn px-5 py-2 rounded text-[13px] cursor-pointer transition-colors duration-150" onClick={onClose}>取消</button>
          </div>
        </div>
      </>
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
      <>
        <style>{`
          @keyframes inpaintFadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
          }
          @keyframes inpaintSpin {
            to { transform: rotate(360deg); }
          }
          .inpaint-btn { background: #21262d; color: #e6edf3; border: 1px solid #30363d; }
          .inpaint-btn:hover { background: #30363d; }
          .inpaint-btn.primary { background: #238636; color: #fff; border: 1px solid #238636; }
          .inpaint-btn.primary:hover { background: #2ea043; }
          .inpaint-cancel-btn { border: 1px solid #30363d; background: transparent; color: #8b949e; }
          .inpaint-cancel-btn:hover { color: #e6edf3; }
          .frame-img { -webkit-user-drag: none; }
        `}</style>
        <div
          className="fixed inset-0 z-[250] flex flex-col items-center justify-center"
          style={{
            background: "rgba(0,0,0,0.5)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            animation: "inpaintFadeIn 0.3s ease-out",
          }}
          onClick={onClose}
        >
          <div
            className="flex flex-col gap-4 px-8 py-6 rounded-2xl overflow-y-auto"
            style={{
              background: "#161b22",
              border: "1px solid #30363d",
              boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
              maxWidth: "900px",
              maxHeight: "90vh",
            }}
            onClick={(e) => e.stopPropagation()}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
          >
            <h3 className="text-base font-semibold m-0" style={{ color: "#e6edf3" }}>框选字幕区域</h3>

            <div className="relative inline-block leading-none rounded-lg overflow-hidden" style={{ border: "1px solid #30363d" }}>
              {frameUrl && (
                <img
                  ref={imgRef}
                  src={frameUrl}
                  className="frame-img block max-w-[800px] max-h-[450px] select-none"
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
                  <div
                    className="absolute pointer-events-none z-[1]"
                    style={{
                      background: "rgba(0,0,0,0.45)",
                      top: 0,
                      left: 0,
                      right: 0,
                      height: ry,
                    }}
                  />
                  <div
                    className="absolute left-0 right-0 flex z-[1]"
                    style={{ top: ry, height: rh }}
                  >
                    <div
                      className="absolute pointer-events-none z-[1]"
                      style={{
                        background: "rgba(0,0,0,0.45)",
                        top: 0,
                        bottom: 0,
                        left: 0,
                        width: rx,
                      }}
                    />
                    <div
                      className="relative border-2 border-dashed cursor-move z-[2]"
                      style={{
                        borderColor: "#58a6ff",
                        width: rw,
                        height: rh,
                      }}
                      onMouseDown={(e) => handleMouseDown(e, "move")}
                    >
                      <div
                        className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize"
                        style={{
                          background: "#58a6ff",
                          borderRadius: "0 0 2px 0",
                        }}
                        onMouseDown={(e) => { e.stopPropagation(); handleMouseDown(e, "corner"); }}
                      />
                      <div
                        className="absolute -bottom-1 left-1/4 right-1/4 h-2.5 cursor-ns-resize"
                        onMouseDown={(e) => { e.stopPropagation(); handleMouseDown(e, "edge"); }}
                      />
                    </div>
                    <div
                      className="absolute pointer-events-none z-[1]"
                      style={{
                        background: "rgba(0,0,0,0.45)",
                        top: 0,
                        bottom: 0,
                        right: 0,
                        width: Math.max(0, display.w - rx - rw),
                      }}
                    />
                  </div>
                  <div
                    className="absolute pointer-events-none z-[1]"
                    style={{
                      background: "rgba(0,0,0,0.45)",
                      left: 0,
                      right: 0,
                      top: ry + rh,
                      height: Math.max(0, display.h - ry - rh),
                    }}
                  />
                </>
              )}
            </div>

            <div className="flex items-center gap-4 text-xs flex-wrap" style={{ color: "#8b949e" }}>
              <span>x={region.x} y={region.y} w={region.width} h={region.height}</span>
              <label>
                预览帧时间:
                <input
                  type="number"
                  className="w-[60px] px-1.5 py-1 rounded text-xs mx-1"
                  style={{ background: "#0d1117", border: "1px solid #30363d", color: "#e6edf3" }}
                  value={timeInput}
                  onChange={(e) => setTimeInput(e.target.value)}
                  min="0"
                  step="1"
                />
                s
              </label>
              <button className="inpaint-btn px-5 py-2 rounded text-[13px] cursor-pointer transition-colors duration-150" onClick={handlePreview}>
                {previewUrl ? "刷新预览" : "预览效果"}
              </button>
            </div>

            {previewUrl && (
              <div className="flex gap-3 justify-center">
                <div>
                  <span className="block text-xs mb-1 text-center" style={{ color: "#8b949e" }}>原图</span>
                  <img src={frameUrl!} className="max-w-[350px] max-h-[200px] rounded" style={{ border: "1px solid #30363d" }} alt="original" />
                </div>
                <div>
                  <span className="block text-xs mb-1 text-center" style={{ color: "#8b949e" }}>修复后</span>
                  <img src={previewUrl} className="max-w-[350px] max-h-[200px] rounded" style={{ border: "1px solid #30363d" }} alt="preview" />
                </div>
              </div>
            )}

            <div className="flex gap-3 justify-center">
              <button className="inpaint-cancel-btn px-5 py-2 rounded text-[13px] cursor-pointer transition-colors duration-150" onClick={() => setStep("choose")}>上一步</button>
              <button className="inpaint-btn primary px-5 py-2 rounded text-[13px] cursor-pointer transition-colors duration-150" onClick={handleStartProcess}>开始擦除</button>
            </div>
          </div>
        </div>
      </>
    );
  }

  // --- Render: Processing ---
  if (step === "processing") {
    const isSoft = mode === "soft";
    return (
      <>
        <style>{`
          @keyframes inpaintFadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
          }
          @keyframes inpaintSpin {
            to { transform: rotate(360deg); }
          }
        `}</style>
        <div
          className="fixed inset-0 z-[250] flex flex-col items-center justify-center"
          style={{
            background: "rgba(0,0,0,0.5)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            animation: "inpaintFadeIn 0.3s ease-out",
          }}
        >
          <div
            className="flex flex-col items-center gap-5 min-w-[360px] max-w-[800px] rounded-2xl px-10 py-8"
            style={{
              background: "#161b22",
              border: "1px solid #30363d",
              boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
            }}
          >
            {isSoft ? (
              <>
                <div
                  className="w-10 h-10 rounded-full"
                  style={{
                    border: "3px solid #21262d",
                    borderTopColor: "#58a6ff",
                    animation: "inpaintSpin 0.8s linear infinite",
                  }}
                />
                <h3 className="text-base font-semibold m-0" style={{ color: "#e6edf3" }}>正在去除软字幕</h3>
                <p className="text-[13px] m-0" style={{ color: "#8b949e" }}>{processingMessage}</p>
              </>
            ) : (
              <>
                <div
                  className="w-10 h-10 rounded-full"
                  style={{
                    border: "3px solid #21262d",
                    borderTopColor: "#58a6ff",
                    animation: "inpaintSpin 0.8s linear infinite",
                  }}
                />
                <h3 className="text-base font-semibold m-0" style={{ color: "#e6edf3" }}>正在擦除硬字幕</h3>
                <div className="w-full h-1.5 rounded overflow-hidden" style={{ background: "#21262d" }}>
                  <div
                    className="h-full rounded"
                    style={{
                      background: "linear-gradient(90deg, #238636, #58a6ff)",
                      transition: "width 0.3s ease",
                      width: `${Math.min(progress.percent, 100)}%`,
                    }}
                  />
                </div>
                <p className="text-[13px] m-0" style={{ color: "#8b949e" }}>
                  {progress.percent > 0
                    ? `处理中 ${progress.percent}% (第 ${progress.frame} / ${progress.total} 帧)`
                    : "正在启动处理..."}
                </p>
              </>
            )}
          </div>
        </div>
      </>
    );
  }

  // --- Render: Done ---
  if (step === "done") {
    return (
      <>
        <style>{`
          @keyframes inpaintFadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
          }
          .inpaint-btn { background: #21262d; color: #e6edf3; border: 1px solid #30363d; }
          .inpaint-btn:hover { background: #30363d; }
          .inpaint-btn.primary { background: #238636; color: #fff; border: 1px solid #238636; }
          .inpaint-btn.primary:hover { background: #2ea043; }
        `}</style>
        <div
          className="fixed inset-0 z-[250] flex flex-col items-center justify-center"
          style={{
            background: "rgba(0,0,0,0.5)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            animation: "inpaintFadeIn 0.3s ease-out",
          }}
          onClick={onClose}
        >
          <div
            className="flex flex-col items-center gap-5 min-w-[360px] max-w-[800px] rounded-2xl px-10 py-8"
            style={{
              background: "#161b22",
              border: "1px solid #30363d",
              boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: "#238636" }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <h3 className="text-base font-semibold m-0" style={{ color: "#e6edf3" }}>擦除完成</h3>
            <p className="text-[13px] m-0" style={{ color: "#8b949e" }}>{outputPath.split("/").pop()}</p>
            <div className="flex gap-3 justify-center">
              <button className="inpaint-btn px-5 py-2 rounded text-[13px] cursor-pointer transition-colors duration-150" onClick={handleOpenFolder}>打开文件夹</button>
              <button className="inpaint-btn primary px-5 py-2 rounded text-[13px] cursor-pointer transition-colors duration-150" onClick={() => { onReplaceVideo(outputPath); onClose(); }}>替换原视频</button>
            </div>
          </div>
        </div>
      </>
    );
  }

  // --- Render: Error ---
  return (
    <>
      <style>{`
        @keyframes inpaintFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .inpaint-btn.primary { background: #238636; color: #fff; border: 1px solid #238636; }
        .inpaint-btn.primary:hover { background: #2ea043; }
      `}</style>
      <div
        className="fixed inset-0 z-[250] flex flex-col items-center justify-center"
        style={{
          background: "rgba(0,0,0,0.5)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          animation: "inpaintFadeIn 0.3s ease-out",
        }}
        onClick={onClose}
      >
        <div
          className="flex flex-col items-center gap-5 min-w-[360px] max-w-[800px] rounded-2xl px-10 py-8"
          style={{
            background: "#161b22",
            border: "1px solid #30363d",
            boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: "#da3633" }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </div>
          <h3 className="text-base font-semibold m-0" style={{ color: "#e6edf3" }}>擦除失败</h3>
          <p className="text-[13px] m-0" style={{ color: "#8b949e" }}>{errorMessage}</p>
          <button className="inpaint-btn primary px-5 py-2 rounded text-[13px] cursor-pointer transition-colors duration-150" onClick={onClose}>确定</button>
        </div>
      </div>
    </>
  );
}
