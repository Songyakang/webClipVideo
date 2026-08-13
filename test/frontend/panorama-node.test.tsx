import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ReactFlowProvider } from "@xyflow/react";
import PanoramaNode from "../../src/pages/detail/nodes/PanoramaNode";
import type { NodeProps } from "@xyflow/react";

// Mock asset helpers so the component doesn't touch Tauri APIs in jsdom
vi.mock("../../src/lib/assets", () => ({
  saveAsset: vi.fn(async (_projectId: string, _nodeId: string, file: File) => {
    return `blob:mock-${file.name}`;
  }),
  getAssetSrc: vi.fn(async (path: string) => `asset://${path}`),
}));

import { saveAsset } from "../../src/lib/assets";

function makeProps(overrides: Partial<{ data: Record<string, unknown>; selected: boolean; dragging: boolean }> = {}): NodeProps {
  return {
    id: "node-pano-1",
    data: { type: "panorama", content: "", ...(overrides.data || {}) },
    selected: overrides.selected ?? false,
    dragging: overrides.dragging ?? false,
  } as unknown as NodeProps;
}

function renderNode(props: NodeProps) {
  return render(
    <ReactFlowProvider>
      <PanoramaNode {...props} />
    </ReactFlowProvider>,
  );
}

describe("PanoramaNode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── 未上传状态 ────────────────────────────────────────────────

  it("未上传时显示上传按钮和占位文案", () => {
    renderNode(makeProps());
    expect(screen.getByText("全景图")).toBeTruthy();
    expect(screen.getByText("上传全景图片")).toBeTruthy();
    // 不显示预览提示
    expect(screen.queryByText("双击预览全景图")).toBeNull();
  });

  it("上传按钮点击时触发隐藏的 file input", () => {
    renderNode(makeProps());
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const clickSpy = vi.spyOn(fileInput, "click");
    fireEvent.click(screen.getByText("上传全景图片"));
    expect(clickSpy).toHaveBeenCalled();
  });

  // ─── 已上传状态 ────────────────────────────────────────────────

  it("已上传时显示图片缩略图和预览提示", () => {
    renderNode(
      makeProps({
        data: { type: "panorama", content: "", fileUrl: "asset://mock/pano.jpg", assetPath: "proj/node-1.jpg" },
      }),
    );
    const img = screen.getByAltText("") as HTMLImageElement;
    expect(img.src).toContain("mock/pano.jpg");
    expect(screen.getByText("双击预览全景图")).toBeTruthy();
    // 上传按钮隐藏
    expect(screen.queryByText("上传全景图片")).toBeNull();
  });

  // ─── 文件上传流程 ──────────────────────────────────────────────

  it("选择文件后调用 saveAsset 并通知 onUploadComplete", async () => {
    const onUploadComplete = vi.fn();
    renderNode(
      makeProps({
        data: { type: "panorama", content: "", projectId: "proj-1", onUploadComplete },
      }),
    );

    const file = new File(["fake-image-bytes"], "pano.jpg", { type: "image/jpeg" });
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => expect(onUploadComplete).toHaveBeenCalledTimes(1));

    // saveAsset called with projectId + nodeId + file
    expect(saveAsset).toHaveBeenCalledWith("proj-1", "node-pano-1", file);
    // onUploadComplete called with nodeId, url, path
    expect(onUploadComplete).toHaveBeenCalledWith("node-pano-1", "blob:mock-pano.jpg", "blob:mock-pano.jpg");
  });

  it("上传失败时捕获错误且不崩溃", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(saveAsset).mockRejectedValueOnce(new Error("write failed"));
    const onUploadComplete = vi.fn();

    renderNode(
      makeProps({
        data: { type: "panorama", content: "", projectId: "proj-1", onUploadComplete },
      }),
    );

    const file = new File(["x"], "pano.png", { type: "image/png" });
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => expect(errSpy).toHaveBeenCalled());
    expect(onUploadComplete).not.toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it("没有 onUploadComplete 回调时静默完成上传", async () => {
    renderNode(
      makeProps({ data: { type: "panorama", content: "", projectId: "proj-1" } }),
    );

    const file = new File(["x"], "pano.png", { type: "image/png" });
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => expect(saveAsset).toHaveBeenCalledTimes(1));
  });

  // ─── 节点状态样式 ──────────────────────────────────────────────

  it("选中时带 selected class，未选中时没有", () => {
    const { container } = renderNode(makeProps({ selected: false }));
    expect(container.querySelector(".panorama-node")?.className).not.toContain("selected");
  });
});
