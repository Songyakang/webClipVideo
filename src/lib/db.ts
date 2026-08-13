/**
 * SQLite-backed persistence layer.
 *
 * All data is stored in `~/Documents/editor-tarui/data.db` via Tauri commands.
 * Each function maps 1:1 to a Rust `#[tauri::command]` in `src-tauri/src/commands/db.rs`.
 */

import { invoke } from "@tauri-apps/api/core";
import type { Node, Edge } from "@xyflow/react";
import type { VideoClip, SubtitleTrack } from "./types";
import type { TimelineRecord } from "../pages/detail/timeline/types";

// ---------------------------------------------------------------------------
// Connection (no-op — SQLite is managed by the Rust backend)
// ---------------------------------------------------------------------------

export function closeDB(): void {
  // SQLite connection is managed by the Tauri app lifecycle
}

// ---------------------------------------------------------------------------
// Canvas (per-clip isolation via clip_id column)
// ---------------------------------------------------------------------------

/** 剥离 DOM 引用（videoEl）和回调函数，得到可序列化的节点 data */
export function cleanNodeData(n: Node): Record<string, unknown> {
  const { videoEl, onFileUpload, onUploadComplete, ...cleanData } = (n.data || {}) as Record<string, unknown>;
  return cleanData;
}

export function nodeToInput(n: Node) {
  return {
    id: n.id,
    type: n.type,
    position: n.position,
    data: cleanNodeData(n),
    width: n.width ?? undefined,
    height: n.height ?? undefined,
    selected: n.selected ?? false,
  };
}

function edgeToInput(e: Edge) {
  return {
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle ?? "",
    targetHandle: e.targetHandle ?? "",
  };
}

export async function saveCanvas(
  clipId: string,
  nodes: Node[],
  edges: Edge[],
): Promise<void> {
  if (!clipId) return;

  const cleanNodes = nodes.map(nodeToInput);
  const cleanEdges = edges.map(edgeToInput);

  await invoke("db_save_canvas", {
    clipId,
    nodes: cleanNodes,
    edges: cleanEdges,
  });
}

// ---------------------------------------------------------------------------
// 增量保存（性能优化）
//
// 只把自上次保存以来发生变化的节点/边发给后端（upsert），
// 并把已删除的 id 告知后端（delete）。
// state 保存每个 id 的上次序列化 hash，由调用方（useCanvasPersistence）
// 持有，项目切换时需重建。
// ---------------------------------------------------------------------------

export interface CanvasDiffState {
  nodeHashes: Map<string, string>;
  edgeHashes: Map<string, string>;
}

export function createCanvasDiffState(): CanvasDiffState {
  return { nodeHashes: new Map(), edgeHashes: new Map() };
}

export async function saveCanvasIncremental(
  clipId: string,
  nodes: Node[],
  edges: Edge[],
  state: CanvasDiffState,
): Promise<void> {
  if (!clipId) return;

  // 计算节点 diff
  const upsertNodes: ReturnType<typeof nodeToInput>[] = [];
  const deleteNodeIds: string[] = [];
  const nextNodeHashes = new Map<string, string>();
  for (const n of nodes) {
    const input = nodeToInput(n);
    const hash = JSON.stringify(input);
    nextNodeHashes.set(n.id, hash);
    if (state.nodeHashes.get(n.id) !== hash) upsertNodes.push(input);
  }
  for (const id of state.nodeHashes.keys()) {
    if (!nextNodeHashes.has(id)) deleteNodeIds.push(id);
  }

  // 计算边 diff
  const upsertEdges: ReturnType<typeof edgeToInput>[] = [];
  const deleteEdgeIds: string[] = [];
  const nextEdgeHashes = new Map<string, string>();
  for (const e of edges) {
    const input = edgeToInput(e);
    const hash = JSON.stringify(input);
    nextEdgeHashes.set(e.id, hash);
    if (state.edgeHashes.get(e.id) !== hash) upsertEdges.push(input);
  }
  for (const id of state.edgeHashes.keys()) {
    if (!nextEdgeHashes.has(id)) deleteEdgeIds.push(id);
  }

  // 只发非空批次（幂等：INSERT OR REPLACE / DELETE，重复执行无害）
  const calls: Promise<unknown>[] = [];
  if (upsertNodes.length > 0) {
    calls.push(invoke("db_upsert_canvas_nodes", { clipId, nodes: upsertNodes }));
  }
  if (deleteNodeIds.length > 0) {
    calls.push(invoke("db_delete_canvas_nodes", { clipId, nodeIds: deleteNodeIds }));
  }
  if (upsertEdges.length > 0) {
    calls.push(invoke("db_upsert_canvas_edges", { clipId, edges: upsertEdges }));
  }
  if (deleteEdgeIds.length > 0) {
    calls.push(invoke("db_delete_canvas_edges", { clipId, edgeIds: deleteEdgeIds }));
  }
  await Promise.all(calls);

  state.nodeHashes = nextNodeHashes;
  state.edgeHashes = nextEdgeHashes;
}

