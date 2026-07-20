import { isDirectorData, type FlowNode } from "./nodes/types";
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
  if (!dirNode || !isDirectorData(dirNode.data)) return null;

  return (
    <DirectorView
      data={dirNode.data}
      projectId={projectId}
      onClose={onClose}
      onUpdate={(newData) => {
        setNodes((prev) =>
          prev.map((n) =>
            n.id === directorNodeId ? { ...n, data: { ...n.data, ...newData } } : n,
          ),
        );
      }}
    />
  );
}
