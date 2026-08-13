import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Tauri invoke so saveCanvas can be tested in jsdom
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async () => undefined),
}));

import { saveCanvas } from "../../src/lib/db";
import { invoke } from "@tauri-apps/api/core";
import type { Node } from "@xyflow/react";

function makeNode(data: Record<string, unknown>): Node {
  return {
    id: "node-pano-1",
    type: "panorama",
    position: { x: 0, y: 0 },
    data: { type: "panorama", content: "", ...data },
  };
}

describe("saveCanvas 持久化过滤", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("剥离 onUploadComplete 回调", async () => {
    const node = makeNode({
      fileUrl: "asset://x/pano.jpg",
      assetPath: "proj-1/pano.jpg",
      onUploadComplete: () => {},
    });

    await saveCanvas("clip-1", [node], []);

    const [cmd, args] = vi.mocked(invoke).mock.calls[0];
    expect(cmd).toBe("db_save_canvas");
    const cleanNodes = (args as { nodes: { data: Record<string, unknown> }[] }).nodes;
    expect(cleanNodes[0].data).not.toHaveProperty("onUploadComplete");
  });

  it("剥离 onFileUpload 旧字段（兼容）", async () => {
    const node = makeNode({
      fileUrl: "asset://x/pano.jpg",
      onFileUpload: () => {},
    });

    await saveCanvas("clip-1", [node], []);

    const [, args] = vi.mocked(invoke).mock.calls[0];
    const cleanNodes = (args as { nodes: { data: Record<string, unknown> }[] }).nodes;
    expect(cleanNodes[0].data).not.toHaveProperty("onFileUpload");
  });

  it("剥离 videoEl DOM 引用（回归保护）", async () => {
    const node = makeNode({
      fileUrl: "asset://x/v.mp4",
      videoEl: document.createElement("video"),
    });

    await saveCanvas("clip-1", [node], []);

    const [, args] = vi.mocked(invoke).mock.calls[0];
    const cleanNodes = (args as { nodes: { data: Record<string, unknown> }[] }).nodes;
    expect(cleanNodes[0].data).not.toHaveProperty("videoEl");
  });

  it("普通字段完整保留", async () => {
    const node = makeNode({
      fileUrl: "asset://x/pano.jpg",
      assetPath: "proj-1/pano.jpg",
      projectId: "proj-1",
      w: 680,
      h: 400,
    });

    await saveCanvas("clip-1", [node], []);

    const [, args] = vi.mocked(invoke).mock.calls[0];
    const cleanNodes = (args as { nodes: { data: Record<string, unknown> }[] }).nodes;
    expect(cleanNodes[0].data).toMatchObject({
      fileUrl: "asset://x/pano.jpg",
      assetPath: "proj-1/pano.jpg",
      projectId: "proj-1",
      w: 680,
      h: 400,
    });
  });
});
