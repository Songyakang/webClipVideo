import { useRef, useCallback } from "react";
import type { CameraTrack, CameraKeyframe } from "./types";
import styles from "./KeyframeTimeline.module.css";

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
    <div className={styles["kf-timeline"]}>
      {/* Track list */}
      <div className={styles["kf-track-list"]}>
        {tracks.map((track) => (
          <div
            key={track.id}
            className={`${styles["kf-track-label"]}${track.id === activeCameraId ? " active" : ""}`}
          >
            <span
              className={styles["kf-track-color"]}
              style={{ background: track.id === activeCameraId ? "#4ade80" : "#666" }}
            />
            {track.name}
          </div>
        ))}
      </div>

      {/* Timeline area */}
      <div className={styles["kf-timeline-area"]} ref={timelineRef} onClick={handleTimelineClick}>
        {/* Time ruler */}
        <div className={styles["kf-ruler"]}>
          {Array.from({ length: Math.ceil(duration) + 1 }, (_, i) => (
            <div key={i} className={styles["kf-ruler-tick"]} style={{ left: `${(i / duration) * 100}%` }}>
              <span className={styles["kf-ruler-label"]}>0:{String(i).padStart(2, "0")}</span>
            </div>
          ))}
        </div>

        {/* Tracks */}
        {tracks.map((track) => (
          <div key={track.id} className={styles["kf-track-row"]}>
            {track.keyframes.map((kf, idx) => (
              <div
                key={idx}
                className={styles["kf-keyframe-dot"]}
                style={{
                  left: `${(kf.time / duration) * 100}%`,
                  background:
                    idx === 0 ? "#4ade80" : idx === track.keyframes.length - 1 ? "#ef4444" : "#f59e0b",
                }}
              />
            ))}
          </div>
        ))}

        {/* Playhead */}
        <div
          className={styles["kf-playhead"]}
          style={{ left: `${(currentTime / duration) * 100}%` }}
        />
      </div>

      {/* Controls */}
      <div className={styles["kf-controls"]}>
        <button className={styles["kf-ctrl-btn"]} onClick={playing ? onPause : onPlay}>
          {playing ? "⏸" : "▶"}
        </button>
        <span className={styles["kf-time-display"]}>
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>
        <button className={styles["kf-ctrl-btn"]} title="添加关键帧" onClick={handleAddKeyframe}>
          + 关键帧
        </button>
      </div>
    </div>
  );
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}
