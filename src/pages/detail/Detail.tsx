import { useState, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ReactFlow,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  type Edge,
  BackgroundVariant,
  SelectionMode,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useClipLoader } from "./hooks/useClipLoader";
import { useCanvasPersistence } from "./hooks/useCanvasPersistence";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { useContextMenu } from "./hooks/useContextMenu";
import { useNodeOperations } from "./hooks/useNodeOperations";
import { useFileUpload } from "./hooks/useFileUpload";
import { useMediaResizer } from "./hooks/useMediaResizer";
import ContextMenus from "./ContextMenus";
import ImageToolbox from "./ImageToolbox";
import TextNode from "./nodes/TextNode";
import ImageNode from "./nodes/ImageNode";
import VideoNode from "./nodes/VideoNode";
import type { FlowNode } from "./nodes/types";
import { invoke } from "@tauri-apps/api/core";
import { resolveAssetPath } from "../../lib/assets";
import type { Generate3DResult, SceneModel } from "../../lib/types";
import SubtitlePanel from "./subtitle/SubtitlePanel";
import TitleEditor from "./TitleEditor";
import EditOverlay from "./EditOverlay";
import "./Detail.css";
import "./nodes/nodes.css";

const nodeTypes = {
  text: TextNode,
  image: ImageNode,
  "image-upload": ImageNode,
  video: VideoNode,
  "video-upload": VideoNode,
};

