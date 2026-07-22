import { useCallback, memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";

export default memo(function VideoNode({ data, selected }: NodeProps) {
  const d = data as any;

  const videoRefCallback = useCallback((el: HTMLVideoElement | null) => {
    d.videoEl = el;
  }, []);
  const w = d.w || 700;
  const h = d.h || 400;
  const isUpload = d.type === "video-upload";
  const hasSrc = isUpload && d.fileUrl;

  return (
    <div
      className={`flow-node video-node${selected ? " selected" : ""}${hasSrc ? " no-pad" : ""}`}
      style={hasSrc ? {} : { width: w, height: h }}
    >
      <Handle type="target" position={Position.Left} className="flow-handle" />
      {hasSrc ? (
        <div className="node-video-wrap" style={{ width: w, height: h }}>
          <video
            ref={videoRefCallback}
            src={d.fileUrl}
            playsInline
            preload="metadata"
            className="node-video-el"
            controls
          />
        </div>
      ) : (
        <div className="node-content node-placeholder-center">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.3 }}>
            <polygon points="5 3 19 12 5 21 5 3" />
          </svg>
          <span>视频</span>
        </div>
      )}
      <Handle type="source" position={Position.Right} className="flow-handle" />
    </div>
  );
});
