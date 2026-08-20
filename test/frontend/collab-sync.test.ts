import { describe, it, expect } from "vitest";
import { readVarUint, writeVarUint } from "../../src/pages/detail/hooks/collabProvider";
import { sanitizeNodeForSync, sanitizeEdgeForSync } from "../../src/pages/detail/hooks/useCollab";
import type { FlowNode } from "../../src/pages/detail/nodes/types";
import type { Edge } from "@xyflow/react";

describe("varint 编解码", () => {
  it("边界值往返一致", () => {
    for (const v of [0, 1, 127, 128, 255, 16384, 2 ** 21, 2 ** 32]) {
      const buf: number[] = [];
      writeVarUint(buf, v);
      const [decoded, n] = readVarUint(new Uint8Array(buf), 0);
      expect(decoded).toBe(v);
      expect(n).toBe(buf.length);
    }
  });

  it("连续编码两个值可顺序解析", () => {
    const buf: number[] = [];
    writeVarUint(buf, 128);
    writeVarUint(buf, 3);
    const data = new Uint8Array(buf);
    const [a, n1] = readVarUint(data, 0);
    const [b, n2] = readVarUint(data, n1);
    expect(a).toBe(128);
    expect(b).toBe(3);
    expect(n2).toBe(data.length);
  });
});

describe("sanitizeNodeForSync", () => {
  it("剥离运行时瞬态字段与函数/DOM 引用，保留业务字段", () => {
    const cb = () => {};
    const node: FlowNode = {
      id: "node-1",
      type: "text",
      position: { x: 10, y: 20 },
      selected: true,
      dragging: true,
      measured: { width: 680, height: 400 },
      width: 680,
      height: 400,
      data: {
        type: "text",
        content: "hello",
        videoEl: document.createElement("video"),
        onCreateVideoNode: cb,
        w: 680,
        h: 400,
      },
    };

    const clean = sanitizeNodeForSync(node);

    expect(clean.selected).toBeUndefined();
    expect(clean.dragging).toBeUndefined();
    expect(clean.measured).toBeUndefined();
    expect(clean.width).toBeUndefined();
    expect(clean.height).toBeUndefined();
    expect(clean.position).toEqual({ x: 10, y: 20 });
    expect(clean.id).toBe("node-1");
    // JSON 往返：函数与 DOM 引用被剥离
    expect(clean.data).toBeDefined();
    expect((clean.data as Record<string, unknown>).content).toBe("hello");
    expect((clean.data as Record<string, unknown>).videoEl).toBeUndefined();
    expect((clean.data as Record<string, unknown>).onCreateVideoNode).toBeUndefined();
    // 入参不被修改
    expect(node.selected).toBe(true);
    expect(node.data.videoEl).toBeDefined();
  });
});

describe("sanitizeEdgeForSync", () => {
  it("剥离 selected 保留端点", () => {
    const edge: Edge = { id: "edge-1", source: "node-1", target: "node-2", selected: true };
    const clean = sanitizeEdgeForSync(edge);
    expect(clean.selected).toBeUndefined();
    expect(clean.source).toBe("node-1");
    expect(clean.target).toBe("node-2");
  });
});
