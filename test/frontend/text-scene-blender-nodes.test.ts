import { describe, expect, it } from "vitest";
import { Entity, type Object3D } from "@orillusion/core";
import { findBlenderNode } from "../../src/pages/text-scene/blenderNodes";

describe("Blender GLTF 节点查找（真实 Orillusion Entity）", () => {
  it("穿过导入层和物体分组查找人物及地面零件", () => {
    const root = new Entity();
    const wrapper = new Entity();
    root.entityChildren.push(wrapper);
    for (const name of ["人物", "广场地面"]) {
      const group = new Entity(); group.name = name;
      const part = new Entity(); part.name = `${name}_Part_000`;
      wrapper.entityChildren.push(group); group.entityChildren.push(part);
      expect(root.getObjectByName(part.name)).toBeNull();
      expect(findBlenderNode(root as Object3D, group.name)).toBe(group);
      expect(findBlenderNode(root as Object3D, part.name)).toBe(part);
      expect(findBlenderNode(group as Object3D, part.name)).toBe(part);
    }
    expect(findBlenderNode(root as Object3D, "不存在的零件")).toBeFalsy();
  });
});
