import { useCallback, type MutableRefObject } from "react";
import { addEdge as rfAddEdge, type Connection, type Edge } from "@xyflow/react";
import { deleteAssetDir } from "../../../lib/assets";
import type { FlowNode } from "../nodes/types";

export function useNodeOperations(
  projectId: string,
  setNodes: React.Dispatch<React.SetStateAction<FlowNode[]>>,
  setEdges: React.Dispatch<React.SetStateAction<Edge[]>>,
  setSelectedNodes: (ns: FlowNode[]) => void,
  nodeIdCounterRef: MutableRefObject<number>,
  edgeIdCounterRef: MutableRefObject<number>,
) {
  const addNode = useCallback((type: string, x: number, y: number, fileUrl?: string) => {
    const isMedia = type === "image-upload" || type === "video-upload";
    const id = `node-${++nodeIdCounterRef.current}`;
    const newNode: FlowNode = {
      id, type: type as FlowNode["type"], position: { x, y },
      data: { type, content: "", fileUrl: fileUrl || "", w: isMedia ? undefined : 680, h: isMedia ? undefined : 400 },
    };
    setNodes((prev) => [...prev, newNode]);
    return id;
  }, [setNodes, nodeIdCounterRef]);

  const deleteNode = useCallback((nodeId: string) => {
    setNodes((prev) => prev.filter((n) => n.id !== nodeId));
    setEdges((prev) => prev.filter((e: Edge) => e.source !== nodeId && e.target !== nodeId));
    setSelectedNodes([]);
    deleteAssetDir(projectId, nodeId);
  }, [projectId, setNodes, setEdges, setSelectedNodes]);

  const duplicateNode = useCallback((nodeId: string) => {
    setNodes((prev) => {
      const node = prev.find((n) => n.id === nodeId);
      if (!node) return prev;
      const copy = {
        ...node,
        id: `node-${++nodeIdCounterRef.current}`,
        position: { x: node.position.x + 30, y: node.position.y + 30 },
      };
      return [...prev, copy];
    });
  }, [setNodes, nodeIdCounterRef]);

  const addEdge = useCallback((params: Connection) => {
    setEdges((prev) => rfAddEdge({ ...params, id: `edge-${++edgeIdCounterRef.current}` }, prev));
  }, [setEdges, edgeIdCounterRef]);

  const removeEdge = useCallback((edgeId: string) => {
    setEdges((prev) => prev.filter((e: Edge) => e.id !== edgeId));
  }, [setEdges]);

  return { addNode, deleteNode, duplicateNode, addEdge, removeEdge };
}
