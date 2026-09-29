import { useEffect } from "react";

interface Args {
  edgeToDelete: { id: string; x: number; y: number } | null;
  selectedNodes: { id: string }[];
  setMenu: (m: null) => void;
  setEdgeToDelete: (e: null) => void;
  deleteNode: (id: string) => void;
  removeEdge: (id: string) => void;
  onGroup?: () => void;
  onUngroup?: () => void;
  onCopy: () => void;
  onPaste: () => void;
}

export function useKeyboardShortcuts({
  edgeToDelete,
  selectedNodes,
  setMenu,
  setEdgeToDelete,
  deleteNode,
  removeEdge,
  onCopy,
  onPaste,
  onGroup,
  onUngroup,
}: Args) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenu(null);
        setEdgeToDelete(null);
      }
      const isInput = !!(e.target as HTMLElement).closest?.("input, textarea, select, [contenteditable='true']");
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "g" && !isInput) {
        e.preventDefault();
        if (e.shiftKey) onUngroup?.(); else onGroup?.();
      }
      if ((e.key === "Delete" || e.key === "Backspace") && !isInput) {
        e.preventDefault();
        if (edgeToDelete) { removeEdge(edgeToDelete.id); setEdgeToDelete(null); }
        else if (selectedNodes.length > 0) { selectedNodes.forEach((n) => deleteNode(n.id)); }
      }
      // 复制/粘贴：输入框聚焦时让位给原生行为
      if ((e.ctrlKey || e.metaKey) && e.key === "c" && !isInput) {
        e.preventDefault();
        onCopy();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "v" && !isInput) {
        e.preventDefault();
        onPaste();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [edgeToDelete, selectedNodes, setMenu, setEdgeToDelete, deleteNode, removeEdge, onCopy, onPaste, onGroup, onUngroup]);
}
