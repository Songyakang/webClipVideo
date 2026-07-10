import { useEffect } from "react";

interface Args {
  editingNodeId: string | null;
  edgeToDelete: { id: string; x: number; y: number } | null;
  selectedNode: { id: string } | null;
  setMenu: (m: null) => void;
  setEditingNodeId: (id: null) => void;
  setEdgeToDelete: (e: null) => void;
  deleteNode: (id: string) => void;
  removeEdge: (id: string) => void;
}

export function useKeyboardShortcuts({
  editingNodeId,
  edgeToDelete,
  selectedNode,
  setMenu,
  setEditingNodeId,
  setEdgeToDelete,
  deleteNode,
  removeEdge,
}: Args) {
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
  }, [editingNodeId, edgeToDelete, selectedNode, setMenu, setEditingNodeId, setEdgeToDelete, deleteNode, removeEdge]);
}
