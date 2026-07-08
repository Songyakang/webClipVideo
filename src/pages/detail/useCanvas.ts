import { useState, useRef, useCallback } from "react";
import type { CanvasNodeData } from "./types";

export function useCanvas() {
  const isMac = useRef(
    /Mac|iPhone|iPad|iPod/.test(navigator.platform) ||
    /Mac/.test(navigator.userAgent)
  );

  const containerRef = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [scale, setScale] = useState(1);
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const dragOffset = useRef({ x: 0, y: 0 });
  const scaleRef = useRef(scale);
  const offsetRef = useRef(offset);
  scaleRef.current = scale;
  offsetRef.current = offset;

  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const dragNodeStart = useRef({ x: 0, y: 0 });
  const dragNodeOrigin = useRef({ x: 0, y: 0 });

  const handleMouseDown = useCallback((e: React.MouseEvent, nodes: CanvasNodeData[]) => {
    const flowItem = (e.target as HTMLElement).closest(".flow-item") as HTMLElement | null;
    if ((e.target as HTMLElement).closest(".canvas-node") && !flowItem) return;

    if (flowItem) {
      const nodeId = flowItem.dataset.nodeId;
      if (nodeId) {
        setDraggingNodeId(nodeId);
        dragNodeStart.current = { x: e.clientX, y: e.clientY };
        const node = nodes.find((n) => n.id === nodeId);
        dragNodeOrigin.current = node ? { x: node.x, y: node.y } : { x: 0, y: 0 };
        return;
      }
    }

    setDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY };
    dragOffset.current = { ...offsetRef.current };
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent, onNodeMove: (id: string, x: number, y: number) => void) => {
    if (draggingNodeId) {
      const s = scaleRef.current;
      const dx = (e.clientX - dragNodeStart.current.x) / s;
      const dy = (e.clientY - dragNodeStart.current.y) / s;
      onNodeMove(draggingNodeId, dragNodeOrigin.current.x + dx, dragNodeOrigin.current.y + dy);
      return;
    }
    if (!dragging) return;
    setOffset({
      x: dragOffset.current.x + e.clientX - dragStart.current.x,
      y: dragOffset.current.y + e.clientY - dragStart.current.y,
    });
  }, [dragging, draggingNodeId]);

  const handleMouseUp = useCallback(() => {
    setDragging(false);
    setDraggingNodeId(null);
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const currentScale = scaleRef.current;
    const currentOffset = offsetRef.current;

    if (isMac.current && !e.ctrlKey) {
      setOffset({
        x: currentOffset.x - e.deltaX,
        y: currentOffset.y - e.deltaY,
      });
      return;
    }

    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newScale = Math.min(6, Math.max(0.4, currentScale * delta));

    setOffset({
      x: mx - ((mx - currentOffset.x) / currentScale) * newScale,
      y: my - ((my - currentOffset.y) / currentScale) * newScale,
    });
    setScale(newScale);
  }, []);

  const screenToCanvas = useCallback((sx: number, sy: number) => ({
    x: (sx - offsetRef.current.x) / scaleRef.current,
    y: (sy - offsetRef.current.y) / scaleRef.current,
  }), []);

  const focusNode = useCallback((nodeX: number, nodeY: number, targetScale: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setScale(targetScale);
    setOffset({
      x: rect.width / 2 - (nodeX + 350) * targetScale / 2,
      y: rect.height / 2 - (nodeY + 200) * targetScale / 2,
    });
  }, []);

  const resetView = useCallback(() => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  }, []);

  return {
    isMac,
    containerRef,
    offset,
    scale,
    setScale,
    setOffset,
    dragging,
    draggingNodeId,
    scaleRef,
    offsetRef,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleWheel,
    screenToCanvas,
    focusNode,
    resetView,
  };
}
