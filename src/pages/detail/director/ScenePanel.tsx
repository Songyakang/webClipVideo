import type { SceneModel, CameraTrack, DirectorSceneSettings } from "./types";

interface Props {
  models: SceneModel[];
  activeModelId: string | null;
  cameraTracks: CameraTrack[];
  activeCameraId: string;
  sceneSettings: DirectorSceneSettings;
  onActiveCameraChange: (id: string) => void;
  onModelTransformUpdate: (modelId: string, transform: SceneModel["transform"]) => void;
  onSceneSettingsChange: (settings: DirectorSceneSettings) => void;
}

function SliderControl({ label, value, min, max, step, onChange, unit }: {
  label: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; unit?: string;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div>
      <div className="flex items-center h-7 mb-1">
        <span className="text-xs font-normal" style={{ color: "#8b949e" }}>{label}</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="relative h-5 flex-1 shrink-0" style={{ maxWidth: 170 }}>
          <div className="absolute left-0 top-1/2 w-full h-1 -translate-y-1/2 rounded-full" style={{ background: "#30363d" }}>
            <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "#58a6ff" }} />
          </div>
          <input type="range" min={min} max={max} step={step} value={value}
            className="absolute inset-x-0 top-1/2 h-5 w-full -translate-y-1/2 cursor-pointer opacity-0"
            onChange={(e) => onChange(parseFloat(e.target.value))} />
        </div>
        <input className="h-7 w-16 rounded-lg border-0 text-xs text-center outline-none transition-colors"
          style={{ background: "rgba(255,255,255,0.06)", color: "#e6edf3" }}
          onFocus={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.1)"; }}
          onBlur={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.06)"; }}
          value={unit ? `${value}${unit}` : String(value)}
          onChange={(e) => {
            const n = parseFloat(e.target.value);
            if (!isNaN(n)) onChange(Math.min(max, Math.max(min, n)));
          }}
        />
      </div>
    </div>
  );
}

function AxisInput({ axis, value, onChange, colorClass, step }: {
  axis: string; value: number; onChange: (v: number) => void; colorClass: string; step?: string;
}) {
  return (
    <div className="relative flex h-7 min-w-0 overflow-hidden rounded-lg transition-colors"
      style={{ background: "rgba(255,255,255,0.06)" }}>
      <span className={`absolute left-0 top-0 z-10 flex h-7 w-5 select-none items-center justify-center rounded-l-lg text-xs uppercase cursor-ew-resize ${colorClass}`}>
        {axis}
      </span>
      <input type="number" step={step ?? "0.1"}
        className="h-full min-w-0 flex-1 border-0 bg-transparent pl-6 pr-2 text-xs text-center outline-none"
        style={{ color: "#e6edf3" }}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)} />
    </div>
  );
}

