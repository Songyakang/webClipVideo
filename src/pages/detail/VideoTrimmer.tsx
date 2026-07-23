import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { loadAssetUrl } from "../../lib/assets";
import { showToast } from "../../lib/toast";

function fmtTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

interface Props {
  videoEl: HTMLVideoElement | null;
  assetPath: string;
  onTrimmed: (newFileUrl: string, newAssetPath: string) => void;
}

export default function VideoTrimmer({ videoEl, assetPath, onTrimmed }: Props) {
  const [duration, setDuration] = useState(0);
  const [startTime, setStartTime] = useState(0);
  const [endTime, setEndTime] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [trimming, setTrimming] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<number>(0);

  // Read duration from video element
  useEffect(() => {
    const el = videoEl;
    if (!el) return;
    const update = () => {
      if (el.duration && isFinite(el.duration)) {
        setDuration(el.duration);
        setEndTime(el.duration);
      }
    };
    el.addEventListener("loadedmetadata", update);
    el.addEventListener("durationchange", update);
    update();
    return () => {
      el.removeEventListener("loadedmetadata", update);
      el.removeEventListener("durationchange", update);
    };
  }, [videoEl]);

  // Track current playback time
  useEffect(() => {
    const el = videoEl;
    if (!el) return;
    const tick = () => {
      setCurrentTime(el.currentTime);
      animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [videoEl]);

  const getTimeFromX = useCallback((clientX: number): number => {
    const bar = barRef.current;
    if (!bar || !duration) return 0;
    const rect = bar.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return ratio * duration;
  }, [duration]);

  const handleBarMouseDown = useCallback((e: React.MouseEvent) => {
    const t = getTimeFromX(e.clientX);
    setCurrentTime(t);
    if (videoEl) videoEl.currentTime = t;

    const onMove = (ev: MouseEvent) => {
      const t2 = getTimeFromX(ev.clientX);
      setCurrentTime(t2);
      if (videoEl) videoEl.currentTime = t2;
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [getTimeFromX, videoEl]);

  const handleHandleMouseDown = useCallback((which: "start" | "end") => (e: React.MouseEvent) => {
    e.stopPropagation();

    const onMove = (ev: MouseEvent) => {
      const t = getTimeFromX(ev.clientX);
      if (which === "start") {
        setStartTime(Math.max(0, Math.min(t, endTime - 0.1)));
      } else {
        setEndTime(Math.max(startTime + 0.1, Math.min(t, duration)));
      }
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [getTimeFromX, duration, startTime, endTime]);

  const handleTrim = async () => {
    if (endTime - startTime < 0.1) {
      showToast("裁剪区间太小", "error");
      return;
    }
    setTrimming(true);
    try {
      const newPath: string = await invoke("trim_video", {
        assetPath,
        startSeconds: startTime,
        endSeconds: endTime,
      });
      const newUrl = await loadAssetUrl(newPath);
      if (!newUrl) {
        showToast("裁剪后的视频加载失败", "error");
        return;
      }
      onTrimmed(newUrl, newPath);
      showToast("裁剪完成", "success");
    } catch (err) {
      console.error("trim_video failed:", err);
      const msg = typeof err === "string" ? err : "裁剪失败";
      showToast(msg, "error");
    } finally {
      setTrimming(false);
    }
  };

  const startPct = duration > 0 ? (startTime / duration) * 100 : 0;
  const endPct = duration > 0 ? (endTime / duration) * 100 : 100;
  const curPct = duration > 0 ? (currentTime / duration) * 100 : 0;

  if (!duration) return null;

  return (
    <div
      className="nodrag flex flex-col gap-2 p-3 rounded-lg border select-none"
      style={{ background: "#161b22", borderColor: "#30363d", width: 680 }}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <style>{`
        .trim-bar { position: relative; height: 32px; border-radius: 6px; cursor: pointer; background: #0d1117; border: 1px solid #30363d; }
        .trim-selection { position: absolute; top: 0; height: 100%; border-radius: 0; background: rgba(88,166,255,0.15); border-left: 2px solid #58a6ff; border-right: 2px solid #58a6ff; }
        .trim-handle { position: absolute; top: 0; bottom: 0; width: 8px; cursor: col-resize; z-index: 2; }
        .trim-handle::after { content: ''; position: absolute; top: 0; bottom: 0; left: 3px; width: 2px; background: #58a6ff; border-radius: 1px; }
        .trim-playhead { position: absolute; top: -2px; bottom: -2px; width: 2px; background: #fff; z-index: 1; pointer-events: none; border-radius: 1px; }
      `}</style>

      {/* Time labels */}
      <div className="flex justify-between text-xs" style={{ color: "#8b949e" }}>
        <span>{fmtTime(startTime)}</span>
        <span>{fmtTime(endTime - startTime)}</span>
        <span>{fmtTime(endTime)}</span>
      </div>

      {/* Timeline bar */}
      <div ref={barRef} className="trim-bar" onMouseDown={handleBarMouseDown}>
        {/* Selection range */}
        <div className="trim-selection" style={{ left: `${startPct}%`, width: `${endPct - startPct}%` }} />
        {/* Playhead */}
        <div className="trim-playhead" style={{ left: `${curPct}%` }} />
        {/* Start handle */}
        <div
          className="trim-handle"
          style={{ left: `${startPct}%` }}
          onMouseDown={handleHandleMouseDown("start")}
        />
        {/* End handle */}
        <div
          className="trim-handle"
          style={{ right: `${100 - endPct}%` }}
          onMouseDown={handleHandleMouseDown("end")}
        />
      </div>

      {/* Buttons */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs" style={{ color: "#484f58" }}>
          <span>拖拽蓝色手柄设置起止点</span>
        </div>
        <button
          className="toolbox-btn primary"
          onClick={handleTrim}
          disabled={trimming}
          style={{ padding: "5px 16px", fontSize: 12 }}
        >
          {trimming ? "裁剪中..." : "裁剪"}
        </button>
      </div>
    </div>
  );
}
