import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { invoke, isTauri } from "@tauri-apps/api/core";
import ScriptEditor from "../../src/pages/detail/script/ScriptEditor";
import { createExampleScript, type ScriptDocument } from "../../src/pages/detail/script/types";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(), isTauri: vi.fn(() => true) }));
vi.mock("../../src/lib/assets", () => ({ getAssetSrc: vi.fn() }));
vi.mock("../../src/pages/detail/script/ScriptControls", async (original) => {
  const actual = await original<Record<string, unknown>>();
  return { ...actual, Choice: ({ label, value, options, onChange, disabled }: any) => (
    <select aria-label={label} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
      {options.map((option: any) => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
  ) };
});

const generated = { shots: [{ title: "AI 开场", description: "窗边的咖啡杯", duration: 5, camera: "特写", dialogue: "你好，清晨", sound: "钢琴", prompt: "自然晨光，咖啡特写", id: "untrusted", assetNodeId: "fake" }] };
const platform = { id: "local", name: "本地模型", platformType: "text", location: "local", baseEndpoint: "http://localhost/v1", endpoints: [{ key: "chat", model: "test-model" }] };
let preference: string | null;
let request: () => Promise<unknown>;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(isTauri).mockReturnValue(true);
  localStorage.clear();
  preference = "platform:local";
  request = async () => generated;
  vi.mocked(invoke).mockImplementation(async (command) => {
    if (command === "get_platforms") return [platform] as any;
    if (command === "get_config_key") return preference as any;
    if (command === "split_script_shots") return request() as any;
    return undefined as any;
  });
});
afterEach(cleanup);

function pending() {
  let resolve!: (value: unknown) => void;
  const promise = new Promise((r) => { resolve = r; });
  return { resolve, promise };
}

async function setup(initial = createExampleScript()) {
  const save = vi.fn(async (_doc: ScriptDocument) => {});
  const view = render(<ScriptEditor initial={initial} onSave={save} onClose={() => {}} />);
  await waitFor(() => expect((screen.getByRole("button", { name: "AI 拆分镜头" }) as HTMLButtonElement).disabled).toBe(false));
  return { save, ...view };
}

async function generate() {
  fireEvent.click(screen.getByRole("button", { name: "AI 拆分镜头" }));
  return screen.findByRole("region", { name: "AI 分镜草稿预览" });
}

