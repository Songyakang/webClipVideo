import { useRef, useEffect, useState, useCallback } from "react";
import type { ConnectedScene, DirectorNodeData, SceneModel, TransformMode } from "./types";
import { useDirectorEngine, updateCameraFromKeyframe } from "./useDirectorEngine";
import { useCameraAnimation } from "./useCameraAnimation";
import { useRenderVideo } from "./useRenderVideo";
import ScenePanel from "./ScenePanel";
import KeyframeTimeline from "./KeyframeTimeline";
import ExportMenu from "./ExportMenu";
import DirectorAssetPanel from "./DirectorAssetPanel";
import WebGPUGuard from "./WebGPUCheck";
import { showToast } from "../../../lib/toast";
import { FilmIcon, MoveIcon, RotateIcon, ScaleIcon, FolderIcon, CameraIcon as ScreenshotIcon, MaximizeIcon, UploadIcon, DownloadIcon, XIcon, SearchIcon, VideoIcon, BoxIcon, EyeIcon, EyeOffIcon } from "./icons";

interface Props {
  data: DirectorNodeData;
  onClose: () => void;
  onUpdate: (data: DirectorNodeData) => void;
  projectId: string;
  onOutputToCanvas?: (videoAssetPath: string) => void;
  connectedScenes?: ConnectedScene[];
  onAddModelFromAsset?: (assetPath: string) => void;
}

/* ---------- 左侧场景面板 ---------- */
function LeftPanel({
  models,
  cameraTracks,
  activeModelId,
  activeCameraId,
  onModelSelect,
  onCameraChange,
  onCameraToggle,
}: {
  models: SceneModel[];
  cameraTracks: { id: string; name: string; enabled: boolean }[];
  activeModelId: string | null;
  activeCameraId: string;
  onModelSelect: (id: string) => void;
  onCameraChange: (id: string) => void;
  onCameraToggle: (id: string, enabled: boolean) => void;
}) {
  const [search, setSearch] = useState("");
  const filteredModels = search ? models.filter((m) => m.name.toLowerCase().includes(search.toLowerCase())) : models;

  return (
    <div className="flex flex-col h-full" style={{ background: "#161b22", borderRight: "1px solid #21262d", width: 220 }}>
      <div className="flex flex-col px-3 py-5 gap-4 flex-1 min-h-0">
        <div className="flex items-center px-3">
          <span className="text-sm font-medium" style={{ color: "#e6edf3" }}>场景</span>
        </div>

        {/* Search */}
        <label className="relative h-8 shrink-0 block">
          <input
            placeholder="搜索场景对象"
            className="w-full h-8 rounded-lg pl-3 pr-8 text-xs outline-none"
            style={{ background: "rgba(255,255,255,0.06)", color: "#e6edf3" }}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <span className="absolute right-2 top-1/2 -translate-y-1/2" style={{ color: "rgba(255,255,255,0.4)" }}><SearchIcon /></span>
        </label>

        {/* Object list */}
        <div className="flex-1 min-h-0 overflow-y-auto" style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,0.15) transparent" }}>
          {/* Cameras */}
          {cameraTracks.map((cam) => (
            <div
              key={cam.id}
              className="group flex items-center h-8 px-1 pr-2 rounded cursor-pointer text-xs transition-colors relative"
              style={{
                color: cam.id === activeCameraId ? "#e6edf3" : "#8b949e",
                background: cam.id === activeCameraId ? "rgba(255,255,255,0.06)" : "transparent",
              }}
              onClick={() => onCameraChange(cam.id)}
            >
              <span className="w-4 shrink-0" />
              <span className="w-6 h-6 flex items-center justify-center shrink-0 rounded-lg"><VideoIcon /></span>
              <span className="flex-1 truncate pl-1">{cam.name}</span>
              <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5 rounded-md opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ background: "#21262d" }}>
                <button
                  className="w-5 h-5 flex items-center justify-center rounded text-xs"
                  style={{ color: cam.enabled ? "#4ade80" : "#484f58" }}
                  onClick={(e) => { e.stopPropagation(); onCameraToggle(cam.id, !cam.enabled); }}
                  title="显示/隐藏"
                >
                  {cam.enabled ? <EyeIcon /> : <EyeOffIcon />}
                </button>
              </div>
            </div>
          ))}

          {/* Models */}
          {filteredModels.map((model) => (
            <div
              key={model.id}
              className="group flex items-center h-8 px-1 pr-2 rounded cursor-pointer text-xs transition-colors relative"
              style={{
                color: model.id === activeModelId ? "#e6edf3" : "#8b949e",
                background: model.id === activeModelId ? "rgba(255,255,255,0.06)" : "transparent",
              }}
              onClick={() => onModelSelect(model.id)}
            >
              <span className="w-4 shrink-0">
                <span className={`inline-block w-1.5 h-1.5 rounded-full ${model.status === "ready" ? "bg-green-400" : model.status === "loading" ? "bg-amber-400 animate-pulse" : "bg-red-400"}`} />
              </span>
              <span className="w-6 h-6 flex items-center justify-center shrink-0 rounded-lg"><BoxIcon /></span>
              <span className="flex-1 truncate pl-1">{model.name}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Minimap + reset */}
      <div className="px-3 pb-3 flex flex-col items-center gap-1.5">
        <canvas className="w-full aspect-square rounded-md" style={{ background: "#0d1117", maxHeight: 144 }} />
        <button className="w-full rounded-md py-0.5 text-xs transition-colors"
          style={{ background: "rgba(255,255,255,0.06)", color: "#8b949e" }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.1)"; e.currentTarget.style.color = "#e6edf3"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.06)"; e.currentTarget.style.color = "#8b949e"; }}
        >
          重置视角
        </button>
      </div>
    </div>
  );
}

