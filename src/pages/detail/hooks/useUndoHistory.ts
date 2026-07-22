import { useCallback, useRef, useState } from "react";
import type { Edge } from "@xyflow/react";
import type { FlowNode } from "../nodes/types";

interface Snapshot {
  nodes: FlowNode[];
  edges: Edge[];
}

const MAX_HISTORY = 50;

/** Lightweight clone: only copies fields we care about for undo. */
function cloneSnapshot(nodes: FlowNode[], edges: Edge[]): Snapshot {
  return {
    nodes: nodes.map((n) => {
      const { videoEl, ...data } = n.data || {};
      return {
        ...n,
        position: { ...n.position },
        data: { ...data },
      };
    }),
    edges: edges.map((e) => ({ ...e })),
  };
}

export function useUndoHistory() {
  const pastRef = useRef<Snapshot[]>([]);
  const futureRef = useRef<Snapshot[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const currentRef = useRef<Snapshot | null>(null);
  const lastCountRef = useRef({ nodes: 0, edges: 0 });

  const push = useCallback((nodes: FlowNode[], edges: Edge[]) => {
    // Skip if nothing changed (fast count check instead of JSON compare)
    if (lastCountRef.current.nodes === nodes.length && lastCountRef.current.edges === edges.length) return;
    lastCountRef.current = { nodes: nodes.length, edges: edges.length };

    if (currentRef.current) {
      pastRef.current.push(currentRef.current);
      if (pastRef.current.length > MAX_HISTORY) pastRef.current.shift();
    }
    futureRef.current = [];
    currentRef.current = cloneSnapshot(nodes, edges);
    setCanUndo(true);
    setCanRedo(false);
  }, []);

  const undo = useCallback(() => {
    const past = pastRef.current;
    if (past.length === 0 || !currentRef.current) return null;

    futureRef.current.push(currentRef.current);
    const prev = past.pop()!;
    currentRef.current = prev;
    setCanUndo(past.length > 0);
    setCanRedo(true);
    return cloneSnapshot(prev.nodes, prev.edges);
  }, []);

  const redo = useCallback(() => {
    const future = futureRef.current;
    if (future.length === 0 || !currentRef.current) return null;

    pastRef.current.push(currentRef.current);
    const next = future.pop()!;
    currentRef.current = next;
    setCanUndo(true);
    setCanRedo(future.length > 0);
    return cloneSnapshot(next.nodes, next.edges);
  }, []);

  return { push, undo, redo, canUndo, canRedo };
}
