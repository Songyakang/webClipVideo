import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ReactFlow,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge as rfAddEdge,
  type Edge,
  type Connection,
  BackgroundVariant,
  SelectionMode,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { VideoClip } from "../../lib/types";
import { getClipById, updateClip } from "../../lib/store";
import { saveCanvas, loadCanvas } from "../../lib/db";
import { saveAsset, loadAssetUrl, deleteAssetDir } from "../../lib/assets";
import { MAIN_MENU, ADD_NODE_MENU, FLOW_ITEM_MENU } from "./menus";
import ImageToolbox from "./ImageToolbox";
import TextNode from "./nodes/TextNode";
import ImageNode from "./nodes/ImageNode";
import VideoNode from "./nodes/VideoNode";
import type { FlowNode } from "./nodes/types";
import SubtitlePanel from "./subtitle/SubtitlePanel";
import "./Detail.css";
import "./nodes/nodes.css";

const nodeTypes = {
  text: TextNode,
  image: ImageNode,
  "image-upload": ImageNode,
  video: VideoNode,
  "video-upload": VideoNode,
};

let nodeIdCounter = 0;
let edgeIdCounter = 0;

interface MenuState { x: number; y: number; type: "main" | "addNode" | "flowItem"; nodeId?: string; }

export default function Detail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [clip, setClip] = useState<VideoClip | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedNode, setSelectedNode] = useState<FlowNode | null>(null);
  const [edgeToDelete, setEdgeToDelete] = useState<{ id: string; x: number; y: number } | null>(null);
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [showSubtitles, setShowSubtitles] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadPosRef = useRef({ x: 0, y: 0 });

  const rfInstance = useRef<any>(null);
  const loadedRef = useRef(false);

  useEffect(() => {
    if (!id) return;
    getClipById(id).then((found) => {
      if (!found) { navigate("/", { replace: true }); return; }
      setClip(found);
    });
  }, [id, navigate]);

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

  const addNode = useCallback((type: string, x: number, y: number, fileUrl?: string) => {
    const isMedia = type === "image-upload" || type === "video-upload";
    const id = `node-${++nodeIdCounter}`;
    const newNode: FlowNode = {
      id, type: type, position: { x, y },
      data: { type, content: "", fileUrl: fileUrl || "", w: isMedia ? undefined : 700, h: isMedia ? undefined : 400 },
    };
    setNodes((prev) => [...prev, newNode]);
    return id;
  }, [setNodes]);

  const addEdge = useCallback((params: Connection) => {
    setEdges((prev) => rfAddEdge({ ...params, id: `edge-${++edgeIdCounter}` }, prev));
  }, [setEdges]);

  const deleteNode = useCallback((nodeId: string) => {
    setNodes((prev) => prev.filter((n) => n.id !== nodeId));
    setEdges((prev) => prev.filter((e) => e.source !== nodeId && e.target !== nodeId));
    setSelectedNode(null);
    deleteAssetDir(nodeId);
  }, [setNodes, setEdges]);

  const duplicateNode = useCallback((nodeId: string) => {
    setNodes((prev) => {
      const node = prev.find((n) => n.id === nodeId);
      if (!node) return prev;
      const copy = { ...node, id: `node-${++nodeIdCounter}`, position: { x: node.position.x + 30, y: node.position.y + 30 } };
      return [...prev, copy];
    });
  }, [setNodes]);

  const removeEdge = useCallback((edgeId: string) => {
    setEdges((prev) => prev.filter((e) => e.id !== edgeId));
  }, [setEdges]);

  // Keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenu(null);
        setEditingNodeId(null);
        setEdgeToDelete(null);
      }
      const isInput = ["INPUT", "TEXTAREA", "SELECT"].includes((e.target as HTMLElement).tagName);
      if ((e.key === "Delete" || e.key === "Backspace") && !editingNodeId && !isInput) {
        e.preventDefault();
        if (edgeToDelete) { removeEdge(edgeToDelete.id); setEdgeToDelete(null); }
        else if (selectedNode) { deleteNode(selectedNode.id); }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editingNodeId, edgeToDelete, selectedNode, removeEdge, deleteNode]);

  // Load from IndexedDB
  useEffect(() => {
    loadCanvas().then(async (data) => {
      if (loadedRef.current) return;
      const restoredNodes = await Promise.all(data.nodes.map(async (n: any) => {
        const fileUrl: string = n.data?.fileUrl || "";
        if (fileUrl && !fileUrl.startsWith("blob:") && !fileUrl.startsWith("http")) {
          const assetUrl = await loadAssetUrl(fileUrl);
          return { ...n, data: { ...n.data, fileUrl: assetUrl || fileUrl } };
        }
        return n;
      }));
      // Sync counter from loaded IDs
      restoredNodes.forEach((n: any) => {
        const match = n.id.match(/^node-(\d+)$/);
        if (match) nodeIdCounter = Math.max(nodeIdCounter, parseInt(match[1]));
      });
      data.edges.forEach((e: any) => {
        const match = e.id.match(/^edge-(\d+)$/);
        if (match) edgeIdCounter = Math.max(edgeIdCounter, parseInt(match[1]));
      });
      if (restoredNodes.length > 0) {
        setNodes(restoredNodes as any);
        setEdges(data.edges as any);
      }
      loadedRef.current = true;
    });
  }, [setNodes, setEdges]);

  // Save to IndexedDB
  useEffect(() => {
    if (!loadedRef.current) return;
    const timer = setTimeout(() => {
      saveCanvas(nodes as any, edges as any);
    }, 500);
    return () => clearTimeout(timer);
  }, [nodes, edges]);

  // Menu close
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [menu]);

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const type = file.type.startsWith("video/") ? "video-upload" : "image-upload";
    const nodeId = addNode(type, uploadPosRef.current.x, uploadPosRef.current.y, "");
    const path = await saveAsset(nodeId, file);
    const url = path.startsWith("blob:") ? path : await loadAssetUrl(path);
    setNodes((prev) => prev.map((n) => n.id === nodeId ? {
      ...n, data: { ...n.data, fileUrl: url }
    } : n));
    // Auto-resize
    if (type === "video-upload") {
      const v = document.createElement("video");
      v.preload = "metadata";
      v.onloadedmetadata = () => {
        const maxW = 700;
        const w = Math.min(maxW, v.videoWidth);
        const h = v.videoWidth ? (v.videoHeight / v.videoWidth) * w : 400;
        setNodes((prev) => prev.map((n) => n.id === nodeId ? {
          ...n, data: { ...n.data, w, h },
          position: { x: n.position.x - w / 2, y: n.position.y - h / 2 }
        } : n));
      };
      v.src = url;
    } else {
      const img = new Image();
      img.onload = () => {
        const maxW = 700;
        const w = Math.min(maxW, img.naturalWidth);
        const h = (img.naturalHeight / img.naturalWidth) * w;
        setNodes((prev) => prev.map((n) => n.id === nodeId ? {
          ...n, data: { ...n.data, w, h },
          position: { x: n.position.x - w / 2, y: n.position.y - h / 2 }
        } : n));
      };
      img.src = url;
    }
    e.target.value = "";
  }, [addNode, setNodes]);

  const handleMenuAction = useCallback((action: string) => {
    if (!menu) return;
    switch (action) {
      case "添加节点": setMenu({ ...menu, type: "addNode" }); return;
      case "上传":
        uploadPosRef.current = screenToFlow(menu.x, menu.y);
        setMenu(null);
        fileInputRef.current?.click();
        break;
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
            (() => {
              const nodeEl = document.querySelector(
                `.react-flow__node[data-id="${selectedVideoNode.id}"] video`
              ) as HTMLVideoElement | null;
              return nodeEl;
            })()
          }
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

      {/* Context menus */}
      {menu && menu.type === "main" && (
        <div className="context-menu" style={{ left: menu.x, top: menu.y }} onMouseDown={(e) => e.stopPropagation()}>
          {MAIN_MENU.map((item) => (
            <button key={item.label} className={`context-menu-item${item.disabled ? " disabled" : ""}`}
              onClick={() => !item.disabled && handleMenuAction(item.label)} disabled={item.disabled}>
              <span>{item.label}</span>
              {item.shortcut && <span className="menu-shortcut">{item.shortcut}</span>}
            </button>
          ))}
        </div>
      )}

      {menu && menu.type === "addNode" && (
        <div className="context-menu" style={{ left: menu.x, top: menu.y }} onMouseDown={(e) => e.stopPropagation()}>
          {ADD_NODE_MENU.map((group) => (
            <div key={group.group}>
              <div className="menu-group-title">{group.group}</div>
              {group.items.map((item) => (
                <button key={item.label} className="context-menu-item" onClick={() => handleMenuAction(item.label)}>
                  <span className="menu-icon">{item.icon}</span><span>{item.label}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}

      {menu && menu.type === "flowItem" && (
        <div className="context-menu" style={{ left: menu.x, top: menu.y }} onMouseDown={(e) => e.stopPropagation()}>
          {FLOW_ITEM_MENU.map((item) => (
            <button key={item.label} className={`context-menu-item${item.label === "删除" ? " danger" : ""}`}
              onClick={() => handleMenuAction(item.label)}>
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      )}

    </div>
  );
}

function TitleEditor({ clip, onUpdate }: { clip: any; onUpdate: (c: any) => void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(clip.title);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  const save = async () => {
    const t = text.trim() || "未命名";
    const updated = await updateClip(clip.id, { title: t });
    if (updated) onUpdate(updated);
    setText(t);
    setEditing(false);
  };

  return editing ? (
    <input
      ref={inputRef}
      className="title-input"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") { setText(clip.title); setEditing(false); } }}
    />
  ) : (
    <div className="title-display" onClick={() => setEditing(true)} title="点击编辑标题">
      {clip.title}
    </div>
  );
}

function EditOverlay({ node, onCommit, rfInstance }: { node: FlowNode; onCommit: (text: string) => void; rfInstance: any }) {
  const [text, setText] = useState(node.data.content || "");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pos = rfInstance.current?.flowToScreenPosition?.(node.position) ?? { x: 0, y: 0 };
  const zoom = rfInstance.current?.getZoom?.() ?? 0.5;

  useEffect(() => { textareaRef.current?.focus(); }, []);

  return (
    <textarea
      ref={textareaRef}
      className="canvas-textarea"
      style={{
        position: "fixed",
        left: pos.x + 32 * zoom,
        top: pos.y + 36 * zoom,
        width: ((node.data.w || 700) - 64) * zoom,
        height: ((node.data.h || 400) - 72) * zoom,
        fontSize: 14 * zoom,
      }}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => onCommit(text)}
      placeholder="输入文本..."
    />
  );
}
