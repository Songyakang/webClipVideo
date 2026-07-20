export type {
  DirectorNodeData,
  SceneModel,
  CameraTrack,
  CameraKeyframe,
  DirectorSceneSettings,
  Generate3DResult,
} from "../../../lib/types";

// Direction key for transform gizmo
export type TransformMode = "translate" | "rotate" | "scale";

// Render export options
export interface ExportVideoOptions {
  resolution: "720p" | "1080p" | "2K" | "4K UHD" | "4K DCI";
  width: number;
  height: number;
  fps: number;
}

export const RESOLUTION_OPTIONS: { label: string; width: number; height: number }[] = [
  { label: "720p", width: 1280, height: 720 },
  { label: "1080p", width: 1920, height: 1080 },
  { label: "2K", width: 2560, height: 1440 },
  { label: "4K UHD", width: 3840, height: 2160 },
  { label: "4K DCI", width: 4096, height: 2160 },
];

export const DEFAULT_RESOLUTION = RESOLUTION_OPTIONS[1]; // 1080p
