import { describe, it, expect, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { absolutePosition, canGroup, groupNodes, ungroupNodes, groupLayoutInput } from "../../src/pages/detail/grouping";
import { buildCopyPayload, buildPastePayload } from "../../src/pages/detail/hooks/clipboard";
import { useUndoHistory } from "../../src/pages/detail/hooks/useUndoHistory";
import { useKeyboardShortcuts } from "../../src/pages/detail/hooks/useKeyboardShortcuts";
import type { FlowNode } from "../../src/pages/detail/nodes/types";
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
import { invoke } from "@tauri-apps/api/core";
import { nodeToInput, loadCanvas, saveCanvasIncremental, createCanvasDiffState } from "../../src/lib/db";

const initial = (): FlowNode[] => [
  { id: "node-1", type: "text", position: { x: -100, y: 200 }, data: { type: "text", content: "a", w: 200, h: 100 } },
  { id: "node-2", type: "text", position: { x: 400, y: 500 }, data: { type: "text", content: "b", w: 300, h: 150 } },
];
const grouped = () => groupNodes(initial(), new Set(["node-1", "node-2"]), "node-3");
const edge = { id: "edge-1", source: "node-1", target: "node-2" };

describe("画布分组", () => {
  it("包围选中节点并保持世界坐标，父节点排在成员之前", () => {
    const nodes = grouped();
    expect(nodes[0].type).toBe("canvas-group");
    expect(nodes[0].style).toEqual({ width: 864, height: 546 });
    initial().forEach((n) => expect(absolutePosition(nodes.find((x) => x.id === n.id)!, nodes)).toEqual(n.position));
    expect(nodes.slice(1).every((n) => n.parentId === "node-3" && !n.selected)).toBe(true);
  });
  it("移动组后解组保持成员位置与内容", () => {
    const nodes = grouped().map((n) => n.type === "canvas-group" ? { ...n, position: { x: n.position.x + 300, y: n.position.y - 100 } } : n);
    const result = ungroupNodes(nodes, new Set(["node-3"]));
    expect(result).toHaveLength(2);
    result.forEach((n, i) => {
      expect(n.position).toEqual({ x: initial()[i].position.x + 300, y: initial()[i].position.y - 100 });
      expect(n.parentId).toBeUndefined();
      expect(n.extent).toBeUndefined();
      expect(n.data).toEqual(initial()[i].data);
    });
  });
  it("拒绝单个节点、组内节点及嵌套组", () => {
    expect(canGroup(initial())).toBe(true);
    expect(canGroup(initial().slice(0, 1))).toBe(false);
    expect(canGroup(grouped())).toBe(false);
    expect(canGroup(grouped().slice(1))).toBe(false);
  });
  it("复制整个组重映射父关系和内部连线，子节点相对位置不变", () => {
    const source = grouped();
    const payload = buildCopyPayload(source, [edge], new Set(["node-3"]));
    const paste = buildPastePayload(payload, 3, 1, { x: 1000, y: 1000 }, { x: 0, y: 0 });
    expect(paste.nodes).toHaveLength(3);
    expect(paste.nodes[0].position).toEqual({ x: 1000, y: 1000 });
    expect(paste.nodes[1].parentId).toBe(paste.nodes[0].id);
    expect(paste.nodes[1].position).toEqual(source[1].position);
    expect(paste.edges[0]).toMatchObject({ source: paste.nodes[1].id, target: paste.nodes[2].id });
    expect(paste.nodes.filter((n) => n.selected)).toHaveLength(1);
  });
  it("单独复制组内成员成为独立节点", () => {
    const payload = buildCopyPayload(grouped(), [edge], new Set(["node-2"]));
    expect(payload.nodes[0].parentId).toBeUndefined();
    expect(payload.nodes[0].position).toEqual(initial()[1].position);
    expect(payload.edges).toHaveLength(0);
  });
  it("整理画布将跨组连线投影到组且不单独整理成员", () => {
    const nodes = [...grouped(), { ...initial()[0], id: "external" }];
    const layout = groupLayoutInput(nodes, [edge, { id: "out", source: "node-2", target: "external" }]);
    expect(layout.nodes.map((n) => n.id)).toEqual(["node-3", "external"]);
    expect(layout.edges).toEqual([{ source: "node-3", target: "external" }]);
  });
  it("通过现有 SQLite JSON 字段往返恢复分组和尺寸并排序", async () => {
    const nodes = grouped();
    const input = nodes.map(nodeToInput).reverse();
    vi.mocked(invoke).mockResolvedValueOnce({ nodes: input, edges: [edge] });
    const restored = await loadCanvas("project");
    expect(restored.nodes[0].id).toBe("node-3");
    expect(restored.nodes[0].style).toEqual(nodes[0].style);
    expect(restored.nodes.find((n) => n.id === "node-1")?.parentId).toBe("node-3");
    const ungrouped = ungroupNodes(restored.nodes as FlowNode[], new Set(["node-3"]));
    expect(nodeToInput(ungrouped[0]).data.__canvasGroup).toBeUndefined();
  });
  it("增量保存能够检测分组及取消分组", async () => {
    vi.mocked(invoke).mockReset().mockResolvedValue(undefined);
    const state = createCanvasDiffState();
    await saveCanvasIncremental("project", initial(), [edge], state);
    vi.mocked(invoke).mockClear();
    await saveCanvasIncremental("project", grouped(), [edge], state);
    const upsert = vi.mocked(invoke).mock.calls.find(([name]) => name === "db_upsert_canvas_nodes");
    expect((upsert?.[1] as { nodes: unknown[] }).nodes).toHaveLength(3);
    vi.mocked(invoke).mockClear();
    await saveCanvasIncremental("project", ungroupNodes(grouped(), new Set(["node-3"])), [edge], state);
    expect(invoke).toHaveBeenCalledWith("db_delete_canvas_nodes", { clipId: "project", nodeIds: ["node-3"] });
  });
  it("打组前强制保存最新位置，撤销重做恢复正确父关系", () => {
    const { result } = renderHook(() => useUndoHistory());
    const before = initial().map((n) => ({ ...n, position: { x: n.position.x + 100, y: n.position.y } }));
    const after = groupNodes(before, new Set(before.map((n) => n.id)), "node-3");
    act(() => { result.current.push(initial(), []); result.current.push(before, [], true); result.current.push(after, []); });
    act(() => { expect(result.current.undo()?.nodes).toEqual(before); });
    act(() => { expect(result.current.redo()?.nodes).toEqual(after); });
  });
  it("快捷键支持 macOS/Windows 且不劫持输入框", () => {
    const onGroup = vi.fn(); const onUngroup = vi.fn();
    const { unmount } = renderHook(() => useKeyboardShortcuts({ edgeToDelete: null, selectedNodes: [], setMenu: vi.fn(), setEdgeToDelete: vi.fn(), deleteNode: vi.fn(), removeEdge: vi.fn(), onCopy: vi.fn(), onPaste: vi.fn(), onGroup, onUngroup }));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "g", metaKey: true }));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "G", ctrlKey: true, shiftKey: true }));
    const input = document.createElement("input"); document.body.appendChild(input);
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "g", ctrlKey: true, bubbles: true }));
    expect(onGroup).toHaveBeenCalledTimes(1); expect(onUngroup).toHaveBeenCalledTimes(1);
    input.remove(); unmount();
  });
});
