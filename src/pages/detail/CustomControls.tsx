import type { ReactFlowInstance } from "@xyflow/react";
import type { FlowNode } from "./nodes/types";
import type { Edge } from "@xyflow/react";

interface Props {
  rfInstance: React.RefObject<ReactFlowInstance<FlowNode, Edge> | null>;
  zoom: number;
  className?: string;
}

export default function CustomControls({ rfInstance, zoom, className }: Props) {
  const zoomIn = () => rfInstance.current?.zoomIn({ duration: 200 });
  const zoomOut = () => rfInstance.current?.zoomOut({ duration: 200 });
  const fitView = () => rfInstance.current?.fitView({ duration: 200, padding: 0.2 });

  return (
    <div className={className}>
      <button onClick={zoomIn} title="放大">+</button>
      <span>{Math.round(zoom * 100)}%</span>
      <button onClick={zoomOut} title="缩小">-</button>
      <button onClick={fitView} title="自适应">⊡</button>
    </div>
  );
}
