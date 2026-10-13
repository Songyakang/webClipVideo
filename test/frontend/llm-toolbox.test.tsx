import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Toolbox from "../../src/pages/detail/toolbox/Toolbox";
import { GenerateContext } from "../../src/pages/detail/hooks/GenerateContext";
import { invoke } from "@tauri-apps/api/core";
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("../../src/pages/detail/toolbox/common", async (importOriginal) => {
  const real = await importOriginal<Record<string, unknown>>();
  return { ...real, SelectWrap: ({ value, onValueChange, items }: any) => <select value={value} onChange={(e) => onValueChange(e.target.value)}>{items.map((p: any) => <option key={p.value} value={p.value}>{p.label}</option>)}</select> };
});
const custom = { id: "local", name: "Local", platformType: "text", location: "local", baseEndpoint: "http://localhost/v1", endpoints: [ { key: "chat", model: "test" }, { key: "reverse-prompt", model: "vision" } ] };
beforeEach(() => { localStorage.clear(); vi.mocked(invoke).mockReset(); vi.mocked(invoke).mockImplementation(async (command) => command === "get_platforms" ? [custom] : undefined as any); });
afterEach(cleanup);
function pending<T>() { let resolve!: (v: T) => void; const promise = new Promise<T>((r) => { resolve = r; }); return { promise, resolve }; }

describe("LLM 工具箱", () => {
  it("自定义平台请求包含 ID，结果不会覆盖等待期间的新输入", async () => {
    localStorage.setItem("llm-chat", "platform:local");
    const response = pending<{ optimized_prompt: string }>();
    vi.mocked(invoke).mockImplementation(async (cmd) => cmd === "get_platforms" ? [custom] : cmd === "optimize_prompt" ? response.promise : undefined as any);
    const apply = vi.fn();
    render(<Toolbox nodeId="node-1" nodeType="text" defaultPrompt="原文" onOptimized={apply} />);
    await screen.findByText("Local · test");
    await act(async () => {});
    fireEvent.click(screen.getByText("优化"));
    expect(invoke).toHaveBeenCalledWith("optimize_prompt", expect.objectContaining({ provider: "custom", platformId: "local", text: "原文" }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "新输入" } });
    await act(async () => response.resolve({ optimized_prompt: "候选结果文本" }));
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("新输入");
    expect(apply).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("应用结果"));
    expect(apply).toHaveBeenCalledWith("候选结果文本");
  });
  it("取消后忽略迟到的结果", async () => {
    const response = pending<{ optimized_prompt: string }>();
    vi.mocked(invoke).mockImplementation(async (cmd) => cmd === "get_platforms" ? [] : cmd === "optimize_prompt" ? response.promise : undefined as any);
    render(<Toolbox nodeId="node-1" nodeType="text" defaultPrompt="原文" />);
    await act(async () => {});
    fireEvent.click(screen.getByText("优化"));
    fireEvent.click(screen.getByText("取消请求"));
    expect(invoke).toHaveBeenCalledWith("cancel_llm_request", expect.objectContaining({ requestId: expect.any(String) }));
    await act(async () => response.resolve({ optimized_prompt: "迟到结果" }));
    expect(screen.queryByText("应用结果")).toBeNull();
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("原文");
  });
  it("图片反推使用视觉平台，不触发图片生成", async () => {
    localStorage.setItem("llm-vision", "platform:local");
    const reverse = vi.fn().mockResolvedValue("图片描述"); const generate = vi.fn();
    render(<GenerateContext.Provider value={{ reversePrompt: reverse, generateImage: generate, generatingNodeId: null, reversingNodeId: null }}><Toolbox nodeId="image-1" nodeType="image" defaultPrompt="分析图片" /></GenerateContext.Provider>);
    await screen.findByText("Local · vision");
    fireEvent.click(screen.getByText("反推"));
    await waitFor(() => expect(reverse).toHaveBeenCalledWith("image-1", "分析图片", "custom", "local", expect.any(String)));
    expect(generate).not.toHaveBeenCalled();
    await screen.findByText("应用结果");
  });
  it("已删除的自定义平台不静默回退到另一个服务", async () => {
    localStorage.setItem("llm-chat", "platform:deleted");
    render(<Toolbox nodeId="node-1" nodeType="text" defaultPrompt="原文" />);
    await screen.findByText("Local · test");
    await act(async () => {});
    fireEvent.click(screen.getByText("优化"));
    expect(vi.mocked(invoke).mock.calls.some(([cmd]) => cmd === "optimize_prompt")).toBe(false);
  });
});
