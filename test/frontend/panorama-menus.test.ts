import { describe, it, expect } from "vitest";
import { ADD_NODE_MENU } from "../../src/pages/detail/menus";

describe("ADD_NODE_MENU 全景图入口", () => {
  it("添加节点分组中包含全景图菜单项", () => {
    const group = ADD_NODE_MENU.find((g) => g.group === "添加节点");
    expect(group).toBeDefined();
    const item = group!.items.find((i) => i.label === "全景图");
    expect(item).toBeDefined();
    expect(item!.icon).toBeTruthy();
  });

  it("全景图菜单项与其他节点类型共存", () => {
    const group = ADD_NODE_MENU.find((g) => g.group === "添加节点")!;
    const labels = group.items.map((i) => i.label);
    expect(labels).toContain("文本");
    expect(labels).toContain("图片");
    expect(labels).toContain("视频");
    expect(labels).toContain("导演台");
    expect(labels).toContain("全景图");
  });

  it("菜单标签唯一，不重复", () => {
    const allLabels: string[] = [];
    ADD_NODE_MENU.forEach((g) => g.items.forEach((i) => allLabels.push(i.label)));
    expect(new Set(allLabels).size).toBe(allLabels.length);
  });
});
