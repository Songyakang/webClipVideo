import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Tauri invoke — 记录调用
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async () => undefined),
}));

import { saveCanvasIncremental, createCanvasDiffState, cleanNodeData } from "../../src/lib/db";
import { invoke } from "@tauri-apps/api/core";
import type { Node, Edge } from "@xyflow/react";

function makeNode(id: string, extra: Record<string, unknown> = {}): Node {
  return {
    id,
    type: "text",
    position: { x: 0, y: 0 },
    data: { type: "text", content: id, ...extra },
  };
}

function makeEdge(id: string, source: string, target: string): Edge {
  return { id, source, target, sourceHandle: "", targetHandle: "" };
}

type InvokeArgs = { clipId?: string; nodes?: unknown[]; nodeIds?: string[]; edges?: unknown[]; edgeIds?: string[] };

function invokedCommands(): string[] {
  return vi.mocked(invoke).mock.calls.map((c) => c[0] as string);
}

function invokedArgs(cmd: string): InvokeArgs {
  const call = vi.mocked(invoke).mock.calls.find((c) => c[0] === cmd);
  return (call?.[1] ?? {}) as InvokeArgs;
}

describe("saveCanvasIncremental", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("首次保存 upsert 全部节点和边，不触发删除", async () => {
    const state = createCanvasDiffState();
    const nodes = [makeNode("n1"), makeNode("n2")];
    const edges = [makeEdge("e1", "n1", "n2")];

    await saveCanvasIncremental("clip-1", nodes, edges, state);

    const cmds = invokedCommands();
    expect(cmds).toContain("db_upsert_canvas_nodes");
    expect(cmds).toContain("db_upsert_canvas_edges");
    expect(cmds).not.toContain("db_delete_canvas_nodes");
    expect(cmds).not.toContain("db_delete_canvas_edges");
    expect(invokedArgs("db_upsert_canvas_nodes").nodes).toHaveLength(2);
    expect(invokedArgs("db_upsert_canvas_edges").edges).toHaveLength(1);
  });

  it("无变化时第二次保存不发任何 IPC", async () => {
    const state = createCanvasDiffState();
    const nodes = [makeNode("n1"), makeNode("n2")];
    const edges = [makeEdge("e1", "n1", "n2")];

    await saveCanvasIncremental("clip-1", nodes, edges, state);
    vi.clearAllMocks();
    await saveCanvasIncremental("clip-1", nodes, edges, state);

    expect(invokedCommands()).toEqual([]);
  });

  it("单个节点变化只 upsert 该节点", async () => {
    const state = createCanvasDiffState();
    const nodes = [makeNode("n1"), makeNode("n2")];
    const edges: Edge[] = [];
    await saveCanvasIncremental("clip-1", nodes, edges, state);
    vi.clearAllMocks();

    const changed = [makeNode("n1", { content: "n1 改" }), makeNode("n2")];
    await saveCanvasIncremental("clip-1", changed, edges, state);

    const args = invokedArgs("db_upsert_canvas_nodes");
    expect(args.nodes).toHaveLength(1);
    expect((args.nodes as { id: string }[])[0].id).toBe("n1");
  });

  it("节点删除触发 db_delete_canvas_nodes 且只含删除的 id", async () => {
    const state = createCanvasDiffState();
    const nodes = [makeNode("n1"), makeNode("n2"), makeNode("n3")];
    const edges: Edge[] = [];
    await saveCanvasIncremental("clip-1", nodes, edges, state);
    vi.clearAllMocks();

    await saveCanvasIncremental("clip-1", [makeNode("n1")], edges, state);

    expect(invokedArgs("db_delete_canvas_nodes").nodeIds).toEqual(["n2", "n3"]);
    expect(invokedArgs("db_upsert_canvas_nodes")).toBeDefined(); // n1 无变化则不 upsert
    // n1 未变 — 检查是否有 upsert（应该没有）
    expect(invokedArgs("db_upsert_canvas_nodes").nodes).toBeUndefined();
  });

  it("边变化只影响边的 upsert/delete", async () => {
    const state = createCanvasDiffState();
    const nodes = [makeNode("n1"), makeNode("n2")];
    const edges = [makeEdge("e1", "n1", "n2"), makeEdge("e2", "n2", "n1")];
    await saveCanvasIncremental("clip-1", nodes, edges, state);
    vi.clearAllMocks();

    const newEdges = [makeEdge("e1", "n1", "n2")]; // e2 删除
    await saveCanvasIncremental("clip-1", nodes, newEdges, state);

    expect(invokedArgs("db_delete_canvas_edges").edgeIds).toEqual(["e2"]);
    expect(invokedArgs("db_upsert_canvas_edges")).toBeDefined();
    expect(invokedArgs("db_upsert_canvas_edges").edges).toBeUndefined(); // e1 未变
  });

  it("空 clipId 直接返回", async () => {
    const state = createCanvasDiffState();
    await saveCanvasIncremental("", [makeNode("n1")], [], state);
    expect(invokedCommands()).toEqual([]);
  });

  it("切换项目重建 state 后重新全量 upsert", async () => {
    const state = createCanvasDiffState();
    await saveCanvasIncremental("clip-1", [makeNode("n1")], [], state);
    vi.clearAllMocks();

    // 模拟切换项目：新 state
    const state2 = createCanvasDiffState();
    await saveCanvasIncremental("clip-2", [makeNode("n1")], [], state2);
    expect(invokedArgs("db_upsert_canvas_nodes").clipId).toBe("clip-2");
    expect(invokedArgs("db_upsert_canvas_nodes").nodes).toHaveLength(1);
  });
});

describe("cleanNodeData", () => {
  it("剥离 videoEl 和回调函数", () => {
    const node = makeNode("n1", {
      videoEl: document.createElement("video"),
      onUploadComplete: () => {},
      onFileUpload: () => {},
      fileUrl: "asset://x.jpg",
    });
    const clean = cleanNodeData(node);
    expect(clean).not.toHaveProperty("videoEl");
    expect(clean).not.toHaveProperty("onUploadComplete");
    expect(clean).not.toHaveProperty("onFileUpload");
    expect(clean.fileUrl).toBe("asset://x.jpg");
  });

  it("无 data 时返回空对象", () => {
    const node = { id: "n", type: "text", position: { x: 0, y: 0 }, data: undefined } as unknown as Node;
    expect(cleanNodeData(node)).toEqual({});
  });
});
