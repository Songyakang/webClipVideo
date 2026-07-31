import { useState, useCallback, useEffect } from "react";
import type { TimelineClip, ClipFilter } from "./types";
import { FILTER_PRESETS, FILTER_PRESET_NAMES, FILTER_LABELS } from "./types";
import { showToast } from "../../../lib/toast";

interface Props {
  clip: TimelineClip | null;
  onUpdateClipFilter: (clipId: string, filter: ClipFilter) => void;
  onApplyFilterPreset: (clipId: string, presetName: string) => void;
  onResetClipFilter: (clipId: string) => void;
  onClose: () => void;
}

/** Slider specs for each filter parameter */
interface SliderSpec {
  key: keyof ClipFilter;
  min: number;
  max: number;
  step: number;
}

const SLIDERS: SliderSpec[] = [
  { key: "brightness", min: -1, max: 1, step: 0.01 },
  { key: "contrast", min: -1, max: 1, step: 0.01 },
  { key: "saturation", min: -1, max: 1, step: 0.01 },
  { key: "hue", min: -180, max: 180, step: 1 },
  { key: "blur", min: 0, max: 20, step: 0.1 },
  { key: "sharpen", min: 0, max: 1, step: 0.01 },
  { key: "temperature", min: -1, max: 1, step: 0.01 },
  { key: "vignette", min: 0, max: 1, step: 0.01 },
];

