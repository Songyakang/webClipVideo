import { useEffect } from "react";
import type { FlowNode } from "../nodes/types";
import TimelineEditor from "./TimelineEditor";

interface Props {
  projectId: string;
  initialAssetPath?: string;
  initialFileUrl?: string;
  initialTitle?: string;
  projectNodes: FlowNode[];
  onClose: () => void;
}

export default function TimelineOverlay({
  projectId,
  initialAssetPath,
  initialFileUrl,
  initialTitle,
  projectNodes,
  onClose,
}: Props) {
  // Escape key to close
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <div
      className="nodrag"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "#0d1117",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <TimelineEditor
        projectId={projectId}
        initialAssetPath={initialAssetPath}
        initialFileUrl={initialFileUrl}
        initialTitle={initialTitle}
        projectNodes={projectNodes}
        onClose={onClose}
      />
    </div>
  );
}