export default function Detail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { clip, setClip } = useClipLoader(id);
  const { menu, setMenu } = useContextMenu();
  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedNode, setSelectedNode] = useState<FlowNode | null>(null);
  const [edgeToDelete, setEdgeToDelete] = useState<{ id: string; x: number; y: number } | null>(null);
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [showSubtitles, setShowSubtitles] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const rfInstance = useRef<any>(null);
  const loadedRef = useRef(false);
  const nodeIdCounterRef = useRef(0);
  const edgeIdCounterRef = useRef(0);

  const viewportCenter = useCallback(() => {
    const rf = rfInstance.current;
    if (!rf) return { x: 0, y: 0 };
    const vp = rf.getViewport();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: (rect.width / 2 - vp.x) / vp.zoom, y: (rect.height / 2 - vp.y) / vp.zoom };
  }, []);

  const screenToFlow = useCallback((sx: number, sy: number) => {
    const rf = rfInstance.current;
    if (!rf) return viewportCenter();
    const pos = rf.screenToFlowPosition({ x: sx, y: sy });
    if (!pos || isNaN(pos.x) || isNaN(pos.y)) return viewportCenter();
    return pos;
  }, [viewportCenter]);

  const { addNode, deleteNode, duplicateNode, addEdge, removeEdge } = useNodeOperations(
    id!, setNodes, setEdges, setSelectedNode, nodeIdCounterRef, edgeIdCounterRef
  );

  const { resizeMediaNode } = useMediaResizer(setNodes);

  const { fileInputRef, uploadPosRef, handleFileChange } = useFileUpload(id!, addNode, setNodes, resizeMediaNode);

  useKeyboardShortcuts({
    editingNodeId, edgeToDelete, selectedNode,
    setMenu, setEditingNodeId, setEdgeToDelete,
    deleteNode, removeEdge,
  });

  useCanvasPersistence(id!, nodes, edges, setNodes, setEdges, loadedRef, nodeIdCounterRef, edgeIdCounterRef);

  const handleMenuAction = useCallback((action: string) => {
    if (!menu) return;
    switch (action) {
      case "添加节点": setMenu({ ...menu, type: "addNode" }); return;
      case "上传":
        uploadPosRef.current = screenToFlow(menu.x, menu.y);
        setMenu(null);
        fileInputRef.current?.click();
        break;
      case "转为3D模型": {
        if (!menu?.nodeId) break;
        const node = nodes.find((n) => n.id === menu.nodeId);
        if (!node || (node.data?.type !== "image" && node.data?.type !== "image-upload")) break;
        const imagePath = node.data?.assetPath;
        if (!imagePath) break;
        setMenu(null);

        // 生成 model_id 用于乐观更新
        const modelId = `model-${Date.now()}`;

        // 创建导演台节点
        const directorId = `node-${++nodeIdCounterRef.current}`;
        const directorNode: FlowNode = {
          id: directorId,
          type: "director",
          position: { x: node.position.x + 200, y: node.position.y },
          data: {
            type: "director",
            content: "",
            label: "导演台",
            sourceImageNodeIds: [menu.nodeId],
            models: [{
              id: modelId,
              name: node.data?.content || "未命名",
              modelPath: "",
              thumbnailPath: "",
              transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: 1 },
              meta: { vertexCount: 0, faceCount: 0, sourceImageId: menu.nodeId },
              status: "loading",
            }],
            cameraTracks: [{
              id: "cam_1",
              name: "主摄像机",
              enabled: true,
              keyframes: [
                { time: 0, fov: 45, position: [0, 1.5, 5], lookAt: [0, 0, 0] },
                { time: 5, fov: 45, position: [3, 2, 2], lookAt: [0, 0.5, 0] },
              ],
              easing: "ease-in-out",
            }],
            sceneSettings: {
              backgroundColor: "#1a1a2e",
              ambientLight: 0.5,
              gridVisible: true,
            },
          },
        };
        setNodes((prev) => [...prev, directorNode]);

        // 连线
        setEdges((prev) => [
          ...prev,
          { id: `edge-${++edgeIdCounterRef.current}`, source: menu.nodeId!, target: directorId },
        ]);

        // 调用后端 API
        resolveAssetPath(imagePath).then((imageAbsPath) => {
          invoke("generate_3d", { imagePath: imageAbsPath, projectId: id! })
            .then((result) => {
              const generateResult = result as Generate3DResult;
              setNodes((prev) =>
                prev.map((n) => {
                  if (n.id !== directorId) return n;
                  const models: SceneModel[] = (n.data as any).models.map((m: SceneModel) =>
                    m.id === modelId
                      ? {
                          ...m,
                          modelPath: generateResult.modelPath,
                          thumbnailPath: generateResult.thumbnailPath,
                          meta: { ...m.meta, vertexCount: generateResult.vertexCount, faceCount: generateResult.faceCount },
                          status: "ready" as const,
                        }
                      : m
                  );
                  return { ...n, data: { ...n.data, models } };
                })
              );
            })
            .catch((err) => {
              console.error("generate_3d failed:", err);
              setNodes((prev) =>
                prev.map((n) => {
                  if (n.id !== directorId) return n;
                  const models: SceneModel[] = (n.data as any).models.map((m: SceneModel) =>
                    m.id === modelId ? { ...m, status: "error" as const } : m
                  );
                  return { ...n, data: { ...n.data, models } };
                })
              );
            });
        });
        break;
      }
      case "文本": addNode("text", screenToFlow(menu.x, menu.y).x, screenToFlow(menu.x, menu.y).y); setMenu(null); break;
      case "图片": addNode("image", screenToFlow(menu.x, menu.y).x, screenToFlow(menu.x, menu.y).y); setMenu(null); break;
      case "删除": if (menu.nodeId) deleteNode(menu.nodeId); setMenu(null); break;
      case "复制节点": case "创建副本": if (menu.nodeId) duplicateNode(menu.nodeId); setMenu(null); break;
      default: setMenu(null);
    }
  }, [menu, addNode, deleteNode, duplicateNode, screenToFlow]);

  const handleNodeDoubleClick = useCallback((_e: React.MouseEvent, node: FlowNode) => {
    setEditingNodeId(node.id);
  }, []);

  const commitEdit = useCallback((text: string) => {
    if (editingNodeId) {
      setNodes((prev) => prev.map((n) => n.id === editingNodeId ? { ...n, data: { ...n.data, content: text } } : n));
    }
    setEditingNodeId(null);
  }, [editingNodeId, setNodes]);

  if (!clip) return null;

  const showToolbox = selectedNode && selectedNode.data?.type === "image";
  const selectedVideoNode =
    selectedNode &&
    (selectedNode.data?.type === "video" || selectedNode.data?.type === "video-upload")
      ? selectedNode
      : null;
  const editNode = editingNodeId ? nodes.find((n) => n.id === editingNodeId) : null;
  return (
    <div className="canvas-container" ref={containerRef}>
      <input ref={fileInputRef} type="file" accept="image/*,video/*" style={{ display: "none" }} onChange={handleFileChange} />

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={addEdge}
        onNodeDoubleClick={handleNodeDoubleClick}
        onNodeContextMenu={(e, node) => {
          e.preventDefault();
          setMenu({ x: e.clientX, y: e.clientY, type: "flowItem", nodeId: node.id });
        }}
        onPaneContextMenu={(e) => {
          e.preventDefault();
          setMenu({ x: e.clientX, y: e.clientY, type: "main" });
        }}
        onEdgeClick={(e, edge) => {
          setEdgeToDelete({ id: edge.id, x: e.clientX, y: e.clientY });
        }}
        onInit={(instance) => { rfInstance.current = instance; }}
        onSelectionChange={({ nodes: sel }) => {
          setSelectedNode(sel.length === 1 ? sel[0] as unknown as FlowNode : null);
        }}
        nodeTypes={nodeTypes as any}
        fitView={false}
        defaultViewport={{ x: 0, y: 0, zoom: 0.5 }}
        minZoom={0.2}
        maxZoom={3}
        selectionMode={SelectionMode.Partial}
        deleteKeyCode={null}
        multiSelectionKeyCode="Shift"
        proOptions={{ hideAttribution: true }}
        style={{ width: "100%", height: "100%" }}
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="#21262d" />
        <Controls className="flow-controls" />
      </ReactFlow>

      <button className="btn-back" onClick={() => navigate("/")}>&larr; 返回</button>

      {selectedVideoNode && (
        <button
          className={`btn-subtitle-toggle${showSubtitles ? " active" : ""}`}
          onClick={() => setShowSubtitles((v) => !v)}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
            <line x1="8" y1="7" x2="16" y2="7" />
            <line x1="8" y1="11" x2="14" y2="11" />
          </svg>
          字幕
        </button>
      )}

      {showSubtitles && selectedVideoNode && (
        <SubtitlePanel
          nodeId={selectedVideoNode.id}
          videoEl={
            document.querySelector(
              `.react-flow__node[data-id="${selectedVideoNode.id}"] video`
            ) as HTMLVideoElement | null
          }
          videoAssetPath={selectedVideoNode.data?.assetPath}
          projectId={id!}
          onClose={() => setShowSubtitles(false)}
        />
      )}

      <TitleEditor clip={clip} onUpdate={setClip} />

      {/* Toolbox */}
      {showToolbox && (
        <ImageToolbox style={{ position: "fixed", left: "50%", bottom: 16, transform: "translateX(-50%)" }} />
      )}

      {/* Edit textarea */}
      {editNode && (
        <EditOverlay node={editNode} onCommit={commitEdit} rfInstance={rfInstance} />
      )}

      {/* Scissors */}
      {edgeToDelete && (
        <div className="scissors-btn" style={{ left: edgeToDelete.x - 20, top: edgeToDelete.y - 20 }}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() => { removeEdge(edgeToDelete.id); setEdgeToDelete(null); }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="6" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><line x1="20" y1="4" x2="8.12" y2="15.88" /><line x1="14.47" y1="14.48" x2="20" y2="20" /><line x1="8.12" y1="8.12" x2="12" y2="12" />
          </svg>
        </div>
      )}

      {menu && <ContextMenus menu={menu} onAction={handleMenuAction} />}

    </div>
  );
}
