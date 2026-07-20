import type { Node } from "@xyflow/react";
import type { CameraTrack, DirectorNodeData, DirectorSceneSettings, SceneModel } from "../../../lib/types";

export interface NodeData extends Record<string, unknown> {
  type: string;
  content: string;
  fileUrl?: string;
  assetPath?: string;
  w?: number;
  h?: number;
  videoEl?: HTMLVideoElement | null;
  label?: string;
  sourceImageNodeIds?: string[];
  models?: SceneModel[];
  cameraTracks?: CameraTrack[];
  sceneSettings?: DirectorSceneSettings;
}

export type FlowNode = Node<NodeData>;

export function isDirectorData(data: NodeData): data is NodeData & DirectorNodeData {
  return (
    data.type === "director" &&
    Array.isArray(data.models) &&
    Array.isArray(data.cameraTracks) &&
    data.sceneSettings != null
  );
}
