import { useCallback, type MutableRefObject, type Dispatch, type SetStateAction } from "react";
import type { Edge } from "@xyflow/react";
import type { FlowNode } from "../nodes/types";

/** Apply an accepted LLM result through canvas state so persistence, collaboration and undo see it. */
export function useApplyPrompt(
  nodesRef: MutableRefObject<FlowNode[]>, edgesRef: MutableRefObject<Edge[]>,
  setNodes: Dispatch<SetStateAction<FlowNode[]>>,
  push: (nodes: FlowNode[], edges: Edge[], force?: boolean) => void,
) {
  return useCallback((nodeId: string, content: string) => {
    const current = nodesRef.current;
    if (!content.trim() || !current.some((n) => n.id === nodeId)) return;
    const next = current.map((n) => n.id !== nodeId ? n : {
      ...n, data: { ...n.data, ...(n.type === "text"
        ? { content: JSON.stringify({ prompt: content }) }
        : { llmPrompt: content }) },
    });
    push(current, edgesRef.current, true);
    push(next, edgesRef.current, true);
    nodesRef.current = next;
    setNodes(next);
  }, [nodesRef, edgesRef, push, setNodes]);
}
