import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Node } from "@xyflow/react";
import { isDirectorData } from "../../src/pages/detail/nodes/types";

// Mock Tauri invoke：db_save_canvas 存入内存，db_load_canvas 返回
const stored: { nodes: unknown[]; edges: unknown[] } = { nodes: [], edges: [] };
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (cmd: string, args?: Record<string, unknown>) => {
    if (cmd === "db_save_canvas") {
      stored.nodes = (args?.nodes as unknown[]) ?? [];
      stored.edges = (args?.edges as unknown[]) ?? [];
      return undefined;
    }
    if (cmd === "db_load_canvas") {
      return { nodes: stored.nodes, edges: stored.edges };
    }
    return undefined;
  }),
}));

import { saveCanvas, loadCanvas } from "../../src/lib/db";

function makeDirectorNode(data: Record<string, unknown>): Node {
  return {
    id: "dir-1",
    type: "director",
    position: { x: 0, y: 0 },
    data: {
      type: "director",
      content: "",
      label: "导演台",
      sourceImageNodeIds: [],
      models: [],
      cameraTracks: [],
      sceneSettings: { backgroundColor: "#000", ambientLight: 0.5, gridVisible: true },
      ...data,
    },
  };
}

describe("DirectorNodeData 环境字段", () => {
  beforeEach(() => {
    stored.nodes = [];
    stored.edges = [];
  });

  it("environmentNodeId 为可选字段，不设置时 isDirectorData 仍通过", () => {
    const node = makeDirectorNode({});
    expect(isDirectorData(node.data as never)).toBe(true);
    expect((node.data as { environmentNodeId?: string }).environmentNodeId).toBeUndefined();
  });

  it("保存/加载往返后 environmentNodeId 完整保留", async () => {
    const node = makeDirectorNode({ environmentNodeId: "pano-7" });
    await saveCanvas("clip-1", [node], []);

    const result = await loadCanvas("clip-1");
    expect(result.nodes).toHaveLength(1);
    const loaded = result.nodes[0];
    expect((loaded.data as { environmentNodeId?: string }).environmentNodeId).toBe("pano-7");
    expect(isDirectorData(loaded.data as never)).toBe(true);
  });

  it("空字符串 environmentNodeId（显式禁用）往返后保留", async () => {
    const node = makeDirectorNode({ environmentNodeId: "" });
    await saveCanvas("clip-1", [node], []);

    const result = await loadCanvas("clip-1");
    const loaded = result.nodes[0];
    expect((loaded.data as { environmentNodeId?: string }).environmentNodeId).toBe("");
  });

  it("移除环境（字段删除）往返后为 undefined", async () => {
    const node = makeDirectorNode({});
    await saveCanvas("clip-1", [node], []);

    const result = await loadCanvas("clip-1");
    const loaded = result.nodes[0];
    expect((loaded.data as { environmentNodeId?: string }).environmentNodeId).toBeUndefined();
  });
});
