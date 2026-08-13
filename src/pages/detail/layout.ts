/**
 * 画布布局算法（纯函数，可被 Web Worker 与测试共用）
 *
 * 混合策略：
 * - 小图（节点数 ≤ 1500 且链深 ≤ 1000）：dagre 高质量布局
 * - 大图 / 深链：迭代式最长路径分层（Kahn 拓扑），O(V+E) 无递归
 *
 * dagre 的 acyclic.js 用递归 DFS 找环，深链（>1000 节点串行连接）
 * 会触发 "Maximum call stack size exceeded"，因此必须先做深度预检。
 */
import dagre from "dagre";

export interface LayoutNode {
  id: string;
  width: number;
  height: number;
}

export interface LayoutEdge {
  source: string;
  target: string;
}

export interface LayoutResult {
  /** 节点 id → 左上角坐标 */
  positions: Record<string, { x: number; y: number }>;
  duration: number;
  algorithm: "dagre" | "layered";
}

const MAX_DAGRE_NODES = 1500;
const MAX_CHAIN_DEPTH = 1000;

/** 迭代式计算最长链深度（Kahn 拓扑，无递归） */
function computeChainDepth(nodes: LayoutNode[], edges: LayoutEdge[]): number {
  const indegree = new Map<string, number>();
  const adj = new Map<string, string[]>();
  nodes.forEach((n) => {
    indegree.set(n.id, 0);
    adj.set(n.id, []);
  });
  edges.forEach((e) => {
    if (!adj.has(e.source) || !adj.has(e.target)) return;
    adj.get(e.source)!.push(e.target);
    indegree.set(e.target, (indegree.get(e.target) ?? 0) + 1);
  });

  const depth = new Map<string, number>();
  const queue: string[] = [];
  nodes.forEach((n) => {
    if ((indegree.get(n.id) ?? 0) === 0) queue.push(n.id);
  });

  let qi = 0; // 指针式队列，避免 shift O(N)
  let maxDepth = 0;
  while (qi < queue.length) {
    const id = queue[qi++];
    const d = depth.get(id) ?? 0;
    maxDepth = Math.max(maxDepth, d);
    for (const t of adj.get(id) ?? []) {
      depth.set(t, Math.max(depth.get(t) ?? 0, d + 1));
      const remaining = (indegree.get(t) ?? 1) - 1;
      indegree.set(t, remaining);
      if (remaining === 0) queue.push(t);
    }
  }
  return maxDepth;
}

/** 迭代式分层布局：第 L 层在 x = L * stepX，层内纵向排布 */
function layeredLayout(nodes: LayoutNode[], edges: LayoutEdge[]): Record<string, { x: number; y: number }> {
  const indegree = new Map<string, number>();
  const adj = new Map<string, string[]>();
  const sizeById = new Map<string, LayoutNode>();
  nodes.forEach((n) => {
    sizeById.set(n.id, n);
    indegree.set(n.id, 0);
    adj.set(n.id, []);
  });
  edges.forEach((e) => {
    if (!adj.has(e.source) || !adj.has(e.target)) return;
    adj.get(e.source)!.push(e.target);
    indegree.set(e.target, (indegree.get(e.target) ?? 0) + 1);
  });

  const layer = new Map<string, number>();
  const queue: string[] = [];
  nodes.forEach((n) => {
    if ((indegree.get(n.id) ?? 0) === 0) queue.push(n.id);
  });

  let qi = 0;
  let maxLayer = 0;
  while (qi < queue.length) {
    const id = queue[qi++];
    const l = layer.get(id) ?? 0;
    maxLayer = Math.max(maxLayer, l);
    for (const t of adj.get(id) ?? []) {
      layer.set(t, Math.max(layer.get(t) ?? 0, l + 1));
      const remaining = (indegree.get(t) ?? 1) - 1;
      indegree.set(t, remaining);
      if (remaining === 0) queue.push(t);
    }
  }

  // 环内节点（indegree 未归零）放到最后一层之后
  nodes.forEach((n) => {
    if ((indegree.get(n.id) ?? 0) > 0) {
      layer.set(n.id, maxLayer + 1);
    }
  });

  const nodeStepX = 760; // 680 宽 + 80 间距
  const nodeStepY = 480; // 400 高 + 80 间距
  const layerCounts = new Map<number, number>();
  const positions: Record<string, { x: number; y: number }> = {};
  nodes.forEach((n) => {
    const l = layer.get(n.id) ?? 0;
    const idx = layerCounts.get(l) ?? 0;
    layerCounts.set(l, idx + 1);
    positions[n.id] = { x: l * nodeStepX, y: idx * nodeStepY };
  });
  return positions;
}

function dagreLayout(nodes: LayoutNode[], edges: LayoutEdge[]): Record<string, { x: number; y: number }> {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "LR", nodesep: 80, ranksep: 160 });
  nodes.forEach((n) => g.setNode(n.id, { width: n.width, height: n.height }));
  edges.forEach((e) => g.setEdge(e.source, e.target));
  dagre.layout(g);

  const positions: Record<string, { x: number; y: number }> = {};
  nodes.forEach((n) => {
    const pos = g.node(n.id);
    if (pos) positions[n.id] = { x: pos.x - n.width / 2, y: pos.y - n.height / 2 };
  });
  return positions;
}

export function layoutCanvas(nodes: LayoutNode[], edges: LayoutEdge[]): LayoutResult {
  const start = performance.now();

  let positions: Record<string, { x: number; y: number }>;
  let algorithm: LayoutResult["algorithm"];

  const chainDepth = computeChainDepth(nodes, edges);
  if (nodes.length <= MAX_DAGRE_NODES && chainDepth <= MAX_CHAIN_DEPTH) {
    try {
      positions = dagreLayout(nodes, edges);
      algorithm = "dagre";
    } catch (err) {
      // dagre 递归栈溢出等异常 → 降级
      console.warn("[layout] dagre failed, fallback to layered:", err);
      positions = layeredLayout(nodes, edges);
      algorithm = "layered";
    }
  } else {
    positions = layeredLayout(nodes, edges);
    algorithm = "layered";
  }

  return { positions, duration: performance.now() - start, algorithm };
}
