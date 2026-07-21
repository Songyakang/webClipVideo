// /Users/songyakang/Desktop/奇思妙想/webVideoClip/src/pages/detail/subtitle/BurnProgressOverlay.tsx

interface Props {
  status: "encoding" | "done" | "error";
  message: string;
  onClose: () => void;
}

export default function BurnProgressOverlay({ status, message, onClose }: Props) {
  return (
    <>
      <style>{`
        @keyframes burnFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes burnSpin {
          to { transform: rotate(360deg); }
        }
        @keyframes burnBarSlide {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(430%); }
        }
        .burn-btn { background: #21262d; color: #e6edf3; border: 1px solid #30363d; }
        .burn-btn:hover { background: #30363d; }
      `}</style>
      <div
        className="fixed inset-0 z-[300] flex flex-col items-center justify-center gap-5"
        style={{
          background: "rgba(0,0,0,0.5)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          animation: "burnFadeIn 0.3s ease-out",
        }}
      >
        <div
          className="flex flex-col items-center gap-5 min-w-[360px] rounded-2xl px-10 py-8"
          style={{
            background: "#161b22",
            border: "1px solid #30363d",
            boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
          }}
        >
          {status === "encoding" && (
            <>
              <div
                className="w-10 h-10 rounded-full"
                style={{
                  border: "3px solid #21262d",
                  borderTopColor: "#58a6ff",
                  animation: "burnSpin 0.8s linear infinite",
                }}
              />
              <h3 className="text-base font-semibold m-0" style={{ color: "#e6edf3" }}>
                正在烧录字幕
              </h3>
              <div
                className="w-full h-1.5 rounded overflow-hidden"
                style={{ background: "#21262d" }}
              >
                <div
                  className="h-full rounded"
                  style={{
                    background: "linear-gradient(90deg, #238636, #58a6ff)",
                    animation: "burnBarSlide 2s ease-in-out infinite",
                    width: "30%",
                  }}
                />
              </div>
              <p className="text-[13px] m-0" style={{ color: "#8b949e" }}>
                FFmpeg 编码中，请稍候...
              </p>
            </>
          )}

          {status === "done" && (
            <>
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center"
                style={{ background: "#238636" }}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <h3 className="text-base font-semibold m-0" style={{ color: "#e6edf3" }}>
                导出完成
              </h3>
              <p className="text-[13px] m-0" style={{ color: "#8b949e" }}>
                {message}
              </p>
              <button
                className="burn-btn mt-2 px-6 py-2 rounded text-[13px] cursor-pointer transition-colors duration-150"
                onClick={onClose}
              >
                确定
              </button>
            </>
          )}

          {status === "error" && (
            <>
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center"
                style={{ background: "#da3633" }}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </div>
              <h3 className="text-base font-semibold m-0" style={{ color: "#e6edf3" }}>
                导出失败
              </h3>
              <p className="text-[13px] m-0" style={{ color: "#8b949e" }}>
                {message}
              </p>
              <button
                className="burn-btn mt-2 px-6 py-2 rounded text-[13px] cursor-pointer transition-colors duration-150"
                onClick={onClose}
              >
                确定
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );
}
