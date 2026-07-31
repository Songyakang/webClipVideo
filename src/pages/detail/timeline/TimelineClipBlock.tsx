import { useRef, useCallback, useState, useEffect } from "react";
import type { TimelineClip } from "./types";
import { isFilterEmpty } from "./types";
import { getAssetSrc } from "../../../lib/assets";

interface Props {
  clip: TimelineClip;
  zoom: number;
  trackHeight: number;
  selected: boolean;
  onSelect: (id: string) => void;
  onMove: (clipId: string, newStart: number) => void;
  onTrim: (clipId: string, edge: "left" | "right", newTime: number) => void;
}

const TYPE_COLORS: Record<string, string> = {
  video: "#1f6feb",
  audio: "#d29922",
  image: "#2ea043",
  text: "#a371f7",
};

/** Extract frame thumbnails from a video at evenly spaced intervals via canvas capture. */
function VideoThumbnailStrip({
  assetPath,
  sourceStart,
  sourceDuration,
  stripWidth,
}: {
  assetPath: string;
  sourceStart: number;
  sourceDuration: number;
  stripWidth: number;
}) {
  const [thumbs, setThumbs] = useState<{ time: number; dataUrl: string }[]>([]);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!assetPath || stripWidth < 40 || sourceDuration < 0.5) return;

    const thumbWidth = 48;
    const count = Math.min(Math.floor(stripWidth / thumbWidth), 20);
    if (count < 1) return;

    let cancelled = false;
    const results: { time: number; dataUrl: string }[] = [];

    (async () => {
      try {
        const src = await getAssetSrc(assetPath);
        if (cancelled) return;

        // Create hidden video element
        const video = document.createElement("video");
        video.src = src;
        video.muted = true;
        video.playsInline = true;
        video.preload = "metadata";
        video.crossOrigin = "anonymous";
        videoRef.current = video;

        const canvas = document.createElement("canvas");
        canvas.width = thumbWidth;
        canvas.height = 32;
        canvasRef.current = canvas;
        const ctx = canvas.getContext("2d");

        await new Promise<void>((resolve, reject) => {
          video.onloadedmetadata = () => resolve();
          video.onerror = () => reject(new Error("load failed"));
          video.load();
        });
        if (cancelled) return;

        // Wait until video is seekable
        if (video.readyState < 2) {
          await new Promise<void>((r) => { video.oncanplay = () => r(); });
        }
        if (cancelled) return;

        // Capture frames at evenly spaced intervals
        for (let i = 0; i < count && !cancelled; i++) {
          const t = sourceStart + (i / (count - 1 || 1)) * sourceDuration;
          const cappedT = Math.min(t, video.duration || t);

          try {
            video.currentTime = cappedT;
            await new Promise<void>((resolve) => {
              const onSeeked = () => {
                video.removeEventListener("seeked", onSeeked);
                resolve();
              };
              video.addEventListener("seeked", onSeeked);
            });
          } catch {
            // seek failed, continue
          }

          if (ctx) {
            ctx.drawImage(video, 0, 0, thumbWidth, 32);
            results.push({ time: cappedT, dataUrl: canvas.toDataURL("image/jpeg", 0.5) });
          }
        }

        if (!cancelled) setThumbs(results);
      } catch {
        // Can't load video for thumbnails
      }
    })();

    return () => {
      cancelled = true;
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.removeAttribute("src");
        videoRef.current.load();
        videoRef.current = null;
      }
    };
  }, [assetPath, sourceStart, sourceDuration, stripWidth]);

  if (thumbs.length === 0) return null;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        pointerEvents: "none",
        opacity: 0.7,
      }}
    >
      {thumbs.map((t, i) => (
        <img
          key={i}
          src={t.dataUrl}
          alt=""
          style={{
            height: "100%",
            width: `${100 / thumbs.length}%`,
            objectFit: "cover",
            flexShrink: 0,
          }}
        />
      ))}
    </div>
  );
}

