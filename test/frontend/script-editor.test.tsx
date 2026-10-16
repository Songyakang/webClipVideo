import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import ScriptEditor from "../../src/pages/detail/script/ScriptEditor";
import { createExampleScript, createScript, type ScriptDocument } from "../../src/pages/detail/script/types";

vi.mock("../../src/lib/assets", () => ({ getAssetSrc: vi.fn(async () => "asset://example") }));
afterEach(cleanup);

function setup(initial = createExampleScript(), onSave = vi.fn(async (_script: ScriptDocument) => {})) {
  const onClose = vi.fn();
  render(<ScriptEditor initial={initial} onSave={onSave} onClose={onClose} demo />);
  return { onSave, onClose };
}

describe("脚本编辑流程", () => {
  it("复制、排序时保留镜头与素材的关联，生成新的稳定 ID", async () => {
    const initial = createExampleScript();
    initial.shots[0].assetNodeId = "image-1";
    const { onSave } = setup(initial);
    fireEvent.keyDown(screen.getByRole("button", { name: "镜头 1 更多操作" }), { key: "ArrowDown" });
    fireEvent.click(await screen.findByRole("menuitem", { name: "复制镜头 1" }));
    fireEvent.click(screen.getByRole("button", { name: "上移镜头 2" }));
    fireEvent.click(screen.getByRole("button", { name: "保存为新项目" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    const saved = onSave.mock.calls[0][0];
    expect(saved.shots).toHaveLength(5);
    expect(saved.shots[0].id).not.toBe(initial.shots[0].id);
    expect(saved.shots[0].assetNodeId).toBe("image-1");
    expect(saved.shots[1].id).toBe(initial.shots[0].id);
    expect(initial.shots).toHaveLength(4);
  });

  it("删除后可撤销和重做，并恢复镜头的全部内容", async () => {
    const initial = createExampleScript();
    const { onSave } = setup(initial);
    fireEvent.keyDown(screen.getByRole("button", { name: "镜头 1 更多操作" }), { key: "ArrowDown" });
    fireEvent.click(await screen.findByRole("menuitem", { name: "删除镜头 1" }));
    expect(screen.getAllByRole("article")).toHaveLength(3);
    fireEvent.click(screen.getByRole("button", { name: "撤销编辑" }));
    expect(screen.getAllByRole("article")).toHaveLength(4);
    fireEvent.click(screen.getByRole("button", { name: "重做编辑" }));
    expect(screen.getAllByRole("article")).toHaveLength(3);
    fireEvent.click(screen.getByRole("button", { name: "撤销编辑" }));
    fireEvent.click(screen.getByRole("button", { name: "保存为新项目" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    expect(onSave.mock.calls[0][0].shots).toEqual(initial.shots);
  });

  it("修改时长后更新总时长，并提示超出目标", () => {
    setup();
    fireEvent.change(screen.getByLabelText("时长（秒）"), { target: { value: "10" } });
    expect(screen.getByText("34 秒")).toBeTruthy();
    expect(screen.getByText("超出 4 秒")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("目标时长（秒）"), { target: { value: "40" } });
    expect(screen.queryByText("超出 4 秒")).toBeNull();
  });

  it("保存失败保留草稿，重试成功后清除未保存状态", async () => {
    const onSave = vi.fn(async (_script: ScriptDocument) => {}).mockRejectedValueOnce(new Error("数据库忙"));
    setup(createExampleScript(), onSave);
    fireEvent.change(screen.getByRole("textbox", { name: "脚本标题" }), { target: { value: "新故事" } });
    fireEvent.click(screen.getByRole("button", { name: "保存为新项目" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("保存失败"));
    expect((screen.getByRole("textbox", { name: "脚本标题" }) as HTMLInputElement).value).toBe("新故事");
    fireEvent.click(screen.getByRole("button", { name: "保存为新项目" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(screen.queryByText("有未保存的修改")).toBeNull();
    expect(onSave.mock.calls[1][0].title).toBe("新故事");
  });

  it("离开前提醒未保存修改，可继续编辑或明确放弃", () => {
    const { onClose } = setup();
    fireEvent.change(screen.getByLabelText("原稿内容"), { target: { value: "修改后的原稿" } });
    fireEvent.click(screen.getByRole("button", { name: "返回体验功能" }));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "继续编辑" }));
    expect(screen.queryByRole("alert")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "返回体验功能" }));
    fireEvent.click(screen.getByRole("button", { name: "放弃修改并返回" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("空脚本可创建第一个镜头，空标题不能保存", () => {
    const { onSave } = setup(createScript());
    fireEvent.click(screen.getByRole("button", { name: "＋ 添加镜头" }));
    expect(screen.getAllByRole("article")).toHaveLength(1);
    expect(within(screen.getByRole("article")).getByLabelText("画面描述")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("脚本标题"), { target: { value: " " } });
    fireEvent.click(screen.getByRole("button", { name: "保存为新项目" }));
    expect(screen.getByRole("alert").textContent).toContain("标题");
    expect(onSave).not.toHaveBeenCalled();
  });
});
