import { useState, useEffect, useCallback } from "react";
import "./SubtitlePlayerBar.css";

function fmt(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

interface Props {
  videoEl: HTMLVideoElement | null;
  currentTime: number;
  onTimeUpdate: (t: number) => void;
  duration: number;
}

export default function SubtitlePlayerBar({ videoEl, currentTime, onTimeUpdate, duration }: Props) {
  const [playing, setPlaying] = useState(false);
  const [volume, setVolumeState] = useState(1);

  useEffect(() => {
    if (!videoEl) return;
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onTime = () => onTimeUpdate(videoEl.currentTime);
    const onVol = () => setVolumeState(videoEl.volume);
    videoEl.addEventListener("play", onPlay);
    videoEl.addEventListener("pause", onPause);
    videoEl.addEventListener("timeupdate", onTime);
    videoEl.addEventListener("volumechange", onVol);
    return () => {
      videoEl.removeEventListener("play", onPlay);
      videoEl.removeEventListener("pause", onPause);
      videoEl.removeEventListener("timeupdate", onTime);
      videoEl.removeEventListener("volumechange", onVol);
    };
  }, [videoEl, onTimeUpdate]);

  const togglePlay = useCallback(() => {
    if (!videoEl) return;
    if (videoEl.paused) videoEl.play();
    else videoEl.pause();
  }, [videoEl]);

  const skip = useCallback(
    (delta: number) => {
      if (!videoEl) return;
      videoEl.currentTime = Math.max(0, Math.min(duration, videoEl.currentTime + delta));
    },
    [videoEl, duration]
  );

  const setVolume = useCallback(
    (v: number) => {
      if (!videoEl) return;
      videoEl.volume = v;
      setVolumeState(v);
    },
    [videoEl]
  );

  return (
    <div className="subtitle-player-bar">
      <button className="player-btn" onClick={() => skip(-5)} title="后退5秒">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="1 4 1 10 7 10" />
          <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
        </svg>
      </button>
      <button className="player-btn" onClick={togglePlay} title={playing ? "暂停" : "播放"}>
        {playing ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <rect x="6" y="4" width="4" height="16" rx="1" />
            <rect x="14" y="4" width="4" height="16" rx="1" />
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="6 4 20 12 6 20 6 4" />
          </svg>
        )}
      </button>
      <button className="player-btn" onClick={() => skip(5)} title="前进5秒">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="23 4 23 10 17 10" />
          <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
        </svg>
      </button>
      <div className="player-time">
        <span>{fmt(currentTime)}</span> / {fmt(duration)}
      </div>
      <div className="player-spacer" />
      <div className="player-volume">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: "#8b949e" }}>
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
          <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
        </svg>
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={volume}
          onChange={(e) => setVolume(parseFloat(e.target.value))}
        />
      </div>
    </div>
  );
}