export default function TimelineClipBlock({
  clip,
  zoom,
  trackHeight,
  selected,
  onSelect,
  onMove,
  onTrim,
}: Props) {
  const [dragging, setDragging] = useState<"move" | "trim-left" | "trim-right" | null>(null);
  const dragRef = useRef<{ startX: number; origStart: number; origDur: number } | null>(null);

  const color = TYPE_COLORS[clip.type] || "#58a6ff";
  const left = clip.startTime * zoom;
  const width = Math.max(4, clip.duration * zoom);

  const startDrag = useCallback(
    (type: "move" | "trim-left" | "trim-right", e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      setDragging(type);
      dragRef.current = {
        startX: e.clientX,
        origStart: clip.startTime,
        origDur: clip.duration,
      };

      const handleMove = (ev: MouseEvent) => {
        if (!dragRef.current) return;
        const dx = (ev.clientX - dragRef.current.startX) / zoom;
        const { origStart, origDur } = dragRef.current;

        if (type === "move") {
          onMove(clip.id, Math.max(0, origStart + dx));
        } else if (type === "trim-left") {
          const newStart = Math.max(0, origStart + dx);
          if (newStart < origStart + origDur - 0.1) {
            onTrim(clip.id, "left", newStart);
          }
        } else if (type === "trim-right") {
          const newEnd = origStart + origDur + dx;
          if (newEnd > origStart + 0.1) {
            onTrim(clip.id, "right", newEnd);
          }
        }
      };

      const handleUp = () => {
        setDragging(null);
        dragRef.current = null;
        window.removeEventListener("mousemove", handleMove);
        window.removeEventListener("mouseup", handleUp);
      };

      window.addEventListener("mousemove", handleMove);
      window.addEventListener("mouseup", handleUp);
    },
    [clip.id, clip.startTime, clip.duration, zoom, onMove, onTrim],
  );

  const showThumbnails = clip.type === "video" && clip.assetPath && width > 60;

  return (
    <div
      onClick={(e) => {
        e.stopPropagation();
        onSelect(clip.id);
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onMove(clip.id, 0);
      }}
      style={{
        position: "absolute",
        left: `${left}px`,
        top: 4,
        width: `${width}px`,
        height: `${trackHeight - 8}px`,
        background: selected ? color : `${color}99`,
        borderRadius: 4,
        border: selected ? "2px solid #fff" : "1px solid transparent",
        cursor: dragging === "move" ? "grabbing" : "grab",
        overflow: "hidden",
        zIndex: dragging ? 20 : 1,
        boxShadow: selected ? `0 0 0 1px ${color}` : undefined,
      }}
    >
      {/* Video frame thumbnails */}
      {showThumbnails && (
        <VideoThumbnailStrip
          assetPath={clip.assetPath!}
          sourceStart={clip.sourceStart}
          sourceDuration={clip.sourceEnd - clip.sourceStart || clip.duration}
          stripWidth={width}
        />
      )}

      {/* Title label */}
      <div
        style={{
          position: "relative",
          zIndex: 2,
          padding: "2px 6px",
          fontSize: 10,
          color: "#fff",
          fontFamily: "monospace",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          pointerEvents: "none",
          userSelect: "none",
          textShadow: showThumbnails ? "0 1px 3px rgba(0,0,0,0.8)" : undefined,
        }}
      >
        {/* FX badge when filter is active */}
        {clip.filter && !isFilterEmpty(clip.filter) && (
          <span
            style={{
              display: "inline-block",
              marginRight: 4,
              padding: "0 3px",
              fontSize: 8,
              fontWeight: 700,
              color: "#58a6ff",
              background: "rgba(88,166,255,0.15)",
              borderRadius: 2,
              verticalAlign: "middle",
              lineHeight: "14px",
            }}
          >
            FX
          </span>
        )}
        {clip.title}
      </div>

      {/* Left trim handle */}
      <div
        onMouseDown={(e) => startDrag("trim-left", e)}
        style={{
          position: "absolute", left: 0, top: 0, width: 6, height: "100%",
          cursor: "col-resize", zIndex: 5,
          background: "transparent",
          borderRight: selected ? `2px solid ${color}` : "none",
        }}
      />

      {/* Right trim handle */}
      <div
        onMouseDown={(e) => startDrag("trim-right", e)}
        style={{
          position: "absolute", right: 0, top: 0, width: 6, height: "100%",
          cursor: "col-resize", zIndex: 5,
          background: "transparent",
          borderLeft: selected ? `2px solid ${color}` : "none",
        }}
      />

      {/* Move handle (middle area) */}
      <div
        onMouseDown={(e) => startDrag("move", e)}
        style={{
          position: "absolute", left: 8, right: 8, top: 0,
          height: "100%", cursor: "grab", zIndex: 3,
        }}
      />
    </div>
  );
}
