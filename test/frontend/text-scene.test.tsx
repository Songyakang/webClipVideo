import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { invoke, isTauri } from "@tauri-apps/api/core";
import TextSceneWorkspace from "../../src/pages/TextSceneWorkspace";
import { sampleTransform, type TextScene } from "../../src/pages/text-scene/types";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(), isTauri: vi.fn(() => true) }));
// Network/workspace tests do not require a GPU; rendering is verified separately.
vi.mock("../../src/pages/text-scene/ScenePreview", () => ({ default: ({ scene }: { scene: TextScene }) => <div aria-label="场景预览">{scene.title}</div> }));
const transform = { position: [0,0,0], rotation: [0,0,0], scale: [1,1,1] } as const;
const blender = { jobId: "test-job", modelPath: "blender/test-job/scene.glb", blendPath: "blender/test-job/scene.blend", prefix: "ET_test-job_" };
const scene: TextScene = JSON.parse(JSON.stringify({ title: "小球滚动", note: "几何模型", duration: 4, background: "#182030", camera: { position: [6,4,8], target: [0,0,0] }, objects: [{ ...transform, name: "球", parts: [{ ...transform, shape: "sphere", color: "#ff0000" }], keyframes: [{ ...transform, time: 0 }, { ...transform, time: 2, position: [2,1,0], rotation: [0,180,0] }, { ...transform, time: 4, position: [4,0,0], rotation: [0,360,0] }] }] }));
let generate: () => Promise<unknown>;
beforeEach(() => {
  vi.clearAllMocks(); localStorage.clear(); vi.mocked(isTauri).mockReturnValue(true);
  generate = async () => scene;
  vi.mocked(invoke).mockImplementation(async command => {
    if (command === "get_platforms") return [] as any;
    if (command === "get_config_key") return "deepseek" as any;
    if (command === "get_blender_status") return { available: true, version: "5.2.0", message: "Blender 已连接" } as any;
    if (command === "build_blender_scene") return blender as any;
    if (command === "generate_text_scene") return generate() as any;
    return undefined as any;
  });
});
afterEach(cleanup);
async function setup() {
  const view = render(<MemoryRouter><TextSceneWorkspace /></MemoryRouter>);
  fireEvent.change(screen.getByLabelText("场景描述"), { target: { value: "小球滚动" } });
  await waitFor(() => expect((screen.getByRole("button", { name: "生成 3D 场景与动画" }) as HTMLButtonElement).disabled).toBe(false));
  return view;
}
describe("文本生成场景", () => {
  it("将用户文本和已保存的平台传入后端并展示结果，修改描述标注旧结果", async () => {
    await setup();
    fireEvent.click(screen.getByText("生成 3D 场景与动画"));
    await screen.findByLabelText("场景预览");
    expect(invoke).toHaveBeenCalledWith("generate_text_scene", expect.objectContaining({ text: "小球滚动", provider: "deepseek", requestId: expect.any(String) }));
    fireEvent.change(screen.getByLabelText("场景描述"), { target: { value: "小球跳跃" } });
    expect(screen.getByText(/描述已修改/)).toBeTruthy();
    generate = async () => { throw new Error("服务超时"); };
    fireEvent.click(screen.getByText("重新生成场景"));
    expect((await screen.findByRole("alert")).textContent).toContain("上一版场景已保留");
    expect(screen.getByLabelText("场景预览").textContent).toBe("小球滚动");
  });
  it("取消后忽略迟到的结果，并且不覆盖新请求", async () => {
    let resolve!: (scene: TextScene) => void;
    generate = () => new Promise(r => { resolve = r; });
    await setup();
    fireEvent.click(screen.getByText("生成 3D 场景与动画"));
    fireEvent.click(screen.getByText("取消生成"));
    expect(invoke).toHaveBeenCalledWith("cancel_llm_request", {requestId: expect.any(String)});
    generate = async () => ({ ...scene, title: "新场景" });
    await waitFor(() => expect((screen.getByRole("button", { name: "生成 3D 场景与动画" }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByText("生成 3D 场景与动画"));
    await screen.findByLabelText("场景预览");
    expect(screen.getByLabelText("场景预览").textContent).toBe("新场景");
  });
  it("卸载时取消正在执行的生成", async () => {
    generate = () => new Promise(() => {});
    const view = await setup();
    fireEvent.click(screen.getByText("生成 3D 场景与动画"));
    view.unmount();
    expect(invoke).toHaveBeenCalledWith("cancel_llm_request", { requestId: expect.any(String) });
  });
  it("普通浏览器明确提示桌面要求且不读桌面配置", () => {
    vi.mocked(isTauri).mockReturnValue(false);
    render(<MemoryRouter><TextSceneWorkspace /></MemoryRouter>);
    expect(screen.getByText(/请在桌面应用中打开此功能/)).toBeTruthy();
    expect(invoke).not.toHaveBeenCalled();
  });
});
describe("几何动画采样", () => {
  it("按多个关键帧插值位置和完整旋转，拖回开头没有累计误差", () => {
    const object = scene.objects[0];
    expect(sampleTransform(object, 1).position).toEqual([1,0.5,0]);
    expect(sampleTransform(object, 3).position).toEqual([3,0.5,0]);
    expect(sampleTransform(object, 3).rotation).toEqual([0,270,0]);
    expect(sampleTransform(object, 20)).toEqual(object.keyframes[2]);
    expect(sampleTransform(object, 0)).toEqual(object.keyframes[0]);
    expect(sampleTransform({ ...object, keyframes: [] }, 3).position).toEqual([0,0,0]);
  });
});