export default function ScenePanel({
  models, activeModelId, cameraTracks, activeCameraId, sceneSettings,
  onActiveCameraChange, onModelTransformUpdate, onSceneSettingsChange,
}: Props) {
  const activeModel = models.find((m) => m.id === activeModelId) ?? null;

  return (
    <div className="flex flex-col overflow-hidden border-l"
      style={{ background: "#161b22", borderColor: "#21262d", width: 281 }}>
      <style>{`
        .sp-section { border-bottom: 1px solid rgba(255,255,255,0.06); }
        .sp-section-header { display: flex; align-items: center; justify-content: space-between; height: 48px; padding: 0 12px; }
        .sp-section-body { padding: 0 16px 16px; }
      `}</style>

      <div className="flex items-center justify-between h-12 px-3 shrink-0">
        <span className="text-sm font-medium" style={{ color: "#e6edf3" }}>3D场景</span>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto"
        style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,0.15) transparent" }}>

        {/* ---- 场景变换 Section ---- */}
        {activeModel && (
          <div className="sp-section">
            <div className="sp-section-header">
              <span className="text-sm font-medium" style={{ color: "#e6edf3" }}>{activeModel.name}</span>
              <span className="text-xs" style={{ color: "#8b949e" }}>
                {activeModel.status === "ready" ? "就绪" : activeModel.status === "loading" ? "生成中..." : "错误"}
              </span>
            </div>
            <div className="sp-section-body space-y-3">
              {/* Position */}
              <div>
                <div className="flex items-center h-7 mb-1">
                  <span className="text-xs" style={{ color: "#8b949e" }}>位移</span>
                </div>
                <div className="grid grid-cols-3 gap-1">
                  <AxisInput axis="x" colorClass="text-red-400" value={activeModel.transform.position[0]}
                    onChange={(v) => { const p: [number,number,number] = [...activeModel.transform.position]; p[0] = v; onModelTransformUpdate(activeModel.id, { ...activeModel.transform, position: p }); }} />
                  <AxisInput axis="y" colorClass="text-green-400" value={activeModel.transform.position[1]}
                    onChange={(v) => { const p: [number,number,number] = [...activeModel.transform.position]; p[1] = v; onModelTransformUpdate(activeModel.id, { ...activeModel.transform, position: p }); }} />
                  <AxisInput axis="z" colorClass="text-blue-400" value={activeModel.transform.position[2]}
                    onChange={(v) => { const p: [number,number,number] = [...activeModel.transform.position]; p[2] = v; onModelTransformUpdate(activeModel.id, { ...activeModel.transform, position: p }); }} />
                </div>
              </div>

              {/* Rotation */}
              <div>
                <div className="flex items-center h-7 mb-1">
                  <span className="text-xs" style={{ color: "#8b949e" }}>旋转</span>
                </div>
                <div className="grid grid-cols-3 gap-1">
                  <AxisInput axis="x" colorClass="text-red-400" step="1" value={activeModel.transform.rotation[0]}
                    onChange={(v) => { const r: [number,number,number] = [...activeModel.transform.rotation]; r[0] = v; onModelTransformUpdate(activeModel.id, { ...activeModel.transform, rotation: r }); }} />
                  <AxisInput axis="y" colorClass="text-green-400" step="1" value={activeModel.transform.rotation[1]}
                    onChange={(v) => { const r: [number,number,number] = [...activeModel.transform.rotation]; r[1] = v; onModelTransformUpdate(activeModel.id, { ...activeModel.transform, rotation: r }); }} />
                  <AxisInput axis="z" colorClass="text-blue-400" step="1" value={activeModel.transform.rotation[2]}
                    onChange={(v) => { const r: [number,number,number] = [...activeModel.transform.rotation]; r[2] = v; onModelTransformUpdate(activeModel.id, { ...activeModel.transform, rotation: r }); }} />
                </div>
              </div>

              {/* Scale */}
              <SliderControl label="缩放" value={activeModel.transform.scale} min={0.1} max={5} step={0.1}
                onChange={(v) => onModelTransformUpdate(activeModel.id, { ...activeModel.transform, scale: v })} />

              {/* Status info */}
              <div className="text-xs" style={{ color: "#484f58" }}>
                顶点: {activeModel.meta.vertexCount > 0 ? (activeModel.meta.vertexCount >= 1000 ? `${(activeModel.meta.vertexCount / 1000).toFixed(1)}K` : activeModel.meta.vertexCount) : "—"} | 面: {activeModel.meta.faceCount > 0 ? (activeModel.meta.faceCount >= 1000 ? `${(activeModel.meta.faceCount / 1000).toFixed(1)}K` : activeModel.meta.faceCount) : "—"}
              </div>
            </div>
          </div>
        )}

        {/* ---- 场景设置 Section ---- */}
        <div className="sp-section">
          <div className="sp-section-header">
            <span className="text-sm font-medium" style={{ color: "#e6edf3" }}>场景设置</span>
          </div>
          <div className="sp-section-body space-y-3">
            {/* Background color */}
            <div>
              <div className="flex items-center h-7 mb-1">
                <span className="text-xs" style={{ color: "#8b949e" }}>背景颜色</span>
              </div>
              <div className="flex items-center gap-2">
                <label className="dv-color-swatch shrink-0" style={{ background: sceneSettings.backgroundColor }}>
                  <input type="color" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    value={sceneSettings.backgroundColor}
                    onChange={(e) => onSceneSettingsChange({ ...sceneSettings, backgroundColor: e.target.value })} />
                </label>
                <div className="flex h-7 flex-1 items-center gap-0.5 rounded-lg px-2"
                  style={{ background: "rgba(255,255,255,0.06)" }}>
                  <span className="text-xs" style={{ color: "#8b949e" }}>#</span>
                  <input maxLength={6} spellCheck={false}
                    className="h-full min-w-0 flex-1 bg-transparent text-xs uppercase outline-none"
                    style={{ color: "#e6edf3" }}
                    value={sceneSettings.backgroundColor.replace("#", "")}
                    onChange={(e) => {
                      const v = e.target.value.replace(/[^0-9a-fA-F]/g, "").slice(0, 6);
                      onSceneSettingsChange({ ...sceneSettings, backgroundColor: `#${v}` });
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Ambient light */}
            <SliderControl label="环境光强度" value={sceneSettings.ambientLight} min={0} max={1} step={0.05}
              onChange={(v) => onSceneSettingsChange({ ...sceneSettings, ambientLight: v })} />

            {/* Grid visible */}
            <div className="flex items-center justify-between h-7">
              <span className="text-xs" style={{ color: "#8b949e" }}>显示网格</span>
              <div className={`dv-switch ${sceneSettings.gridVisible ? "on" : "off"}`}
                onClick={() => onSceneSettingsChange({ ...sceneSettings, gridVisible: !sceneSettings.gridVisible })}>
                <div className="dv-switch-knob" />
              </div>
            </div>
          </div>
        </div>

        {/* ---- 摄像机 Section ---- */}
        <div className="py-4 px-4 space-y-3">
          <span className="text-sm font-medium block" style={{ color: "#e6edf3" }}>摄像机</span>
          {cameraTracks.map((track) => (
            <div key={track.id}
              className="flex items-center gap-2 rounded-lg px-3 py-2 cursor-pointer transition-colors"
              style={{ background: track.id === activeCameraId ? "rgba(255,255,255,0.06)" : "transparent" }}
              onClick={() => onActiveCameraChange(track.id)}
            >
              <span className="w-2 h-2 rounded-full shrink-0"
                style={{ background: track.id === activeCameraId ? "#58a6ff" : "#484f58" }} />
              <span className="text-xs truncate"
                style={{ color: track.id === activeCameraId ? "#e6edf3" : "#8b949e" }}>
                {track.name}
              </span>
              {!track.enabled && (
                <span className="text-xs shrink-0 ml-auto" style={{ color: "#484f58" }}>已隐藏</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
