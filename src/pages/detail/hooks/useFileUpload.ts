import { useRef, useCallback } from "react";
import { saveAsset, getAssetSrc } from "../../../lib/assets";

export function useFileUpload(
  addNode: (type: string, x: number, y: number, fileUrl?: string) => string,
  setNodes: React.Dispatch<React.SetStateAction<any[]>>,
  resizeMediaNode: (nodeId: string, type: string, url: string) => void,
) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadPosRef = useRef({ x: 0, y: 0 });

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const type = file.type.startsWith("video/") ? "video-upload" : "image-upload";
    const nodeId = addNode(type, uploadPosRef.current.x, uploadPosRef.current.y, "");
    const path = await saveAsset(nodeId, file);
    const url = path.startsWith("blob:") ? path : await getAssetSrc(path);
    setNodes((prev) => prev.map((n) => n.id === nodeId ? {
      ...n, data: { ...n.data, fileUrl: url, assetPath: path }
    } : n));
    resizeMediaNode(nodeId, type, url);
    e.target.value = "";
  }, [addNode, setNodes, resizeMediaNode]);

  return { fileInputRef, uploadPosRef, handleFileChange };
}
