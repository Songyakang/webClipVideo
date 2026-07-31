import { useRef, useCallback } from "react";

interface Props {
  duration: number;
  zoom: number;
  onSeek: (time: number) => void;
}

function fmtTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export default function TimelineRuler({ duration, zoom, onSeek }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  // Adaptive tick interval
  const tickInterval = duration > 300 ? 60 : duration > 60 ? 30 : 10;
  const ticks: number[] = [];
  for (let t = 0; t <= duration; t += tickInterval) {
    ticks.push(t);
  }

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      const rect = ref.current?.getBoundingClientRect();
      if (!rect) return;
      const x = e.clientX - rect.left;
      onSeek(x / zoom);
    },
    [zoom, onSeek],
  );

  const totalWidth = duration * zoom;

  return (
    <div
      ref={ref}
      onClick={handleClick}
      style={{
        position: "relative",
        height: 24,
        width: `${totalWidth}px`,
        minWidth: "100%",
        background: "#161b22",
        borderBottom: "1px solid #21262d",
        cursor: "pointer",
        flexShrink: 0,
      }}
    >
      {ticks.map((t) => (
        <div
          key={t}
          style={{
            position: "absolute",
            left: `${t * zoom}px`,
            top: 0,
            height: "100%",
            borderLeft: "1px solid #30363d",
          }}
        >
          <span
            style={{
              position: "absolute",
              top: 4,
              left: 4,
              fontSize: 10,
              color: "#484f58",
              fontFamily: "monospace",
              whiteSpace: "nowrap",
            }}
          >
            {fmtTime(t)}
          </span>
        </div>
      ))}
    </div>
  );
}
