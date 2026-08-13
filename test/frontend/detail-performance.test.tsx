/**
 * Detail 页面性能基准测试
 *
 * 测量随节点数增长的各关键路径耗时：
 *  1. addNode 状态更新（数组复制）
 *  2. onNodeClick 全量 map（Detail.tsx 的点击处理）
 *  3. undo 快照 push（useUndoHistory.cloneSnapshot）
 *  4. 持久化序列化（saveCanvas 清理 + IPC payload 大小）
 *  5. ReactFlow 渲染（含节点组件实例化）
 *
 * 说明：jsdom 数值比 Tauri webview 慢数倍，但增长趋势与真实环境一致，
 * 用于评估可承载节点量级。
 */
import { describe, it, expect, vi } from "vitest";
import { render, cleanup, act } from "@testing-library/react";
import { renderHook } from "@testing-library/react";
import { ReactFlow, ReactFlowProvider } from "@xyflow/react";
import { useUndoHistory } from "../../src/pages/detail/hooks/useUndoHistory";
import type { FlowNode } from "../../src/pages/detail/nodes/types";

// ReactFlow 依赖 ResizeObserver，jsdom 需要桩
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as { ResizeObserver?: unknown }).ResizeObserver =
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver ?? ResizeObserverStub;

// Mock Tauri invoke — 只统计 payload 大小，不真实写入
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async () => undefined),
}));

import { saveCanvas } from "../../src/lib/db";
import { invoke } from "@tauri-apps/api/core";

const COUNTS = [50, 100, 200, 400, 800, 1600];

function makeNodes(n: number, withData = true): FlowNode[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `node-${i + 1}`,
    type: "text",
    position: { x: (i % 20) * 350, y: Math.floor(i / 20) * 200 },
    data: withData
      ? {
          type: "text",
          content: `节点 ${i + 1} 的内容示例文本，用于模拟真实数据体积`.repeat(3),
          w: 680,
          h: 400,
        }
      : { type: "text", content: "" },
  }));
}

function makeEdges(n: number) {
  return Array.from({ length: n - 1 }, (_, i) => ({
    id: `edge-${i + 1}`,
    source: `node-${i + 1}`,
    target: `node-${i + 2}`,
    sourceHandle: "",
    targetHandle: "",
  }));
}

function bench(label: string, fn: () => void, iterations = 1): number {
  const start = performance.now();
  for (let i = 0; i < iterations; i++) fn();
  const elapsed = (performance.now() - start) / iterations;
  // eslint-disable-next-line no-console
  console.log(`  [${label}] ${elapsed.toFixed(2)} ms`);
  return elapsed;
}

const results: Record<string, Record<number, number>> = {
  addNode: {},
  clickMap: {},
  undoPush: {},
  serialize: {},
  reactflowRender: {},
};
const payloadSizes: Record<number, number> = {};

function SimpleNode() {
  return <div style={{ width: 680, height: 400 }}>node</div>;
}

describe("Detail 性能基准", () => {
  afterEach(() => cleanup());

  it("随节点数增长的各项耗时与 payload", { timeout: 120000 }, () => {
    for (const n of COUNTS) {
      const nodes = makeNodes(n);
      const edges = makeEdges(n);
      // eslint-disable-next-line no-console
      console.log(`\n=== ${n} 节点 ===`);

      // 1. addNode 模式（函数式 setState 追加）
      const one = nodes[0];
      results.addNode[n] = bench("addNode 追加", () => {
        nodes.concat([{ ...one, id: `node-extra-${n}` }]);
      }, 10);

      // 2. onNodeClick 模式（全量 map 设置 selected）
      results.clickMap[n] = bench("click 全量 map", () => {
        nodes.map((nd) => ({ ...nd, selected: nd.id === "node-1" }));
      }, 10);

      // 3. undo push（cloneSnapshot 全量克隆）
      // push 按节点/边数量去重，用变化的边数强制每次执行全量克隆
      const { result } = renderHook(() => useUndoHistory());
      const push = result.current.push;
      act(() => {
        push(nodes, edges); // 首次调用建立 currentRef 基线
      });
      results.undoPush[n] = bench("undo push 快照", () => {
        act(() => {
          push(nodes, edges.concat([{ id: `bench-e-${n}`, source: "node-1", target: "node-2", sourceHandle: "", targetHandle: "" }]));
        });
      }, 1);

      // 4. 持久化序列化 + payload 大小
      let payloadSize = 0;
      const invokeMock = vi.mocked(invoke) as unknown as (
        cmd: string,
        args?: { nodes?: unknown[]; edges?: unknown[] },
      ) => Promise<void>;
      invokeMock.mockImplementation(async (_cmd, args) => {
        payloadSize = JSON.stringify(args).length;
      });
      results.serialize[n] = bench("saveCanvas 序列化", () => {
        void saveCanvas("bench-clip", nodes, edges);
      });
      payloadSizes[n] = payloadSize;

      // 5. ReactFlow 渲染（1600 时 jsdom 太慢，跳过）
      if (n <= 800) {
        results.reactflowRender[n] = bench("ReactFlow 渲染", () => {
          const { unmount } = render(
            <ReactFlowProvider>
              <ReactFlow nodes={nodes} edges={edges} nodeTypes={{ text: SimpleNode }} fitView={false} />
            </ReactFlowProvider>,
          );
          unmount();
        });
      }
    }

    // 汇总表
    // eslint-disable-next-line no-console
    console.log("\n=== 汇总 (ms) ===");
    for (const [label, byCount] of Object.entries(results)) {
      const row: Record<string, string | number> = { 指标: label };
      for (const n of COUNTS) row[`${n}节点`] = byCount[n] ?? "-";
      // eslint-disable-next-line no-console
      console.table(row);
    }
    const sizeRow: Record<string, string | number> = { 指标: "payload(KB)" };
    for (const n of COUNTS) sizeRow[`${n}节点`] = +(payloadSizes[n] / 1024).toFixed(1);
    // eslint-disable-next-line no-console
    console.table(sizeRow);

    // 基本合理性断言（趋势应大致线性或更好）
    expect(results.addNode[400]).toBeGreaterThan(0);
    expect(payloadSizes[400]).toBeGreaterThan(payloadSizes[50]);
  });
});
