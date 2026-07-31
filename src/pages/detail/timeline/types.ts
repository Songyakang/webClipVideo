/** 滤镜参数 */
export interface ClipFilter {
  brightness?: number;  // -1..1, 默认 0
  contrast?: number;    // -1..1, 默认 0
  saturation?: number;  // -1..1, 默认 0
  hue?: number;         // -180..180 度, 默认 0
  blur?: number;        // 0..20 px, 默认 0
  sharpen?: number;     // 0..1, 默认 0
  temperature?: number; // -1..1, 默认 0 (冷→暖)
  vignette?: number;    // 0..1, 默认 0
}

/** 滤镜预设 */
export const FILTER_PRESETS: Record<string, Partial<ClipFilter>> = {
  none: {},
  cinematic: {
    contrast: 0.15,
    saturation: -0.15,
    temperature: 0.1,
    vignette: 0.3,
  },
  vintage: {
    brightness: 0.05,
    contrast: -0.1,
    saturation: -0.4,
    temperature: 0.3,
    vignette: 0.4,
  },
  warm: { temperature: 0.4, saturation: 0.1 },
  cool: { temperature: -0.4, saturation: 0.05 },
  bw: { saturation: -1, contrast: 0.2 },
  sharp: { sharpen: 0.5, contrast: 0.05 },
  soft: { blur: 3, brightness: 0.03, saturation: -0.1 },
} as const;

export const FILTER_PRESET_NAMES = Object.keys(FILTER_PRESETS);

/** 滤镜参数中文标签 */
export const FILTER_LABELS: Record<keyof ClipFilter, string> = {
  brightness: "亮度",
  contrast: "对比度",
  saturation: "饱和度",
  hue: "色相",
  blur: "模糊",
  sharpen: "锐化",
  temperature: "色温",
  vignette: "暗角",
};

/** 检查滤镜是否为空（无任何有效参数） */
export function isFilterEmpty(filter?: ClipFilter): boolean {
  if (!filter) return true;
  const keys = Object.keys(filter) as (keyof ClipFilter)[];
  return keys.every((k) => filter[k] === undefined || filter[k] === 0);
}

/**
 * 将 ClipFilter 转为 CSS filter 字符串
 * 用于实时预览
 */
export function clipFilterToCSS(filter?: ClipFilter): string {
  if (!filter || isFilterEmpty(filter)) return "";
  const parts: string[] = [];

  // brightness: -1..1 → 0.2..3 (css brightness)
  if (filter.brightness !== undefined && filter.brightness !== 0) {
    const v = 1 + filter.brightness;
    parts.push(`brightness(${v.toFixed(2)})`);
  }
  // contrast: -1..1 → 0..2
  if (filter.contrast !== undefined && filter.contrast !== 0) {
    const v = 1 + filter.contrast;
    parts.push(`contrast(${v.toFixed(2)})`);
  }
  // saturation: -1..1 → 0..2
  if (filter.saturation !== undefined && filter.saturation !== 0) {
    const v = 1 + filter.saturation;
    parts.push(`saturate(${v.toFixed(2)})`);
  }
  // hue: -180..180 → css hue-rotate
  if (filter.hue !== undefined && filter.hue !== 0) {
    parts.push(`hue-rotate(${filter.hue}deg)`);
  }
  // blur: 0..20 → css blur
  if (filter.blur !== undefined && filter.blur > 0) {
    parts.push(`blur(${filter.blur}px)`);
  }

  return parts.join(" ");
}

/**
 * 获取暗角 CSS overlay
 * 返回 radial-gradient 字符串，用于叠加层
 */
export function vignetteCSS(filter?: ClipFilter): string | null {
  if (!filter?.vignette || filter.vignette <= 0) return null;
  const alpha = filter.vignette * 0.6;
  return `radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,${alpha.toFixed(2)}) 100%)`;
}

/**
 * 获取色温 CSS overlay（模拟）
 * 暖色=sepia+橙色，冷色=蓝色色调
 */
export function temperatureCSS(filter?: ClipFilter): string | null {
  if (!filter?.temperature || filter.temperature === 0) return null;
  // 用 sepia + hue-rotate 近似色温效果
  if (filter.temperature > 0) {
    const a = filter.temperature * 0.4;
    return `sepia(${a.toFixed(2)}) saturate(${(1 + a * 2).toFixed(2)})`;
  } else {
    const a = Math.abs(filter.temperature) * 0.3;
    return `hue-rotate(180deg) saturate(${(1 + a).toFixed(2)}) opacity(${(0.2 + a).toFixed(2)})`;
  }
}

/** A single clip on the timeline */
export interface TimelineClip {
  id: string;
  title: string;
  type: "video" | "image" | "text" | "audio";

  // Timeline position (seconds)
  startTime: number;
  duration: number;

  // Source media info
  assetPath?: string;       // relative path for persistence
  fileUrl?: string;         // blob URL for display (not persisted)
  sourceStart: number;      // trim start in source (default 0)
  sourceEnd: number;        // trim end in source

  // Visual
  thumbnail?: string;
  content?: string;         // text content
  sourceDuration?: number;  // original media duration

  // Filter
  filter?: ClipFilter;
  filterPreset?: string;
}

/** A single track (lane) on the timeline */
export interface TimelineTrack {
  id: string;
  name: string;
  type: "video" | "audio" | "text";
  clips: TimelineClip[];
  muted?: boolean;
  locked?: boolean;
  order: number;
}

/** Complete timeline state for a project */
export interface TimelineData {
  tracks: TimelineTrack[];
  fps: number;
}

/** Serialized form for IndexedDB persistence */
export interface TimelineRecord {
  projectId: string;
  data: TimelineData;
  updatedAt: number;
}

/** Default resolution options */
export const RESOLUTION_OPTIONS = [
  { label: "1080p (1920×1080)", width: 1920, height: 1080 },
  { label: "720p (1280×720)", width: 1280, height: 720 },
  { label: "原分辨率", width: 0, height: 0 },
] as const;

/** Generate a unique clip ID */
let _clipCounter = 0;
export function nextClipId(): string {
  return `tlc_${Date.now().toString(36)}_${(_clipCounter++).toString(36)}`;
}

/** Generate a unique track ID */
let _trackCounter = 0;
export function nextTrackId(): string {
  return `tlt_${Date.now().toString(36)}_${(_trackCounter++).toString(36)}`;
}