export async function loadCanvas(clipId: string): Promise<{
  nodes: Node[];
  edges: Edge[];
}> {
  if (!clipId) return { nodes: [], edges: [] };

  const result = await invoke<{ nodes: any[]; edges: any[] }>("db_load_canvas", { clipId });

  const nodes: Node[] = result.nodes.map((n: any) => ({
    id: n.id,
    type: n.type || "text",
    position: n.position || { x: 0, y: 0 },
    data: { ...n.data, fileUrl: n.data?.fileUrl || "" },
    width: n.width ?? undefined,
    height: n.height ?? undefined,
    selected: false,
    dragging: false,
  }));

  const edges: Edge[] = result.edges.map((e: any) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle,
    targetHandle: e.targetHandle,
  }));

  return { nodes, edges };
}

export async function clearCanvas(clipId: string): Promise<void> {
  if (!clipId) return;
  await invoke("db_clear_canvas", { clipId });
}

// ---------------------------------------------------------------------------
// VideoClip (Index page)
// ---------------------------------------------------------------------------

export async function getAllClips(): Promise<VideoClip[]> {
  return invoke<VideoClip[]>("db_get_all_clips");
}

export async function getClipById(id: string): Promise<VideoClip | undefined> {
  const result = await invoke<VideoClip | null>("db_get_clip_by_id", { id });
  return result ?? undefined;
}

export async function addClip(
  data: Omit<VideoClip, "id" | "createdAt">,
): Promise<VideoClip> {
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
  const clip = await invoke<VideoClip>("db_add_clip", {
    data: {
      id,
      title: data.title,
      description: data.description,
      url: data.url,
      thumbnail: data.thumbnail,
      duration: data.duration,
      tags: data.tags ?? [],
    },
  });
  return clip;
}

export async function updateClip(
  id: string,
  data: Partial<Omit<VideoClip, "id" | "createdAt">>,
): Promise<VideoClip | undefined> {
  const result = await invoke<VideoClip | null>("db_update_clip", { id, data });
  return result ?? undefined;
}

export async function deleteClip(id: string): Promise<boolean> {
  return invoke<boolean>("db_delete_clip", { id });
}

export async function searchClips(query: string): Promise<VideoClip[]> {
  return invoke<VideoClip[]>("db_search_clips", { query });
}

// ---------------------------------------------------------------------------
// Subtitles
// ---------------------------------------------------------------------------

export async function saveSubtitleTrack(track: SubtitleTrack): Promise<void> {
  await invoke("db_save_subtitle", {
    track: {
      id: track.id,
      items: track.items ?? [],
      language: track.language ?? "",
      status: (track as any).status ?? "",
      clipId: (track as any).clipId ?? "",
    },
  });
}

export async function loadSubtitleTrack(nodeId: string): Promise<SubtitleTrack | null> {
  const result = await invoke<any | null>("db_load_subtitle", { nodeId });
  if (!result) return null;
  return {
    id: result.id,
    items: result.items ?? [],
    language: result.language ?? "",
    status: result.status ?? "",
  } as SubtitleTrack;
}

// ---------------------------------------------------------------------------
// Timeline persistence
// ---------------------------------------------------------------------------

export async function dbSaveTimeline(record: TimelineRecord): Promise<void> {
  await invoke("db_save_timeline", {
    record: {
      projectId: record.projectId,
      data: record.data,
      updatedAt: record.updatedAt,
    },
  });
}

export async function dbLoadTimeline(projectId: string): Promise<TimelineRecord | null> {
  const result = await invoke<any | null>("db_load_timeline", { projectId });
  if (!result) return null;
  return {
    projectId: result.projectId,
    data: result.data,
    updatedAt: result.updatedAt,
  };
}

export async function dbDeleteTimeline(projectId: string): Promise<void> {
  await invoke("db_delete_timeline", { projectId });
}
