import { useCallback, useRef, useState } from "react";
import type { Edge } from "@xyflow/react";
import type { FlowNode } from "../nodes/types";

interface Snapshot {
  nodes: FlowNode[];
  edges: Edge[];
}

const MAX_HISTORY = 50;

function clone(nodes: FlowNode[], edges: Edge[]): Snapshot {
  // Strip videoEl DOM refs before serializing
  const cleanNodes = nodes.map((n) => {
    const { videoEl, ...data } = n.data || {};
    return { ...n, data };
  });
  return JSON.parse(JSON.stringify({ nodes: cleanNodes, edges }));
}

export function useUndoHistory() {
  const pastRef = useRef<Snapshot[]>([]);
  const futureRef = useRef<Snapshot[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const currentRef = useRef<Snapshot | null>(null);

  const push = useCallback((nodes: FlowNode[], edges: Edge[]) => {
    const snap = clone(nodes, edges);
    const curr = currentRef.current;

    // Deduplicate: skip if identical to current state
    if (curr && JSON.stringify(curr) === JSON.stringify(snap)) return;

    if (curr) {
      pastRef.current.push(curr);
      if (pastRef.current.length > MAX_HISTORY) pastRef.current.shift();
    }
    futureRef.current = [];
    currentRef.current = snap;
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
    return JSON.parse(JSON.stringify(prev)) as Snapshot;
  }, []);

  const redo = useCallback(() => {
    const future = futureRef.current;
    if (future.length === 0 || !currentRef.current) return null;

    pastRef.current.push(currentRef.current);
    const next = future.pop()!;
    currentRef.current = next;
    setCanUndo(true);
    setCanRedo(future.length > 0);
    return JSON.parse(JSON.stringify(next)) as Snapshot;
  }, []);

  return { push, undo, redo, canUndo, canRedo };
}
