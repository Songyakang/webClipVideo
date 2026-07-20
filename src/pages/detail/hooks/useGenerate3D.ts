import { useCallback, type MutableRefObject } from "react";
import { invoke } from "@tauri-apps/api/core";
import { resolveAssetPath } from "../../../lib/assets";
import { showToast } from "../../../lib/toast";
import type { Edge } from "@xyflow/react";
import type { FlowNode, NodeData } from "../nodes/types";
import type { DirectorNodeData, Generate3DResult, SceneModel } from "../../../lib/types";

export function useGenerate3D(
  projectId: string,
  setNodes: React.Dispatch<React.SetStateAction<FlowNode[]>>,
  setEdges: React.Dispatch<React.SetStateAction<Edge[]>>,
  nodeIdCounterRef: MutableRefObject<number>,
  edgeIdCounterRef: MutableRefObject<number>,
) {
  const generate3DFromImage = useCallback((imageNode: FlowNode) => {
    const imageData = imageNode.data as NodeData;
    const imagePath = imageData.assetPath;
    if (!imagePath) return;

    const modelId = `model-${Date.now()}`;
    const directorId = `node-${++nodeIdCounterRef.current}`;
    const directorNode: FlowNode = {
      id: directorId,
      type: "director",
      position: { x: imageNode.position.x + 200, y: imageNode.position.y },
      data: {
        type: "director",
        content: "",
        label: "导演台",
        sourceImageNodeIds: [imageNode.id],
        models: [{
          id: modelId,
          name: imageData.content || "未命名",
          modelPath: "",
          thumbnailPath: "",
          transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: 1 },
          meta: { vertexCount: 0, faceCount: 0, sourceImageId: imageNode.id },
          status: "loading" as const,
        }],
        cameraTracks: [{
          id: "cam_1",
          name: "主摄像机",
          enabled: true,
          keyframes: [
            { time: 0, fov: 45, position: [0, 1.5, 5], lookAt: [0, 0, 0] },
            { time: 5, fov: 45, position: [3, 2, 2], lookAt: [0, 0.5, 0] },
          ],
          easing: "ease-in-out",
        }],
        sceneSettings: {
          backgroundColor: "#1a1a2e",
          ambientLight: 0.5,
          gridVisible: true,
        },
      },
    };

    setNodes((prev) => [...prev, directorNode]);

    setEdges((prev) => [
      ...prev,
      { id: `edge-${++edgeIdCounterRef.current}`, source: imageNode.id, target: directorId },
    ]);

    resolveAssetPath(imagePath)
      .then((imageAbsPath) => {
        if (!imageAbsPath) {
          console.error("resolveAssetPath returned empty for:", imagePath);
          showToast("文件读取失败，请检查文件是否存在", "error");
          return;
        }
        invoke<Generate3DResult>("generate_3d", { imagePath: imageAbsPath, projectId })
          .then((generateResult) => {
            setNodes((prev) =>
              prev.map((n) => {
                if (n.id !== directorId) return n;
                const models: SceneModel[] = (n.data as unknown as DirectorNodeData).models.map((m: SceneModel) =>
                  m.id === modelId
                    ? {
                        ...m,
                        modelPath: generateResult.modelPath,
                        thumbnailPath: generateResult.thumbnailPath,
                        meta: { ...m.meta, vertexCount: generateResult.vertexCount, faceCount: generateResult.faceCount },
                        status: "ready" as const,
                      }
                    : m
                );
                return { ...n, data: { ...n.data, models } } as FlowNode;
              })
            );
          })
          .catch((err) => {
            console.error("generate_3d failed:", err);
            showToast("3D 模型生成失败，请稍后重试", "error");
            setNodes((prev) =>
              prev.map((n) => {
                if (n.id !== directorId) return n;
                const models: SceneModel[] = (n.data as unknown as DirectorNodeData).models.map((m: SceneModel) =>
                  m.id === modelId ? { ...m, status: "error" as const } : m
                );
                return { ...n, data: { ...n.data, models } } as FlowNode;
              })
            );
          });
      })
      .catch((err) => {
        console.error("resolveAssetPath failed:", err);
        showToast("文件读取失败，请检查文件是否存在", "error");
        setNodes((prev) =>
          prev.map((n) => {
            if (n.id !== directorId) return n;
            const models = (n.data as unknown as DirectorNodeData).models.map((m: SceneModel) =>
              m.id === modelId ? { ...m, status: "error" as const } : m
            );
            return { ...n, data: { ...n.data, models } } as FlowNode;
          })
        );
      });
  }, [projectId, setNodes, setEdges, nodeIdCounterRef, edgeIdCounterRef]);

  return { generate3DFromImage };
}