/* ---------- 底部浮动 HUD ---------- */
function BottomHUD({
  transformMode,
  onTransformModeChange,
  onOpenAsset,
  onScreenshot,
  onToggleFullscreen,
  viewMode,
  onViewModeChange,
}: {
  transformMode: TransformMode;
  onTransformModeChange: (m: TransformMode) => void;
  onOpenAsset: () => void;
  onScreenshot: () => void;
  onToggleFullscreen: () => void;
  viewMode: "scene" | "timeline";
  onViewModeChange: (m: "scene" | "timeline") => void;
}) {
  return (
    <div className="flex items-center gap-2 pb-5">
      {/* Tool buttons */}
      <nav className="flex items-center gap-1">
        <HUDToolBtn label="移动 (V)" active={transformMode === "translate"} onClick={() => onTransformModeChange("translate")}>
          <MoveIcon />
        </HUDToolBtn>
        <HUDToolBtn label="旋转 (R)" active={transformMode === "rotate"} onClick={() => onTransformModeChange("rotate")}>
          <RotateIcon />
        </HUDToolBtn>
        <HUDToolBtn label="缩放 (S)" active={transformMode === "scale"} onClick={() => onTransformModeChange("scale")}>
          <ScaleIcon />
        </HUDToolBtn>

        <div className="w-px h-6 mx-1" style={{ background: "#30363d" }} />

        <HUDToolBtn label="素材库" onClick={onOpenAsset}>
          <FolderIcon />
        </HUDToolBtn>
        <HUDToolBtn label="截图" onClick={onScreenshot}>
          <ScreenshotIcon />
        </HUDToolBtn>
        <HUDToolBtn label="全屏" onClick={onToggleFullscreen}>
          <MaximizeIcon />
        </HUDToolBtn>

        <div className="w-px h-6 mx-1" style={{ background: "#30363d" }} />

        {/* Segmented: 场景编辑 | 动画时间轴 */}
        <div className="flex items-center rounded-lg p-0.5 gap-0.5" style={{ background: "rgba(255,255,255,0.05)" }}>
          <button
            className={`px-2.5 py-1 rounded-md text-xs transition-colors ${viewMode === "scene" ? "text-white" : "text-white/50 hover:text-white/70"}`}
            style={viewMode === "scene" ? { background: "#21262d", boxShadow: "0 2px 8px rgba(0,0,0,0.3)" } : {}}
            onClick={() => onViewModeChange("scene")}
          >
            场景编辑
          </button>
          <button
            className={`px-2.5 py-1 rounded-md text-xs transition-colors ${viewMode === "timeline" ? "text-white" : "text-white/50 hover:text-white/70"}`}
            style={viewMode === "timeline" ? { background: "#21262d", boxShadow: "0 2px 8px rgba(0,0,0,0.3)" } : {}}
            onClick={() => onViewModeChange("timeline")}
          >
            动画时间轴
          </button>
        </div>
      </nav>
    </div>
  );
}

