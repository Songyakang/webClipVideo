import type { Edge } from "@xyflow/react";
import type { FlowNode } from "./nodes/types";

/** 父节点始终先于子节点，兼容数据库和协作返回的任意顺序。 */
export function orderGroupNodes<T extends { id: string; parentId?: string }>(nodes: T[]): T[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const result: T[] = [];
  const visited = new Set<string>();
  const visit = (node: T) => {
    if (visited.has(node.id)) return;
    visited.add(node.id);
    const parent = node.parentId && byId.get(node.parentId);
    if (parent) visit(parent);
    result.push(node);
  };
  nodes.forEach(visit);
  return result;
}

export function absolutePosition(node: FlowNode, nodes: FlowNode[]) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const position = { ...node.position };
  const visited = new Set([node.id]);
  let parentId = node.parentId;
  while (parentId && !visited.has(parentId)) {
    visited.add(parentId);
    const parent = byId.get(parentId);
    if (!parent) break;
    position.x += parent.position.x;
    position.y += parent.position.y;
    parentId = parent.parentId;
  }
  return position;
}

export function canGroup(nodes: FlowNode[]) {
  return nodes.length >= 2 && nodes.every((n) => !n.parentId && n.type !== "canvas-group");
}

export function groupNodes(nodes: FlowNode[], selectedIds: Set<string>, id: string): FlowNode[] {
  const members = nodes.filter((n) => selectedIds.has(n.id));
  if (!canGroup(members)) return nodes;
  const x = Math.min(...members.map((n) => n.position.x)) - 32;
  const y = Math.min(...members.map((n) => n.position.y)) - 64;
  const width = Math.max(...members.map((n) => n.position.x + (n.measured?.width ?? n.width ?? n.data.w ?? 680))) - x + 32;
  const height = Math.max(...members.map((n) => n.position.y + (n.measured?.height ?? n.height ?? n.data.h ?? 400))) - y + 32;
  const group: FlowNode = {
    id, type: "canvas-group", position: { x, y }, selected: true,
    style: { width, height }, dragHandle: ".group-drag-handle",
    data: { type: "canvas-group", content: "", label: "分组", w: width, h: height },
  };
  return orderGroupNodes([group, ...nodes.map((node) => selectedIds.has(node.id)
    ? { ...node, selected: false, parentId: id, extent: "parent" as const, expandParent: true,
        position: { x: node.position.x - x, y: node.position.y - y } }
    : node.selected ? { ...node, selected: false } : node)]);
}

/** 解散组（或删除组框）只移除容器，保留成员及其世界坐标。 */
export function ungroupNodes(nodes: FlowNode[], groupIds: Set<string>): FlowNode[] {
  const removed = new Set(nodes.filter((n) => n.type === "canvas-group" && groupIds.has(n.id)).map((n) => n.id));
  if (!removed.size) return nodes;
  return nodes.filter((n) => !removed.has(n.id)).map((node) => {
    if (!node.parentId || !removed.has(node.parentId)) return node;
    const { parentId, extent, expandParent, ...rest } = node;
    return { ...rest, position: absolutePosition(node, nodes), selected: true };
  });
}

/** 整理时仅移动顶层对象；跨组边投影到组框，组内坐标保持不变。 */
export function groupLayoutInput(nodes: FlowNode[], edges: Edge[]) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  return {
    nodes: nodes.filter((n) => !n.parentId).map((n) => ({
      id: n.id, width: n.measured?.width ?? n.width ?? n.data.w ?? 680,
      height: n.measured?.height ?? n.height ?? n.data.h ?? 400,
    })),
    edges: edges.map((e) => ({ source: byId.get(e.source)?.parentId ?? e.source, target: byId.get(e.target)?.parentId ?? e.target }))
      .filter((e) => e.source !== e.target && byId.has(e.source) && byId.has(e.target)),
  };
}
