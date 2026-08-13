import { useCallback, useRef, useState } from "react";
import type { Edge } from "@xyflow/react";
import type { FlowNode } from "../nodes/types";

interface Snapshot {
  nodes: FlowNode[];
  edges: Edge[];
}

const MAX_HISTORY = 50;

/**
 * 结构共享快照：只复制数组，不克隆节点对象。
 *
 * 代码库约定节点/边均为不可变更新（setNodes 中总是 spread 创建新对象），
 * 因此快照可以安全地共享对象引用。相比原来的深克隆：
 * - push 从 O(N) 对象分配降为 O(N) 指针复制
 * - 内存从 50 × N 个对象降为 50 × N 个指针（N=1600 时约 40MB → 1.3MB）
 * - videoEl 不再被剥离（同一 DOM 引用被活节点持有，不产生额外内存），
 *   持久化时由 saveCanvas 的 cleanNodeData 剥离
 */
function cloneSnapshot(nodes: FlowNode[], edges: Edge[]): Snapshot {
  return {
    nodes: [...nodes],
    edges: [...edges],
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
