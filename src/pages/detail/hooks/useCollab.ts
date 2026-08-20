/**
 * 协作画布同步绑定（P0）：会话激活时建立 Y.Doc ↔ React 画布状态的双向绑定。
 *
 * 方向 1（远端 → 本地）：doc update 事件 → setNodes/setEdges（渲染层无感）
 * 方向 2（本地 → 远端）：nodes/edges 变化 → 与 doc 内容做 JSON diff → 写入 Y.Map
 *   （仅写变化节点，避免每帧全量广播；写入触发方向 1 但内容相同，自然收敛）
 *
 * 初始推送：宿主发起协作后把自己的画布推入空房间；客户端以房间内容为准
 * （本地画布在协作模式中被房间内容覆盖，P0 决策）。
 */
import { useEffect, useRef, useState } from "react";
import * as Y from "yjs";
import type { Edge } from "@xyflow/react";
import type { FlowNode } from "../nodes/types";
import { CollabProvider } from "./collabProvider";
import { subscribeCollabSession, getCollabSession, type CollabSession } from "./collabSession";

/**
 * 剥离函数回调与 DOM 引用后 JSON 往返（DOM 元素 JSON 化会变成 {}，必须显式删除），
 * 再剔除 ReactFlow 运行时瞬态字段。
 */
export function sanitizeNodeForSync(node: FlowNode): Record<string, unknown> {
  const data = { ...(node.data as Record<string, unknown>) };
  for (const k of [
    "videoEl", "onCreateVideoNode", "onCreateImageNode", "onReversePrompt",
    "onUploadComplete", "onFileUpload", "isEditing",
  ]) {
    delete data[k];
  }
  const clean = JSON.parse(JSON.stringify({ ...node, data })) as Record<string, unknown>;
  delete clean.selected;
  delete clean.dragging;
  delete clean.measured;
  delete clean.width;
  delete clean.height;
  return clean;
}

export function sanitizeEdgeForSync(edge: Edge): Record<string, unknown> {
  const clean = JSON.parse(JSON.stringify(edge)) as Record<string, unknown>;
  delete clean.selected;
  return clean;
}

export function useCollabBinding(
  clipId: string,
  nodes: FlowNode[],
  edges: Edge[],
  setNodes: React.Dispatch<React.SetStateAction<FlowNode[]>>,
  setEdges: React.Dispatch<React.SetStateAction<Edge[]>>,
  loadedRef: React.MutableRefObject<boolean>,
) {
  const [session, setSession] = useState<CollabSession | null>(getCollabSession());
  const docRef = useRef<Y.Doc | null>(null);
  const providerRef = useRef<CollabProvider | null>(null);
  const applyingRef = useRef(false);
  const readyRef = useRef(false); // 初始同步完成后方可本地写回

  // 会话订阅
  useEffect(() => subscribeCollabSession(setSession), []);

  // 会话建立/销毁
  useEffect(() => {
    if (!session || !loadedRef.current) return;
    const doc = new Y.Doc();
    docRef.current = doc;
    const url = `ws://${session.host}:${session.port}/ws/${session.code}?token=${session.code}`;

    const provider = new CollabProvider(url, doc, () => {
      readyRef.current = true;
      if (session.role === "host") {
        // 宿主：把本地画布推入房间（空房间场景；有内容则 diff 后无事发生）
        pushLocalState(doc, nodes, edges);
      }
      // 客户端：doc 内容即权威，等待 update 事件覆盖本地（update 处理器会 setNodes）
    });
    providerRef.current = provider;

    const onUpdate = () => {
      applyingRef.current = true;
      const syncedNodes = Array.from(doc.getMap<FlowNode>("nodes").values());
      const syncedEdges = Array.from(doc.getMap<Edge>("edges").values());
      setNodes(syncedNodes);
      setEdges(syncedEdges);
      applyingRef.current = false;
    };
    doc.on("update", onUpdate);

    return () => {
      doc.off("update", onUpdate);
      provider.destroy();
      doc.destroy();
      providerRef.current = null;
      docRef.current = null;
      readyRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, clipId]);

  // 本地 → 远端：diff 后写 Y.Map（仅写变化节点/边）
  useEffect(() => {
    const doc = docRef.current;
    if (!doc || !readyRef.current || applyingRef.current || !loadedRef.current) return;

    const nodeMap = doc.getMap<Record<string, unknown>>("nodes");
    const edgeMap = doc.getMap<Record<string, unknown>>("edges");

    const curNodeIds = new Set<string>();
    for (const n of nodes) {
      curNodeIds.add(n.id);
      const clean = sanitizeNodeForSync(n);
      const prev = nodeMap.get(n.id);
      if (!prev || JSON.stringify(prev) !== JSON.stringify(clean)) {
        nodeMap.set(n.id, clean);
      }
    }
    for (const id of Array.from(nodeMap.keys())) {
      if (!curNodeIds.has(id)) nodeMap.delete(id);
    }

    const curEdgeIds = new Set<string>();
    for (const e of edges) {
      curEdgeIds.add(e.id);
      const clean = sanitizeEdgeForSync(e);
      const prev = edgeMap.get(e.id);
      if (!prev || JSON.stringify(prev) !== JSON.stringify(clean)) {
        edgeMap.set(e.id, clean);
      }
    }
    for (const id of Array.from(edgeMap.keys())) {
      if (!curEdgeIds.has(id)) edgeMap.delete(id);
    }
  }, [nodes, edges, loadedRef]);
}

/** 把本地画布全量推入 doc（宿主初始推送用） */
function pushLocalState(doc: Y.Doc, nodes: FlowNode[], edges: Edge[]) {
  const nodeMap = doc.getMap<Record<string, unknown>>("nodes");
  const edgeMap = doc.getMap<Record<string, unknown>>("edges");
  for (const n of nodes) nodeMap.set(n.id, sanitizeNodeForSync(n));
  for (const e of edges) edgeMap.set(e.id, sanitizeEdgeForSync(e));
}
