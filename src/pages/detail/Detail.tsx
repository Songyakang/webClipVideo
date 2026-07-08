import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import type { VideoClip } from "../../lib/types";
import { getClipById, updateClip } from "../../lib/store";
import { useCanvas } from "./useCanvas";
import { useNodes } from "./useNodes";
import { MAIN_MENU, ADD_NODE_MENU, FLOW_ITEM_MENU } from "./menus";
import type { ContextMenuState } from "./types";
import {
  render, screenToWorld, worldToScreen, hitTest,
} from "./renderer";
import ImageToolbox from "./ImageToolbox";
import "./Detail.css";

export default function Detail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [clip, setClip] = useState<VideoClip | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    title: "", description: "", url: "", duration: "", tags: "",
  });
  const [menu, setMenu] = useState<ContextMenuState | null>(null);

  const {
    containerRef, offset, scale, setOffset, setScale,
    handleWheel, focusNode, resetView,
  } = useCanvas();

  const {
    nodes, edges, addNode, deleteNode, duplicateNode,
    updateNode, moveNode, cancelEditing, addEdge, removeEdge,
  } = useNodes();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef(0);

  const [connectingFrom, setConnectingFrom] = useState<string | null>(null);
  const cursorWorld = useRef({ x: 0, y: 0 });
  const [hoveredPort, setHoveredPort] = useState<string | null>(null);
  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null);
  const [edgeToDelete, setEdgeToDelete] = useState<{ id: string; x: number; y: number } | null>(null);
  const [selectedImageNodeId, setSelectedImageNodeId] = useState<string | null>(null);
  const dashOffsetRef = useRef(0);
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [dragNodeId, setDragNodeId] = useState<string | null>(null);
  const [dragCanvas, setDragCanvas] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const dragOrigin = useRef({ x: 0, y: 0, ox: 0, oy: 0 });
  const cssScale = scale / 2;

  useEffect(() => {
    if (!id) return;
    const found = getClipById(id);
    if (!found) { navigate("/", { replace: true }); return; }
    setClip(found);
    setForm({
      title: found.title, description: found.description,
      url: found.url, duration: String(found.duration),
      tags: found.tags.join(", "),
    });
  }, [id, navigate]);

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenu(null);
        cancelEditing();
        setEditingNodeId(null);
        setConnectingFrom(null);
      }
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [menu, cancelEditing]);

  // Render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const draw = () => {
      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = rect.width + "px";
      canvas.style.height = rect.height + "px";
      const ctx = canvas.getContext("2d")!;
      dashOffsetRef.current = (dashOffsetRef.current + 1) % 36;
      render(
        ctx, rect.width, rect.height, dpr,
        offset.x, offset.y, scale,
        nodes, edges,
        connectingFrom, cursorWorld.current.x, cursorWorld.current.y,
        hoveredPort, hoveredEdgeId, dashOffsetRef.current,
      );
      animRef.current = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(animRef.current);
  }, [offset, scale, nodes, edges, connectingFrom, hoveredPort, hoveredEdgeId, containerRef]);

  const handleScreenToWorld = useCallback((sx: number, sy: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return screenToWorld(sx, sy, offset.x, offset.y, scale);
  }, [offset, scale, containerRef]);

  const handleWorldToScreen = useCallback((wx: number, wy: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return worldToScreen(wx, wy, offset.x, offset.y, scale);
  }, [offset, scale, containerRef]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const pos = handleScreenToWorld(e.clientX, e.clientY);
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) {
      const hit = hitTest(e.clientX, e.clientY, offset.x, offset.y, scale, nodes, edges, rect);
      if (hit.type === "node" && hit.nodeId) {
        setMenu({ x: e.clientX, y: e.clientY, canvasX: pos.x, canvasY: pos.y, type: "flowItem", nodeId: hit.nodeId });
        return;
      }
    }
    setMenu({ x: e.clientX, y: e.clientY, canvasX: pos.x, canvasY: pos.y, type: "main" });
  }, [handleScreenToWorld, offset, scale, nodes, edges, containerRef]);

  const handleMenuAction = useCallback((action: string) => {
    const nodeId = menu?.nodeId;
    const cx = menu?.canvasX ?? 0;
    const cy = menu?.canvasY ?? 0;

    switch (action) {
      case "添加节点":
        setMenu((prev) => prev ? { ...prev, type: "addNode" } : null);
        return;
      case "文本":
        addNode("text", cx, cy);
        setMenu(null);
        break;
      case "图片":
        addNode("image", cx, cy);
        setMenu(null);
        break;
      case "删除":
        if (nodeId) deleteNode(nodeId);
        setMenu(null);
        break;
      case "复制节点":
      case "创建副本":
        if (nodeId) duplicateNode(nodeId);
        setMenu(null);
        break;
      default:
        setMenu(null);
    }
  }, [menu, addNode, deleteNode, duplicateNode]);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const hit = hitTest(e.clientX, e.clientY, offset.x, offset.y, scale, nodes, edges, rect);

    if (hit.type === "edge" && hit.edgeId) {
      setEdgeToDelete({ id: hit.edgeId, x: e.clientX, y: e.clientY });
      return;
    }

    // Dismiss scissors on other clicks
    setEdgeToDelete(null);

    if (hit.type === "port-in" || hit.type === "port-out") {
      setConnectingFrom(hit.nodeId!);
      return;
    }

    if (hit.type === "node") {
      setDragNodeId(hit.nodeId!);
      const node = nodes.find((n) => n.id === hit.nodeId);
      dragOrigin.current = { x: node?.x ?? 0, y: node?.y ?? 0, ox: e.clientX, oy: e.clientY };
      // Select image nodes, deselect for others
      if (node?.type === "image") {
        setSelectedImageNodeId(hit.nodeId!);
      } else {
        setSelectedImageNodeId(null);
      }
      return;
    }

    // Click on empty canvas: deselect
    setSelectedImageNodeId(null);

    setDragCanvas(true);
    dragStart.current = { x: e.clientX, y: e.clientY };
    dragOrigin.current = { x: offset.x, y: offset.y, ox: 0, oy: 0 };
  }, [offset, scale, nodes, edges, removeEdge]);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    const world = handleScreenToWorld(e.clientX, e.clientY);
    cursorWorld.current = world;

    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    // Hover detection
    const hit = hitTest(e.clientX, e.clientY, offset.x, offset.y, scale, nodes, edges, rect);
    if (hit.type === "edge") {
      setHoveredEdgeId(hit.edgeId ?? null);
      setHoveredPort(null);
      if (containerRef.current) containerRef.current.style.cursor = "pointer";
    } else if (hit.type === "port-in" || hit.type === "port-out") {
      setHoveredEdgeId(null);
      setHoveredPort(`${hit.nodeId}-${hit.type === "port-in" ? "in" : "out"}`);
      if (containerRef.current) containerRef.current.style.cursor = "pointer";
    } else {
      setHoveredEdgeId(null);
      setHoveredPort(null);
      if (containerRef.current) {
        containerRef.current.style.cursor = dragNodeId || dragCanvas ? "grabbing" : "grab";
      }
    }

    if (dragNodeId) {
      const s = cssScale;
      const dx = (e.clientX - dragOrigin.current.ox) / s;
      const dy = (e.clientY - dragOrigin.current.oy) / s;
      moveNode(dragNodeId, dragOrigin.current.x + dx, dragOrigin.current.y + dy);
      return;
    }

    if (dragCanvas) {
      setOffset({
        x: dragOrigin.current.x + e.clientX - dragStart.current.x,
        y: dragOrigin.current.y + e.clientY - dragStart.current.y,
      });
      return;
    }
  }, [handleScreenToWorld, offset, scale, nodes, edges, dragNodeId, dragCanvas, cssScale, moveNode]);

  const onMouseUp = useCallback(() => {
    if (connectingFrom && hoveredPort) {
      const targetId = hoveredPort.replace(/-in|-out$/, "");
      if (targetId !== connectingFrom) {
        addEdge(connectingFrom, targetId);
      }
    }
    setConnectingFrom(null);
    setDragNodeId(null);
    setDragCanvas(false);
  }, [connectingFrom, hoveredPort, addEdge]);

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const hit = hitTest(e.clientX, e.clientY, offset.x, offset.y, scale, nodes, edges, rect);
    if (hit.type === "node" && hit.nodeId) {
      const node = nodes.find((n) => n.id === hit.nodeId);
      if (node) {
        focusNode(node.x, node.y, 2);
        setEditingNodeId(hit.nodeId);
        setEditText(node.content);
      }
    }
  }, [offset, scale, nodes, edges, focusNode]);

  const commitEdit = useCallback(() => {
    if (editingNodeId) {
      updateNode(editingNodeId, { content: editText, editing: false });
    }
    setEditingNodeId(null);
  }, [editingNodeId, editText, updateNode]);

  const handleSave = () => {
    if (!clip || !form.title.trim() || !form.url.trim()) return;
    const updated = updateClip(clip.id, {
      title: form.title.trim(), description: form.description.trim(),
      url: form.url.trim(), duration: parseFloat(form.duration) || 0,
      tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
    });
    if (updated) {
      setClip(updated);
      setForm({
        title: updated.title, description: updated.description,
        url: updated.url, duration: String(updated.duration),
        tags: updated.tags.join(", "),
      });
    }
    setEditing(false);
  };

  if (!clip) return null;

  // Compute textarea screen position
  let editScreenPos = { left: -9999, top: -9999, width: 700, height: 400 };
  if (editingNodeId) {
    const node = nodes.find((n) => n.id === editingNodeId);
    if (node) {
      const pos = handleWorldToScreen(node.x, node.y);
      editScreenPos = {
        left: pos.x,
        top: pos.y,
        width: 700 * cssScale,
        height: 400 * cssScale,
      };
    }
  }

  return (
    <div
      className="canvas-container"
      ref={containerRef}
      onContextMenu={handleContextMenu}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onDoubleClick={handleDoubleClick}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
      onWheel={handleWheel}
    >
      <canvas
        ref={canvasRef}
        className="render-canvas"
      />

      <button className="btn-back" onClick={() => navigate("/")}>&larr; 返回</button>

      <div className="zoom-controls">
        <button onClick={() => setScale((s) => Math.min(6, s * 1.2))}>+</button>
        <span>{Math.round(scale * 100)}%</span>
        <button onClick={() => setScale((s) => Math.max(0.4, s / 1.2))}>−</button>
        <button onClick={resetView}>⟲</button>
      </div>

      {selectedImageNodeId && nodes.find((n) => n.id === selectedImageNodeId) && (() => {
        const node = nodes.find((n) => n.id === selectedImageNodeId)!;
        const pos = handleWorldToScreen(node.x, node.y);
        return (
          <ImageToolbox
            style={{
              left: pos.x + 350 * cssScale,
              top: pos.y + 400 * cssScale + 12,
              transform: "translateX(-50%)",
            }}
          />
        );
      })()}

      {editingNodeId && (
        <textarea
          className="canvas-textarea"
          style={{
            left: editScreenPos.left + 32 * cssScale,
            top: editScreenPos.top + 36 * cssScale,
            width: editScreenPos.width - 64 * cssScale,
            height: editScreenPos.height - 72 * cssScale,
            fontSize: 14 * cssScale,
          }}
          value={editText}
          onChange={(e) => setEditText(e.target.value)}
          onBlur={commitEdit}
          autoFocus
          placeholder={nodes.find((n) => n.id === editingNodeId)?.type === "image" ? "输入图片描述..." : "输入文本..."}
        />
      )}

      {edgeToDelete && (
        <div
          className="scissors-btn"
          style={{ left: edgeToDelete.x - 20, top: edgeToDelete.y - 20 }}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() => { removeEdge(edgeToDelete.id); setEdgeToDelete(null); }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="6" cy="6" r="3" />
            <circle cx="6" cy="18" r="3" />
            <line x1="20" y1="4" x2="8.12" y2="15.88" />
            <line x1="14.47" y1="14.48" x2="20" y2="20" />
            <line x1="8.12" y1="8.12" x2="12" y2="12" />
          </svg>
        </div>
      )}

      {menu && menu.type === "main" && (
        <div className="context-menu" style={{ left: menu.x, top: menu.y }} onMouseDown={(e) => e.stopPropagation()}>
          {MAIN_MENU.map((item) => (
            <button
              key={item.label}
              className={`context-menu-item${item.disabled ? " disabled" : ""}`}
              onClick={() => !item.disabled && handleMenuAction(item.label)}
              disabled={item.disabled}
            >
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
                  <span className="menu-icon">{item.icon}</span>
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}

      {menu && menu.type === "flowItem" && (
        <div className="context-menu" style={{ left: menu.x, top: menu.y }} onMouseDown={(e) => e.stopPropagation()}>
          {FLOW_ITEM_MENU.map((item) => (
            <button
              key={item.label}
              className={`context-menu-item${item.label === "删除" ? " danger" : ""}`}
              onClick={() => handleMenuAction(item.label)}
            >
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      )}

      {editing && (
        <div className="modal-overlay" onClick={() => setEditing(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>编辑片段</h2>
            <div className="form-group"><label>标题 *</label><input type="text" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
            <div className="form-group"><label>链接 *</label><input type="text" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} /></div>
            <div className="form-group"><label>描述</label><textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={4} /></div>
            <div className="form-group"><label>时长（秒）</label><input type="number" value={form.duration} onChange={(e) => setForm({ ...form, duration: e.target.value })} min="0" step="0.1" /></div>
            <div className="form-group"><label>标签（逗号分隔）</label><input type="text" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} /></div>
            <div className="form-actions">
              <button className="btn-cancel" onClick={() => setEditing(false)}>取消</button>
              <button className="btn-primary" onClick={handleSave} disabled={!form.title.trim() || !form.url.trim()}>保存</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
