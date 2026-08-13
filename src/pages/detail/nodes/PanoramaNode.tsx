import { memo, useRef } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Toolbox } from "../toolbox";
import { saveAsset, getAssetSrc } from "../../../lib/assets";

interface PanoramaNodeData {
  type: string;
  content: string;
  fileUrl?: string;
  assetPath?: string;
  w?: number;
  h?: number;
  projectId?: string;
  onUploadComplete?: (nodeId: string, fileUrl: string, assetPath: string) => void;
}

export default memo(function PanoramaNode({ id, data, selected, dragging }: NodeProps) {
  const d = data as unknown as PanoramaNodeData;
  const w = d.w || 680;
  const h = d.h || 400;
  const hasImg = !!d.fileUrl;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUploadClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      // Read and save the file directly here — don't pass the File object
      // through React state, which can cause lifecycle/permission issues.
      const projectId = d.projectId || "";
      const path = await saveAsset(projectId, id, file);
      const url = path.startsWith("blob:") ? path : await getAssetSrc(path);

      if (d.onUploadComplete) {
        d.onUploadComplete(id, url, path);
      }
    } catch (err) {
      console.error("[PanoramaNode] Upload failed:", err);
    }

    e.target.value = "";
  };

  return (
    <div
      className={`flow-node panorama-node${selected ? " selected" : ""}${hasImg ? " no-pad" : ""}`}
      style={hasImg ? {} : { width: w, height: h }}
    >
      <Handle type="target" position={Position.Left} className="flow-handle" />

      {hasImg ? (
        <div className="panorama-img-wrap">
          <img src={d.fileUrl} alt="" className="node-img" style={{ width: w, height: h }} />
          <div className="panorama-hint">双击预览全景图</div>
        </div>
      ) : (
        <div className="node-content node-placeholder-center">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.3 }}>
            <circle cx="12" cy="12" r="10" />
            <ellipse cx="12" cy="12" rx="8" ry="3" />
            <line x1="2" y1="12" x2="22" y2="12" />
          </svg>
          <span>全景图</span>
          <button
            className="panorama-upload-btn"
            onClick={handleUploadClick}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            上传全景图片
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={handleFileChange}
          />
        </div>
      )}

      <Handle type="source" position={Position.Right} className="flow-handle" />

      {selected && !dragging && (
        <div className="node-toolbox-wrapper">
          <Toolbox nodeId={id} nodeType="image" />
        </div>
      )}
    </div>
  );
});
