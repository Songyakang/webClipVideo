import { useCallback } from "react";

const MAX_W = 700;

export function useMediaResizer(
  setNodes: React.Dispatch<React.SetStateAction<any[]>>,
) {
  const resizeMediaNode = useCallback((nodeId: string, type: string, url: string) => {
    if (type === "video-upload") {
      const v = document.createElement("video");
      v.preload = "metadata";
      v.onloadedmetadata = () => {
        const w = Math.min(MAX_W, v.videoWidth);
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
        const w = Math.min(MAX_W, img.naturalWidth);
        const h = (img.naturalHeight / img.naturalWidth) * w;
        setNodes((prev) => prev.map((n) => n.id === nodeId ? {
          ...n, data: { ...n.data, w, h },
          position: { x: n.position.x - w / 2, y: n.position.y - h / 2 }
        } : n));
      };
      img.src = url;
    }
  }, [setNodes]);

  return { resizeMediaNode };
}
