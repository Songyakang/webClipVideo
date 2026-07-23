import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import ImageToolbox from "../ImageToolbox";

export default memo(function ImageNode({ id, data, selected, dragging }: NodeProps) {
  const d = data as any;
  const w = d.w || 700;
  const h = d.h || 400;
  const isUpload = d.type === "image-upload";
  const hasImg = isUpload && d.fileUrl;

  return (
    <div
      className={`flow-node image-node${selected ? " selected" : ""}${hasImg ? " no-pad" : ""}`}
      style={hasImg ? {} : { width: w, height: h }}
    >
      <Handle type="target" position={Position.Left} className="flow-handle" />
      {hasImg ? (
        <img src={d.fileUrl} alt="" className="node-img" style={{ width: w, height: h }} />
      ) : (
        <div className="node-content node-placeholder-center">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.3 }}>
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
          </svg>
          <span>图片</span>
        </div>
      )}
      <Handle type="source" position={Position.Right} className="flow-handle" />
      {selected && !dragging && (
        <div className="node-toolbox-wrapper">
          <ImageToolbox nodeId={id} nodeType="image" />
        </div>
      )}
    </div>
  );
});
