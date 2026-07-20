export interface VideoClip {
  id: string;
  title: string;
  description: string;
  url: string;
  thumbnail?: string;
  duration: number; // seconds
  createdAt: number; // timestamp
  tags: string[];
}

export interface SubtitleItem {
  id: string;
  startTime: number;
  endTime: number;
  text: string;
}

export interface SubtitleStyle {
  fontSize: number;
  fontColor: string;
  outlineColor: string;
  outlineWidth: number;
  alignment: 1 | 2 | 3;
  marginV: number;
  bold: boolean;
  italic: boolean;
}

export interface SubtitleTrack {
  id: string;
  items: SubtitleItem[];
  language: string;
  status: "empty" | "generating" | "ready" | "edited";
}

export const DEFAULT_SUBTITLE_STYLE: SubtitleStyle = {
  fontSize: 24,
  fontColor: "#FFFFFF",
  outlineColor: "#000000",
  outlineWidth: 2,
  alignment: 2,
  marginV: 50,
  bold: false,
  italic: false,
};

export interface VoiceProfile {
  embedding: number[];
  createdAt: string;
}

export interface AudioReplacement {
  startTime: number;
  endTime: number;
  wavPath: string;
}

export interface SceneModel {
  id: string;
  name: string;
  modelPath: string;
  thumbnailPath: string;
  transform: {
    position: [number, number, number];
    rotation: [number, number, number];
    scale: number;
  };
  meta: {
    vertexCount: number;
    faceCount: number;
    sourceImageId: string;
  };
  status: "loading" | "ready" | "error";
}

export interface CameraKeyframe {
  time: number;
  fov: number;
  position: [number, number, number];
  lookAt: [number, number, number];
}

export interface CameraTrack {
  id: string;
  name: string;
  enabled: boolean;
  keyframes: CameraKeyframe[];
  easing: "linear" | "ease-in" | "ease-out" | "ease-in-out";
}

export interface DirectorSceneSettings {
  backgroundColor: string;
  ambientLight: number;
  gridVisible: boolean;
}

export interface DirectorNodeData {
  label: string;
  sourceImageNodeIds: string[];
  models: SceneModel[];
  cameraTracks: CameraTrack[];
  sceneSettings: DirectorSceneSettings;
}

export interface Generate3DResult {
  modelId: string;
  modelPath: string;
  thumbnailPath: string;
  vertexCount: number;
  faceCount: number;
}
