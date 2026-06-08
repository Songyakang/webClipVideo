export type AssetKind = 'image' | 'video' | 'audio' | 'other';

export type AssetStatus = 'ready' | 'processing' | 'error';

export interface MediaAsset {
  id: string;
  title: string;
  originalName: string;
  mimeType: string;
  kind: AssetKind;
  size: number;
  durationSeconds?: number;
  status: AssetStatus;
  createdAt: string;
  updatedAt: string;
  files: {
    original: string;
    thumbnail?: string;
    transcoded?: string;
  };
}

export interface AssetsResponse {
  items: MediaAsset[];
  mediaBaseUrl: string;
}

export interface AssetResponse {
  item: MediaAsset;
  mediaBaseUrl: string;
}

export type TimelineTrackId = string;

export type TimelineTrackType = 'video' | 'audio' | 'text';

export interface TimelineTrack {
  id: TimelineTrackId;
  label: string;
  type: TimelineTrackType;
  muted?: boolean;
  disabled?: boolean;
}

export interface TimelineClip {
  id: string;
  assetId?: string;
  trackId: TimelineTrackId;
  offsetSeconds: number;
  trimStart: number;
  trimEnd: number;
  baseDuration: number;
  scalePercent?: number;
  positionXPx?: number;
  positionYPx?: number;
  rotationDegrees?: number;
  flipX?: boolean;
  text?: string;
  fontSize?: number;
  fontColor?: string;
}

export interface ProjectState {
  version: 1;
  name: string;
  playheadSeconds: number;
  tracks: TimelineTrack[];
  timelineClips: TimelineClip[];
  updatedAt: string;
}

export interface ProjectResponse {
  project: ProjectState;
}

export interface UpdateProjectPayload {
  name?: string;
  playheadSeconds: number;
  tracks: TimelineTrack[];
  timelineClips: TimelineClip[];
}

