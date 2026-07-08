import { useState, useCallback } from "react";
import type { CanvasNodeData, EdgeData } from "./types";

let nodeIdCounter = 0;
let edgeIdCounter = 0;

export function useNodes() {
  const [nodes, setNodes] = useState<CanvasNodeData[]>([]);
  const [edges, setEdges] = useState<EdgeData[]>([]);

  const addNode = useCallback((type: string, canvasX: number, canvasY: number) => {
    setNodes((prev) => [
      ...prev,
      {
        id: `node-${++nodeIdCounter}`,
        type,
        x: canvasX - 350,
        y: canvasY - 200,
        content: "",
        editing: false,
      },
    ]);
  }, []);

  const deleteNode = useCallback((nodeId: string) => {
    setNodes((prev) => prev.filter((n) => n.id !== nodeId));
    setEdges((prev) => prev.filter((e) => e.fromNode !== nodeId && e.toNode !== nodeId));
  }, []);

  const duplicateNode = useCallback((nodeId: string) => {
    setNodes((prev) => {
      const node = prev.find((n) => n.id === nodeId);
      if (!node) return prev;
      return [
        ...prev,
        { ...node, id: `node-${++nodeIdCounter}`, x: node.x + 30, y: node.y + 30, editing: false },
      ];
    });
  }, []);

  const updateNode = useCallback((nodeId: string, patch: Partial<CanvasNodeData>) => {
    setNodes((prev) =>
      prev.map((n) => (n.id === nodeId ? { ...n, ...patch } : n))
    );
  }, []);

  const moveNode = useCallback((nodeId: string, x: number, y: number) => {
    setNodes((prev) =>
      prev.map((n) => (n.id === nodeId ? { ...n, x, y } : n))
    );
  }, []);

  const cancelEditing = useCallback(() => {
    setNodes((prev) => prev.map((n) => (n.editing ? { ...n, editing: false } : n)));
  }, []);

  const addEdge = useCallback((fromNode: string, toNode: string) => {
    setEdges((prev) => {
      const exists = prev.some((e) => e.fromNode === fromNode && e.toNode === toNode);
      if (exists) return prev;
      return [...prev, { id: `edge-${++edgeIdCounter}`, fromNode, toNode }];
    });
  }, []);

  const removeEdge = useCallback((edgeId: string) => {
    setEdges((prev) => prev.filter((e) => e.id !== edgeId));
  }, []);

  return {
    nodes, edges,
    addNode, deleteNode, duplicateNode, updateNode, moveNode, cancelEditing,
    addEdge, removeEdge,
  };
}
