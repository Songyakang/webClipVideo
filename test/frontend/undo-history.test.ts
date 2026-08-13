import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useUndoHistory } from "../../src/pages/detail/hooks/useUndoHistory";
import type { FlowNode } from "../../src/pages/detail/nodes/types";
import type { Edge } from "@xyflow/react";

function makeNode(id: string, x = 0, y = 0): FlowNode {
  return {
    id,
    type: "text",
    position: { x, y },
    data: { type: "text", content: `node ${id}` },
  };
}

function makeEdge(id: string, source: string, target: string): Edge {
  return { id, source, target };
}

describe("useUndoHistory", () => {
  it("initially canUndo and canRedo are false", () => {
    const { result } = renderHook(() => useUndoHistory());
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
  });

  it("push enables undo and disables redo", () => {
    const { result } = renderHook(() => useUndoHistory());
    act(() => {
      result.current.push([makeNode("n1")], []);
    });
    expect(result.current.canUndo).toBe(true);
    expect(result.current.canRedo).toBe(false);
  });

  it("undo returns previous snapshot", () => {
    const { result } = renderHook(() => useUndoHistory());

    // Push 3 states with different counts to build history
    act(() => {
      result.current.push([makeNode("n1")], []); // 1 node, 0 edges
    });
    act(() => {
      result.current.push([makeNode("n1"), makeNode("n2")], []); // 2 nodes
    });
    act(() => {
      result.current.push(
        [makeNode("n1"), makeNode("n2"), makeNode("n3")],
        []
      ); // 3 nodes
    });

    // Undo once → back to 2-node state, canUndo still true
    let restored: { nodes: FlowNode[]; edges: Edge[] } | null = null;
    act(() => {
      restored = result.current.undo();
    });

    expect(restored).not.toBeNull();
    expect(restored!.nodes).toHaveLength(2);
    expect(result.current.canUndo).toBe(true);
    expect(result.current.canRedo).toBe(true);
  });

  it("redo restores undone state", () => {
    const { result } = renderHook(() => useUndoHistory());

    act(() => {
      result.current.push([makeNode("n1")], []); // 1 node
    });
    act(() => {
      result.current.push([makeNode("n1"), makeNode("n2")], []); // 2 nodes
    });
    act(() => {
      result.current.undo(); // go back to first state (1 node)
    });

    let restored: { nodes: FlowNode[]; edges: Edge[] } | null = null;
    act(() => {
      restored = result.current.redo();
    });

    expect(restored).not.toBeNull();
    expect(restored!.nodes).toHaveLength(2);
    expect(result.current.canRedo).toBe(false);
  });

  it("push clears redo stack", () => {
    const { result } = renderHook(() => useUndoHistory());

    act(() => {
      result.current.push([makeNode("a")], []);
    });
    act(() => {
      result.current.push([makeNode("a"), makeNode("b")], []);
    });
    act(() => {
      result.current.undo(); // redo stack now has the 2-node state
    });
    expect(result.current.canRedo).toBe(true);

    // Push a new state with different count → redo stack cleared
    act(() => {
      result.current.push(
        [makeNode("x"), makeNode("y"), makeNode("z")],
        []
      );
    });
    expect(result.current.canRedo).toBe(false);
  });

  it("returns snapshots that share node object references (immutable-updates contract)", () => {
    // 性能优化后快照采用结构共享：只复制数组，不深克隆节点对象。
    // 契约：节点/边必须不可变更新（代码库约定 setNodes 中总是 spread 新对象），
    // 原位修改会同时反映到快照中（由 undo-snapshot-sharing.test.ts 显式验证共享行为）。
    const { result } = renderHook(() => useUndoHistory());
    const node = makeNode("n1", 100, 200);

    act(() => {
      result.current.push([node], []);
    });

    // 不可变更新（新对象）不会污染已有快照
    const updatedNode = { ...node, position: { ...node.position, x: 999 } };

    act(() => {
      result.current.push([updatedNode], [makeEdge("e1", "n1", "n2")]);
    });

    let restored: { nodes: FlowNode[]; edges: Edge[] } | null = null;
    act(() => {
      restored = result.current.undo();
    });

    expect(restored).not.toBeNull();
    // 快照共享原节点引用，且原节点未被修改 → 位置保持 100
    expect(restored!.nodes[0]).toBe(node);
    expect(restored!.nodes[0].position.x).toBe(100); // not 999
  });

  it("undo at top of history returns null", () => {
    const { result } = renderHook(() => useUndoHistory());
    let restored: { nodes: FlowNode[]; edges: Edge[] } | null = null;
    act(() => {
      restored = result.current.undo();
    });
    expect(restored).toBeNull();
  });

  it("redo at bottom of history returns null", () => {
    const { result } = renderHook(() => useUndoHistory());
    let restored: { nodes: FlowNode[]; edges: Edge[] } | null = null;
    act(() => {
      restored = result.current.redo();
    });
    expect(restored).toBeNull();
  });

  it("history is capped at MAX_HISTORY (50)", () => {
    const { result } = renderHook(() => useUndoHistory());

    // Push 55 states, each with unique node count (to bypass dedup)
    for (let i = 1; i <= 55; i++) {
      const nodes = Array.from({ length: i }, (_, j) => makeNode(`n${j}`));
      act(() => {
        result.current.push(nodes, []);
      });
    }

    // Undo until we can't anymore
    let undoCount = 0;
    for (let i = 0; i < 55; i++) {
      let r: { nodes: FlowNode[]; edges: Edge[] } | null = null;
      act(() => {
        r = result.current.undo();
      });
      if (r === null) break;
      undoCount++;
    }

    // Past is capped at 50, so at most 50 undos from 55 pushes
    expect(undoCount).toBe(50);
    expect(result.current.canUndo).toBe(false);
  });

  it("dedupes pushes with same node/edge count", () => {
    const { result } = renderHook(() => useUndoHistory());

    // Push first state
    act(() => {
      result.current.push([makeNode("a")], []);
    });
    // Push second state with same count → should be deduped
    act(() => {
      result.current.push([makeNode("b")], []);
    });

    // Undo → should get null because deduped push was skipped
    // (only 1 state ever entered history: the first push, and since
    // there's nothing before it, undo returns null? No...)
    // Actually: first push stores snapshot A. Second push with same count
    // is deduped (no-op). So current is still A, past is empty.
    // Undo from empty past → returns null.
    let restored: { nodes: FlowNode[]; edges: Edge[] } | null = null;
    act(() => {
      restored = result.current.undo();
    });
    expect(restored).toBeNull();
  });
});
