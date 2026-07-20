import { useState, useRef, useCallback, useEffect } from "react";
import type { CameraTrack } from "./types";

interface UseCameraAnimationOptions {
  track: CameraTrack | undefined;
  onFrame?: (time: number) => void;
}

export function useCameraAnimation({ track, onFrame }: UseCameraAnimationOptions) {
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const rafRef = useRef<number>(0);
  const startRef = useRef<number>(0);
  const initialTimeRef = useRef<number>(0);

  const duration = track?.keyframes.length
    ? track.keyframes[track.keyframes.length - 1].time
    : 5;

  const play = useCallback(() => {
    if (!track?.keyframes.length) return;
    setPlaying(true);
    startRef.current = performance.now();
    initialTimeRef.current = currentTime >= duration ? 0 : currentTime;
  }, [track, currentTime, duration]);

  const pause = useCallback(() => {
    setPlaying(false);
    cancelAnimationFrame(rafRef.current);
  }, []);

  const seek = useCallback((time: number) => {
    setCurrentTime(Math.max(0, Math.min(time, duration)));
    onFrame?.(time);
  }, [duration, onFrame]);

  // Playback loop
  useEffect(() => {
    if (!playing) return;

    const loop = (now: number) => {
      const elapsed = (now - startRef.current) / 1000;
      const t = initialTimeRef.current + elapsed;
      if (t >= duration) {
        setCurrentTime(duration);
        setPlaying(false);
        onFrame?.(duration);
        return;
      }
      setCurrentTime(t);
      onFrame?.(t);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [playing, duration, onFrame]);

  // Interpolate camera position at a given time
  const getCameraAtTime = useCallback((t: number) => {
    if (!track?.keyframes.length) return null;
    const kfs = track.keyframes;

    if (t <= kfs[0].time) return kfs[0];
    if (t >= kfs[kfs.length - 1].time) return kfs[kfs.length - 1];

    for (let i = 0; i < kfs.length - 1; i++) {
      const a = kfs[i];
      const b = kfs[i + 1];
      if (t >= a.time && t <= b.time) {
        const ratio = (t - a.time) / (b.time - a.time);
        // Apply easing
        const eased = applyEasing(ratio, track.easing);
        return {
          time: t,
          fov: a.fov + (b.fov - a.fov) * eased,
          position: a.position.map((v, j) => v + (b.position[j] - v) * eased) as [number, number, number],
          lookAt: a.lookAt.map((v, j) => v + (b.lookAt[j] - v) * eased) as [number, number, number],
        };
      }
    }
    return kfs[kfs.length - 1];
  }, [track]);

  return { playing, currentTime, duration, play, pause, seek, getCameraAtTime };
}

function applyEasing(t: number, easing: CameraTrack["easing"]): number {
  switch (easing) {
    case "ease-in": return t * t;
    case "ease-out": return t * (2 - t);
    case "ease-in-out": return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    default: return t;
  }
}