describe("AI 分镜生成与采用", () => {
  it("传递原稿、设置和平台，先预览，确认替换后才更新分镜", async () => {
    const initial = createExampleScript();
    initial.shots[0].assetNodeId = "image-1";
    const { save } = await setup(initial);
    await generate();
    expect(invoke).toHaveBeenCalledWith("split_script_shots", expect.objectContaining({
      provider: "custom", platformId: "local", requestId: expect.any(String),
      input: { title: initial.title, source: initial.source, brief: initial.brief, targetDuration: 30, aspectRatio: "16:9" },
    }));
    expect(screen.getAllByRole("article", { hidden: true })).toHaveLength(4);
    expect(screen.queryByRole("article")).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: "当前分镜 · 4" }));
    expect(screen.getAllByRole("article")).toHaveLength(4);
    expect(screen.queryByRole("region", { name: "AI 分镜草稿预览" })).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: "AI 草稿 ●" }));
    expect(screen.getByRole("region", { name: "AI 分镜草稿预览" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "替换现有分镜" }));
    expect(screen.getByRole("alert").textContent).toContain("素材关联");
    expect(screen.getAllByRole("article", { hidden: true })).toHaveLength(4);
    fireEvent.click(screen.getByRole("button", { name: "确认替换现有分镜" }));
    expect(screen.getAllByRole("article", { hidden: true })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "保存到画布" }));
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    const saved = save.mock.calls[0][0];
    expect(saved.source).toBe(initial.source);
    expect(saved.shots[0].title).toBe("AI 开场");
    expect(saved.shots[0].id).not.toBe("untrusted");
    expect(saved.shots[0].assetNodeId).toBeUndefined();
    fireEvent.click(screen.getByRole("button", { name: "撤销编辑" }));
    expect(screen.getAllByRole("article", { hidden: true })).toHaveLength(4);
    fireEvent.click(screen.getByRole("button", { name: "保存到画布" }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    expect(save.mock.calls[1][0].shots).toEqual(initial.shots);
  });

  it("追加保留现有镜头、顺序和素材关联，支持撤销重做", async () => {
    const initial = createExampleScript();
    initial.shots[1].assetNodeId = "video-1";
    const { save } = await setup(initial);
    await generate();
    fireEvent.click(screen.getByRole("button", { name: "追加到末尾" }));
    expect(screen.getAllByRole("article", { hidden: true })).toHaveLength(5);
    fireEvent.click(screen.getByRole("button", { name: "撤销编辑" }));
    expect(screen.getAllByRole("article", { hidden: true })).toHaveLength(4);
    fireEvent.click(screen.getByRole("button", { name: "重做编辑" }));
    fireEvent.click(screen.getByRole("button", { name: "保存到画布" }));
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    expect(save.mock.calls[0][0].shots.slice(0, 4)).toEqual(initial.shots);
  });

  it("生成期间修改原稿后，旧草稿不可采用，重新生成才恢复", async () => {
    const response = pending();
    request = () => response.promise;
    await setup();
    fireEvent.click(screen.getByRole("button", { name: "AI 拆分镜头" }));
    fireEvent.change(screen.getByLabelText("原稿内容"), { target: { value: "新的故事" } });
    await act(async () => response.resolve(generated));
    expect(screen.getByRole("alert").textContent).toContain("旧内容");
    expect((screen.getByRole("button", { name: "追加到末尾" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getAllByRole("article", { hidden: true })).toHaveLength(4);
    request = async () => generated;
    fireEvent.click(screen.getByRole("button", { name: "重新生成分镜" }));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect((screen.getByRole("button", { name: "追加到末尾" }) as HTMLButtonElement).disabled).toBe(false);
    expect(invoke).toHaveBeenLastCalledWith("split_script_shots", expect.objectContaining({ input: expect.objectContaining({ source: "新的故事" }) }));
  });

  it("取消后可重新发起请求，旧请求迟到不会覆盖新结果或清除忙碌状态", async () => {
    const old = pending();
    const current = pending();
    request = () => old.promise;
    await setup();
    fireEvent.click(screen.getByRole("button", { name: "AI 拆分镜头" }));
    fireEvent.click(screen.getByRole("button", { name: "取消生成" }));
    expect(invoke).toHaveBeenCalledWith("cancel_llm_request", expect.objectContaining({ requestId: expect.any(String) }));
    request = () => current.promise;
    fireEvent.click(screen.getByRole("button", { name: "AI 拆分镜头" }));
    await act(async () => old.resolve(generated));
    expect(screen.queryByRole("region", { name: "AI 分镜草稿预览" })).toBeNull();
    expect(screen.getByRole("button", { name: "取消生成" })).toBeTruthy();
    await act(async () => current.resolve({ shots: [{ ...generated.shots[0], title: "第二次生成" }] }));
    expect(screen.getByText("01 · 第二次生成")).toBeTruthy();
    expect(screen.queryByText("01 · AI 开场")).toBeNull();
  });

  it("请求失败或无效返回时保留现有分镜，允许重试", async () => {
    request = async () => { throw new Error("模型输出被截断，请增大输出长度后重试"); };
    await setup();
    fireEvent.click(screen.getByRole("button", { name: "AI 拆分镜头" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("被截断"));
    expect(screen.getAllByRole("article", { hidden: true })).toHaveLength(4);
    request = async () => ({ shots: [] });
    fireEvent.click(screen.getByRole("button", { name: "AI 拆分镜头" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("未返回有效分镜"));
    request = async () => generated;
    await generate();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("离开页面时取消进行中的请求", async () => {
    request = () => new Promise(() => {});
    const { unmount } = await setup();
    fireEvent.click(screen.getByRole("button", { name: "AI 拆分镜头" }));
    unmount();
    expect(invoke).toHaveBeenCalledWith("cancel_llm_request", expect.objectContaining({ requestId: expect.any(String) }));
  });

  it("已删除平台不会静默回退到其他服务，重新选择保存后才能生成", async () => {
    preference = "platform:deleted";
    render(<ScriptEditor initial={createExampleScript()} onSave={async () => {}} onClose={() => {}} />);
    await screen.findByText("所选平台不可用，请重新选择。");
    expect((screen.getByRole("button", { name: "AI 拆分镜头" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("分镜生成平台"), { target: { value: "deepseek" } });
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("set_config_key", { key: "llm-script-split", value: "deepseek" }));
    await waitFor(() => expect((screen.getByRole("button", { name: "AI 拆分镜头" }) as HTMLButtonElement).disabled).toBe(false));
    await generate();
    expect(invoke).toHaveBeenCalledWith("split_script_shots", expect.objectContaining({ provider: "deepseek" }));
  });

  it("浏览器预览提示使用桌面应用，不调用不存在的后端", () => {
    vi.mocked(isTauri).mockReturnValue(false);
    render(<ScriptEditor initial={createExampleScript()} onSave={async () => {}} onClose={() => {}} />);
    expect(screen.getByRole("button", { name: "请在桌面应用中使用" })).toBeTruthy();
    expect(invoke).not.toHaveBeenCalled();
  });
});
