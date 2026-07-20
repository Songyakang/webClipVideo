import type { FlowNode, NodeData } from "./nodes/types";
import type { DirectorNodeData } from "../../lib/types";
import DirectorView from "./director/DirectorView";

interface Props {
  directorNodeId: string;
  nodes: FlowNode[];
  projectId: string;
  setNodes: React.Dispatch<React.SetStateAction<FlowNode[]>>;
  onClose: () => void;
}

export default function DirectorOverlay({ directorNodeId, nodes, projectId, setNodes, onClose }: Props) {
  const dirNode = nodes.find((n) => n.id === directorNodeId);
  if (!dirNode) return null;

  return (
    <DirectorView
      data={dirNode.data as unknown as DirectorNodeData}
      projectId={projectId}
      onClose={onClose}
      onUpdate={(newData) => {
        setNodes((prev) =>
          prev.map((n) =>
            n.id === directorNodeId
              ? { ...n, data: newData as unknown as NodeData }
              : n
          ) as FlowNode[]
        );
      }}
    />
  );
}
