import { useRef, useEffect } from "react";
import { usePanoramaEngine } from "./director/usePanoramaEngine";
import WebGPUGuard from "./director/WebGPUCheck";
import { XIcon } from "./director/icons";

interface Props {
  imageUrl: string;
  onClose: () => void;
}

export default function PanoramaOverlay({ imageUrl, onClose }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { initEngine, dispose } = usePanoramaEngine({ canvasRef, imageUrl });

  useEffect(() => {
    let cancelled = false;
    const tryInit = () => {
      if (cancelled) return;
      if (canvasRef.current) {
        initEngine();
      } else {
        requestAnimationFrame(tryInit);
      }
    };
    tryInit();
    return () => {
      cancelled = true;
      dispose();
    };
  }, [initEngine, dispose]);

  return (
    <WebGPUGuard>
      <style>{`
        .pano-overlay {
          background: #000;
          color: #e6edf3;
          font-family: system-ui, sans-serif;
        }
        .pano-topbar {
          background: rgba(22, 27, 34, 0.9);
          backdrop-filter: blur(8px);
          border-bottom: 1px solid #21262d;
          height: 48px;
        }
        .pano-close-btn {
          color: #8b949e;
          transition: all 0.15s;
        }
        .pano-close-btn:hover {
          color: #ef4444;
          background: rgba(239, 68, 68, 0.1);
        }
        .pano-hint-bottom {
          background: rgba(22, 27, 34, 0.8);
          backdrop-filter: blur(8px);
          border: 1px solid #21262d;
          color: #8b949e;
          font-size: 13px;
          border-radius: 8px;
          padding: 6px 16px;
          pointer-events: none;
        }
      `}</style>

      <div className="pano-overlay fixed inset-0 flex flex-col" style={{ zIndex: 1001 }}>
        {/* Top Bar */}
        <div className="pano-topbar flex items-center justify-between px-4 shrink-0">
          <span className="font-semibold text-sm flex items-center gap-1.5">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <ellipse cx="12" cy="12" rx="8" ry="3" />
            </svg>
            全景图预览
          </span>
          <button
            className="pano-close-btn w-8 h-8 flex items-center justify-center rounded-lg cursor-pointer text-sm"
            onClick={onClose}
            title="关闭"
          >
            <XIcon />
          </button>
        </div>

        {/* Viewport */}
        <div className="flex-1 relative bg-black" style={{ minHeight: 0 }}>
          <canvas
            ref={canvasRef}
            style={{ width: "100%", height: "100%", display: "block" }}
          />

          {/* Bottom hint */}
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2">
            <span className="pano-hint-bottom">
              拖拽鼠标旋转视角
            </span>
          </div>
        </div>
      </div>
    </WebGPUGuard>
  );
}
