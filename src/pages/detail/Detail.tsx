import { useState, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ReactFlow,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  type Edge,
  type ReactFlowInstance,
  type NodeTypes,
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
import { useGenerate3D } from "./hooks/useGenerate3D";
import { useMenuActions } from "./hooks/useMenuActions";
import ContextMenus from "./ContextMenus";

import TextNode from "./nodes/TextNode";
import ImageNode from "./nodes/ImageNode";
import VideoNode from "./nodes/VideoNode";
import DirectorNode from "./nodes/DirectorNode";
import type { FlowNode } from "./nodes/types";
import SubtitleOverlay from "./SubtitleOverlay";
import DirectorOverlay from "./DirectorOverlay";
import EdgeDeleteButton from "./EdgeDeleteButton";
import TitleEditor from "./TitleEditor";
import EditOverlay from "./EditOverlay";
import styles from "./Detail.module.css";
import "./nodes/nodes.module.css";

const nodeTypes: NodeTypes = {
  text: TextNode,
  image: ImageNode,
  "image-upload": ImageNode,
  video: VideoNode,
  "video-upload": VideoNode,
  director: DirectorNode,
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
  const [directorNodeId, setDirectorNodeId] = useState<string | null>(null);
  const [showSubtitles, setShowSubtitles] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const rfInstance = useRef<ReactFlowInstance<FlowNode, Edge> | null>(null);
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

  const { generate3DFromImage } = useGenerate3D(id!, setNodes, setEdges, nodeIdCounterRef, edgeIdCounterRef);

  const { handleMenuAction } = useMenuActions({
    menu, setMenu, nodes,
    addNode, deleteNode, duplicateNode,
    screenToFlow, generate3DFromImage,
    uploadPosRef, fileInputRef,
  });

  useKeyboardShortcuts({
    editingNodeId, edgeToDelete, selectedNode,
    setMenu, setEditingNodeId, setEdgeToDelete,
    deleteNode, removeEdge,
  });

  useCanvasPersistence(id!, nodes, edges, setNodes, setEdges, loadedRef, nodeIdCounterRef, edgeIdCounterRef);

  const handleNodeDoubleClick = useCallback((_e: React.MouseEvent, node: FlowNode) => {
    if (node.type === "director") {
      setDirectorNodeId(node.id);
    } else if (node.type === "text") {
      setEditingNodeId(node.id);
    }
  }, []);

  const commitEdit = useCallback((text: string) => {
    if (editingNodeId) {
      setNodes((prev) => prev.map((n) => n.id === editingNodeId ? { ...n, data: { ...n.data, content: text } } : n));
    }
    setEditingNodeId(null);
  }, [editingNodeId, setNodes]);

  if (!clip) return null;

  const selectedVideoNode =
    selectedNode &&
    (selectedNode.data?.type === "video" || selectedNode.data?.type === "video-upload")
      ? selectedNode
      : null;
  const editNode = editingNodeId ? nodes.find((n) => n.id === editingNodeId) : null;

  return (
    <div className={styles["canvas-container"]} ref={containerRef}>
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
          setSelectedNode(sel.length === 1 ? sel[0] as FlowNode : null);
        }}
        nodeTypes={nodeTypes}
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

      <button className={styles["btn-back"]} onClick={() => navigate("/")}>&larr; 返回</button>

      {selectedVideoNode && (
        <button
          className={`${styles["btn-subtitle-toggle"]}${showSubtitles ? " active" : ""}`}
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

      <SubtitleOverlay
        showSubtitles={showSubtitles}
        selectedVideoNode={selectedVideoNode}
        projectId={id!}
        onClose={() => setShowSubtitles(false)}
      />

      <TitleEditor clip={clip} onUpdate={setClip} />

      {editNode && (
        <EditOverlay node={editNode} onCommit={commitEdit} rfInstance={rfInstance} />
      )}

      <EdgeDeleteButton
        edgeToDelete={edgeToDelete}
        onDelete={removeEdge}
        onDismiss={() => setEdgeToDelete(null)}
      />

      {directorNodeId && (
        <DirectorOverlay
          directorNodeId={directorNodeId}
          nodes={nodes}
          projectId={id!}
          setNodes={setNodes}
          onClose={() => setDirectorNodeId(null)}
        />
      )}

      {menu && (
        <>
          <div
            style={{ position: "fixed", inset: 0, zIndex: 199 }}
            onClick={() => setMenu(null)}
            onContextMenu={(e) => e.preventDefault()}
          />
          <ContextMenus menu={menu} onAction={handleMenuAction} />
        </>
      )}
    </div>
  );
}