export default function FilterPanel({
  clip,
  onUpdateClipFilter,
  onApplyFilterPreset,
  onResetClipFilter,
  onClose,
}: Props) {
  // Local state for slider values (instant updates)
  const [localFilter, setLocalFilter] = useState<ClipFilter>({});

  // Sync local state when clip changes
  useEffect(() => {
    setLocalFilter(clip?.filter || {});
  }, [clip?.id, clip?.filter]);

  const handleSliderChange = useCallback(
    (key: keyof ClipFilter, value: number) => {
      const updated = { ...localFilter, [key]: value };
      setLocalFilter(updated);
      if (clip) {
        onUpdateClipFilter(clip.id, { [key]: value } as ClipFilter);
      }
    },
    [clip, localFilter, onUpdateClipFilter],
  );

  const handlePreset = useCallback(
    (presetName: string) => {
      if (!clip) return;
      if (presetName === "none") {
        onResetClipFilter(clip.id);
        setLocalFilter({});
        showToast("滤镜已重置", "info");
        return;
      }
      onApplyFilterPreset(clip.id, presetName);
      const preset = FILTER_PRESETS[presetName];
      if (preset) {
        setLocalFilter({ ...preset } as ClipFilter);
      }
      const presetNames: Record<string, string> = {
        cinematic: "电影感",
        vintage: "复古",
        warm: "温暖",
        cool: "冷色",
        bw: "黑白",
        sharp: "锐化",
        soft: "柔焦",
      };
      showToast(`已应用"${presetNames[presetName] || presetName}"滤镜`, "success");
    },
    [clip, onApplyFilterPreset, onResetClipFilter],
  );

  const handleReset = useCallback(() => {
    if (!clip) return;
    onResetClipFilter(clip.id);
    setLocalFilter({});
    showToast("滤镜已重置", "info");
  }, [clip, onResetClipFilter]);

  if (!clip) {
    return (
      <div className="s-fp-panel">
        <style>{filterPanelCSS}</style>
        <div className="s-fp-empty">选择片段以编辑滤镜</div>
      </div>
    );
  }

  const canFilter = clip.type === "video" || clip.type === "image";

  if (!canFilter) {
    return (
      <div className="s-fp-panel">
        <style>{filterPanelCSS}</style>
        <div className="s-fp-empty">当前片段类型不支持滤镜</div>
      </div>
    );
  }

  return (
    <div className="s-fp-panel">
      <style>{filterPanelCSS}</style>

      {/* Header */}
      <div className="s-fp-header">
        <span className="s-fp-title">滤镜</span>
        <span className="s-fp-clip-name" title={clip.title}>
          {clip.title}
        </span>
        <button className="s-fp-close" onClick={onClose}>
          ✕
        </button>
      </div>

      {/* Presets */}
      <div className="s-fp-section">
        <div className="s-fp-section-label">预设</div>
        <div className="s-fp-presets">
          {FILTER_PRESET_NAMES.map((name) => {
            const presetNames: Record<string, string> = {
              none: "无",
              cinematic: "电影感",
              vintage: "复古",
              warm: "温暖",
              cool: "冷色",
              bw: "黑白",
              sharp: "锐化",
              soft: "柔焦",
            };
            const isActive = clip.filterPreset === name;
            return (
              <button
                key={name}
                className={`s-fp-preset-btn ${isActive ? "s-fp-preset-active" : ""}`}
                onClick={() => handlePreset(name)}
              >
                {presetNames[name] || name}
              </button>
            );
          })}
        </div>
      </div>

      {/* Sliders */}
      <div className="s-fp-section s-fp-sliders">
        <div className="s-fp-section-label">参数调整</div>
        {SLIDERS.map((spec) => {
          const value = localFilter[spec.key] ?? 0;
          const label = FILTER_LABELS[spec.key];
          return (
            <div key={spec.key} className="s-fp-row">
              <label className="s-fp-label">{label}</label>
              <input
                type="range"
                className="s-fp-slider"
                min={spec.min}
                max={spec.max}
                step={spec.step}
                value={value}
                onChange={(e) => handleSliderChange(spec.key, Number(e.target.value))}
              />
              <span className="s-fp-value">
                {spec.key === "hue" ? `${value}°` : value.toFixed(2)}
              </span>
              {/* Reset individual value */}
              {value !== 0 && (
                <button
                  className="s-fp-reset-val"
                  onClick={() => handleSliderChange(spec.key, 0)}
                  title="重置"
                >
                  ↺
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Reset all */}
      <div className="s-fp-footer">
        <button className="s-fp-btn-danger" onClick={handleReset}>
          重置所有滤镜
        </button>
      </div>
    </div>
  );
}

const filterPanelCSS = `
.s-fp-panel {
  width: 280px;
  flex-shrink: 0;
  background: #0d1117;
  border-left: 1px solid #21262d;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.s-fp-empty {
  color: #484f58;
  font-size: 13px;
  text-align: center;
  padding: 24px 16px;
}
.s-fp-header {
  display: flex;
  align-items: center;
  padding: 10px 12px;
  border-bottom: 1px solid #21262d;
  gap: 8px;
  flex-shrink: 0;
}
.s-fp-title {
  color: #c9d1d9;
  font-weight: 600;
  font-size: 14px;
}
.s-fp-clip-name {
  flex: 1;
  color: #484f58;
  font-size: 11px;
  font-family: monospace;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.s-fp-close {
  background: none;
  border: none;
  color: #8b949e;
  cursor: pointer;
  font-size: 14px;
  padding: 0 4px;
}
.s-fp-section {
  padding: 10px 12px;
  border-bottom: 1px solid #161b22;
  flex-shrink: 0;
}
.s-fp-sliders {
  flex: 1;
  overflow-y: auto;
}
.s-fp-section-label {
  color: #8b949e;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  margin-bottom: 8px;
  letter-spacing: 0.5px;
}
.s-fp-presets {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.s-fp-preset-btn {
  background: #161b22;
  border: 1px solid #30363d;
  border-radius: 4px;
  color: #c9d1d9;
  cursor: pointer;
  font-size: 11px;
  padding: 3px 8px;
  transition: background 0.15s, border-color 0.15s;
}
.s-fp-preset-btn:hover {
  background: #1c2533;
  border-color: #58a6ff;
}
.s-fp-preset-active {
  background: #1c2533;
  border-color: #58a6ff;
  color: #58a6ff;
}
.s-fp-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
}
.s-fp-label {
  width: 42px;
  color: #c9d1d9;
  font-size: 11px;
  flex-shrink: 0;
}
.s-fp-slider {
  flex: 1;
  height: 4px;
  accent-color: #58a6ff;
  cursor: pointer;
  min-width: 0;
}
.s-fp-value {
  width: 38px;
  color: #8b949e;
  font-size: 10px;
  font-family: monospace;
  text-align: right;
  flex-shrink: 0;
}
.s-fp-reset-val {
  background: none;
  border: none;
  color: #484f58;
  cursor: pointer;
  font-size: 12px;
  padding: 0 2px;
  flex-shrink: 0;
}
.s-fp-reset-val:hover {
  color: #f85149;
}
.s-fp-footer {
  padding: 10px 12px;
  border-top: 1px solid #21262d;
  flex-shrink: 0;
}
.s-fp-btn-danger {
  width: 100%;
  background: #161b22;
  border: 1px solid #30363d;
  border-radius: 4px;
  color: #f85149;
  cursor: pointer;
  font-size: 12px;
  padding: 6px 12px;
  transition: background 0.15s;
}
.s-fp-btn-danger:hover {
  background: #1c1518;
}
`;
