import { useCallback, type MutableRefObject } from "react";
import { addEdge as rfAddEdge, type Connection, type Edge } from "@xyflow/react";
import { deleteAssetDir } from "../../../lib/assets";
import { ungroupNodes } from "../grouping";
import { buildCopyPayload, buildPastePayload } from "./clipboard";
import type { FlowNode } from "../nodes/types";

export function useNodeOperations(
  projectId: string,
  setNodes: React.Dispatch<React.SetStateAction<FlowNode[]>>,
  setEdges: React.Dispatch<React.SetStateAction<Edge[]>>,
  setSelectedNodes: (ns: FlowNode[]) => void,
  nodeIdCounterRef: MutableRefObject<number>,
  edgeIdCounterRef: MutableRefObject<number>,
  nodesRef: MutableRefObject<FlowNode[]>,
  edgesRef: MutableRefObject<Edge[]>,
) {
  const addNode = useCallback((type: string, x: number, y: number, fileUrl?: string, extraData?: Record<string, unknown>) => {
    const isMedia = type === "image-upload" || type === "video-upload";
    const id = `node-${++nodeIdCounterRef.current}`;
    const newNode: FlowNode = {
      id, type: type as FlowNode["type"], position: { x, y },
      data: { type, content: "", fileUrl: fileUrl || "", w: isMedia ? undefined : 680, h: isMedia ? undefined : 400, ...extraData },
    };
    setNodes((prev) => [...prev, newNode]);
    return id;
  }, [setNodes, nodeIdCounterRef]);

  const deleteNode = useCallback((nodeId: string) => {
    setNodes((prev) => ungroupNodes(prev, new Set([nodeId])).filter((n) => n.id !== nodeId));
    setEdges((prev) => prev.filter((e: Edge) => e.source !== nodeId && e.target !== nodeId));
    setSelectedNodes([]);
    deleteAssetDir(projectId, nodeId);
  }, [projectId, setNodes, setEdges, setSelectedNodes]);

  const duplicateNode = useCallback((nodeId: string) => {
    const payload = buildCopyPayload(nodesRef.current, edgesRef.current, new Set([nodeId]));
    if (!payload.nodes.length) return;
    const result = buildPastePayload(payload, nodeIdCounterRef.current, edgeIdCounterRef.current,
      payload.nodes[0].position, { x: 30, y: 30 });
    nodeIdCounterRef.current = result.nodeIdCounter;
    edgeIdCounterRef.current = result.edgeIdCounter;
    setNodes((prev) => [...prev.map((n) => n.selected ? { ...n, selected: false } : n), ...result.nodes]);
    setEdges((prev) => [...prev, ...result.edges]);
  }, [setNodes, setEdges, nodeIdCounterRef, edgeIdCounterRef, nodesRef, edgesRef]);

  const addEdge = useCallback((params: Connection) => {
    setEdges((prev) => rfAddEdge({ ...params, id: `edge-${++edgeIdCounterRef.current}` }, prev));
  }, [setEdges, edgeIdCounterRef]);

  const removeEdge = useCallback((edgeId: string) => {
    setEdges((prev) => prev.filter((e: Edge) => e.id !== edgeId));
  }, [setEdges]);

  return { addNode, deleteNode, duplicateNode, addEdge, removeEdge };
}
