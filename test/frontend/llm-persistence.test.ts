import { act, renderHook, waitFor } from "@testing-library/react";
import { useRef, useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { useApplyPrompt } from "../../src/pages/detail/hooks/useApplyPrompt";
import { useUndoHistory } from "../../src/pages/detail/hooks/useUndoHistory";
import { useCanvasPersistence } from "../../src/pages/detail/hooks/useCanvasPersistence";
import type { FlowNode } from "../../src/pages/detail/nodes/types";
import type { Edge } from "@xyflow/react";
import { invoke } from "@tauri-apps/api/core";
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("../../src/lib/assets", () => ({ getAssetSrc: vi.fn() }));
const node: FlowNode = { id: "node-1", type: "text", position: { x: 0, y: 0 }, data: { type: "text", content: "原文" } };

describe("LLM 结果应用到画布", () => {
  it("不可变更新触发自动保存，并支持撤销重做", async () => {
    vi.mocked(invoke).mockImplementation(async (cmd) => cmd === "db_load_canvas" ? { nodes: [node], edges: [] } as any : undefined);
    const { result } = renderHook(() => {
      const [nodes, setNodes] = useState<FlowNode[]>([]);
      const [edges, setEdges] = useState<Edge[]>([]);
      const nr = useRef(nodes); nr.current = nodes;
      const er = useRef(edges); er.current = edges;
      const loaded = useRef(false);
      const history = useUndoHistory();
      useCanvasPersistence("project", nodes, edges, setNodes, setEdges, loaded, useRef(0), useRef(0));
      const apply = useApplyPrompt(nr, er, setNodes, history.push);
      return { nodes, apply, history, setNodes };
    });
    await waitFor(() => expect(result.current.nodes).toHaveLength(1));
    const original = result.current.nodes[0];
    act(() => result.current.apply("node-1", "优化结果"));
    expect(original.data.content).toBe("原文");
    expect(result.current.nodes[0].data.content).toBe('{"prompt":"优化结果"}');
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("db_upsert_canvas_nodes", expect.objectContaining({ nodes: [expect.objectContaining({ data: expect.objectContaining({ content: '{"prompt":"优化结果"}' }) })] })), { timeout: 2000 });
    act(() => result.current.setNodes(result.current.history.undo()!.nodes));
    expect(result.current.nodes[0].data.content).toBe("原文");
    act(() => result.current.setNodes(result.current.history.redo()!.nodes));
    expect(result.current.nodes[0].data.content).toBe('{"prompt":"优化结果"}');
  });
});
