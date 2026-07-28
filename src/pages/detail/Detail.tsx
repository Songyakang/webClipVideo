import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ReactFlow,
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
import dagre from "dagre";
import { useClipLoader } from "./hooks/useClipLoader";
import { useCanvasPersistence } from "./hooks/useCanvasPersistence";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { useContextMenu } from "./hooks/useContextMenu";
import { useNodeOperations } from "./hooks/useNodeOperations";
import { useFileUpload } from "./hooks/useFileUpload";
import { useMediaResizer } from "./hooks/useMediaResizer";
import { useGenerate3D } from "./hooks/useGenerate3D";
import { useGenerateImage } from "./hooks/useGenerateImage";
import { GenerateContext } from "./hooks/GenerateContext";
import { useMenuActions } from "./hooks/useMenuActions";
import { useUndoHistory } from "./hooks/useUndoHistory";
import ContextMenus from "./ContextMenus";
import CustomControls from "./CustomControls";
import TextNode from "./nodes/TextNode";
import ImageNode from "./nodes/ImageNode";
import VideoNode from "./nodes/VideoNode";
import DirectorNode from "./nodes/DirectorNode";
import type { FlowNode } from "./nodes/types";
import SubtitleOverlay from "./SubtitleOverlay";
import DirectorOverlay from "./DirectorOverlay";
import EdgeDeleteButton from "./EdgeDeleteButton";
import TitleEditor from "./TitleEditor";
import AssetLibrary from "./AssetLibrary";
import CanvasPreview from "./CanvasPreview";
import { getAssetSrc } from "../../lib/assets";


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
  const [selectedNodes, setSelectedNodes] = useState<FlowNode[]>([]);
  const [edgeToDelete, setEdgeToDelete] = useState<{ id: string; x: number; y: number } | null>(null);

  const [directorNodeId, setDirectorNodeId] = useState<string | null>(null);
  const [showSubtitles, setShowSubtitles] = useState(false);
  const [zoom, setZoom] = useState(0.5);
  const [showAssetLibrary, setShowAssetLibrary] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const rfInstance = useRef<ReactFlowInstance<FlowNode, Edge> | null>(null);
  const loadedRef = useRef(false);
  const nodeIdCounterRef = useRef(0);
  const edgeIdCounterRef = useRef(0);

  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  nodesRef.current = nodes;
  edgesRef.current = edges;

  const { push, undo, redo } = useUndoHistory();

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
    id!, setNodes, setEdges, setSelectedNodes, nodeIdCounterRef, edgeIdCounterRef
  );

  const { resizeMediaNode } = useMediaResizer(setNodes);

  const { fileInputRef, uploadPosRef, handleFileChange } = useFileUpload(id!, addNode, setNodes, resizeMediaNode);

  const { generate3DFromImage, addModelToDirector } = useGenerate3D(id!, setNodes, setEdges, nodeIdCounterRef, edgeIdCounterRef);

  const { generateImage, generatingNodeId, reversePrompt, reversingNodeId } = useGenerateImage(id!, setNodes, setEdges, nodesRef, edgesRef);

  const handleAddImageFromLibrary = useCallback((fileUrl: string, assetPath: string, x: number, y: number) => {
    const nid = `node-${++nodeIdCounterRef.current}`;
    setNodes((prev) => [...prev, {
      id: nid, type: "image-upload",
      position: { x: x - 350, y: y - 200 },
      data: { type: "image-upload", content: "", fileUrl, assetPath },
    }]);
  }, [setNodes]);

  const handleAddVideoFromLibrary = useCallback((fileUrl: string, assetPath: string, x: number, y: number) => {
    const nid = `node-${++nodeIdCounterRef.current}`;
    setNodes((prev) => [...prev, {
      id: nid, type: "video-upload",
      position: { x: x - 350, y: y - 200 },
      data: { type: "video-upload", content: "", fileUrl, assetPath },
    }]);
  }, [setNodes]);

  const organizeCanvas = useCallback(() => {
    const currentNodes = nodesRef.current;
    const currentEdges = edgesRef.current;
    if (currentNodes.length === 0) return;

    push(currentNodes, currentEdges);

    const g = new dagre.graphlib.Graph();
    g.setDefaultEdgeLabel(() => ({}));
    g.setGraph({ rankdir: "LR", nodesep: 80, ranksep: 160 });

    currentNodes.forEach((node) => {
      g.setNode(node.id, {
        width: node.measured?.width ?? node.data.w ?? 200,
        height: node.measured?.height ?? node.data.h ?? 100,
      });
    });

    currentEdges.forEach((edge) => {
      g.setEdge(edge.source, edge.target);
    });

    dagre.layout(g);

    setNodes((prev) =>
      prev.map((node) => {
        const pos = g.node(node.id);
        if (!pos) return node;
        const w = node.measured?.width ?? node.data.w ?? 200;
        const h = node.measured?.height ?? node.data.h ?? 100;
        return { ...node, position: { x: pos.x - w / 2, y: pos.y - h / 2 } };
      })
    );

    setTimeout(() => {
      rfInstance.current?.fitView({ duration: 300, padding: 0.2 });
    }, 50);
  }, [setNodes, push]);

  const handleOutputToCanvas = useCallback((videoAssetPath: string) => {
    if (!directorNodeId) return;
    const dirNode = nodesRef.current.find((n) => n.id === directorNodeId);
    const pos = { x: (dirNode?.position.x ?? 0) + 400, y: dirNode?.position.y ?? 0 };
    const vnId = addNode("video-upload", pos.x, pos.y);
    addEdge({ source: directorNodeId, target: vnId, sourceHandle: null, targetHandle: null });
    setDirectorNodeId(null);
    getAssetSrc(videoAssetPath).then((url) => {
      if (url) {
        setNodes((prev) =>
          prev.map((n) =>
            n.id === vnId ? { ...n, data: { ...n.data, fileUrl: url, assetPath: videoAssetPath } } : n,
          ),
        );
      }
    });
  }, [directorNodeId, addNode, addEdge, setNodes]);

  const handleAddModelFromAsset = useCallback((assetPath: string) => {
    if (!directorNodeId) return;
    addModelToDirector(assetPath, directorNodeId, setNodes);
  }, [directorNodeId, addModelToDirector, setNodes]);

  // Tauri native drag-drop listener
  const unlistenRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    (async () => {
      try {
        const { getCurrentWebview } = await import("@tauri-apps/api/webview");
        unlistenRef.current = await getCurrentWebview().onDragDropEvent(async (event) => {
          const { type } = event.payload;

          if (type === "over") {
            setDragOver(true);
          } else if (type === "leave") {
            setDragOver(false);
          } else if (type === "drop") {
            setDragOver(false);
            const paths = event.payload.paths;
            const pos = screenToFlow(
              event.payload.position.x,
              event.payload.position.y,
            );

            for (let i = 0; i < paths.length; i++) {
              const srcPath = paths[i];
              const ext = srcPath.split(".").pop()?.toLowerCase() || "";
              const isVideo = ["mp4", "mov", "avi", "webm", "mkv", "flv", "wmv"].includes(ext);
              const nodeType = isVideo ? "video-upload" : "image-upload";
              const nid = addNode(nodeType, pos.x + i * 30, pos.y + i * 30, "");

              try {
                const { readFile, writeFile, mkdir } = await import("@tauri-apps/plugin-fs");
                const { documentDir, join } = await import("@tauri-apps/api/path");
                const data = await readFile(srcPath);
                const docDir = await documentDir();
                const destDir = await join(docDir, "editor-tarui", "assets", id!, nid);
                await mkdir(destDir, { recursive: true });
                const filename = `${Date.now()}.${ext}`;
                const destPath = await join(destDir, filename);
                await writeFile(destPath, data);
                const assetPath = `${id!}/${nid}/${filename}`;
                const url = await getAssetSrc(assetPath);
                if (url) {
                  if (isVideo) {
                    setNodes((prev) =>
                      prev.map((n) =>
                        n.id === nid ? { ...n, data: { ...n.data, fileUrl: url, assetPath } } : n,
                      ),
                    );
                  } else {
                    resizeMediaNode(nid, nodeType, url);
                    setNodes((prev) =>
                      prev.map((n) =>
                        n.id === nid ? { ...n, data: { ...n.data, fileUrl: url, assetPath } } : n,
                      ),
                    );
                  }
                }
              } catch (err) {
                console.error("drag-drop save failed:", err);
              }
            }
          }
        });
      } catch { /* Tauri API not available */ }
    })();
    return () => { unlistenRef.current?.(); unlistenRef.current = null; };
  }, []);

  const [dragOver, setDragOver] = useState(false);

  const onUndo = useMemo(() => () => {
    const snap = undo();
    if (snap) { setNodes(snap.nodes); setEdges(snap.edges); setSelectedNodes([]); }
  }, [undo, setNodes, setEdges]);
  const onRedo = useMemo(() => () => {
    const snap = redo();
    if (snap) { setNodes(snap.nodes); setEdges(snap.edges); setSelectedNodes([]); }
  }, [redo, setNodes, setEdges]);

  const createTextNode = useCallback((x: number, y: number) => {
    const w = 680;
    const gap = 60;
    const textNodeId = addNode("text", x, y);

    setNodes((prev) =>
      prev.map((n) =>
        n.id === textNodeId
          ? {
              ...n,
              data: {
                ...n.data,
                onCreateVideoNode: () => {
                  const vid = addNode("video-upload", x + w + gap, y);
                  addEdge({ source: textNodeId, target: vid, sourceHandle: null, targetHandle: null });
                },
                onCreateImageNode: () => {
                  const imgId = addNode("image", x + w + gap, y);
                  addEdge({ source: textNodeId, target: imgId, sourceHandle: null, targetHandle: null });
                },
                onReversePrompt: () => {
                  const imgId = addNode("image-upload", x - w - gap, y);
                  addEdge({ source: imgId, target: textNodeId, sourceHandle: null, targetHandle: null });
                },
              },
            }
          : n,
      ),
    );

    return textNodeId;
  }, [addNode, addEdge, setNodes]);

  const handleReversePromptFromImage = useCallback((imageNodeId: string) => {
    const imgNode = nodesRef.current.find((n) => n.id === imageNodeId);
    if (!imgNode) return;
    const gap = 60;
    const x = imgNode.position.x + (imgNode.data.w || 200) + gap;
    const y = imgNode.position.y;
    const textNodeId = addNode("text", x, y);
    addEdge({ source: imageNodeId, target: textNodeId, sourceHandle: null, targetHandle: null });
    setNodes((prev) =>
      prev.map((n) =>
        n.id === textNodeId
          ? { ...n, data: { ...n.data, mode: "reverse", content: "" } }
          : n,
      ),
    );
  }, [addNode, addEdge, setNodes]);

  const { handleMenuAction } = useMenuActions({
    menu, setMenu, nodes, selectedNodes,
    addNode, deleteNode, duplicateNode,
    screenToFlow, generate3DFromImage,
    uploadPosRef, fileInputRef,
    onUndo, onRedo,
    createTextNode,
    onReversePromptFromImage: handleReversePromptFromImage,
  });

  useKeyboardShortcuts({
    edgeToDelete, selectedNodes,
    setMenu, setEdgeToDelete,
    deleteNode, removeEdge,
  });

  useCanvasPersistence(id!, nodes, edges, setNodes, setEdges, loadedRef, nodeIdCounterRef, edgeIdCounterRef);

  // Push undo snapshot on node/edge count changes (add/delete)
  const prevLenRef = useRef({ nodes: nodes.length, edges: edges.length });
  useEffect(() => {
    if (!loadedRef.current) return;
    const prev = prevLenRef.current;
    if (prev.nodes !== nodes.length || prev.edges !== edges.length) {
      push(nodes, edges);
      prev.nodes = nodes.length;
      prev.edges = edges.length;
    }
    prevLenRef.current = { nodes: nodes.length, edges: edges.length };
  }, [nodes.length, edges.length]);

  // Ctrl+Z / Ctrl+Shift+Z keyboard bindings
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        const snap = undo();
        if (snap) { setNodes(snap.nodes); setEdges(snap.edges); setSelectedNodes([]); }
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && e.shiftKey) {
        e.preventDefault();
        const snap = redo();
        if (snap) { setNodes(snap.nodes); setEdges(snap.edges); setSelectedNodes([]); }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo, setNodes, setEdges]);

  const handleNodeDoubleClick = useCallback((_e: React.MouseEvent, node: FlowNode) => {
    if (node.type === "director") {
      setDirectorNodeId(node.id);
    } else if (node.type === "text") {
      setSelectedNodes([]);
      setNodes((nds) =>
        nds.map((n) =>
          n.id === node.id
            ? { ...n, selected: false, data: { ...n.data, isEditing: true } }
            : { ...n, selected: false },
        ),
      );
    }
  }, []);

  if (!clip) return null;

  const selectedVideoNode =
    selectedNodes.length === 1 &&
    (selectedNodes[0].data?.type === "video" || selectedNodes[0].data?.type === "video-upload")
      ? selectedNodes[0]
      : null;
  return (
    <GenerateContext.Provider value={{ generateImage, generatingNodeId, reversePrompt, reversingNodeId }}>
    <div
      className="fixed inset-0 overflow-hidden cursor-grab active:cursor-grabbing"
      style={{ backgroundColor: "#0d1117" }}
      ref={containerRef}
    >
      <input ref={fileInputRef} type="file" accept="image/*,video/*" style={{ display: "none" }} onChange={handleFileChange} />

      <style>{`
        .btn-back,
        .btn-subtitle-toggle {
          transition: background 0.15s;
        }
        .btn-back {
          background: #161b22;
          border: 1px solid #30363d;
          color: #58a6ff;
        }
        .btn-back:hover {
          background: #21262d;
        }
        .btn-subtitle-toggle {
          background: #161b22;
          border: 1px solid #30363d;
          color: #58a6ff;
        }
        .btn-subtitle-toggle:hover {
          background: #21262d;
        }
        .btn-subtitle-toggle.active {
          background: #1a2a3d;
          border-color: #58a6ff;
        }
        .custom-controls button {
          width: 28px;
          height: 28px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: transparent;
          color: #fff;
          border: none;
          border-radius: 6px;
          font-size: 16px;
          cursor: pointer;
          transition: background 0.15s;
        }
        .custom-controls button:hover {
          background: #333;
        }
        .custom-controls span {
          padding: 0 6px;
          color: #8b949e;
          font-size: 12px;
          font-family: monospace;
          user-select: none;
        }
      `}</style>

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={addEdge}
        onNodeClick={(_e, node) => {
          setSelectedNodes([node as FlowNode]);
          setNodes((nds) =>
            nds.map((n) => ({ ...n, selected: n.id === node.id })),
          );
        }}
        onNodeDoubleClick={handleNodeDoubleClick}
        onPaneClick={() => {
          setSelectedNodes([]);
          setNodes((nds) =>
            nds.map((n) => ({ ...n, selected: false })),
          );
        }}
        onNodeContextMenu={(e, node) => {
          e.preventDefault();
          setSelectedNodes([node as FlowNode]);
          setNodes((nds) =>
            nds.map((n) => ({ ...n, selected: n.id === node.id })),
          );
          setMenu({ x: e.clientX, y: e.clientY, type: "flowItem", nodeId: node.id });
        }}
        onPaneContextMenu={(e) => {
          e.preventDefault();
          setSelectedNodes([]);
          setNodes((nds) =>
            nds.map((n) => ({ ...n, selected: false })),
          );
          setMenu({ x: e.clientX, y: e.clientY, type: "main" });
        }}
        onEdgeClick={(e, edge) => {
          setEdgeToDelete({ id: edge.id, x: e.clientX, y: e.clientY });
        }}
        onInit={(instance) => { rfInstance.current = instance; }}
        onSelectionChange={({ nodes: sel }) => {
          setSelectedNodes(sel as FlowNode[]);
        }}
        nodeTypes={nodeTypes}
        fitView={false}
        defaultViewport={{ x: 0, y: 0, zoom: 0.5 }}
        minZoom={0.2}
        maxZoom={3}
        zoomOnScroll={false}
        onNodeDragStop={() => push(nodesRef.current, edgesRef.current)}
        panOnScroll={true}
        selectionMode={SelectionMode.Partial}
        deleteKeyCode={null}
        multiSelectionKeyCode="Shift"
        onMoveEnd={(_e, vp) => setZoom(vp.zoom)}
        proOptions={{ hideAttribution: true }}
        style={{ width: "100%", height: "100%" }}
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="#21262d" />
      </ReactFlow>

      <CustomControls
        rfInstance={rfInstance}
        zoom={zoom}
        assetLibraryOpen={showAssetLibrary}
        onToggleAssetLibrary={() => setShowAssetLibrary((v) => !v)}
        onPreview={() => setShowPreview(true)}
        onOrganize={organizeCanvas}
        className="custom-controls absolute bottom-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-0.5 bg-black rounded-lg p-0.5 select-none"
      />

      <button className="btn-back fixed top-4 left-4 z-10 cursor-pointer px-4 py-2 rounded-lg select-none text-sm" onClick={() => navigate("/")}>&larr; 返回</button>
      {showAssetLibrary && (
        <>
          <div
            className="fixed inset-0 z-20"
            style={{ background: "rgba(0,0,0,0.5)" }}
            onClick={() => setShowAssetLibrary(false)}
          />
          <div
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-30"
            style={{ boxShadow: "0 8px 48px rgba(0,0,0,0.7)" }}
          >
            <AssetLibrary
              viewportCenter={viewportCenter}
              onAddImageNode={handleAddImageFromLibrary}
              onAddVideoNode={handleAddVideoFromLibrary}
              onClose={() => setShowAssetLibrary(false)}
            />
          </div>
        </>
      )}
      {showPreview && (
        <CanvasPreview
          nodes={nodes}
          edges={edges}
          onClose={() => setShowPreview(false)}
        />
      )}

      {selectedVideoNode && (
        <button
          className={`btn-subtitle-toggle fixed top-4 right-4 z-10 cursor-pointer px-3.5 py-2 rounded-lg text-[13px] flex items-center gap-1.5${showSubtitles ? " active" : ""}`}
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

      <EdgeDeleteButton
        edgeToDelete={edgeToDelete}
        onDelete={removeEdge}
        onDismiss={() => setEdgeToDelete(null)}
      />

      {directorNodeId && (
        <DirectorOverlay
          directorNodeId={directorNodeId}
          nodes={nodes}
          edges={edges}
          projectId={id!}
          setNodes={setNodes}
          onClose={() => setDirectorNodeId(null)}
          onOutputToCanvas={handleOutputToCanvas}
          onAddModelFromAsset={handleAddModelFromAsset}
        />
      )}

      {menu && (
        <>
          <div
            style={{ position: "fixed", inset: 0, zIndex: 199 }}
            onClick={() => setMenu(null)}
            onContextMenu={(e) => e.preventDefault()}
          />
          <ContextMenus menu={menu} onAction={handleMenuAction} selectedCount={selectedNodes.length} />
        </>
      )}

      {dragOver && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none"
          style={{ background: "rgba(88, 166, 255, 0.08)", border: "2px dashed #58a6ff", margin: 12, borderRadius: 16 }}
        >
          <div className="flex flex-col items-center gap-3">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#58a6ff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <span style={{ color: "#58a6ff", fontSize: 16, fontWeight: 600 }}>拖放文件到此处上传</span>
          </div>
        </div>
      )}
    </div>
    </GenerateContext.Provider>
  );
}
