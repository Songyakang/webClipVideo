import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import Settings from "../../src/pages/Settings";
import { invoke } from "@tauri-apps/api/core";
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("../../src/pages/detail/toolbox/common", () => ({ TOOLBOX_CSS: "", SelectWrap: ({ value, onValueChange, items }: any) => <select value={value} onChange={(e) => onValueChange(e.target.value)}>{items.map((p: any) => <option key={p.value} value={p.value}>{p.label}</option>)}</select> }));
const platform = { id: "local", name: "Local", platformType: "text", location: "local", authType: "none", baseEndpoint: "http://localhost:1234/v1", endpoints: [{ key: "chat", name: "对话", path: "/chat/completions", model: "test" }] };
beforeEach(() => { vi.mocked(invoke).mockReset().mockImplementation(async (command) => command === "get_all_config" ? {} : command === "get_platforms" ? [platform] : undefined as any); });
afterEach(cleanup);
async function openEdit() {
  render(<MemoryRouter><Settings /></MemoryRouter>);
  fireEvent.click(screen.getByText("文本"));
  await screen.findByText("Local");
  fireEvent.click(screen.getByText("编辑"));
}
describe("LLM 配置保存和测试连接", () => {
  it("保存失败保留表单和输入，重试成功后才关闭", async () => {
    let fail = true;
    vi.mocked(invoke).mockImplementation(async (cmd) => {
      if (cmd === "get_all_config") return {} as any;
      if (cmd === "get_platforms") return [platform] as any;
      if (cmd === "save_platforms" && fail) throw "磁盘写入失败";
      return undefined as any;
    });
    await openEdit();
    fireEvent.change(screen.getByDisplayValue("Local"), { target: { value: "修改名称" } });
    fireEvent.click(screen.getByText("更新"));
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "磁盘写入失败");
    expect(screen.getByDisplayValue("修改名称")).toBeTruthy();
    expect(screen.getByText("Local")).toBeTruthy();
    fail = false;
    fireEvent.click(screen.getByText("更新"));
    await waitFor(() => expect(screen.queryByText("编辑平台")).toBeNull());
    expect(screen.getByText("修改名称")).toBeTruthy();
  });
  it("加载失败禁止新增，重试恢复配置", async () => {
    let fail = true;
    vi.mocked(invoke).mockImplementation(async (cmd) => {
      if (cmd === "get_platforms" && fail) throw "配置损坏";
      return (cmd === "get_platforms" ? [platform] : {}) as any;
    });
    render(<MemoryRouter><Settings /></MemoryRouter>);
    await screen.findByRole("alert");
    expect((screen.getByText("+ 新增") as HTMLButtonElement).disabled).toBe(true);
    fail = false; fireEvent.click(screen.getByText("重试加载"));
    await waitFor(() => expect((screen.getByText("+ 新增") as HTMLButtonElement).disabled).toBe(false));
  });
  it("测试使用未保存的表单配置且发送真实参数类型", async () => {
    vi.mocked(invoke).mockImplementation(async (cmd) => (cmd === "get_all_config" ? {} : cmd === "get_platforms" ? [platform] : { model: "test", latencyMs: 15 }) as any);
    await openEdit();
    fireEvent.change(screen.getByLabelText("对话额外参数"), { target: { value: '{"temperature":0.4,"max_tokens":128}' } });
    fireEvent.click(screen.getByText("测试连接"));
    await screen.findByRole("status");
    expect(invoke).toHaveBeenCalledWith("test_llm_connection", expect.objectContaining({ platform: expect.objectContaining({ authType: "none", endpoints: [expect.objectContaining({ params: { temperature: 0.4, max_tokens: 128 } })] }), functionKey: "chat" }));
    expect(vi.mocked(invoke).mock.calls.some(([cmd]) => cmd === "save_platforms")).toBe(false);
  });
  it("保存进行中不重复发起请求", async () => {
    let finish!: () => void;
    vi.mocked(invoke).mockImplementation(async (cmd) => {
      if (cmd === "save_platforms") return new Promise<void>((resolve) => { finish = resolve; }) as any;
      return (cmd === "get_platforms" ? [platform] : {}) as any;
    });
    await openEdit(); fireEvent.click(screen.getByText("更新"));
    fireEvent.click(screen.getByText("保存中…"));
    expect(vi.mocked(invoke).mock.calls.filter(([cmd]) => cmd === "save_platforms")).toHaveLength(1);
    await act(async () => finish());
  });
});
