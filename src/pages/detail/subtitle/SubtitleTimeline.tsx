import { useRef, useCallback, useState } from "react";
import type { SubtitleItem } from "../../../lib/types";

interface Props {
  items: SubtitleItem[];
  duration: number;
  currentTime: number;
  onSeek: (time: number) => void;
  onUpdateItemTime: (id: string, startTime: number, endTime: number) => void;
  activeItemId?: string;
}

export default function SubtitleTimeline({
  items,
  duration,
  currentTime,
  onSeek,
  onUpdateItemTime,
  activeItemId,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<{
    id: string;
    type: "move" | "resize-left" | "resize-right";
    startX: number;
    origStart: number;
    origEnd: number;
  } | null>(null);

  const totalDuration = duration > 0 ? duration : Math.max(...items.map((i) => i.endTime), 10);

  const timeToX = useCallback(
    (t: number) => {
      if (!containerRef.current) return 0;
      return (t / totalDuration) * containerRef.current.clientWidth;
    },
    [totalDuration]
  );

  const xToTime = useCallback(
    (x: number) => {
      if (!containerRef.current) return 0;
      return (x / containerRef.current.clientWidth) * totalDuration;
    },
    [totalDuration]
  );

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (dragging || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      onSeek(xToTime(x));
    },
    [dragging, onSeek, xToTime]
  );

  const handleBlockMouseDown = useCallback(
    (e: React.MouseEvent, item: SubtitleItem) => {
      e.stopPropagation();
      if (!containerRef.current) return;
      setDragging({
        id: item.id,
        type: "move",
        startX: e.clientX,
        origStart: item.startTime,
        origEnd: item.endTime,
      });
    },
    []
  );

  const handleResizeMouseDown = useCallback(
    (e: React.MouseEvent, item: SubtitleItem, side: "resize-left" | "resize-right") => {
      e.stopPropagation();
      setDragging({
        id: item.id,
        type: side,
        startX: e.clientX,
        origStart: item.startTime,
        origEnd: item.endTime,
      });
    },
    []
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!dragging || !containerRef.current) return;
      const dx = xToTime(e.clientX) - xToTime(dragging.startX);

      if (dragging.type === "move") {
        const newStart = Math.max(0, dragging.origStart + dx);
        const newEnd = dragging.origEnd + dx;
        onUpdateItemTime(dragging.id, newStart, newEnd);
      } else if (dragging.type === "resize-left") {
        const newStart = Math.max(0, Math.min(dragging.origEnd - 0.1, dragging.origStart + dx));
        onUpdateItemTime(dragging.id, newStart, dragging.origEnd);
      } else if (dragging.type === "resize-right") {
        const newEnd = Math.max(dragging.origStart + 0.1, dragging.origEnd + dx);
        onUpdateItemTime(dragging.id, dragging.origStart, newEnd);
      }
    },
    [dragging, onUpdateItemTime, xToTime]
  );

  const handleMouseUp = useCallback(() => {
    setDragging(null);
  }, []);

  const tickInterval = totalDuration > 300 ? 60 : totalDuration > 60 ? 30 : 10;
  const ticks: number[] = [];
  for (let t = 0; t <= totalDuration; t += tickInterval) {
    ticks.push(t);
  }

  return (
    <>
      <style>{`
        .timeline-block:hover { opacity: 1; }
        .timeline-playhead::after {
          content: "";
          position: absolute;
          top: 0;
          left: -4px;
          width: 9px;
          height: 9px;
          background: #f85149;
          border-radius: 2px;
          transform: rotate(45deg);
        }
      `}</style>
      <div
        className="relative h-20 cursor-pointer overflow-hidden select-none"
        ref={containerRef}
        style={{ background: "#0d1117", borderBottom: "1px solid #21262d" }}
        onClick={handleClick}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <div
          className="absolute top-0 left-0 right-0 h-5 flex pointer-events-none"
          style={{ borderBottom: "1px solid #21262d" }}
        >
          {ticks.map((t) => (
            <div key={t} style={{ left: timeToX(t), position: "absolute" }}>
              <div
                className="absolute top-0 bottom-0 w-px"
                style={{ background: "#21262d" }}
              />
              <span
                className="absolute bottom-0.5 text-[9px] tabular-nums"
                style={{ color: "#484f58" }}
              >
                {String(Math.floor(t / 60)).padStart(2, "0")}:
                {String(Math.floor(t % 60)).padStart(2, "0")}
              </span>
            </div>
          ))}
        </div>

        <div className="absolute top-5 left-0 right-0 bottom-0">
          {items.map((item) => (
            <div
              key={item.id}
              className="timeline-block absolute top-1 bottom-1 rounded opacity-80 transition-opacity duration-100 cursor-grab overflow-hidden"
              style={{
                background: activeItemId === item.id ? "#1f3d5e" : "#1a2a3d",
                border: `1px solid ${activeItemId === item.id ? "#79c0ff" : "#58a6ff"}`,
                left: timeToX(item.startTime),
                width: Math.max(4, timeToX(item.endTime) - timeToX(item.startTime)),
                zIndex: activeItemId === item.id ? 3 : 1,
              }}
              onMouseDown={(e) => handleBlockMouseDown(e, item)}
            >
              <div
                className="absolute top-0 bottom-0 w-[6px] cursor-col-resize z-[2] left-0"
                onMouseDown={(e) => handleResizeMouseDown(e, item, "resize-left")}
              />
              <div
                className="text-[9px] px-1 py-px truncate pointer-events-none"
                style={{ color: "#8b949e" }}
              >
                {item.text.substring(0, 20)}
              </div>
              <div
                className="absolute top-0 bottom-0 w-[6px] cursor-col-resize z-[2] right-0"
                onMouseDown={(e) => handleResizeMouseDown(e, item, "resize-right")}
              />
            </div>
          ))}
        </div>

        <div
          className="timeline-playhead absolute top-0 bottom-0 w-px z-[5] pointer-events-none"
          style={{ background: "#f85149", left: timeToX(currentTime) }}
        />
      </div>
    </>
  );
}
