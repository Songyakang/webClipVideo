import { useEffect, type MutableRefObject } from "react";
import type { Node, Edge } from "@xyflow/react";
import { saveCanvas, loadCanvas } from "../../../lib/db";
import { getAssetSrc } from "../../../lib/assets";
import type { FlowNode } from "../nodes/types";

export function useCanvasPersistence(
  clipId: string,
  nodes: Node[],
  edges: Edge[],
  setNodes: (nodes: FlowNode[]) => void,
  setEdges: (edges: Edge[]) => void,
  loadedRef: MutableRefObject<boolean>,
  nodeIdCounterRef: MutableRefObject<number>,
  edgeIdCounterRef: MutableRefObject<number>,
) {
  useEffect(() => {
    // Reset on every clipId change to avoid stale state from previous project
    loadedRef.current = false;
    let cancelled = false;

    loadCanvas(clipId).then(async (data) => {
      if (cancelled) return;

      // Empty canvas — load is complete, mark as ready for auto-save
      if (data.nodes.length === 0 && data.edges.length === 0) {
        loadedRef.current = true;
        return;
      }

      const restoredNodes: FlowNode[] = await Promise.all(
        data.nodes.map(async (n) => {
          const fn = n as FlowNode;
          const assetPath: string = fn.data?.assetPath || "";
          if (assetPath && fn.type?.includes("upload")) {
            try {
              const assetUrl = await getAssetSrc(assetPath);
              if (assetUrl) {
                return { ...fn, data: { ...fn.data, fileUrl: assetUrl } };
              }
            } catch (err) {
              console.error("[restore] getAssetSrc failed:", assetPath, err);
            }
          }
          return fn;
        }),
      );

      if (cancelled) return;

      restoredNodes.forEach((n: FlowNode) => {
        const match = n.id.match(/^node-(\d+)$/);
        if (match) nodeIdCounterRef.current = Math.max(nodeIdCounterRef.current, parseInt(match[1]));
      });
      data.edges.forEach((e: Edge) => {
        const match = e.id.match(/^edge-(\d+)$/);
        if (match) edgeIdCounterRef.current = Math.max(edgeIdCounterRef.current, parseInt(match[1]));
      });

      setNodes(restoredNodes);
      setEdges(data.edges);
      loadedRef.current = true;
    });

    return () => { cancelled = true; };
  }, [clipId, setNodes, setEdges, nodeIdCounterRef, edgeIdCounterRef]);

  useEffect(() => {
    if (!loadedRef.current) return;
    const timer = setTimeout(() => {
      saveCanvas(clipId, nodes, edges);
    }, 500);
    return () => clearTimeout(timer);
  }, [clipId, nodes, edges]);
}
