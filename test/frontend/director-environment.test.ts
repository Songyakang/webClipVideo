import { describe, it, expect } from "vitest";
import type { Edge } from "@xyflow/react";
import {
  findEnvironmentCandidates,
  resolveEnvironment,
} from "../../src/pages/detail/director/environment";
import type { FlowNode } from "../../src/pages/detail/nodes/types";

function makeNode(id: string, type: string, fileUrl?: string): FlowNode {
  return {
    id,
    type,
    position: { x: 0, y: 0 },
    data: { type, content: "", fileUrl: fileUrl || "" },
  } as FlowNode;
}

function makeEdge(source: string, target: string): Edge {
  return { id: `${source}-${target}`, source, target };
}

describe("findEnvironmentCandidates", () => {
  it("返回连线到导演台且已上传图片的全景图节点", () => {
    const nodes = [
      makeNode("pano-1", "panorama", "asset://p1.jpg"),
      makeNode("pano-2", "panorama", "asset://p2.jpg"),
      makeNode("img-1", "image-upload", "asset://i1.jpg"),
      makeNode("pano-3", "panorama", ""), // 未上传
      makeNode("pano-4", "panorama", "asset://p4.jpg"), // 未连线
    ];
    const edges = [
      makeEdge("pano-1", "dir-1"),
      makeEdge("pano-2", "dir-1"),
      makeEdge("img-1", "dir-1"),
      makeEdge("pano-3", "dir-1"),
    ];

    const result = findEnvironmentCandidates("dir-1", edges, nodes);
    expect(result.map((n) => n.id).sort()).toEqual(["pano-1", "pano-2"]);
  });

  it("无连线时返回空数组", () => {
    const nodes = [makeNode("pano-1", "panorama", "asset://p1.jpg")];
    const edges = [makeEdge("pano-1", "dir-2")]; // 连到别的导演台
    expect(findEnvironmentCandidates("dir-1", edges, nodes)).toEqual([]);
  });

  it("非 panorama 类型的节点被忽略", () => {
    const nodes = [makeNode("img-1", "image-upload", "asset://i1.jpg")];
    const edges = [makeEdge("img-1", "dir-1")];
    expect(findEnvironmentCandidates("dir-1", edges, nodes)).toEqual([]);
  });

  it("未上传图片的全景图节点被忽略", () => {
    const nodes = [makeNode("pano-1", "panorama", "")];
    const edges = [makeEdge("pano-1", "dir-1")];
    expect(findEnvironmentCandidates("dir-1", edges, nodes)).toEqual([]);
  });
});

describe("resolveEnvironment", () => {
  const nodes = [
    makeNode("pano-1", "panorama", "asset://p1.jpg"),
    makeNode("pano-2", "panorama", "asset://p2.jpg"),
  ];
  const edges = [makeEdge("pano-1", "dir-1"), makeEdge("pano-2", "dir-1")];

  it("preferredNodeId 未指定时自动取第一个候选", () => {
    const result = resolveEnvironment("dir-1", undefined, edges, nodes);
    expect(result).toEqual({ nodeId: "pano-1", fileUrl: "asset://p1.jpg" });
  });

  it("preferredNodeId 指定时返回对应候选", () => {
    const result = resolveEnvironment("dir-1", "pano-2", edges, nodes);
    expect(result).toEqual({ nodeId: "pano-2", fileUrl: "asset://p2.jpg" });
  });

  it("preferredNodeId 失效时回退到第一个候选", () => {
    const result = resolveEnvironment("dir-1", "pano-gone", edges, nodes);
    expect(result).toEqual({ nodeId: "pano-1", fileUrl: "asset://p1.jpg" });
  });

  it("preferredNodeId 为空字符串表示显式禁用环境", () => {
    const result = resolveEnvironment("dir-1", "", edges, nodes);
    expect(result).toBeNull();
  });

  it("无候选时返回 null", () => {
    const result = resolveEnvironment("dir-1", undefined, [], nodes);
    expect(result).toBeNull();
  });

  it("候选节点被删除后返回 null", () => {
    const result = resolveEnvironment(
      "dir-1",
      undefined,
      [makeEdge("pano-1", "dir-1"), makeEdge("pano-2", "dir-1")],
      [], // 节点全被删除
    );
    expect(result).toBeNull();
  });
});
