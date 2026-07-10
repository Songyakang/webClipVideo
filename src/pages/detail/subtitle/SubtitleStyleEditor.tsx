import type { SubtitleStyle } from "../../../lib/types";
import "./SubtitleStyleEditor.css";

interface Props {
  style: SubtitleStyle;
  onChange: (style: SubtitleStyle) => void;
}

const ALIGNMENT_LABELS: Record<number, string> = {
  1: "底部靠左",
  2: "底部居中",
  3: "底部靠右",
};

function colorToHex(c: string): string {
  if (c.startsWith("#") && c.length === 7) return c;
  return "#FFFFFF";
}

export default function SubtitleStyleEditor({ style, onChange }: Props) {
  const set = (patch: Partial<SubtitleStyle>) => {
    onChange({ ...style, ...patch });
  };

  return (
    <div className="style-editor">
      <h4>字幕样式</h4>

      <div className="style-row">
        <label>字号</label>
        <input
          type="range"
          min="12"
          max="48"
          value={style.fontSize}
          onChange={(e) => set({ fontSize: parseInt(e.target.value) })}
        />
        <span className="style-val">{style.fontSize}px</span>
      </div>

      <div className="style-color-row">
        <div className="style-color-item">
          <label>颜色</label>
          <input
            type="color"
            value={colorToHex(style.fontColor)}
            onChange={(e) => set({ fontColor: e.target.value })}
          />
        </div>
        <div className="style-color-item">
          <label>描边</label>
          <input
            type="color"
            value={colorToHex(style.outlineColor)}
            onChange={(e) => set({ outlineColor: e.target.value })}
          />
        </div>
      </div>

      <div className="style-row">
        <label>描边</label>
        <input
          type="range"
          min="0"
          max="8"
          value={style.outlineWidth}
          onChange={(e) => set({ outlineWidth: parseInt(e.target.value) })}
        />
        <span className="style-val">{style.outlineWidth}px</span>
      </div>

      <div className="style-row">
        <label>位置</label>
        <select
          className="style-select"
          value={style.alignment}
          onChange={(e) => set({ alignment: parseInt(e.target.value) as 1 | 2 | 3 })}
        >
          {Object.entries(ALIGNMENT_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>

      <div className="style-row">
        <label>边距</label>
        <input
          type="range"
          min="10"
          max="150"
          value={style.marginV}
          onChange={(e) => set({ marginV: parseInt(e.target.value) })}
        />
        <span className="style-val">{style.marginV}px</span>
      </div>

      <div className="style-preview">
        <p
          className="style-preview-text"
          style={{
            fontFamily: "PingFang SC, sans-serif",
            fontSize: `${style.fontSize * 0.5}px`,
            color: style.fontColor,
            textShadow: `0 0 ${style.outlineWidth}px ${style.outlineColor}, 0 0 ${style.outlineWidth}px ${style.outlineColor}`,
            fontWeight: style.bold ? 700 : 400,
            fontStyle: style.italic ? "italic" : "normal",
            paddingBottom: `${style.marginV * 0.2}px`,
          }}
        >
          字幕预览效果 ABC 123
        </p>
      </div>
    </div>
  );
}
