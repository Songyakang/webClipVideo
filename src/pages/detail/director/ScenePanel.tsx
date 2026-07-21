import type { SceneModel, CameraTrack } from "./types";

interface Props {
  models: SceneModel[];
  activeModelId: string | null;
  cameraTracks: CameraTrack[];
  activeCameraId: string;
  onActiveCameraChange: (id: string) => void;
  onModelSelect: (id: string) => void;
  onModelTransformUpdate: (modelId: string, transform: SceneModel["transform"]) => void;
}

export default function ScenePanel({
  models,
  activeModelId,
  cameraTracks,
  activeCameraId,
  onActiveCameraChange,
  onModelSelect,
  onModelTransformUpdate,
}: Props) {
  return (
    <>
      <style>{`
        .scene-panel { background: #12121e; border-left: 1px solid #2a2a4a; }
        .sp-section-title { color: #a78bfa; }
        .sp-empty { color: #555; }
        .sp-model-item { background: #1a1a2e; border-left: 3px solid transparent; }
        .sp-model-item.active { border-left-color: #7c3aed; }
        .sp-model-name { color: #e0e0e0; }
        .sp-model-status.ready { background: #4ade80; }
        .sp-model-status.loading { background: #f59e0b; animation: pulse 1s infinite; }
        .sp-model-status.error { background: #ef4444; }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
        .sp-model-meta { color: #555; }
        .sp-model-loading { color: #f59e0b; }
        .sp-axis { color: #666; }
        .sp-axis.x { color: #ef4444; }
        .sp-axis.y { color: #4ade80; }
        .sp-axis.z { color: #60a5fa; }
        .sp-value { color: #a0a0b8; }
        .sp-value-input { background: #1a1a2e; border: 1px solid #2a2a4a; color: #a0a0b8; }
        .sp-value-input:focus { border-color: #7c3aed; }
        .sp-camera-item { color: #888; }
        .sp-camera-item.active { background: #1a1a2e; color: #e0e0e0; }
      `}</style>
      <div className="scene-panel w-60 p-3 flex flex-col gap-4 overflow-y-auto shrink-0">
        {/* Models section */}
        <div>
          <div className="sp-section-title text-xs font-semibold mb-2">📦 场景模型</div>
          {models.length === 0 && (
            <div className="sp-empty text-xs italic">暂无模型</div>
          )}
          {models.map((model) => (
            <div
              key={model.id}
              className={`sp-model-item p-2 rounded-md mb-1 cursor-pointer${model.id === activeModelId ? " active" : ""}`}
              onClick={() => onModelSelect(model.id)}
            >
              <div className="sp-model-name flex items-center gap-1.5 text-xs">
                <span
                  className={`sp-model-status w-1.5 h-1.5 rounded-full shrink-0 ${model.status}`}
                  title={model.status}
                />
                {model.name}
              </div>
              <div className="sp-model-meta text-[10px] mt-1">
                顶点: {formatNumber(model.meta.vertexCount)} | 面: {formatNumber(model.meta.faceCount)}
              </div>
              {model.status === "loading" && (
                <div className="sp-model-loading text-[10px] mt-1">生成中...</div>
              )}
            </div>
          ))}
        </div>

        {/* Transform section */}
        {activeModelId && models.find((m) => m.id === activeModelId) && (
          <div>
            <div className="sp-section-title text-xs font-semibold mb-2">📐 变换</div>
            {(() => {
              const m = models.find((m2) => m2.id === activeModelId)!;
              return (
                <div className="grid gap-x-2 gap-y-1 text-[11px]" style={{ gridTemplateColumns: "20px 1fr" }}>
                  <span className="sp-axis x">X</span>
                  <input
                    type="number"
                    step="0.1"
                    className="sp-value-input font-mono text-[11px] px-1 py-0.5 w-full outline-none"
                    value={m.transform.position[0]}
                    onChange={(e) => {
                      const pos: [number, number, number] = [...m.transform.position];
                      pos[0] = parseFloat(e.target.value) || 0;
                      onModelTransformUpdate(m.id, { ...m.transform, position: pos });
                    }}
                  />
                  <span className="sp-axis y">Y</span>
                  <input
                    type="number"
                    step="0.1"
                    className="sp-value-input font-mono text-[11px] px-1 py-0.5 w-full outline-none"
                    value={m.transform.position[1]}
                    onChange={(e) => {
                      const pos: [number, number, number] = [...m.transform.position];
                      pos[1] = parseFloat(e.target.value) || 0;
                      onModelTransformUpdate(m.id, { ...m.transform, position: pos });
                    }}
                  />
                  <span className="sp-axis z">Z</span>
                  <input
                    type="number"
                    step="0.1"
                    className="sp-value-input font-mono text-[11px] px-1 py-0.5 w-full outline-none"
                    value={m.transform.position[2]}
                    onChange={(e) => {
                      const pos: [number, number, number] = [...m.transform.position];
                      pos[2] = parseFloat(e.target.value) || 0;
                      onModelTransformUpdate(m.id, { ...m.transform, position: pos });
                    }}
                  />
                  <span className="sp-axis">R</span>
                  <span className="sp-value font-mono">
                    {m.transform.rotation[0]}° / {m.transform.rotation[1]}° / {m.transform.rotation[2]}°
                  </span>
                  <span className="sp-axis">S</span>
                  <input
                    type="number"
                    step="0.1"
                    className="sp-value-input font-mono text-[11px] px-1 py-0.5 w-full outline-none"
                    value={m.transform.scale}
                    onChange={(e) => {
                      onModelTransformUpdate(m.id, { ...m.transform, scale: parseFloat(e.target.value) || 1 });
                    }}
                  />
                </div>
              );
            })()}
          </div>
        )}

        {/* Camera section */}
        <div>
          <div className="sp-section-title text-xs font-semibold mb-2">🎥 摄像机</div>
          {cameraTracks.map((track) => (
            <div
              key={track.id}
              className={`sp-camera-item flex items-center gap-2 px-2 py-1.5 rounded text-xs cursor-pointer${track.id === activeCameraId ? " active" : ""}`}
              onClick={() => onActiveCameraChange(track.id)}
            >
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ background: track.enabled ? "#4ade80" : "#555" }}
              />
              {track.name}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function formatNumber(n: number): string {
  if (n >= 1000) return (n / 1000).toFixed(1) + "K";
  return String(n);
}
