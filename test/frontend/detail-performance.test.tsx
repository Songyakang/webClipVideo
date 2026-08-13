/**
 * Detail 页面性能基准测试
 *
 * 纯 JS 路径（6 档节点数）：
 *  1. addNode 状态更新（数组复制）
 *  2. click 全量 map（优化前模式）
 *  3. click 引用保持（优化后 applyNodeSelection 模式）
 *  4. undo 快照 push（useUndoHistory.cloneSnapshot）
 *  5. 持久化序列化 + IPC payload 大小
 *
 * 挂载状态（3 档节点数，测量真实 React 更新）：
 *  6. 点击选中更新：旧全量 map vs 新引用保持 × 有/无虚拟化
 *     — 记录更新耗时 + 实际重渲染的节点组件数
 *  7. ReactFlow 渲染：无虚拟化 vs onlyRenderVisibleElements
 *
 * 说明：jsdom 数值比 Tauri webview 慢数倍，但增长趋势与真实环境一致。
 */
import { describe, it, expect, vi } from "vitest";
import { render, cleanup, act } from "@testing-library/react";
import { renderHook } from "@testing-library/react";
import { useState, useRef } from "react";
import { ReactFlow, ReactFlowProvider, type NodeProps } from "@xyflow/react";
import { useUndoHistory } from "../../src/pages/detail/hooks/useUndoHistory";
import type { FlowNode } from "../../src/pages/detail/nodes/types";
import type { Edge } from "@xyflow/react";

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
const MOUNTED_COUNTS = [100, 400, 800];

function makeNodes(n: number): FlowNode[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `node-${i + 1}`,
    type: "text",
    position: { x: (i % 20) * 350, y: Math.floor(i / 20) * 200 },
    data: {
      type: "text",
      content: `节点 ${i + 1} 的内容示例文本，用于模拟真实数据体积`.repeat(3),
      w: 680,
      h: 400,
    },
  }));
}

