import { useRef, useState } from "react";
import { describe, expect, it, vi, afterEach } from "vitest";
import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import ContextMenus from "../../src/pages/detail/ContextMenus";
import { useNodeOperations } from "../../src/pages/detail/hooks/useNodeOperations";
import { absolutePosition, groupNodes } from "../../src/pages/detail/grouping";
import type { FlowNode } from "../../src/pages/detail/nodes/types";
import type { Edge } from "@xyflow/react";
vi.mock("../../src/lib/assets", () => ({ deleteAssetDir: vi.fn() }));
afterEach(cleanup);

const members: FlowNode[] = [
  { id: "node-1", type: "text", position: { x: 200, y: 300 }, data: { type: "text", content: "a" } },
  { id: "node-2", type: "text", position: { x: 1200, y: 600 }, data: { type: "text", content: "b" } },
];
function useCanvas() {
  const [nodes, setNodes] = useState(groupNodes(members, new Set(members.map((n) => n.id)), "node-3"));
  const [edges, setEdges] = useState<Edge[]>([{ id: "edge-1", source: "node-1", target: "node-2" }]);
  const nodesRef = useRef(nodes); nodesRef.current = nodes;
  const edgesRef = useRef(edges); edgesRef.current = edges;
  const ops = useNodeOperations("project", setNodes, setEdges, vi.fn(), useRef(3), useRef(1), nodesRef, edgesRef);
  return { nodes, edges, ...ops };
}

describe("分组菜单和画布操作", () => {
  it("多选允许打组，分组允许解组", () => {
    const onAction = vi.fn();
    const view = render(<ContextMenus menu={{ type: "flowItem", nodeId: "node-1", x: 0, y: 0 }} onAction={onAction} selectedCount={2} canGroup />);
    fireEvent.click(screen.getByText("打组"));
    expect(onAction).toHaveBeenCalledWith("打组");
    view.rerender(<ContextMenus menu={{ type: "flowItem", nodeId: "node-3", x: 0, y: 0 }} onAction={onAction} canUngroup />);
    expect((screen.getByText("打组").closest("button") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByText("取消分组"));
    expect(onAction).toHaveBeenCalledWith("取消分组");
  });
  it("右键创建副本复制组、成员和内部边", () => {
    const { result } = renderHook(useCanvas);
    act(() => result.current.duplicateNode("node-3"));
    expect(result.current.nodes).toHaveLength(6);
    expect(result.current.edges).toHaveLength(2);
    const copies = result.current.nodes.slice(3);
    expect(copies[1].parentId).toBe(copies[0].id);
    expect(result.current.edges[1]).toMatchObject({ source: copies[1].id, target: copies[2].id });
  });
  it("删除组框保留成员、连线和世界坐标", () => {
    const { result } = renderHook(useCanvas);
    act(() => result.current.deleteNode("node-3"));
    expect(result.current.nodes).toHaveLength(2);
    expect(result.current.edges).toHaveLength(1);
    result.current.nodes.forEach((n, i) => {
      expect(n.parentId).toBeUndefined();
      expect(absolutePosition(n, result.current.nodes)).toEqual(members[i].position);
    });
  });
});