function HUDToolBtn({ label, active, onClick, children }: { label: string; active?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <div className="group relative flex shrink-0">
      <button
        className="flex shrink-0 w-9 h-9 items-center justify-center rounded-lg transition-colors text-sm"
        style={{ color: active ? "#e6edf3" : "rgba(255,255,255,0.6)", background: active ? "rgba(255,255,255,0.06)" : "transparent" }}
        onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
        onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = "transparent"; }}
        onClick={onClick}
      >
        {children}
      </button>
      <span className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-[#21262d] px-2 py-1 text-xs text-white/85 opacity-0 group-hover:opacity-100 transition-opacity shadow-lg z-50">
        {label}
      </span>
    </div>
  );
}

/* ---------- 主组件 ---------- */
export default function DirectorView({ data, onClose, onUpdate, projectId, onOutputToCanvas, connectedScenes, onAddModelFromAsset }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [transformMode, setTransformMode] = useState<TransformMode>("translate");
  const [showExport, setShowExport] = useState(false);
  const [showAssetPanel, setShowAssetPanel] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [activeCameraId, setActiveCameraId] = useState(data.cameraTracks[0]?.id ?? "");
  const [activeModelId, setActiveModelId] = useState<string | null>(null);
  const [outputting, setOutputting] = useState(false);
  const [viewMode, setViewMode] = useState<"scene" | "timeline">("scene");
  const { renderAnimation } = useRenderVideo();

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
    console.log("[DirectorView] useEffect 触发 initEngine");
    // WebGPUGuard 异步检测可能导致 canvas 还未挂载，轮询等待
    let cancelled = false;
    const tryInit = () => {
      if (cancelled) return;
      if (canvasRef.current) {
        initEngine();
      } else {
        console.log("[DirectorView] canvas 未就绪，等待...");
        requestAnimationFrame(tryInit);
      }
    };
    tryInit();
    return () => { cancelled = true; };
  }, [initEngine]);

  useEffect(() => {
    data.models
      .filter((m: SceneModel) => m.status === "ready" && m.modelPath)
      .forEach((m: SceneModel) => loadModel(m));
  }, [data.models, loadModel]);

  const handleModelTransformUpdate = useCallback((modelId: string, transform: SceneModel["transform"]) => {
    onUpdate({ ...data, models: data.models.map((m) => m.id === modelId ? { ...m, transform } : m) });
  }, [data, onUpdate]);

  const cameraTracksForUI = data.cameraTracks.map((t) => ({ id: t.id, name: t.name, enabled: t.enabled }));

  return (
    <WebGPUGuard>
      <style>{`
        .dv-overlay { background: #0d1117; color: #e6edf3; font-family: system-ui, sans-serif; }
        .dv-topbar { background: #161b22; border-bottom: 1px solid #21262d; height: 48px; }
        .dv-topbar-title { color: #e6edf3; }
        .dv-view-toggle { background: #0d1117; border: 1px solid #21262d; }
        .dv-view-toggle-btn { color: #8b949e; transition: all 0.15s; }
        .dv-view-toggle-btn.active { background: rgba(255,255,255,0.08); color: #e6edf3; border-radius: 999px; }
        .dv-close-btn { color: #8b949e; transition: all 0.15s; }
        .dv-close-btn:hover { color: #ef4444; background: rgba(239,68,68,0.1); }
        .dv-viewport { background: #000; }
        .dv-section-title { color: #e6edf3; font-weight: 500; font-size: 13px; }
        .dv-section-label { color: #8b949e; font-size: 12px; }
        .dv-slider-track { background: #30363d; height: 4px; border-radius: 999px; }
        .dv-slider-fill { background: #58a6ff; height: 4px; border-radius: 999px; }
        .dv-slider-thumb { width: 12px; height: 12px; border-radius: 50%; background: #fff; border: 1px solid #21262d; }
        .dv-input { background: rgba(255,255,255,0.06); border: none; border-radius: 8px; color: #e6edf3; font-size: 12px; text-align: center; outline: none; height: 28px; transition: background 0.15s; }
        .dv-input:focus { background: rgba(255,255,255,0.1); }
        .dv-axis-btn { color: #8b949e; font-size: 11px; text-transform: uppercase; transition: color 0.15s; }
        .dv-axis-btn:hover { color: #58a6ff; }
        .dv-axis-btn.x { color: #ef4444; }
        .dv-axis-btn.y { color: #4ade80; }
        .dv-axis-btn.z { color: #60a5fa; }
        .dv-switch { width: 30px; height: 14px; border-radius: 999px; transition: background 0.15s; cursor: pointer; position: relative; }
        .dv-switch.on { background: #e6edf3; }
        .dv-switch.off { background: rgba(255,255,255,0.15); }
        .dv-switch-knob { width: 10px; height: 10px; border-radius: 50%; background: #161b22; position: absolute; top: 2px; transition: transform 0.15s; }
        .dv-switch.on .dv-switch-knob { transform: translateX(18px); }
        .dv-switch.off .dv-switch-knob { transform: translateX(2px); background: rgba(255,255,255,0.6); }
        .dv-color-swatch { width: 28px; height: 28px; border-radius: 8px; cursor: pointer; overflow: hidden; position: relative; }
      `}</style>

      <div className="dv-overlay fixed inset-0 flex flex-col" style={{ zIndex: 1000 }}>
        {/* ---- Top Bar ---- */}
        <div className="dv-topbar flex items-center justify-between px-4 shrink-0">
          <span className="dv-topbar-title font-semibold text-sm flex items-center gap-1.5"><FilmIcon /> 3D导演台</span>

          <div className="flex items-center gap-1 dv-view-toggle rounded-2xl px-0.5 py-0.5">
            <button className={`dv-view-toggle-btn px-3 py-1 text-xs cursor-pointer rounded-full ${viewMode === "scene" ? "active" : ""}`}
              onClick={() => setViewMode("scene")}>导演视角</button>
            <button className={`dv-view-toggle-btn px-3 py-1 text-xs cursor-pointer rounded-full ${viewMode === "timeline" ? "active" : ""}`}
              onClick={() => setViewMode("timeline")}>机位视角</button>
          </div>

          <div className="flex items-center gap-2">
            <button className="dv-close-btn w-8 h-8 flex items-center justify-center rounded-lg cursor-pointer text-sm"
              onClick={() => setShowExport(true)} title="导出"><DownloadIcon /></button>
            {onOutputToCanvas && (
              <button
                className="dv-close-btn w-8 h-8 flex items-center justify-center rounded-lg cursor-pointer text-sm"
                disabled={outputting}
                title="输出到画布"
                onClick={async () => {
                  if (!canvasRef.current || !activeTrack) return;
                  setOutputting(true);
                  try {
                    const dur = activeTrack.keyframes[activeTrack.keyframes.length - 1]?.time ?? 5;
                    const assetPath = await renderAnimation(canvasRef.current, dur, projectId);
                    if (assetPath) onOutputToCanvas(assetPath);
                  } catch { showToast("输出失败", "error"); }
                  finally { setOutputting(false); }
                }}
              >
                <UploadIcon />
              </button>
            )}
            <button className="dv-close-btn w-8 h-8 flex items-center justify-center rounded-lg cursor-pointer text-sm"
              onClick={onClose} title="关闭"><XIcon /></button>
          </div>
        </div>

        {/* ---- Main Area ---- */}
        <div className="flex flex-1 min-h-0">
          {/* Left Panel */}
          <LeftPanel
            models={data.models}
            cameraTracks={cameraTracksForUI}
            activeModelId={activeModelId}
            activeCameraId={activeCameraId}
            onModelSelect={setActiveModelId}
            onCameraChange={setActiveCameraId}
            onCameraToggle={(id, enabled) => {
              onUpdate({
                ...data,
                cameraTracks: data.cameraTracks.map((t) => t.id === id ? { ...t, enabled } : t),
              });
            }}
          />

          {/* Viewport */}
          <div className="dv-viewport flex-1 relative"
            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragOver(true); }}
            onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragOver(false); }}
            onDrop={(e) => {
              e.preventDefault(); e.stopPropagation(); setIsDragOver(false);
              const assetPath = e.dataTransfer.getData("application/x-asset-path");
              if (assetPath) onAddModelFromAsset?.(assetPath);
            }}
          >
            <canvas ref={canvasRef} className="w-full h-full block" />
            {isDragOver && (
              <div className="absolute inset-2 flex items-center justify-center rounded-lg pointer-events-none"
                style={{ background: "rgba(88,166,255,0.08)", border: "2px dashed #58a6ff" }}>
                <span className="text-sm" style={{ color: "#58a6ff" }}>释放以添加 3D 模型</span>
              </div>
            )}

            {/* Bottom HUD */}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-1 z-10">
              <div className="pointer-events-auto">
                <BottomHUD
                  transformMode={transformMode}
                  onTransformModeChange={setTransformMode}
                  onOpenAsset={() => setShowAssetPanel(true)}
                  onScreenshot={() => setShowExport(true)}
                  onToggleFullscreen={() => {}}
                  viewMode={viewMode}
                  onViewModeChange={setViewMode}
                />
              </div>
            </div>
          </div>

          {/* Right Panel */}
          <ScenePanel
            models={data.models}
            activeModelId={activeModelId}
            cameraTracks={data.cameraTracks}
            activeCameraId={activeCameraId}
            sceneSettings={data.sceneSettings}
            onActiveCameraChange={setActiveCameraId}
            onModelTransformUpdate={handleModelTransformUpdate}
            onSceneSettingsChange={(settings) => onUpdate({ ...data, sceneSettings: settings })}
          />
        </div>

        {/* Timeline (toggleable) */}
        {viewMode === "timeline" && (
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
                cameraTracks: data.cameraTracks.map((t) => t.id === trackId ? { ...t, keyframes } : t),
              });
            }}
          />
        )}

        {/* Export modal */}
        {showExport && (
          <ExportMenu
            projectId={projectId}
            cameraTrack={activeTrack}
            canvasRef={canvasRef}
            onClose={() => setShowExport(false)}
            onOutputToCanvas={onOutputToCanvas}
            connectedScenes={connectedScenes}
          />
        )}

        {/* Asset panel */}
        {showAssetPanel && (
          <>
            <div className="fixed inset-0 z-[1100]" style={{ background: "rgba(0,0,0,0.3)" }} onClick={() => setShowAssetPanel(false)} />
            <div className="fixed z-[1101]" style={{ top: "50%", left: "50%", transform: "translate(-50%, -50%)" }}>
              <DirectorAssetPanel
                onAddModel={(assetPath) => {
                  onAddModelFromAsset?.(assetPath);
                  setShowAssetPanel(false);
                }}
                onClose={() => setShowAssetPanel(false)}
              />
            </div>
          </>
        )}
      </div>
    </WebGPUGuard>
  );
}
