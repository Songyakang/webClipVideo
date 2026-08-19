import type { Edge } from "@xyflow/react";
import type { FlowNode } from "../nodes/types";

/** 内存剪贴板内容：已清理瞬态字段的节点 + 两端均在选择集内的边 */
export interface ClipboardPayload {
  nodes: FlowNode[];
  edges: Edge[];
}

/**
 * 剥离节点运行时瞬态字段，得到可安全入剪贴板的副本。
 * 函数回调（onCreateVideoNode 等）保留 —— 会话内粘贴后仍可用，
 * 持久化时由 cleanNodeData 剥离（与「创建副本」先例一致）。
 */
export function sanitizeNodeForClipboard(node: FlowNode): FlowNode {
  const { videoEl, isEditing, ...cleanData } = (node.data || {}) as Record<string, unknown>;
  const { measured, width, height, selected, dragging, ...rest } = node;
  return { ...rest, data: cleanData as FlowNode["data"] };
}

/**
 * 按选择集构建复制内容：
 * 单选 → 仅该节点；多选/框选 → 节点 + 两端都在选择集内的边（保留内部连线）。
 */
export function buildCopyPayload(
  nodes: FlowNode[],
  edges: Edge[],
  selectedIds: Set<string>,
): ClipboardPayload {
  const copied = nodes.filter((n) => selectedIds.has(n.id)).map(sanitizeNodeForClipboard);
  const internal = edges.filter((e) => selectedIds.has(e.source) && selectedIds.has(e.target));
  return { nodes: copied, edges: internal };
}

/**
 * 生成粘贴后的节点/边：id 重映射（node-N/edge-N 计数器）、
 * 按复制集 bbox 锚定到目标位置并应用级联偏移、粘贴节点置 selected。
 * 纯函数：计数器以参数传入、以新值返回，由调用方写回 ref。
 */
export function buildPastePayload(
  payload: ClipboardPayload,
  nodeIdCounter: number,
  edgeIdCounter: number,
  position: { x: number; y: number },
  offset: { x: number; y: number },
): { nodes: FlowNode[]; edges: Edge[]; nodeIdCounter: number; edgeIdCounter: number } {
  if (payload.nodes.length === 0) {
    return { nodes: [], edges: [], nodeIdCounter, edgeIdCounter };
  }

  // 复制集左上角（bbox），锚定后保持粘贴内容的相对布局
  let minX = Infinity;
  let minY = Infinity;
  for (const n of payload.nodes) {
    if (n.position.x < minX) minX = n.position.x;
    if (n.position.y < minY) minY = n.position.y;
  }

  let nCounter = nodeIdCounter;
  const idMap = new Map<string, string>();
  const nodes: FlowNode[] = payload.nodes.map((n) => {
    const newId = `node-${++nCounter}`;
    idMap.set(n.id, newId);
    return {
      ...n,
      id: newId,
      selected: true,
      position: {
        x: position.x + (n.position.x - minX) + offset.x,
        y: position.y + (n.position.y - minY) + offset.y,
      },
    };
  });

  let eCounter = edgeIdCounter;
  const edges: Edge[] = payload.edges.map((e) => ({
    ...e,
    id: `edge-${++eCounter}`,
    source: idMap.get(e.source) ?? e.source,
    target: idMap.get(e.target) ?? e.target,
  }));

  return { nodes, edges, nodeIdCounter: nCounter, edgeIdCounter: eCounter };
}