function makeEdges(n: number): Edge[] {
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

// 节点组件渲染计数器
const nodeRenderCounts = new Map<string, number>();
function TestNode({ id }: NodeProps) {
  nodeRenderCounts.set(id, (nodeRenderCounts.get(id) || 0) + 1);
  return <div style={{ width: 680, height: 400 }}>{id}</div>;
}

// nodeTypes 必须引用稳定（模块级），否则会破坏 ReactFlow NodeWrapper 的 memo
// 真实 Detail.tsx 中 nodeTypes 也是模块级常量
const BENCH_NODE_TYPES = { text: TestNode };

// 挂载的 Flow 测试台：pattern 决定点击更新的实现方式
let triggerSelection: ((targetId: string | null) => void) | null = null;
function FlowHarness({ nodes, edges, pattern, virtualized }: {
  nodes: FlowNode[];
  edges: Edge[];
  pattern: "old" | "new";
  virtualized: boolean;
}) {
  const [ns, setNs] = useState(nodes);
  const ref = useRef<HTMLDivElement>(null);
  triggerSelection = (targetId: string | null) => {
    if (pattern === "old") {
      // 优化前：全量 map，所有节点新建对象
      setNs((prev) => prev.map((n) => ({ ...n, selected: n.id === targetId })));
    } else {
      // 优化后：只更新变化的节点，其余保持引用
      setNs((prev) => {
        let changed = false;
        const next = prev.map((n) => {
          const should = n.id === targetId;
          if (!!n.selected === should) return n;
          changed = true;
          return { ...n, selected: should };
        });
        return changed ? next : prev;
      });
    }
  };
  return (
    <div ref={ref} style={{ width: 1200, height: 800 }}>
      <ReactFlowProvider>
        <ReactFlow
          nodes={ns}
          edges={edges}
          nodeTypes={BENCH_NODE_TYPES}
          fitView={false}
          defaultViewport={{ x: 0, y: 0, zoom: 1 }}
          onlyRenderVisibleElements={virtualized || undefined}
        />
      </ReactFlowProvider>
    </div>
  );
}

interface MountedResult {
  ms: number;
  rerendered: number;
}

function benchMountedSelection(n: number, pattern: "old" | "new", virtualized: boolean): MountedResult {
  const nodes = makeNodes(n);
  const edges = makeEdges(n);
  nodeRenderCounts.clear();
  const { unmount } = render(
    <FlowHarness nodes={nodes} edges={edges} pattern={pattern} virtualized={virtualized} />,
  );
  // 清掉初始渲染计数
  nodeRenderCounts.clear();

  let elapsed = 0;
  act(() => {
    const start = performance.now();
    triggerSelection!("node-1");
    elapsed = performance.now() - start;
  });

  const rerendered = [...nodeRenderCounts.values()].filter((c) => c > 0).length;
  unmount();
  return { ms: elapsed, rerendered };
}

const pureResults: Record<string, Record<number, number>> = {
  addNode: {},
  clickMapOld: {},
  clickMapNew: {},
  undoPush: {},
  serialize: {},
};
const payloadSizes: Record<number, number> = {};
const mountedResults: Record<string, Record<number, MountedResult>> = {
  updateOldNoVirt: {},
  updateNewNoVirt: {},
  updateNewVirt: {},
};
const renderResults: Record<string, Record<number, number>> = {
  renderNoVirt: {},
  renderVirt: {},
};

describe("Detail 性能基准", () => {
  afterEach(() => cleanup());

  it("纯 JS 路径 + 挂载更新 + 渲染", { timeout: 300000 }, () => {
    // ─── 纯 JS 指标 ───────────────────────────────────────────
    for (const n of COUNTS) {
      const nodes = makeNodes(n);
      const edges = makeEdges(n);
      // eslint-disable-next-line no-console
      console.log(`\n=== ${n} 节点 (纯JS) ===`);

      const one = nodes[0];
      pureResults.addNode[n] = bench("addNode 追加", () => {
        nodes.concat([{ ...one, id: `node-extra-${n}` }]);
      }, 10);

      pureResults.clickMapOld[n] = bench("click 全量map(旧)", () => {
        nodes.map((nd) => ({ ...nd, selected: nd.id === "node-1" }));
      }, 10);

      pureResults.clickMapNew[n] = bench("click 引用保持(新)", () => {
        nodes.map((nd) => {
          const should = nd.id === "node-1";
          if (!!nd.selected === should) return nd;
          return { ...nd, selected: should };
        });
      }, 10);

      const { result } = renderHook(() => useUndoHistory());
      const push = result.current.push;
      act(() => {
        push(nodes, edges);
      });
      pureResults.undoPush[n] = bench("undo push 快照", () => {
        act(() => {
          push(nodes, edges.concat([{ id: `bench-e-${n}`, source: "node-1", target: "node-2", sourceHandle: "", targetHandle: "" }]));
        });
      }, 1);

      let payloadSize = 0;
      const invokeMock = vi.mocked(invoke) as unknown as (
        cmd: string,
        args?: { nodes?: unknown[]; edges?: unknown[] },
      ) => Promise<void>;
      invokeMock.mockImplementation(async (_cmd, args) => {
        payloadSize = JSON.stringify(args).length;
      });
      pureResults.serialize[n] = bench("saveCanvas 序列化", () => {
        void saveCanvas("bench-clip", nodes, edges);
      });
      payloadSizes[n] = payloadSize;
    }

    // ─── 挂载状态：点击更新 + 渲染 ─────────────────────────────
    for (const n of MOUNTED_COUNTS) {
      const nodes = makeNodes(n);
      const edges = makeEdges(n);
      // eslint-disable-next-line no-console
      console.log(`\n=== ${n} 节点 (挂载) ===`);

      const r1 = benchMountedSelection(n, "old", false);
      // eslint-disable-next-line no-console
      console.log(`  [更新 旧map 无虚拟化] ${r1.ms.toFixed(2)} ms, 重渲染 ${r1.rerendered} 个组件`);
      mountedResults.updateOldNoVirt[n] = r1;

      const r2 = benchMountedSelection(n, "new", false);
      // eslint-disable-next-line no-console
      console.log(`  [更新 引用保持 无虚拟化] ${r2.ms.toFixed(2)} ms, 重渲染 ${r2.rerendered} 个组件`);
      mountedResults.updateNewNoVirt[n] = r2;

      const r3 = benchMountedSelection(n, "new", true);
      // eslint-disable-next-line no-console
      console.log(`  [更新 引用保持 虚拟化] ${r3.ms.toFixed(2)} ms, 重渲染 ${r3.rerendered} 个组件`);
      mountedResults.updateNewVirt[n] = r3;

      renderResults.renderNoVirt[n] = bench("渲染 无虚拟化", () => {
        const { unmount } = render(
          <FlowHarness nodes={nodes} edges={edges} pattern="new" virtualized={false} />,
        );
        unmount();
      });

      renderResults.renderVirt[n] = bench("渲染 虚拟化", () => {
        const { unmount } = render(
          <FlowHarness nodes={nodes} edges={edges} pattern="new" virtualized={true} />,
        );
        unmount();
      });
    }

    // ─── 汇总 ────────────────────────────────────────────────
    // eslint-disable-next-line no-console
    console.log("\n=== 汇总: 纯JS (ms) ===");
    for (const [label, byCount] of Object.entries(pureResults)) {
      const row: Record<string, string | number> = { 指标: label };
      for (const n of COUNTS) row[`${n}节点`] = +byCount[n].toFixed(3);
      // eslint-disable-next-line no-console
      console.table(row);
    }
    const sizeRow: Record<string, string | number> = { 指标: "payload(KB)" };
    for (const n of COUNTS) sizeRow[`${n}节点`] = +(payloadSizes[n] / 1024).toFixed(1);
    // eslint-disable-next-line no-console
    console.table(sizeRow);

    // eslint-disable-next-line no-console
    console.log("\n=== 汇总: 点击更新 (ms / 重渲染组件数) ===");
    for (const [label, byCount] of Object.entries(mountedResults)) {
      const row: Record<string, string> = { 指标: label };
      for (const n of MOUNTED_COUNTS) {
        const r = byCount[n];
        row[`${n}节点`] = `${r.ms.toFixed(1)}ms/${r.rerendered}个`;
      }
      // eslint-disable-next-line no-console
      console.table(row);
    }

    // eslint-disable-next-line no-console
    console.log("\n=== 汇总: ReactFlow 渲染 (ms) ===");
    for (const [label, byCount] of Object.entries(renderResults)) {
      const row: Record<string, string | number> = { 指标: label };
      for (const n of MOUNTED_COUNTS) row[`${n}节点`] = +byCount[n].toFixed(1);
      // eslint-disable-next-line no-console
      console.table(row);
    }

    // 基本断言
    expect(payloadSizes[1600]).toBeGreaterThan(payloadSizes[50]);
    // 优化后：已选中节点再次点击应零重渲染（引用保持 + React bail-out）
    const n = makeNodes(100);
    const e = makeEdges(100);
    nodeRenderCounts.clear();
    const { unmount } = render(
      <FlowHarness nodes={n} edges={e} pattern="new" virtualized={false} />,
    );
    nodeRenderCounts.clear();
    act(() => triggerSelection!("node-1"));
    nodeRenderCounts.clear();
    act(() => triggerSelection!("node-1")); // 再次点击同一节点
    const secondRerender = [...nodeRenderCounts.values()].filter((c) => c > 0).length;
    expect(secondRerender).toBe(0);
    unmount();
  });
});
