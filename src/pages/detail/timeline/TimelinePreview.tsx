import { useEffect, useRef } from "react";
import type { TimelineData } from "./types";
import { clipFilterToCSS, vignetteCSS } from "./types";
import { getAssetSrc } from "../../../lib/assets";

interface Props {
  data: TimelineData;
  currentTime: number;
  playing: boolean;
}

/** Find the clip that covers the given time on the video track */
function findClipAtTime(data: TimelineData, time: number) {
  const videoTrack = data.tracks.find((t) => t.type === "video");
  if (!videoTrack) return null;
  return videoTrack.clips.find(
    (c) => time >= c.startTime && time < c.startTime + c.duration,
  ) || null;
}

function fmtTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export default function TimelinePreview({ data, currentTime, playing }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const prevClipRef = useRef<string | null>(null);

  const clip = findClipAtTime(data, currentTime);

  // When clip changes, switch the video source
  useEffect(() => {
    const el = videoRef.current;
    if (!el || !clip?.assetPath) return;

    if (clip.id !== prevClipRef.current) {
      prevClipRef.current = clip.id;
      getAssetSrc(clip.assetPath).then((src) => {
        if (prevClipRef.current === clip.id) {
          el.src = src;
          el.load();
        }
      });
    }

    // Seek to the correct position in the source video
    const sourceTime = clip.sourceStart + (currentTime - clip.startTime);
    if (Math.abs(el.currentTime - sourceTime) > 0.1) {
      el.currentTime = sourceTime;
    }

    if (playing) {
      el.play().catch(() => {});
    } else {
      el.pause();
    }
  }, [clip, currentTime, playing]);

  return (
    <div
      style={{
        width: 340,
        flexShrink: 0,
        background: "#000",
        borderRight: "1px solid #21262d",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Preview video */}
      <div style={{ flex: 1, position: "relative", background: "#000" }}>
        {clip?.assetPath ? (
          <>
            <video
              ref={videoRef}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "contain",
                filter: clipFilterToCSS(clip.filter) || undefined,
              }}
              playsInline
              muted
            />
            {/* Vignette overlay */}
            {vignetteCSS(clip.filter) && (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  pointerEvents: "none",
                  background: vignetteCSS(clip.filter)!,
                }}
              />
            )}
          </>
        ) : (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              color: "#484f58",
              fontSize: 14,
            }}
          >
            无预览
          </div>
        )}
        {/* Time badge overlay */}
        <div
          style={{
            position: "absolute",
            top: 8,
            right: 12,
            padding: "2px 8px",
            fontSize: 12,
            color: "#c9d1d9",
            fontFamily: "monospace",
            background: "rgba(0,0,0,0.6)",
            borderRadius: 4,
          }}
        >
          {fmtTime(currentTime)}
          {clip ? ` / ${fmtTime(clip.sourceStart + clip.sourceEnd - (clip.sourceStart > 0 ? clip.sourceStart : 0))}` : ""}
        </div>
      </div>
    </div>
  );
}
