import { useCallback } from "react";
import type { FlowNode } from "../nodes/types";
import type { MenuState } from "./useContextMenu";

interface MenuActionDeps {
  menu: MenuState | null;
  setMenu: (m: MenuState | null) => void;
  nodes: FlowNode[];
  selectedNodes: FlowNode[];
  addNode: (type: string, x: number, y: number, fileUrl?: string) => string;
  deleteNode: (nodeId: string) => void;
  duplicateNode: (nodeId: string) => void;
  screenToFlow: (sx: number, sy: number) => { x: number; y: number };
  generate3DFromImage: (imageNode: FlowNode) => void;
  uploadPosRef: React.MutableRefObject<{ x: number; y: number }>;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onUndo: () => void;
  onRedo: () => void;
  createTextNode?: (x: number, y: number) => string;
}

export function useMenuActions(deps: MenuActionDeps) {
  const { menu, setMenu, nodes, selectedNodes, addNode, deleteNode, duplicateNode, screenToFlow, generate3DFromImage, uploadPosRef, fileInputRef, onUndo, onRedo, createTextNode } = deps;

  const handleMenuAction = useCallback((action: string) => {
    if (!menu) return;
    switch (action) {
      case "添加节点":
        setMenu({ ...menu, type: "addNode" });
        return;
      case "上传":
        uploadPosRef.current = screenToFlow(menu.x, menu.y);
        setMenu(null);
        fileInputRef.current?.click();
        break;
      case "转为3D模型": {
        if (!menu?.nodeId) break;
        const node = nodes.find((n) => n.id === menu.nodeId);
        if (!node || (node.data.type !== "image" && node.data.type !== "image-upload")) break;
        if (!node.data.assetPath) break;
        setMenu(null);
        generate3DFromImage(node);
        break;
      }
      case "文本": {
        const { x, y } = screenToFlow(menu.x, menu.y);
        if (createTextNode) {
          createTextNode(x, y);
        } else {
          addNode("text", x, y);
        }
        setMenu(null);
        break;
      }
      case "图片":
        addNode("image", screenToFlow(menu.x, menu.y).x, screenToFlow(menu.x, menu.y).y);
        setMenu(null);
        break;
      case "删除":
      case "删除选中": {
        if (selectedNodes.length > 1) {
          selectedNodes.forEach((n) => deleteNode(n.id));
        } else if (menu.nodeId) {
          deleteNode(menu.nodeId);
        }
        setMenu(null);
        break;
      }
      case "撤销":
        setMenu(null);
        onUndo();
        break;
      case "重做":
        setMenu(null);
        onRedo();
        break;
      case "复制节点":
      case "创建副本":
        if (menu.nodeId) duplicateNode(menu.nodeId);
        setMenu(null);
        break;
      default:
        setMenu(null);
    }
  }, [menu, setMenu, nodes, selectedNodes, addNode, deleteNode, duplicateNode, screenToFlow, generate3DFromImage, uploadPosRef, fileInputRef, onUndo, onRedo]);

  return { handleMenuAction };
}
