import { useRef, useCallback, useState } from "react";
import type { SubtitleItem } from "../../../lib/types";
import "./SubtitleTimeline.css";

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
    <div
      className="subtitle-timeline"
      ref={containerRef}
      onClick={handleClick}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <div className="timeline-ruler">
        {ticks.map((t) => (
          <div key={t} style={{ left: timeToX(t), position: "absolute" }}>
            <div className="timeline-tick-line" />
            <span className="timeline-tick">
              {String(Math.floor(t / 60)).padStart(2, "0")}:
              {String(Math.floor(t % 60)).padStart(2, "0")}
            </span>
          </div>
        ))}
      </div>

      <div className="timeline-blocks">
        {items.map((item) => (
          <div
            key={item.id}
            className={`timeline-block${activeItemId === item.id ? " active" : ""}`}
            style={{
              left: timeToX(item.startTime),
              width: Math.max(4, timeToX(item.endTime) - timeToX(item.startTime)),
            }}
            onMouseDown={(e) => handleBlockMouseDown(e, item)}
          >
            <div
              className="timeline-block-resize-left"
              onMouseDown={(e) => handleResizeMouseDown(e, item, "resize-left")}
            />
            <div className="timeline-block-label">{item.text.substring(0, 20)}</div>
            <div
              className="timeline-block-resize-right"
              onMouseDown={(e) => handleResizeMouseDown(e, item, "resize-right")}
            />
          </div>
        ))}
      </div>

      <div
        className="timeline-playhead"
        style={{ left: timeToX(currentTime) }}
      />
    </div>
  );
}
