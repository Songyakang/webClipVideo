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
