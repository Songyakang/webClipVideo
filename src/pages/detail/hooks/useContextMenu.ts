import { useState, useEffect } from "react";

interface MenuState { x: number; y: number; type: "main" | "addNode" | "flowItem"; nodeId?: string; }

export function useContextMenu() {
  const [menu, setMenu] = useState<MenuState | null>(null);

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [menu]);

  return { menu, setMenu };
}

export type { MenuState };
