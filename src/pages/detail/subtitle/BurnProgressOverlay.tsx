// /Users/songyakang/Desktop/奇思妙想/webVideoClip/src/pages/detail/subtitle/BurnProgressOverlay.tsx
import "./BurnProgressOverlay.css";

interface Props {
  status: "encoding" | "done" | "error";
  message: string;
  onClose: () => void;
}

export default function BurnProgressOverlay({ status, message, onClose }: Props) {
  return (
    <div className="burn-overlay">
      <div className="burn-card">
        {status === "encoding" && (
          <>
            <div className="burn-spinner" />
            <h3 className="burn-title">正在烧录字幕</h3>
            <div className="burn-progress-track">
              <div className="burn-progress-fill" />
            </div>
            <p className="burn-message">FFmpeg 编码中，请稍候...</p>
          </>
        )}

        {status === "done" && (
          <>
            <div className="burn-done-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <h3 className="burn-title">导出完成</h3>
            <p className="burn-message">{message}</p>
            <button className="burn-btn" onClick={onClose}>确定</button>
          </>
        )}

        {status === "error" && (
          <>
            <div className="burn-error-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </div>
            <h3 className="burn-title">导出失败</h3>
            <p className="burn-message">{message}</p>
            <button className="burn-btn" onClick={onClose}>确定</button>
          </>
        )}
      </div>
    </div>
  );
}
