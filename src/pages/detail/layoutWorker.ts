/**
 * 画布布局 Web Worker — 把布局计算移出主线程，
 * 大图（数千节点）布局时 UI 不卡顿。
 * 算法实现见 layout.ts（小图 dagre，大图迭代分层）。
 */
import { layoutCanvas } from "./layout";
import type { LayoutNode, LayoutEdge } from "./layout";

export interface LayoutRequest {
  type: "layout";
  nodes: LayoutNode[];
  edges: LayoutEdge[];
}

export interface LayoutResponse {
  type: "layout-done";
  /** 节点 id → 左上角坐标 */
  positions: Record<string, { x: number; y: number }>;
  duration: number;
  algorithm: "dagre" | "layered";
}

self.onmessage = (e: MessageEvent<LayoutRequest>) => {
  if (e.data.type !== "layout") return;
  const { positions, duration, algorithm } = layoutCanvas(e.data.nodes, e.data.edges);
  const response: LayoutResponse = { type: "layout-done", positions, duration, algorithm };
  self.postMessage(response);
};

export {};
