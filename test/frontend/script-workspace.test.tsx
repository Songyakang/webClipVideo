import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { addClip } from "../../src/lib/store";
import { loadCanvas, saveCanvas } from "../../src/lib/db";
import ScriptWorkspace from "../../src/pages/ScriptWorkspace";
import { createExampleScript } from "../../src/pages/detail/script/types";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(async () => undefined), isTauri: () => true }));
vi.mock("../../src/lib/store", () => ({ addClip: vi.fn() }));
vi.mock("../../src/lib/db", () => ({ loadCanvas: vi.fn(), saveCanvas: vi.fn(), nodeToInput: (node: unknown) => node }));
vi.mock("../../src/lib/assets", () => ({ getAssetSrc: vi.fn() }));
afterEach(cleanup);
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(invoke).mockImplementation(async (command) => command === "get_platforms" ? [] : null as any);
});

function open(path: string) {
  render(<MemoryRouter initialEntries={[path]}><Routes>
    <Route path="/experiments/script" element={<ScriptWorkspace />} />
    <Route path="/detail/:id/script/:nodeId" element={<ScriptWorkspace />} />
    <Route path="/detail/:id" element={<p>已返回项目画布</p>} />
  </Routes></MemoryRouter>);
}

describe("脚本工作台的存储边界", () => {
  it("新项目首次保存失败后重试复用项目，只有写入成功才离开", async () => {
    vi.mocked(addClip).mockResolvedValue({ id: "project-1" } as Awaited<ReturnType<typeof addClip>>);
    vi.mocked(saveCanvas).mockRejectedValueOnce(new Error("保存失败")).mockResolvedValueOnce(undefined);
    open("/experiments/script");
    fireEvent.click(screen.getByRole("button", { name: "保存为新项目" }));
    await screen.findByRole("alert");
    expect(screen.queryByText("已返回项目画布")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "保存为新项目" }));
    await screen.findByText("已返回项目画布");
    expect(addClip).toHaveBeenCalledOnce();
    expect(saveCanvas).toHaveBeenCalledTimes(2);
    expect(vi.mocked(saveCanvas).mock.calls[1][0]).toBe("project-1");
  });

  it("恢复已有脚本，只更新当前节点并保留最新位置", async () => {
    const node = { id: "node-4", type: "script", position: { x: 12, y: 34 }, data: { type: "script", content: "", script: createExampleScript() } };
    vi.mocked(loadCanvas).mockResolvedValueOnce({ nodes: [node], edges: [] }).mockResolvedValueOnce({ nodes: [{ ...node, position: { x: 99, y: 88 } }], edges: [] });
    open("/detail/project-1/script/node-4");
    await screen.findByRole("textbox", { name: "脚本标题" });
    fireEvent.change(screen.getByLabelText("原稿内容"), { target: { value: "保存后的新原稿" } });
    fireEvent.click(screen.getByRole("button", { name: "保存到画布" }));
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("db_upsert_canvas_nodes", expect.objectContaining({ clipId: "project-1", nodes: [expect.objectContaining({ id: "node-4", position: { x: 99, y: 88 }, data: expect.objectContaining({ script: expect.objectContaining({ source: "保存后的新原稿" }) }) })] })));
    expect(saveCanvas).not.toHaveBeenCalled();
  });

  it("保存前节点已被删除时显示错误，不恢复已删除的节点", async () => {
    vi.mocked(loadCanvas).mockResolvedValueOnce({ nodes: [{ id: "node-1", type: "script", position: { x: 0, y: 0 }, data: { script: createExampleScript() } }], edges: [] }).mockResolvedValueOnce({ nodes: [], edges: [] });
    open("/detail/project-1/script/node-1");
    await screen.findByRole("button", { name: "保存到画布" });
    fireEvent.click(screen.getByRole("button", { name: "保存到画布" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("已被删除"));
    expect(vi.mocked(invoke).mock.calls.some(([command]) => command === "db_upsert_canvas_nodes")).toBe(false);
  });
});
