interface Props {
  currentTime: number;
  totalDuration: number;
  playing: boolean;
  zoom: number;
  hasSelectedClip: boolean;
  showFilter: boolean;
  onToggle: () => void;
  onSeek: (time: number) => void;
  onZoomChange: (zoom: number) => void;
  onAddClip: () => void;
  onExport: () => void;
  onToggleFilter: () => void;
}

function fmtTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export default function TimelineControls({
  currentTime,
  totalDuration,
  playing,
  zoom,
  hasSelectedClip,
  showFilter,
  onToggle,
  onSeek,
  onZoomChange,
  onAddClip,
  onExport,
  onToggleFilter,
}: Props) {
  return (
    <div
      style={{
        height: 48,
        background: "#161b22",
        borderTop: "1px solid #21262d",
        display: "flex",
        alignItems: "center",
        padding: "0 12px",
        gap: 8,
        flexShrink: 0,
      }}
    >
      {/* Skip back */}
      <button
        onClick={() => onSeek(Math.max(0, currentTime - 5))}
        style={btnStyle}
        title="后退5秒"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" /></svg>
      </button>

      {/* Play/Pause */}
      <button onClick={onToggle} style={{ ...btnStyle, width: 32, height: 32 }}>
        {playing ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3" /></svg>
        )}
      </button>

      {/* Skip forward */}
      <button
        onClick={() => onSeek(Math.min(totalDuration, currentTime + 5))}
        style={btnStyle}
        title="前进5秒"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" /></svg>
      </button>

      {/* Time display */}
      <span style={{ color: "#c9d1d9", fontFamily: "monospace", fontSize: 13, minWidth: 100, textAlign: "center" }}>
        {fmtTime(currentTime)} / {fmtTime(totalDuration)}
      </span>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Zoom */}
      <span style={{ color: "#484f58", fontSize: 10, fontFamily: "monospace" }}>缩放</span>
      <input
        type="range"
        min={20}
        max={300}
        value={zoom}
        onChange={(e) => onZoomChange(Number(e.target.value))}
        style={{ width: 80 }}
      />

      {/* Filter toggle */}
      <button
        onClick={onToggleFilter}
        style={{
          ...btnStyle,
          color: showFilter ? "#58a6ff" : hasSelectedClip ? "#c9d1d9" : "#484f58",
          opacity: hasSelectedClip ? 1 : 0.4,
        }}
        title="滤镜"
        disabled={!hasSelectedClip}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="3" />
          <path d="M12 2a10 10 0 0 1 10 10M12 22a10 10 0 0 1-10-10M12 2a10 10 0 0 0-10 10M12 22a10 10 0 0 0 10-10" />
        </svg>
      </button>

      {/* Add clip */}
      <button onClick={onAddClip} style={{ ...btnStyle, color: "#2ea043" }} title="添加素材">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
      </button>

      {/* Export */}
      <button onClick={onExport} style={{ ...btnStyle, color: "#f0883e" }} title="导出视频">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
      </button>
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  background: "none",
  border: "1px solid #30363d",
  borderRadius: 4,
  color: "#c9d1d9",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 4,
};
