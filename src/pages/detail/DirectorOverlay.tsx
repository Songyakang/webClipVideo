import { useMemo } from "react";
import type { Edge } from "@xyflow/react";
import { isDirectorData, type FlowNode } from "./nodes/types";
import type { ConnectedScene } from "./director/types";
import DirectorView from "./director/DirectorView";

interface Props {
  directorNodeId: string;
  nodes: FlowNode[];
  edges: Edge[];
  projectId: string;
  setNodes: React.Dispatch<React.SetStateAction<FlowNode[]>>;
  onClose: () => void;
  onOutputToCanvas?: (videoAssetPath: string) => void;
  onAddModelFromAsset?: (assetPath: string) => void;
}

export default function DirectorOverlay({ directorNodeId, nodes, edges, projectId, setNodes, onClose, onOutputToCanvas, onAddModelFromAsset }: Props) {
  const dirNode = nodes.find((n) => n.id === directorNodeId);
  if (!dirNode || !isDirectorData(dirNode.data)) return null;

  const connectedScenes: ConnectedScene[] = useMemo(() => {
    const outgoingEdges = edges.filter((e) => e.source === directorNodeId);
    return outgoingEdges
      .map((e) => {
        const targetNode = nodes.find((n) => n.id === e.target);
        if (!targetNode || targetNode.type !== "director" || !isDirectorData(targetNode.data)) {
          return null;
        }
        return { nodeId: targetNode.id, data: targetNode.data };
      })
      .filter((s): s is NonNullable<typeof s> => s !== null);
  }, [edges, nodes, directorNodeId]);

  return (
    <DirectorView
      data={dirNode.data}
      projectId={projectId}
      onClose={onClose}
      onOutputToCanvas={onOutputToCanvas}
      onAddModelFromAsset={onAddModelFromAsset}
      connectedScenes={connectedScenes}
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
