import { useEffect, type MutableRefObject } from "react";
import type { Node, Edge } from "@xyflow/react";
import { saveCanvas, loadCanvas } from "../../../lib/db";
import { getAssetSrc } from "../../../lib/assets";

export function useCanvasPersistence(
  clipId: string,
  nodes: Node[],
  edges: Edge[],
  setNodes: (nodes: any) => void,
  setEdges: (edges: any) => void,
  loadedRef: MutableRefObject<boolean>,
  nodeIdCounterRef: MutableRefObject<number>,
  edgeIdCounterRef: MutableRefObject<number>,
) {
  useEffect(() => {
    let cancelled = false;

    loadCanvas(clipId).then(async (data) => {
      if (cancelled) return;

      const restoredNodes = await Promise.all(data.nodes.map(async (n: any) => {
        const assetPath: string = n.data?.assetPath || "";
        if (assetPath && n.type?.includes("upload")) {
          try {
            const assetUrl = await getAssetSrc(assetPath);
            if (assetUrl) {
              return { ...n, data: { ...n.data, fileUrl: assetUrl } };
            }
          } catch (err) {
            console.error("[restore] getAssetSrc failed:", assetPath, err);
          }
        }
        return n;
      }));

      if (cancelled) return;

      restoredNodes.forEach((n: any) => {
        const match = n.id.match(/^node-(\d+)$/);
        if (match) nodeIdCounterRef.current = Math.max(nodeIdCounterRef.current, parseInt(match[1]));
      });
      data.edges.forEach((e: any) => {
        const match = e.id.match(/^edge-(\d+)$/);
        if (match) edgeIdCounterRef.current = Math.max(edgeIdCounterRef.current, parseInt(match[1]));
      });

      setNodes(restoredNodes as any);
      setEdges(data.edges as any);
      loadedRef.current = true;
    });

    return () => { cancelled = true; };
  }, [clipId, setNodes, setEdges, nodeIdCounterRef, edgeIdCounterRef]);

  useEffect(() => {
    if (!loadedRef.current) return;
    const timer = setTimeout(() => {
      saveCanvas(clipId, nodes as any, edges as any);
    }, 500);
    return () => clearTimeout(timer);
  }, [clipId, nodes, edges]);
}
