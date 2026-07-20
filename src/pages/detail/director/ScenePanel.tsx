import type { SceneModel, CameraTrack } from "./types";
import "./ScenePanel.css";

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
  onModelTransformUpdate: _onModelTransformUpdate,
}: Props) {
  return (
    <div className="scene-panel">
      {/* Models section */}
      <div className="sp-section">
        <div className="sp-section-title">场景模型</div>
        {models.length === 0 && (
          <div className="sp-empty">暂无模型</div>
        )}
        {models.map((model) => (
          <div
            key={model.id}
            className={`sp-model-item${model.id === activeModelId ? " active" : ""}`}
            onClick={() => onModelSelect(model.id)}
          >
            <div className="sp-model-name">
              <span
                className={`sp-model-status ${model.status}`}
                title={model.status}
              />
              {model.name}
            </div>
            <div className="sp-model-meta">
              顶点: {formatNumber(model.meta.vertexCount)} | 面: {formatNumber(model.meta.faceCount)}
            </div>
            {model.status === "loading" && (
              <div className="sp-model-loading">生成中...</div>
            )}
          </div>
        ))}
      </div>

      {/* Transform section */}
      {activeModelId && models.find((m) => m.id === activeModelId) && (
        <div className="sp-section">
          <div className="sp-section-title">变换</div>
          {(() => {
            const m = models.find((m2) => m2.id === activeModelId)!;
            return (
              <div className="sp-transform-grid">
                <span className="sp-axis x">X</span>
                <span className="sp-value">{m.transform.position[0].toFixed(2)}</span>
                <span className="sp-axis y">Y</span>
                <span className="sp-value">{m.transform.position[1].toFixed(2)}</span>
                <span className="sp-axis z">Z</span>
                <span className="sp-value">{m.transform.position[2].toFixed(2)}</span>
                <span className="sp-axis">R</span>
                <span className="sp-value">
                  {m.transform.rotation[0]}° / {m.transform.rotation[1]}° / {m.transform.rotation[2]}°
                </span>
                <span className="sp-axis">S</span>
                <span className="sp-value">{m.transform.scale.toFixed(1)}</span>
              </div>
            );
          })()}
        </div>
      )}

      {/* Camera section */}
      <div className="sp-section">
        <div className="sp-section-title">摄像机</div>
        {cameraTracks.map((track) => (
          <div
            key={track.id}
            className={`sp-camera-item${track.id === activeCameraId ? " active" : ""}`}
            onClick={() => onActiveCameraChange(track.id)}
          >
            <span
              className="sp-camera-dot"
              style={{ background: track.enabled ? "#4ade80" : "#555" }}
            />
            {track.name}
          </div>
        ))}
      </div>
    </div>
  );
}

function formatNumber(n: number): string {
  if (n >= 1000) return (n / 1000).toFixed(1) + "K";
  return String(n);
}
