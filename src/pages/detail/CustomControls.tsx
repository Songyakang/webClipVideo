import type { ReactFlowInstance } from "@xyflow/react";
import type { FlowNode } from "./nodes/types";
import type { Edge } from "@xyflow/react";

interface Props {
  rfInstance: React.RefObject<ReactFlowInstance<FlowNode, Edge> | null>;
  zoom: number;
  className?: string;
  assetLibraryOpen?: boolean;
  onToggleAssetLibrary?: () => void;
  onPreview?: () => void;
  onOrganize?: () => void;
}

const AssetLibraryIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
    <rect x="14" y="14" width="7" height="7" rx="1" />
  </svg>
);

const PreviewIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
    <polygon points="8,5 19,12 8,19" />
  </svg>
);

const OrganizeIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="4" r="2.5" />
    <circle cx="5" cy="16" r="2.5" />
    <circle cx="12" cy="16" r="2.5" />
    <circle cx="19" cy="16" r="2.5" />
    <line x1="11" y1="6.5" x2="6" y2="13.5" />
    <line x1="12" y1="6.5" x2="12" y2="13.5" />
    <line x1="13" y1="6.5" x2="18" y2="13.5" />
  </svg>
);

export default function CustomControls({ rfInstance, zoom, className, assetLibraryOpen, onToggleAssetLibrary, onPreview, onOrganize }: Props) {
  const zoomIn = () => rfInstance.current?.zoomIn({ duration: 200 });
  const zoomOut = () => rfInstance.current?.zoomOut({ duration: 200 });
  const fitView = () => rfInstance.current?.fitView({ duration: 200, padding: 0.2 });

  return (
    <div className={className}>
      {onToggleAssetLibrary && (
        <button
          onClick={onToggleAssetLibrary}
          title="素材库"
          style={{ color: assetLibraryOpen ? "#58a6ff" : undefined }}
        >
          <AssetLibraryIcon />
        </button>
      )}
      {onPreview && (
        <button onClick={onPreview} title="预览">
          <PreviewIcon />
        </button>
      )}
      {onOrganize && (
        <button onClick={onOrganize} title="整理画布">
          <OrganizeIcon />
        </button>
      )}
      <button onClick={zoomIn} title="放大">+</button>
      <span>{Math.round(zoom * 100)}%</span>
      <button onClick={zoomOut} title="缩小">-</button>
      <button onClick={fitView} title="自适应">⊡</button>
    </div>
  );
}
