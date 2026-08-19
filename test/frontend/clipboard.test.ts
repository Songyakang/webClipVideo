import { describe, it, expect } from "vitest";
import {
  sanitizeNodeForClipboard,
  buildCopyPayload,
  buildPastePayload,
} from "../../src/pages/detail/hooks/clipboard";
import type { FlowNode } from "../../src/pages/detail/nodes/types";
import type { Edge } from "@xyflow/react";

function makeNode(id: string, x = 0, y = 0, data: Partial<FlowNode["data"]> = {}): FlowNode {
  return {
    id,
    type: "text",
    position: { x, y },
    data: { type: "text", content: `node ${id}`, ...data },
  };
}

function makeEdge(id: string, source: string, target: string): Edge {
  return { id, source, target };
}

describe("sanitizeNodeForClipboard", () => {
  it("剥离瞬态字段（videoEl/isEditing/measured/selected 等），保留业务字段与回调", () => {
    const videoEl = document.createElement("video");
    const cb = () => {};
    const node = makeNode("n1", 10, 20, {
      videoEl,
      isEditing: true,
      fileUrl: "asset://x.png",
      assetPath: "n1/x.png",
      label: "标签",
      mode: "reverse",
      onCreateVideoNode: cb,
    });
    node.selected = true;
    node.dragging = true;
    node.measured = { width: 680, height: 400 };
    node.width = 680;
    node.height = 400;

    const copy = sanitizeNodeForClipboard(node);

    expect(copy).not.toBe(node);
    expect(copy.data).not.toBe(node.data);
    expect(copy.data.videoEl).toBeUndefined();
    expect(copy.data.isEditing).toBeUndefined();
    expect(copy.selected).toBeUndefined();
    expect(copy.dragging).toBeUndefined();
    expect(copy.measured).toBeUndefined();
    expect(copy.width).toBeUndefined();
    expect(copy.height).toBeUndefined();
    // 业务字段与回调保留（会话内可用，持久化时由 cleanNodeData 剥离）
    expect(copy.data.fileUrl).toBe("asset://x.png");
    expect(copy.data.assetPath).toBe("n1/x.png");
    expect(copy.data.label).toBe("标签");
    expect(copy.data.mode).toBe("reverse");
    expect(copy.data.onCreateVideoNode).toBe(cb);
    // 入参未被修改
    expect(node.data.videoEl).toBe(videoEl);
    expect(node.selected).toBe(true);
  });
});

describe("buildCopyPayload", () => {
  it("单选 → 仅该节点、无边", () => {
    const nodes = [makeNode("n1", 0, 0), makeNode("n2", 100, 0)];
    const edges = [makeEdge("e1", "n1", "n2")];
    const payload = buildCopyPayload(nodes, edges, new Set(["n1"]));
    expect(payload.nodes.map((n) => n.id)).toEqual(["n1"]);
    expect(payload.edges).toHaveLength(0);
  });

  it("多选 → 节点 + 两端均在选中集内的边，外部边剔除", () => {
    const nodes = [makeNode("n1", 0, 0), makeNode("n2", 100, 0), makeNode("n3", 500, 500)];
    const edges = [makeEdge("e1", "n1", "n2"), makeEdge("e2", "n2", "n3")];
    const payload = buildCopyPayload(nodes, edges, new Set(["n1", "n2"]));
    expect(payload.nodes.map((n) => n.id)).toEqual(["n1", "n2"]);
    expect(payload.edges.map((e) => e.id)).toEqual(["e1"]);
  });

  it("源节点带 videoEl → 输出已剥离", () => {
    const nodes = [makeNode("n1", 0, 0, { videoEl: document.createElement("video") })];
    const payload = buildCopyPayload(nodes, [], new Set(["n1"]));
    expect(payload.nodes[0].data.videoEl).toBeUndefined();
  });
});

describe("buildPastePayload", () => {
  it("id 重映射、边端点重映射、bbox 锚定保持相对布局、置 selected、返回新计数器", () => {
    const payload = buildCopyPayload(
      [makeNode("n1", 0, 0), makeNode("n2", 100, 50)],
      [makeEdge("e1", "n1", "n2")],
      new Set(["n1", "n2"]),
    );

    const result = buildPastePayload(payload, 3, 1, { x: 1000, y: 800 }, { x: 0, y: 0 });

    expect(result.nodeIdCounter).toBe(5);
    expect(result.edgeIdCounter).toBe(2);
    const [p1, p2] = result.nodes;
    expect(p1.id).toBe("node-4");
    expect(p2.id).toBe("node-5");
    // bbox 锚定：左上角节点落到目标位置，相对布局保持
    expect(p1.position).toEqual({ x: 1000, y: 800 });
    expect(p2.position).toEqual({ x: 1100, y: 850 });
    expect(p1.selected).toBe(true);
    expect(p2.selected).toBe(true);
    // 边 id 与端点重映射
    expect(result.edges[0]).toMatchObject({ id: "edge-2", source: "node-4", target: "node-5" });
  });

  it("offset 应用（级联契约：两次粘贴位置恰差 20）", () => {
    const payload = buildCopyPayload([makeNode("n1", 0, 0)], [], new Set(["n1"]));

    const a = buildPastePayload(payload, 0, 0, { x: 1000, y: 800 }, { x: 0, y: 0 });
    const b = buildPastePayload(payload, 0, 0, { x: 1000, y: 800 }, { x: 20, y: 20 });

    expect(a.nodes[0].position).toEqual({ x: 1000, y: 800 });
    expect(b.nodes[0].position).toEqual({ x: 1020, y: 820 });
    // 剪贴板内容未被修改
    expect(payload.nodes[0].position).toEqual({ x: 0, y: 0 });
  });

  it("空 payload → 空结果、计数器不变", () => {
    const result = buildPastePayload({ nodes: [], edges: [] }, 7, 3, { x: 0, y: 0 }, { x: 0, y: 0 });
    expect(result.nodes).toHaveLength(0);
    expect(result.edges).toHaveLength(0);
    expect(result.nodeIdCounter).toBe(7);
    expect(result.edgeIdCounter).toBe(3);
  });
});
