import { useState, useCallback, memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Toolbox } from "../toolbox";
import { useMouseMode } from "../hooks/MouseModeContext";

const FIXED_W = 640;

export default memo(function VideoNode({ id, data, selected, dragging }: NodeProps) {
  const d = data as any;
  const mouseMode = useMouseMode(); // 箭头（框选）模式下不显示 toolbox
  const isUpload = d.type === "video-upload";
  const hasSrc = isUpload && d.fileUrl;
  const [videoH, setVideoH] = useState(360); // default 16:9

  const onMeta = useCallback((e: React.SyntheticEvent<HTMLVideoElement>) => {
    const v = e.currentTarget;
    if (v.videoWidth && v.videoHeight) {
      setVideoH((v.videoHeight / v.videoWidth) * FIXED_W);
    }
  }, []);

  const w = FIXED_W;
  const h = videoH;

  return (
    <div
      className={`flow-node video-node${selected ? " selected" : ""}${hasSrc ? " no-pad" : ""}`}
      style={hasSrc ? {} : { width: w, height: h }}
    >
      <Handle type="target" position={Position.Left} className="flow-handle" />
      {hasSrc ? (
        <div className="node-video-wrap" style={{ width: w, height: h }}>
          <video
            key={d.fileUrl}
            ref={(el) => { d.videoEl = el; }}
            src={d.fileUrl}
            playsInline preload="metadata"
            onLoadedMetadata={onMeta}
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

      {mouseMode === "hand" && selected && !dragging && hasSrc && (
        <div className="node-toolbox-wrapper">
          <Toolbox nodeId={id} nodeType="video" />
        </div>
      )}
    </div>
  );
});
