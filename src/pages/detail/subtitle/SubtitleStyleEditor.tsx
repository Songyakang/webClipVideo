import type { SubtitleStyle } from "../../../lib/types";

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
    <>
      <style>{`
        .style-row input[type="range"] {
          flex: 1;
          height: 4px;
          -webkit-appearance: none;
          appearance: none;
          background: #30363d;
          border-radius: 2px;
          outline: none;
        }
        .style-row input[type="range"]::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 12px;
          height: 12px;
          border-radius: 50%;
          background: #58a6ff;
          cursor: pointer;
        }
        .style-color-item input[type="color"] {
          width: 24px;
          height: 24px;
          background: none;
          cursor: pointer;
          padding: 0;
          border: 1px solid #30363d;
          border-radius: 4px;
        }
        .style-color-item input[type="color"]::-webkit-color-swatch-wrapper {
          padding: 0;
        }
        .style-color-item input[type="color"]::-webkit-color-swatch {
          border: none;
          border-radius: 3px;
        }
        .style-select { background: #161b22; border: 1px solid #30363d; color: #c9d1d9; }
        .style-select:focus {
          border-color: #58a6ff;
        }
      `}</style>
      <div
        className="px-4 py-3"
        style={{ borderTop: "1px solid #21262d" }}
      >
        <h4 className="m-0 mb-2.5 text-xs font-semibold uppercase tracking-[0.5px]" style={{ color: "#8b949e" }}>
          字幕样式
        </h4>

        <div className="style-row flex items-center gap-2 mb-2">
          <label className="text-xs w-10 shrink-0" style={{ color: "#c9d1d9" }}>字号</label>
          <input
            type="range"
            min="12"
            max="48"
            value={style.fontSize}
            onChange={(e) => set({ fontSize: parseInt(e.target.value) })}
          />
          <span className="text-[11px] w-[30px] text-right tabular-nums" style={{ color: "#8b949e" }}>
            {style.fontSize}px
          </span>
        </div>

        <div className="style-color-row flex items-center gap-3 mb-2">
          <div className="style-color-item flex items-center gap-1.5">
            <label className="text-xs" style={{ color: "#c9d1d9" }}>颜色</label>
            <input
              type="color"
              value={colorToHex(style.fontColor)}
              onChange={(e) => set({ fontColor: e.target.value })}
            />
          </div>
          <div className="style-color-item flex items-center gap-1.5">
            <label className="text-xs" style={{ color: "#c9d1d9" }}>描边</label>
            <input
              type="color"
              value={colorToHex(style.outlineColor)}
              onChange={(e) => set({ outlineColor: e.target.value })}
            />
          </div>
        </div>

        <div className="style-row flex items-center gap-2 mb-2">
          <label className="text-xs w-10 shrink-0" style={{ color: "#c9d1d9" }}>描边</label>
          <input
            type="range"
            min="0"
            max="8"
            value={style.outlineWidth}
            onChange={(e) => set({ outlineWidth: parseInt(e.target.value) })}
          />
          <span className="text-[11px] w-[30px] text-right tabular-nums" style={{ color: "#8b949e" }}>
            {style.outlineWidth}px
          </span>
        </div>

        <div className="style-row flex items-center gap-2 mb-2">
          <label className="text-xs w-10 shrink-0" style={{ color: "#c9d1d9" }}>位置</label>
          <select
            className="style-select px-2 py-1 rounded text-xs cursor-pointer outline-none"
            value={style.alignment}
            onChange={(e) => set({ alignment: parseInt(e.target.value) as 1 | 2 | 3 })}
          >
            {Object.entries(ALIGNMENT_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>

        <div className="style-row flex items-center gap-2 mb-2">
          <label className="text-xs w-10 shrink-0" style={{ color: "#c9d1d9" }}>边距</label>
          <input
            type="range"
            min="10"
            max="150"
            value={style.marginV}
            onChange={(e) => set({ marginV: parseInt(e.target.value) })}
          />
          <span className="text-[11px] w-[30px] text-right tabular-nums" style={{ color: "#8b949e" }}>
            {style.marginV}px
          </span>
        </div>

        <div className="mt-2.5 p-2.5 rounded-lg text-center min-h-[40px] flex items-end justify-center" style={{ background: "#000" }}>
          <p
            className="m-0 truncate max-w-full"
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
    </>
  );
}
