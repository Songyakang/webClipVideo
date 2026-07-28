import { useRef, useCallback } from "react";
import type { CameraTrack, CameraKeyframe } from "./types";
import { PlayIcon, PauseIcon } from "./icons";

interface Props {
  tracks: CameraTrack[];
  activeCameraId: string;
  playing: boolean;
  currentTime: number;
  duration: number;
  onPlay: () => void;
  onPause: () => void;
  onSeek: (time: number) => void;
  onKeyframesChange: (trackId: string, keyframes: CameraKeyframe[]) => void;
}

export default function KeyframeTimeline({
  tracks,
  activeCameraId,
  playing,
  currentTime,
  duration,
  onPlay,
  onPause,
  onSeek,
  onKeyframesChange,
}: Props) {
  const timelineRef = useRef<HTMLDivElement>(null);

  const handleTimelineClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!timelineRef.current) return;
      const rect = timelineRef.current.getBoundingClientRect();
      const ratio = (e.clientX - rect.left) / rect.width;
      onSeek(ratio * duration);
    },
    [duration, onSeek]
  );

  const handleAddKeyframe = useCallback(() => {
    const activeTrack = tracks.find((t) => t.id === activeCameraId);
    if (!activeTrack) return;

    const newKeyframe: CameraKeyframe = {
      time: currentTime,
      fov: activeTrack.keyframes[activeTrack.keyframes.length - 1]?.fov ?? 45,
      position: activeTrack.keyframes[activeTrack.keyframes.length - 1]?.position ?? [0, 0, 0],
      lookAt: activeTrack.keyframes[activeTrack.keyframes.length - 1]?.lookAt ?? [0, 0, 0],
    };

    const updatedKeyframes = [...activeTrack.keyframes, newKeyframe].sort(
      (a, b) => a.time - b.time
    );
    onKeyframesChange(activeCameraId, updatedKeyframes);
  }, [tracks, activeCameraId, currentTime, onKeyframesChange]);

  return (
    <>
      <style>{`
        .kf-timeline { background: #161b22; border-top: 1px solid #21262d; }
        .kf-track-list { border-right: 1px solid #21262d; }
        .kf-track-label { color: #8b949e; border-radius: 4px; transition: background 0.15s; }
        .kf-track-label:hover { background: #21262d; }
        .kf-track-label.active { background: #0d1117; color: #e6edf3; }
        .kf-ruler { border-bottom: 1px solid #21262d; }
        .kf-ruler-label { color: #484f58; }
        .kf-track-row { border-bottom: 1px solid #21262d; }
        .kf-keyframe-dot { border: 1px solid #e6edf3; border-radius: 2px; }
        .kf-playhead { background: #58a6ff; }
        .kf-controls { border-left: 1px solid #21262d; }
        .kf-ctrl-btn { background: #21262d; border: 1px solid #30363d; border-radius: 6px; color: #c9d1d9; transition: background 0.15s; cursor: pointer; }
        .kf-ctrl-btn:hover { background: #30363d; }
        .kf-time-display { color: #58a6ff; font-family: monospace; }
      `}</style>
      <div className="kf-timeline flex h-[120px] shrink-0">
        {/* Track list */}
        <div className="kf-track-list w-[120px] p-2 flex flex-col gap-1">
          {tracks.map((track) => (
            <div
              key={track.id}
              className={`kf-track-label flex items-center gap-1.5 p-1 rounded text-[11px] cursor-pointer${track.id === activeCameraId ? " active" : ""}`}
            >
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ background: track.id === activeCameraId ? "#4ade80" : "#666" }}
              />
              {track.name}
            </div>
          ))}
        </div>

        {/* Timeline area */}
        <div className="flex-1 relative cursor-pointer" ref={timelineRef} onClick={handleTimelineClick}>
          {/* Time ruler */}
          <div className="kf-ruler h-5 relative">
            {Array.from({ length: Math.ceil(duration) + 1 }, (_, i) => (
              <div key={i} className="absolute top-0" style={{ left: `${(i / duration) * 100}%`, transform: "translateX(-50%)" }}>
                <span className="kf-ruler-label text-[9px]">0:{String(i).padStart(2, "0")}</span>
              </div>
            ))}
          </div>

          {/* Tracks */}
          {tracks.map((track) => (
            <div key={track.id} className="kf-track-row h-7 relative">
              {track.keyframes.map((kf, idx) => (
                <div
                  key={idx}
                  className="kf-keyframe-dot absolute top-1/2 w-2.5 h-2.5 rounded-sm cursor-pointer z-[2]"
                  style={{
                    left: `${(kf.time / duration) * 100}%`,
                    transform: "translate(-50%, -50%)",
                    background:
                      idx === 0 ? "#4ade80" : idx === track.keyframes.length - 1 ? "#ef4444" : "#f59e0b",
                  }}
                />
              ))}
            </div>
          ))}

          {/* Playhead */}
          <div
            className="kf-playhead absolute top-0 bottom-0 w-0.5 z-[3] pointer-events-none"
            style={{ left: `${(currentTime / duration) * 100}%` }}
          />
        </div>

        {/* Controls */}
        <div className="kf-controls w-[120px] flex flex-col items-center justify-center gap-1.5 p-2">
          <button className="kf-ctrl-btn px-2.5 py-1 rounded cursor-pointer text-[13px]" onClick={playing ? onPause : onPlay}>
            {playing ? <PauseIcon /> : <PlayIcon />}
          </button>
          <span className="kf-time-display text-[11px]">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>
          <button className="kf-ctrl-btn px-2.5 py-1 rounded cursor-pointer text-[13px]" title="添加关键帧" onClick={handleAddKeyframe}>
            + 关键帧
          </button>
        </div>
      </div>
    </>
  );
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}
