import { useState, useRef, useCallback, useEffect } from "react";

interface UseTimelinePlayerProps {
  totalDuration: number;
  onTimeUpdate?: (time: number) => void;
}

export function useTimelinePlayer({ totalDuration, onTimeUpdate }: UseTimelinePlayerProps) {
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const rafRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const onTimeUpdateRef = useRef(onTimeUpdate);
  onTimeUpdateRef.current = onTimeUpdate;

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const tick = useCallback(() => {
    const now = performance.now() / 1000;
    const dt = lastTimeRef.current > 0 ? now - lastTimeRef.current : 0;
    lastTimeRef.current = now;

    setCurrentTime((prev) => {
      const next = prev + dt;
      if (next >= totalDuration) {
        setPlaying(false);
        lastTimeRef.current = 0;
        onTimeUpdateRef.current?.(totalDuration);
        return totalDuration;
      }
      onTimeUpdateRef.current?.(next);
      return next;
    });

    rafRef.current = requestAnimationFrame(tick);
  }, [totalDuration]);

  const play = useCallback(() => {
    if (playing) return;
    setPlaying(true);
    lastTimeRef.current = performance.now() / 1000;
    rafRef.current = requestAnimationFrame(tick);
  }, [playing, tick]);

  const pause = useCallback(() => {
    setPlaying(false);
    lastTimeRef.current = 0;
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
  }, []);

  const toggle = useCallback(() => {
    if (playing) pause();
    else play();
  }, [playing, play, pause]);

  const seek = useCallback((time: number) => {
    const t = Math.max(0, Math.min(time, totalDuration));
    setCurrentTime(t);
    onTimeUpdateRef.current?.(t);
    if (playing) {
      lastTimeRef.current = performance.now() / 1000;
    }
  }, [totalDuration, playing]);

  return { playing, currentTime, setCurrentTime, play, pause, toggle, seek };
}
