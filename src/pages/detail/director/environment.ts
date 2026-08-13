import type { Edge } from "@xyflow/react";
import type { FlowNode } from "../nodes/types";

export interface EnvironmentInfo {
  nodeId: string;
  fileUrl: string;
}

/**
 * 找出所有连线到导演台的全景图候选节点
 * （传入边 target 为导演台，source 节点 type 为 "panorama" 且已上传图片）
 */
export function findEnvironmentCandidates(
  directorNodeId: string,
  edges: Edge[],
  nodes: FlowNode[],
): FlowNode[] {
  const incomingIds = edges
    .filter((e) => e.target === directorNodeId)
    .map((e) => e.source);
  return nodes.filter((n) => {
    if (!incomingIds.includes(n.id)) return false;
    if (n.type !== "panorama") return false;
    const d = n.data as { fileUrl?: string };
    return !!d.fileUrl;
  });
}

/**
 * 解析导演台当前生效的环境：
 * 1. 优先使用 preferredNodeId 指定的候选（用户手动选择）
 * 2. 否则自动取第一个连线候选
 * 3. 都没有 → null
 */
export function resolveEnvironment(
  directorNodeId: string,
  preferredNodeId: string | undefined,
  edges: Edge[],
  nodes: FlowNode[],
): EnvironmentInfo | null {
  // "" 表示用户显式移除了环境（区别于 undefined = 自动选择）
  if (preferredNodeId === "") return null;

  const candidates = findEnvironmentCandidates(directorNodeId, edges, nodes);
  if (candidates.length === 0) return null;

  if (preferredNodeId) {
    const preferred = candidates.find((n) => n.id === preferredNodeId);
    if (preferred) {
      return { nodeId: preferred.id, fileUrl: (preferred.data as { fileUrl: string }).fileUrl };
    }
  }

  const first = candidates[0];
  return { nodeId: first.id, fileUrl: (first.data as { fileUrl: string }).fileUrl };
}
