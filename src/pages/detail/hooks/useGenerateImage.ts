import { useCallback, useState, type MutableRefObject } from "react";
import { invoke } from "@tauri-apps/api/core";
import { loadAssetUrl, resolveAssetPath } from "../../../lib/assets";
import { showToast } from "../../../lib/toast";
import type { GenerateImageResult, OptimizePromptResult } from "../../../lib/types";
import type { Edge } from "@xyflow/react";
import type { FlowNode } from "../nodes/types";

interface GenerateImageOptions {
  size?: string;
  steps?: number;
  cfgScale?: number;
  negativePrompt?: string;
}

async function findReferenceImage(
  nodeId: string,
  nodesRef: MutableRefObject<FlowNode[]>,
  edgesRef: MutableRefObject<Edge[]>,
): Promise<string | null> {
  const edges = edgesRef.current;
  const nodes = nodesRef.current;
  // Find incoming edges to this node from image nodes
  for (const edge of edges) {
    if (edge.target !== nodeId) continue;
    const sourceNode = nodes.find((n) => n.id === edge.source);
    if (!sourceNode) continue;
    const isImage = sourceNode.type === "image" || sourceNode.type === "image-upload";
    const assetPath = (sourceNode.data as any).assetPath;
    if (isImage && assetPath) {
      const abs = await resolveAssetPath(assetPath);
      if (abs) return abs;
    }
  }
  return null;
}

export function useGenerateImage(
  projectId: string,
  setNodes: React.Dispatch<React.SetStateAction<FlowNode[]>>,
  setEdges: React.Dispatch<React.SetStateAction<Edge[]>>,
  nodesRef: MutableRefObject<FlowNode[]>,
  edgesRef: MutableRefObject<Edge[]>,
) {
  const [generatingNodeId, setGeneratingNodeId] = useState<string | null>(null);
  const [reversingNodeId, setReversingNodeId] = useState<string | null>(null);

  const DISPLAY_WIDTH = 680;

  const getImageDimensions = (url: string): Promise<{ w: number; h: number }> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const ratio = img.naturalHeight / img.naturalWidth;
        resolve({ w: DISPLAY_WIDTH, h: Math.round(DISPLAY_WIDTH * ratio) });
      };
      img.onerror = () => resolve({ w: 0, h: 0 });
      img.src = url;
    });
  };

  const generateImage = useCallback(async (
    nodeId: string,
    prompt: string,
    model: string,
    options?: GenerateImageOptions,
  ) => {
    if (!prompt.trim()) {
      showToast("请输入提示词", "error");
      return;
    }

    const node = nodesRef.current.find((n) => n.id === nodeId);
    if (!node) {
      showToast("节点不存在", "error");
      return;
    }

    setGeneratingNodeId(nodeId);

    try {
      const isImageNode = node.type === "image" || node.type === "image-upload";
      const existingAsset = isImageNode ? (node.data as any).assetPath : null;
      const refImagePath = await findReferenceImage(nodeId, nodesRef, edgesRef);

      let result: GenerateImageResult;

      if (existingAsset) {
        const absPath = await resolveAssetPath(existingAsset);
        if (!absPath) {
          showToast("无法读取参考图片", "error");
          return;
        }
        result = await invoke<GenerateImageResult>("edit_image", {
          imagePath: absPath,
          prompt: prompt.trim(),
          projectId,
          nodeId,
          steps: options?.steps || null,
          cfgScale: options?.cfgScale || null,
          negativePrompt: options?.negativePrompt || null,
        });
      } else {
        result = await invoke<GenerateImageResult>("generate_image", {
          prompt: prompt.trim(),
          model,
          projectId,
          nodeId,
          size: options?.size || null,
          steps: options?.steps || null,
          cfgScale: options?.cfgScale || null,
          negativePrompt: options?.negativePrompt || null,
          referenceImagePath: refImagePath,
        });
      }

      const fileUrl = await loadAssetUrl(result.image_path);
      if (!fileUrl) {
        showToast("图片加载失败", "error");
        return;
      }

      const dims = await getImageDimensions(fileUrl);

      if (isImageNode) {
        setNodes((prev) =>
          prev.map((n) =>
            n.id === nodeId
              ? {
                  ...n,
                  data: {
                    ...n.data,
                    fileUrl,
                    assetPath: result.image_path,
                    content: prompt.trim(),
                    type: "image-upload",
                    w: dims.w || n.data.w,
                    h: dims.h || n.data.h,
                  },
                }
              : n,
          ),
        );
        showToast("图片生成成功", "success");
      } else {
        const imgNodeId = `node-${Date.now()}`;
        const imgNode: FlowNode = {
          id: imgNodeId,
          type: "image-upload",
          position: {
            x: node.position.x + (node.data.w || 680) + 60,
            y: node.position.y,
          },
          data: {
            type: "image-upload",
            content: prompt.trim(),
            fileUrl,
            assetPath: result.image_path,
            w: dims.w,
            h: dims.h,
          },
        };
        const newEdge: Edge = {
          id: `edge-${Date.now()}`,
          source: nodeId,
          target: imgNodeId,
        };
        setNodes((prev) => [...prev, imgNode]);
        setEdges((prev) => [...prev, newEdge]);
        showToast("图片生成成功，已创建新节点", "success");
      }
    } catch (err) {
      console.error("generate_image failed:", err);
      const msg = typeof err === "string" ? err : "图片生成失败，请稍后重试";
      showToast(msg, "error");
    } finally {
      setGeneratingNodeId(null);
    }
  }, [projectId, setNodes, setEdges, nodesRef, edgesRef]);

  const reversePrompt = useCallback(async (
    nodeId: string,
    prompt: string,
    provider: string,
  ): Promise<string> => {
    if (!prompt.trim()) {
      showToast("请输入提示词", "error");
      return "";
    }

    const node = nodesRef.current.find((n) => n.id === nodeId);
    if (!node) {
      showToast("节点不存在", "error");
      return "";
    }

    setReversingNodeId(nodeId);

    try {
      const refImagePath = await findReferenceImage(nodeId, nodesRef, edgesRef);
      if (!refImagePath) {
        showToast("请先连接图片节点", "error");
        return "";
      }

      const result = await invoke<OptimizePromptResult>("reverse_prompt", {
        provider,
        imagePath: refImagePath,
        text: prompt.trim(),
      });

      if (!result.optimized_prompt.trim()) {
        showToast("图片分析返回为空", "error");
        return "";
      }

      showToast("图片分析完成", "success");
      return result.optimized_prompt;
    } catch (err) {
      console.error("reverse_prompt failed:", err);
      const msg = typeof err === "string" ? err : "图片分析失败，请稍后重试";
      showToast(msg, "error");
      return "";
    } finally {
      setReversingNodeId(null);
    }
  }, [nodesRef, edgesRef]);

  return { generateImage, generatingNodeId, reversePrompt, reversingNodeId };
}
