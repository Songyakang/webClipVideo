import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useUndoHistory } from "../../src/pages/detail/hooks/useUndoHistory";
import type { FlowNode } from "../../src/pages/detail/nodes/types";
import type { Edge } from "@xyflow/react";

function makeNode(id: string): FlowNode {
  return {
    id,
    type: "text",
    position: { x: 0, y: 0 },
    data: { type: "text", content: id },
  };
}

describe("useUndoHistory 结构共享快照", () => {
  it("undo 返回的节点对象与原对象同引用（共享而非深克隆）", () => {
    const { result } = renderHook(() => useUndoHistory());
    const nodeA = makeNode("a");
    const nodeB = makeNode("b");
    const nodes1: FlowNode[] = [nodeA, nodeB];
    const edges1: Edge[] = [];

    act(() => result.current.push(nodes1, edges1));
    // 数量变化触发第二次快照
    act(() => result.current.push([...nodes1, makeNode("c")], edges1));

    const undone = result.current.undo();
    expect(undone).not.toBeNull();
    // 数组是新引用
    expect(undone!.nodes).not.toBe(nodes1);
    // 节点对象共享引用 — 不深克隆
    expect(undone!.nodes[0]).toBe(nodeA);
    expect(undone!.nodes[1]).toBe(nodeB);
  });

  it("undo/redo 返回新数组但共享节点对象", () => {
    const { result } = renderHook(() => useUndoHistory());
    const nodeA = makeNode("a");
    const edges: Edge[] = [];

    act(() => result.current.push([nodeA], edges));
    act(() => result.current.push([nodeA, makeNode("b")], edges));

    const undone = result.current.undo();
    const redone = result.current.redo();

    expect(undone!.nodes).not.toBe(redone!.nodes);
    expect(redone!.nodes[0]).toBe(nodeA);
  });

  it("带 videoEl DOM 引用的节点可安全共享（不被剥离、不崩溃）", () => {
    const { result } = renderHook(() => useUndoHistory());
    const video = document.createElement("video");
    const nodeWithVideo = {
      ...makeNode("v"),
      data: { type: "video-upload", content: "", videoEl: video },
    } as FlowNode;
    const edges: Edge[] = [];

    act(() => result.current.push([nodeWithVideo], edges));
    act(() => result.current.push([nodeWithVideo, makeNode("b")], edges));

    const undone = result.current.undo();
    expect((undone!.nodes[0].data as { videoEl?: unknown }).videoEl).toBe(video);
  });

  it("历史长度上限仍生效（50 个快照）", () => {
    const { result } = renderHook(() => useUndoHistory());
    // push 按数量去重，逐次增加节点数以生成快照
    for (let i = 1; i <= 60; i++) {
      const nodes = Array.from({ length: i }, (_, k) => makeNode(`n${k}`));
      act(() => result.current.push(nodes, []));
    }
    // 连续 undo 最多 50 次（MAX_HISTORY 上限，最老的快照被淘汰）
    let undoCount = 0;
    act(() => {
      while (result.current.undo() !== null && undoCount < 100) {
        undoCount++;
      }
    });
    expect(undoCount).toBeLessThanOrEqual(50);
    expect(undoCount).toBeGreaterThanOrEqual(45);
  });
});
