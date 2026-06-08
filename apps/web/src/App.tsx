import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ChangeEvent, DragEvent, MouseEvent, WheelEvent } from 'react';
import { Button, Modal, Select } from 'antd';

import type {
  AssetResponse,
  AssetsResponse,
  MediaAsset,
  ProjectResponse,
  TimelineClip,
  TimelineTrack,
  TimelineTrackId,
  TimelineTrackType,
  UpdateProjectPayload,
} from '@web-video/shared';

import { computeDuration, generateThumbnail, transcodeToMp4 } from './lib/media.js';

const apiBase = import.meta.env.VITE_API_BASE ?? 'http://localhost:4000/api';
const basePixelsPerSecond = 28;
const minClipDuration = 1;
const defaultPreviewScale = 100;
const maxPreviewOffsetPx = 20000;
const safeAreaInsetRatio = 0.08;
const snapThresholdPx = 12;
const minTimelineZoom = 0.5;
const maxTimelineZoom = 4;
const defaultTimelineZoom = maxTimelineZoom;
const floatingMenuViewportPadding = 12;

type PreviewTab = 'player' | 'editor';
type InspectorTab = 'project' | 'clip' | 'editor' | 'export';
type AssetKindFilter = 'all' | MediaAsset['kind'];
type AssetLayoutMode = 'grid' | 'list';

const assetKindFilterOptions = [
  { value: 'all', label: '全部类型' },
  { value: 'image', label: '图片' },
  { value: 'video', label: '视频' },
  { value: 'audio', label: '音频' },
  { value: 'other', label: '文件' },
] satisfies Array<{ value: AssetKindFilter; label: string }>;

const gridLayoutIcon = (
  <span className="asset-layout-icon" aria-hidden="true">
    <span />
    <span />
    <span />
  </span>
);

const listLayoutIcon = (
  <span className="asset-layout-icon asset-layout-icon-list" aria-hidden="true">
    <span />
  </span>
);

const defaultTracks = (): TimelineTrack[] => [
  { id: 'V1', label: 'V1', type: 'video', muted: false, disabled: false },
  { id: 'V2', label: 'V2', type: 'video', muted: false, disabled: false },
  { id: 'A1', label: 'A1', type: 'audio', muted: false, disabled: false },
  { id: 'A2', label: 'A2', type: 'audio', muted: false, disabled: false },
  { id: 'T1', label: 'T1', type: 'text', muted: false, disabled: false },
];

type TrackContextMenu = {
  trackId: TimelineTrackId;
  x: number;
  y: number;
};

type AssetContextMenu = {
  assetId: string;
  x: number;
  y: number;
};

type ClipContextMenu = {
  clipId: string;
  x: number;
  y: number;
};

type PreviewResizeSession = {
  clipId: string | null;
  startX: number;
  startY: number;
  startScalePercent: number;
  centerX: number;
  centerY: number;
  startPointerDistance: number;
};

type PreviewMoveSession = {
  clipId: string | null;
  startX: number;
  startY: number;
  startPositionXPx: number;
  startPositionYPx: number;
};

type SnapAxis = 'center' | 'safe-start' | 'safe-end' | null;

type PreviewSnapState = {
  x: SnapAxis;
  y: SnapAxis;
};

type TimelineZoomAnchor = {
  scaleRatio: number;
  viewportOffset: number;
  contentOffset: number;
};

type TimelineClipResizeEdge = 'start' | 'end';

type TimelineClipResizeSession = {
  clipId: string;
  edge: TimelineClipResizeEdge;
  startX: number;
  startTrimStart: number;
  startTrimEnd: number;
  startOffsetSeconds: number;
};

type TimelineClipDragSession = {
  clipId: string;
  clipDuration: number;
  trackId: TimelineTrackId;
  startX: number;
  startOffsetSeconds: number;
  moved: boolean;
};

type PlaybackVisualLayer = {
  clip: TimelineClip;
  asset?: MediaAsset;
  track: TimelineTrack;
  trackPriority: number;
};

const getFloatingMenuPosition = (clientX: number, clientY: number, menuWidth: number, menuHeight: number) => ({
  x: clamp(clientX, floatingMenuViewportPadding, window.innerWidth - menuWidth - floatingMenuViewportPadding),
  y: clamp(clientY, floatingMenuViewportPadding, window.innerHeight - menuHeight - floatingMenuViewportPadding),
});

const isEditableElement = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable ||
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) ||
    Boolean(target.closest('[contenteditable="true"]')));

const guessMediaBaseUrl = () => apiBase.replace(/\/api\/?$/, '/media');

const formatSize = (size: number) => {
  if (size < 1024) {
    return `${size} B`;
  }

  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }

  if (size < 1024 * 1024 * 1024) {
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }

  return `${(size / (1024 * 1024 * 1024)).toFixed(1)} GB`;
};

const formatSeconds = (seconds: number) => {
  const totalSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, '0');
  const restSeconds = (totalSeconds % 60).toString().padStart(2, '0');
  return `${minutes}:${restSeconds}`;
};

const kindLabelMap: Record<MediaAsset['kind'], string> = {
  image: '图片',
  video: '视频',
  audio: '音频',
  other: '文件',
};

const trackTypeLabelMap: Record<TimelineTrackType, string> = {
  video: '视频轨',
  audio: '音频轨',
  text: '文本轨',
};

const defaultClipDuration = (asset: MediaAsset) => {
  if (asset.kind === 'image') {
    return 5;
  }

  if (asset.kind === 'audio') {
    return 10;
  }

  if (asset.kind === 'other') {
    return 4;
  }

  return 8;
};

const getTimedAssetSourceDuration = (asset: MediaAsset) => {
  if ((asset.kind === 'video' || asset.kind === 'audio') && typeof asset.durationSeconds === 'number') {
    return Math.max(minClipDuration, asset.durationSeconds);
  }

  return undefined;
};

const getAssetBaseDuration = (asset: MediaAsset) => {
  const timedAssetDuration = getTimedAssetSourceDuration(asset);

  if (typeof timedAssetDuration === 'number') {
    return timedAssetDuration;
  }

  return defaultClipDuration(asset);
};

const getInitialClipDuration = (asset: MediaAsset) => getAssetBaseDuration(asset);

const syncClipWithAssetDuration = (clip: TimelineClip, asset?: MediaAsset) => {
  if (!asset) {
    return clip;
  }

  const timedAssetDuration = getTimedAssetSourceDuration(asset);

  if (typeof timedAssetDuration !== 'number') {
    return clip;
  }

  const trimStart = clamp(clip.trimStart, 0, timedAssetDuration - minClipDuration);
  const trimEnd = clamp(clip.trimEnd, trimStart + minClipDuration, timedAssetDuration);

  if (
    clip.baseDuration === timedAssetDuration &&
    clip.trimStart === trimStart &&
    clip.trimEnd === trimEnd
  ) {
    return clip;
  }

  return {
    ...clip,
    baseDuration: timedAssetDuration,
    trimStart,
    trimEnd,
  };
};

const canExtendClipBeyondCurrentBaseDuration = (asset?: MediaAsset) =>
  asset?.kind === 'image' || asset?.kind === 'other';

const getClipDuration = (clip: TimelineClip) => Math.max(minClipDuration, clip.trimEnd - clip.trimStart);

const canDropOnTrack = (asset: MediaAsset, track: TimelineTrack) => {
  if (track.disabled) {
    return false;
  }

  if (track.type === 'text') {
    return false;
  }

  if (track.type === 'audio') {
    return asset.kind === 'audio' || asset.kind === 'video';
  }

  return asset.kind === 'video' || asset.kind === 'image' || asset.kind === 'other';
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const nextTrackId = (tracks: TimelineTrack[], trackType: TimelineTrackType) => {
  const prefix = trackType === 'video' ? 'V' : trackType === 'audio' ? 'A' : 'T';
  const maxIndex = tracks
    .filter((track) => track.type === trackType)
    .map((track) => Number(track.id.replace(prefix, '')))
    .filter((index) => Number.isFinite(index))
    .reduce((currentMax, index) => Math.max(currentMax, index), 0);

  return `${prefix}${maxIndex + 1}`;
};

const App = () => {
  const [modal, modalContextHolder] = Modal.useModal();
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [tracks, setTracks] = useState<TimelineTrack[]>(defaultTracks());
  const [search, setSearch] = useState('');
  const [assetKindFilter, setAssetKindFilter] = useState<AssetKindFilter>('all');
  const [assetLayoutMode, setAssetLayoutMode] = useState<AssetLayoutMode>('grid');
  const [mediaBaseUrl, setMediaBaseUrl] = useState(guessMediaBaseUrl());
  const [uploading, setUploading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [selectedTimelineClipId, setSelectedTimelineClipId] = useState<string | null>(null);
  const [timelineClips, setTimelineClips] = useState<TimelineClip[]>([]);
  const [draggingAssetId, setDraggingAssetId] = useState<string | null>(null);
  const [draggingTrackId, setDraggingTrackId] = useState<string | null>(null);
  const [draggingTimelineClipId, setDraggingTimelineClipId] = useState<string | null>(null);
  const [trackContextMenu, setTrackContextMenu] = useState<TrackContextMenu | null>(null);
  const [assetContextMenu, setAssetContextMenu] = useState<AssetContextMenu | null>(null);
  const [clipContextMenu, setClipContextMenu] = useState<ClipContextMenu | null>(null);
  const [playheadSeconds, setPlayheadSeconds] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [timelineZoom, setTimelineZoom] = useState(defaultTimelineZoom);
  const [previewTab, setPreviewTab] = useState<PreviewTab>('player');
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('project');
  const [isPreviewFullscreen, setIsPreviewFullscreen] = useState(false);
  const [isResizingPreview, setIsResizingPreview] = useState(false);
  const [isDraggingPreview, setIsDraggingPreview] = useState(false);
  const [previewSnapState, setPreviewSnapState] = useState<PreviewSnapState>({ x: null, y: null });
  const [libraryPreviewScale, setLibraryPreviewScale] = useState(defaultPreviewScale);
  const [libraryPreviewPosition, setLibraryPreviewPosition] = useState({ x: 0, y: 0 });
  const [projectName, setProjectName] = useState('默认项目');
  const [assetsReady, setAssetsReady] = useState(false);
  const [projectReady, setProjectReady] = useState(false);
  const [saveState, setSaveState] = useState('未保存');
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [message, setMessage] = useState('素材库空着, 先传点东西进来');
  const fileMapRef = useRef(new Map<string, File>());
  const stagePanelRef = useRef<HTMLElement | null>(null);
  const previewStageRef = useRef<HTMLDivElement | null>(null);
  const previewFrameRef = useRef<HTMLDivElement | null>(null);
  const previewResizeSessionRef = useRef<PreviewResizeSession | null>(null);
  const previewMoveSessionRef = useRef<PreviewMoveSession | null>(null);
  const playheadSecondsRef = useRef(0);
  const playbackAnimationFrameRef = useRef<number | null>(null);
  const playbackStartTimeRef = useRef<number | null>(null);
  const playbackStartPlayheadRef = useRef(0);
  const timelineScrollRef = useRef<HTMLDivElement | null>(null);
  const timelineZoomAnchorRef = useRef<TimelineZoomAnchor | null>(null);
  const timelineClipResizeSessionRef = useRef<TimelineClipResizeSession | null>(null);
  const timelineClipDragSessionRef = useRef<TimelineClipDragSession | null>(null);
  const suppressTimelineClipClickRef = useRef<string | null>(null);
  const trackContextMenuRef = useRef<HTMLDivElement | null>(null);
  const assetContextMenuRef = useRef<HTMLDivElement | null>(null);
  const clipContextMenuRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const canvasPlayerRef = useRef<HTMLVideoElement | null>(null);
  const canvasPlayerAssetIdRef = useRef<string | null>(null);
  const canvasPlayerReadyRef = useRef(false);
  const hiddenVideoMapRef = useRef(new Map<string, HTMLVideoElement>());
  const hiddenImageMapRef = useRef(new Map<string, HTMLImageElement>());
  const filmstripCacheRef = useRef(new Map<string, string>());
  const [filmstripVersion, setFilmstripVersion] = useState(0);
  const timelineClipsRef = useRef<TimelineClip[]>([]);
  const assetMapRef = useRef<Map<string, MediaAsset>>(new Map());
  const trackMapRef = useRef<Map<string, TimelineTrack>>(new Map());
  const trackPriorityRef = useRef<Map<string, number>>(new Map());

  const resolvedMediaBaseUrl = useMemo(() => mediaBaseUrl.replace(/\/$/, ''), [mediaBaseUrl]);
  const assetMap = useMemo(() => new Map(assets.map((asset) => [asset.id, asset])), [assets]);
  const trackMap = useMemo(() => new Map(tracks.map((track) => [track.id, track])), [tracks]);
  const trackPriorityMap = useMemo(
    () => new Map(tracks.map((track, index) => [track.id, index])),
    [tracks],
  );

  const selectedTimelineClip = useMemo(
    () => timelineClips.find((clip) => clip.id === selectedTimelineClipId) ?? null,
    [selectedTimelineClipId, timelineClips],
  );

  const selectedTrack = selectedTimelineClip ? trackMap.get(selectedTimelineClip.trackId) ?? null : null;

  const selectedLibraryAsset = useMemo(
    () => assets.find((asset) => asset.id === selectedAssetId) ?? assets[0] ?? null,
    [assets, selectedAssetId],
  );

  const filteredAssets = useMemo(
    () =>
      assetKindFilter === 'all'
        ? assets
        : assets.filter((asset) => asset.kind === assetKindFilter),
    [assetKindFilter, assets],
  );

  const activePlaybackClips = useMemo(
    () =>
      timelineClips
        .slice()
        .filter((clip) => {
          const track = trackMap.get(clip.trackId);
          return track && !track.disabled && !(track.type === 'audio' && track.muted);
        })
        .filter((clip) => {
          const clipEnd = clip.offsetSeconds + getClipDuration(clip);
          return playheadSeconds >= clip.offsetSeconds && playheadSeconds <= clipEnd;
        })
        .sort((left, right) => {
          const leftPriority = trackPriorityMap.get(left.trackId) ?? Number.MAX_SAFE_INTEGER;
          const rightPriority = trackPriorityMap.get(right.trackId) ?? Number.MAX_SAFE_INTEGER;

          if (leftPriority !== rightPriority) {
            return rightPriority - leftPriority;
          }

          return left.offsetSeconds - right.offsetSeconds;
        }),
    [playheadSeconds, timelineClips, trackMap, trackPriorityMap],
  );

  const activePlaybackClip = activePlaybackClips.at(-1) ?? null;
  const activePlaybackAsset = activePlaybackClip ? assetMap.get(activePlaybackClip.assetId ?? '') ?? null : null;

  const activePlaybackVisualLayers: PlaybackVisualLayer[] = useMemo(
    () =>
      activePlaybackClips.flatMap((clip) => {
        const track = trackMap.get(clip.trackId);
        if (!track) return [];

        if (track.type === 'text') {
          return [
            {
              clip,
              track,
              trackPriority: trackPriorityMap.get(track.id) ?? Number.MAX_SAFE_INTEGER,
            } satisfies PlaybackVisualLayer,
          ];
        }

        const asset = assetMap.get(clip.assetId ?? '');

        if (!asset || (asset.kind !== 'image' && asset.kind !== 'video')) {
          return [];
        }

        return [
          {
            clip,
            asset,
            track,
            trackPriority: trackPriorityMap.get(track.id) ?? Number.MAX_SAFE_INTEGER,
          } satisfies PlaybackVisualLayer,
        ];
      }),
    [activePlaybackClips, assetMap, trackMap, trackPriorityMap],
  );

  const previewAsset =
    assetMap.get(selectedTimelineClip?.assetId ?? activePlaybackClip?.assetId ?? selectedLibraryAsset?.id ?? '') ??
    null;
  const previewTimelineClip = selectedTimelineClip ?? activePlaybackClip ?? null;
  const stagePreviewAsset =
    previewTab === 'player'
      ? activePlaybackAsset
      : previewAsset;
  const stagePreviewTitle =
    previewTab === 'player' && !stagePreviewAsset
      ? '当前时间点没有素材'
      : previewTab === 'player' && activePlaybackVisualLayers.length > 1
        ? `多轨合成预览 · ${activePlaybackVisualLayers.length} 层`
        : stagePreviewAsset?.title ?? '等待素材';
  const stagePreviewKindLabel =
    previewTab === 'player' && activePlaybackVisualLayers.length > 1
      ? '多轨叠加'
      : previewTab === 'player' && !stagePreviewAsset
        ? '空时间点'
      : stagePreviewAsset
        ? kindLabelMap[stagePreviewAsset.kind]
        : '空项目';
  const canResizePreviewAsset =
    previewAsset?.kind === 'image' || previewAsset?.kind === 'video' || selectedTrack?.type === 'text';
  const previewScalePercent = previewTimelineClip?.scalePercent ?? libraryPreviewScale;
  const previewPositionXPx = previewTimelineClip?.positionXPx ?? libraryPreviewPosition.x;
  const previewPositionYPx = previewTimelineClip?.positionYPx ?? libraryPreviewPosition.y;
  const previewRotationDegrees = previewTimelineClip?.rotationDegrees ?? 0;
  const previewFlipX = previewTimelineClip?.flipX ?? false;
  const previewScale = previewScalePercent / 100;
  const previewFrameTransform = `scale(${previewScale}) rotate(${previewRotationDegrees}deg) scaleX(${previewFlipX ? -1 : 1})`;
  const isPreviewTransformDefault =
    previewScalePercent === defaultPreviewScale &&
    previewPositionXPx === 0 &&
    previewPositionYPx === 0 &&
    previewRotationDegrees === 0 &&
    !previewFlipX;
  const hasClipInspectorTarget = Boolean(selectedTimelineClip && (previewAsset || selectedTrack?.type === 'text'));
  const hasEditorInspectorTarget = Boolean(canResizePreviewAsset);
  const showVerticalGuide = previewTab === 'editor' && canResizePreviewAsset && previewSnapState.x === 'center';
  const showHorizontalGuide = previewTab === 'editor' && canResizePreviewAsset && previewSnapState.y === 'center';

  const stats = useMemo(
    () => ({
      total: assets.length,
      videoCount: assets.filter((asset) => asset.kind === 'video').length,
      imageCount: assets.filter((asset) => asset.kind === 'image').length,
      totalSize: assets.reduce((sum, asset) => sum + asset.size, 0),
    }),
    [assets],
  );

  const projectDuration = useMemo(() => {
    const maxDuration = timelineClips.reduce((currentMax, clip) => {
      const clipEnd = clip.offsetSeconds + getClipDuration(clip);
      return Math.max(currentMax, clipEnd);
    }, 20);

    return Math.max(20, Math.ceil(maxDuration));
  }, [timelineClips]);

  const timelinePixelsPerSecond = basePixelsPerSecond * timelineZoom;
  const timelineTickStep = useMemo(() => {
    if (timelinePixelsPerSecond >= 84) {
      return 1;
    }

    if (timelinePixelsPerSecond >= 42) {
      return 2;
    }

    if (timelinePixelsPerSecond >= 24) {
      return 5;
    }

    return 10;
  }, [timelinePixelsPerSecond]);
  const canvasWidth = Math.max(projectDuration * timelinePixelsPerSecond, 880);
  const timelineSnapThresholdSeconds = snapThresholdPx / Math.max(timelinePixelsPerSecond, 1);
  const timelineScrollStyle = useMemo(
    () => ({ '--timeline-canvas-width': `${canvasWidth}px` }) as CSSProperties,
    [canvasWidth],
  );

  const refreshAssets = async (keyword = search) => {
    const url = `${apiBase}/assets${keyword.trim() ? `?search=${encodeURIComponent(keyword.trim())}` : ''}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error('素材列表读取失败');
    }

    const payload = (await response.json()) as AssetsResponse;
    setAssets(payload.items);
    setMediaBaseUrl(payload.mediaBaseUrl ?? guessMediaBaseUrl());
    setAssetsReady(true);
    setMessage(payload.items.length > 0 ? `共 ${payload.items.length} 个素材` : '没搜到素材');
  };

  const loadProject = async () => {
    const response = await fetch(`${apiBase}/project`);

    if (!response.ok) {
      throw new Error('项目读取失败');
    }

    const payload = (await response.json()) as ProjectResponse;
    setProjectName(payload.project.name);
    setTracks(payload.project.tracks.length > 0 ? payload.project.tracks : defaultTracks());
    setTimelineClips(payload.project.timelineClips);
    setPlayheadSeconds(payload.project.playheadSeconds);
    setLastSavedAt(payload.project.updatedAt);
    setSaveState('已保存');
    setProjectReady(true);
  };

  const saveProject = async (showFeedback = false) => {
    const payload: UpdateProjectPayload = {
      name: projectName,
      playheadSeconds,
      tracks,
      timelineClips,
    };

    setSaveState('保存中...');

    const response = await fetch(`${apiBase}/project`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error('项目保存失败');
    }

    const savedPayload = (await response.json()) as ProjectResponse;
    setLastSavedAt(savedPayload.project.updatedAt);
    setSaveState('已保存');

    if (showFeedback) {
      setMessage('项目已保存到后端');
    }
  };

  const runExport = async () => {
    setBusyId('export');
    setMessage('正在导出视频...');

    try {
      const visibleTracks = tracks.filter(
        (track) => !track.disabled && !(track.type === 'audio' && track.muted),
      );
      const trackClips = visibleTracks
        .map((track) => ({
          track,
          clips: timelineClips
            .filter((clip) => clip.trackId === track.id)
            .sort((left, right) => left.offsetSeconds - right.offsetSeconds),
        }))
        .filter((entry) => entry.clips.length > 0 && entry.track.type !== 'text');

      if (trackClips.length === 0) {
        throw new Error('没有可导出的素材片段');
      }

      const response = await fetch(`${apiBase}/project`);
      if (!response.ok) {
        throw new Error('无法获取项目数据');
      }
      await saveProject();

      const mediaBase = resolvedMediaBaseUrl;
      let exportedBuffer: Uint8Array | null = null;
      let exportedName = 'export.mp4';

      for (const { track, clips } of trackClips) {
        for (const clip of clips) {
          const asset = assetMap.get(clip.assetId ?? '');
          if (!asset) continue;

          const url = `${mediaBase}/${asset.files.transcoded ?? asset.files.original}`;
          const fileResponse = await fetch(url);
          if (!fileResponse.ok) continue;

          const blob = await fileResponse.blob();
          const file = new File([blob], asset.originalName, { type: asset.mimeType });

          setMessage(`正在导出 ${asset.title}...`);

          const trimmed = await transcodeToMp4(file, undefined);
          exportedBuffer = trimmed;
          exportedName = `${asset.title}-export.mp4`;
          break;
        }
        if (exportedBuffer) break;
      }

      if (!exportedBuffer) {
        throw new Error('导出失败：没有可处理的素材');
      }

      const downloadBlob = new Blob([exportedBuffer as BlobPart], { type: 'video/mp4' });
      const downloadUrl = URL.createObjectURL(downloadBlob);
      const anchor = document.createElement('a');
      anchor.href = downloadUrl;
      anchor.download = exportedName;
      anchor.click();
      URL.revokeObjectURL(downloadUrl);

      setMessage('导出完成，文件已下载');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '导出失败');
    } finally {
      setBusyId(null);
    }
  };

  useEffect(() => {
    void Promise.all([refreshAssets(), loadProject()]).catch((error) => {
      setMessage(error instanceof Error ? error.message : '初始化失败');
    });
  }, []);

  useEffect(() => {
    if (!assetsReady || !projectReady) {
      return;
    }

    if (assets.length === 0) {
      setSelectedAssetId(null);
      setTimelineClips([]);
      return;
    }

    if (!selectedAssetId || !assets.some((asset) => asset.id === selectedAssetId)) {
      setSelectedAssetId(assets[0].id);
    }

    setTimelineClips((currentClips) => {
      let changed = false;
      const nextClips = currentClips.flatMap((clip) => {
        const isTextClip = tracks.some((track) => track.id === clip.trackId && track.type === 'text');
        if (isTextClip) {
          return [clip];
        }

        const asset = assets.find((item) => item.id === clip.assetId);
        const hasTrack = tracks.some((track) => track.id === clip.trackId);

        if (!asset || !hasTrack) {
          changed = true;
          return [];
        }

        const syncedClip = syncClipWithAssetDuration(clip, asset);
        changed ||= syncedClip !== clip;
        return [syncedClip];
      });

      return changed ? nextClips : currentClips;
    });
  }, [assets, assetsReady, projectReady, selectedAssetId, tracks]);

  useEffect(() => {
    if (selectedTimelineClip && (selectedTimelineClip.assetId ?? null) !== selectedAssetId) {
      setSelectedAssetId(selectedTimelineClip.assetId ?? null);
    }
  }, [selectedTimelineClip, selectedAssetId]);

  useEffect(() => {
    setPlayheadSeconds((currentValue) => clamp(currentValue, 0, projectDuration));
  }, [projectDuration]);

  useEffect(() => {
    playheadSecondsRef.current = playheadSeconds;
  }, [playheadSeconds]);

  useEffect(() => {
    timelineClipsRef.current = timelineClips;
  }, [timelineClips]);

  useEffect(() => {
    const player = canvasPlayerRef.current;
    if (!player) return;

    const videoLayer = activePlaybackVisualLayers.find(
      (layer) => layer.asset?.kind === 'video',
    );

    if (!videoLayer?.asset) {
      canvasPlayerReadyRef.current = false;
      return;
    }

    const src = mediaUrl(videoLayer.asset.files.transcoded ?? videoLayer.asset.files.original);

    if (canvasPlayerAssetIdRef.current === videoLayer.asset.id && canvasPlayerReadyRef.current) {
      return;
    }

    canvasPlayerReadyRef.current = false;
    canvasPlayerAssetIdRef.current = videoLayer.asset.id;

    const onReady = () => {
      canvasPlayerReadyRef.current = true;
      player.removeEventListener('loadedmetadata', onReady);
    };
    player.addEventListener('loadedmetadata', onReady);
    player.src = src;

    return () => {
      player.removeEventListener('loadedmetadata', onReady);
    };
  }, [activePlaybackVisualLayers]);

  useEffect(() => {
    assetMapRef.current = assetMap;
  }, [assetMap]);

  useEffect(() => {
    trackMapRef.current = trackMap;
    trackPriorityRef.current = trackPriorityMap;
  }, [trackMap, trackPriorityMap]);

  const buildActiveLayers = (playhead: number): PlaybackVisualLayer[] => {
    const clips = timelineClipsRef.current;
    const aMap = assetMapRef.current;
    const tMap = trackMapRef.current;
    const tPriority = trackPriorityRef.current;

    const layers: PlaybackVisualLayer[] = [];

    const activeClips = clips.filter((clip) => {
      const clipEnd = clip.offsetSeconds + (clip.trimEnd - clip.trimStart);
      return playhead >= clip.offsetSeconds && playhead <= clipEnd;
    });

    activeClips
      .sort((a, b) => {
        const pa = tPriority.get(a.trackId) ?? 0;
        const pb = tPriority.get(b.trackId) ?? 0;
        if (pa !== pb) return pa - pb;
        return a.offsetSeconds - b.offsetSeconds;
      })
      .forEach((clip) => {
        const track = tMap.get(clip.trackId);
        if (!track) return;
        const asset = aMap.get(clip.assetId ?? '');
        layers.push({ clip, track, asset, trackPriority: tPriority.get(track.id) ?? 0 });
      });

    return layers;
  };

  const renderCanvasFrame = (canvas: HTMLCanvasElement, playhead: number) => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const container = canvas.parentElement;
    if (container) {
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const layers = buildActiveLayers(playhead);

    layers.forEach((layer) => {
      const { clip, asset, track } = layer;
      if (track.disabled || (track.type === 'audio' && track.muted)) return;
      if (track.type !== 'text' && !asset) return;
      if (asset && asset.kind !== 'video' && asset.kind !== 'image') return;

      const cx = canvas.width / 2 + (clip.positionXPx ?? 0);
      const cy = canvas.height / 2 + (clip.positionYPx ?? 0);
      const scale = (clip.scalePercent ?? 100) / 100;
      const rotation = (clip.rotationDegrees ?? 0) * Math.PI / 180;
      const flipX = clip.flipX ?? false;

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rotation);
      ctx.scale(flipX ? -scale : scale, scale);

      if (track.type === 'text') {
        const text = clip.text ?? '文字';
        const fontSize = clip.fontSize ?? 48;
        const fontColor = clip.fontColor ?? '#ffffff';
        ctx.font = `${fontSize}px sans-serif`;
        ctx.fillStyle = fontColor;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, 0, 0);
      } else if (asset) {
        const sourceTime = clip.trimStart + (playhead - clip.offsetSeconds);
        const clampedTime = Math.max(0, Math.min(sourceTime, clip.trimEnd));

        if (asset.kind === 'video') {
          const player = canvasPlayerRef.current;
          if (player && canvasPlayerReadyRef.current && canvasPlayerAssetIdRef.current === asset.id) {
            player.currentTime = clampedTime;
            const vw = player.videoWidth || 320;
            const vh = player.videoHeight || 180;
            ctx.drawImage(player, -vw / 2, -vh / 2, vw, vh);
          }
        } else if (asset.kind === 'image') {
          const img = hiddenImageMapRef.current.get(asset.id);
          if (img && img.complete) {
            ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
          }
        }
      }

      ctx.restore();
    });
  };

  useEffect(() => {
    const anchor = timelineZoomAnchorRef.current;
    const timelineScroll = timelineScrollRef.current;

    if (!anchor || !timelineScroll) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      timelineScroll.scrollLeft = Math.max(0, anchor.contentOffset * anchor.scaleRatio - anchor.viewportOffset);
      timelineZoomAnchorRef.current = null;
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [timelineZoom, canvasWidth]);

  useEffect(() => {
    if (!isPlaying) {
      playbackStartTimeRef.current = null;

      if (playbackAnimationFrameRef.current !== null) {
        window.cancelAnimationFrame(playbackAnimationFrameRef.current);
        playbackAnimationFrameRef.current = null;
      }

      return;
    }

    playbackStartPlayheadRef.current = playheadSecondsRef.current;

    const step = (timestamp: number) => {
      if (playbackStartTimeRef.current === null) {
        playbackStartTimeRef.current = timestamp;
      }

      const elapsedSeconds = (timestamp - playbackStartTimeRef.current) / 1000;
      const nextValue = Number((playbackStartPlayheadRef.current + elapsedSeconds).toFixed(3));

      if (nextValue >= projectDuration) {
        setPlayheadSeconds(projectDuration);
        setIsPlaying(false);
        playbackAnimationFrameRef.current = null;
        return;
      }

      setPlayheadSeconds(nextValue);

      const canvas = canvasRef.current;
      if (canvas) {
        renderCanvasFrame(canvas, nextValue);
      }

      playbackAnimationFrameRef.current = window.requestAnimationFrame(step);
    };

    playbackAnimationFrameRef.current = window.requestAnimationFrame(step);

    return () => {
      if (playbackAnimationFrameRef.current !== null) {
        window.cancelAnimationFrame(playbackAnimationFrameRef.current);
        playbackAnimationFrameRef.current = null;
      }
      playbackStartTimeRef.current = null;
    };
  }, [isPlaying, projectDuration]);

  useEffect(() => {
    if (isPlaying) return;

    const canvas = canvasRef.current;
    if (canvas) {
      renderCanvasFrame(canvas, playheadSeconds);
    }
  }, [playheadSeconds, isPlaying]);

  useEffect(() => {
    const cancelledRef = { current: false };

    const generate = async () => {
      for (const clip of timelineClips) {
        if (cancelledRef.current) return;

        const asset = assetMap.get(clip.assetId ?? '');
        if (!asset || asset.kind !== 'video') continue;

        const cacheKey = `${clip.id}-${clip.trimStart}-${clip.trimEnd}`;
        if (filmstripCacheRef.current.has(cacheKey)) continue;

        const video = hiddenVideoMapRef.current.get(asset.id);
        if (!video || video.readyState < 1) continue;

        const duration = clip.trimEnd - clip.trimStart;
        const stripWidth = Math.max(1, Math.ceil(duration)) * 60;
        const stripHeight = 40;

        const offscreen = document.createElement('canvas');
        offscreen.width = stripWidth;
        offscreen.height = stripHeight;
        const ctx = offscreen.getContext('2d');
        if (!ctx) continue;

        video.currentTime = clip.trimStart;
        video.playbackRate = Math.min(4, duration);
        video.muted = true;

        const hasVFC = typeof video.requestVideoFrameCallback === 'function';

        await new Promise<void>((finish) => {
          let done = false;
          let intervalId: ReturnType<typeof setInterval> | null = null;

          const cleanup = () => {
            if (done) return;
            done = true;
            video.pause();
            video.removeEventListener('ended', onEnded);
            if (intervalId !== null) clearInterval(intervalId);
            finish();
          };

          const onFrame = () => {
            if (cancelledRef.current || done) {
              cleanup();
              return;
            }

            const mediaTime = video.currentTime;
            if (mediaTime >= clip.trimEnd || video.ended || video.paused) {
              cleanup();
              return;
            }

            const relTime = mediaTime - clip.trimStart;
            const xPos = (relTime / duration) * stripWidth;

            const vw = video.videoWidth;
            const vh = video.videoHeight;
            const drawH = stripHeight;
            const drawW = drawH * (vw / vh);
            const sx = (vw - (stripHeight / vh) * vw) / 2;

            ctx.drawImage(
              video,
              sx, 0, vw - sx * 2, vh,
              xPos - drawW / 2, 0, drawW, drawH,
            );

            if (hasVFC) {
              video.requestVideoFrameCallback(onFrame);
            }
          };

          const onEnded = () => cleanup();

          video.addEventListener('ended', onEnded, { once: true });

          if (hasVFC) {
            video.requestVideoFrameCallback(onFrame);
          } else {
            intervalId = setInterval(onFrame, 1000 / 15);
          }

          video.play().catch(() => cleanup());
        });

        video.playbackRate = 1;
        filmstripCacheRef.current.set(cacheKey, offscreen.toDataURL());
      }
    };

    void generate();

    return () => {
      cancelledRef.current = true;
    };
  }, [timelineClips, assetMap, filmstripVersion]);

  useEffect(() => {
    const handlePointerMove = (event: globalThis.MouseEvent) => {
      const session = timelineClipDragSessionRef.current;

      if (!session) {
        return;
      }

      const deltaSeconds = Number(((event.clientX - session.startX) / timelinePixelsPerSecond).toFixed(2));
      const rawOffsetSeconds = Number(clamp(session.startOffsetSeconds + deltaSeconds, 0, projectDuration).toFixed(2));
      const snapCandidates = [
        Math.round(rawOffsetSeconds),
        Math.round(rawOffsetSeconds + session.clipDuration) - session.clipDuration,
      ];

      timelineClips
        .filter((clip) => clip.trackId === session.trackId && clip.id !== session.clipId)
        .forEach((clip) => {
          const clipEnd = clip.offsetSeconds + getClipDuration(clip);
          snapCandidates.push(clip.offsetSeconds, clipEnd, clip.offsetSeconds - session.clipDuration, clipEnd - session.clipDuration);
        });

      let nextOffsetSeconds = rawOffsetSeconds;
      let nearestSnapDistance = timelineSnapThresholdSeconds + 1;

      snapCandidates.forEach((candidate) => {
        const boundedCandidate = clamp(candidate, 0, projectDuration);
        const distance = Math.abs(boundedCandidate - rawOffsetSeconds);

        if (distance <= timelineSnapThresholdSeconds && distance < nearestSnapDistance) {
          nextOffsetSeconds = Number(boundedCandidate.toFixed(2));
          nearestSnapDistance = distance;
        }
      });

      if (!session.moved && Math.abs(event.clientX - session.startX) >= 3) {
        session.moved = true;
      }

      updateTimelineClip(session.clipId, {
        offsetSeconds: nextOffsetSeconds,
      });
    };

    const handlePointerUp = () => {
      const session = timelineClipDragSessionRef.current;

      if (!session) {
        return;
      }

      const movedClip = timelineClips.find((clip) => clip.id === session.clipId);

      if (session.moved) {
        suppressTimelineClipClickRef.current = session.clipId;
      }

      timelineClipDragSessionRef.current = null;
      setDraggingTimelineClipId(null);

      if (!movedClip || !session.moved) {
        return;
      }

      setMessage(`已把片段起点拖到 ${formatSeconds(movedClip.offsetSeconds)}`);
    };

    window.addEventListener('mousemove', handlePointerMove);
    window.addEventListener('mouseup', handlePointerUp);

    return () => {
      window.removeEventListener('mousemove', handlePointerMove);
      window.removeEventListener('mouseup', handlePointerUp);
    };
  }, [projectDuration, timelineClips, timelinePixelsPerSecond, timelineSnapThresholdSeconds]);

  useEffect(() => {
    const handlePointerMove = (event: globalThis.MouseEvent) => {
      const session = timelineClipResizeSessionRef.current;

      if (!session) {
        return;
      }

      const deltaSeconds = Number(((event.clientX - session.startX) / timelinePixelsPerSecond).toFixed(2));
      const sourceClip = timelineClips.find((clip) => clip.id === session.clipId);

      if (!sourceClip) {
        return;
      }

      if (session.edge === 'start') {
        const maxDelta = session.startTrimEnd - session.startTrimStart - minClipDuration;
        const minDelta = -Math.min(session.startOffsetSeconds, session.startTrimStart);
        const boundedDelta = clamp(deltaSeconds, minDelta, maxDelta);

        updateTimelineClip(session.clipId, {
          offsetSeconds: Number((session.startOffsetSeconds + boundedDelta).toFixed(2)),
          trimStart: Number((session.startTrimStart + boundedDelta).toFixed(2)),
        });
        return;
      }

      const currentDuration = session.startTrimEnd - session.startTrimStart;
      const minDelta = minClipDuration - currentDuration;
      const asset = assetMap.get(sourceClip.assetId ?? '');

      if (canExtendClipBeyondCurrentBaseDuration(asset)) {
        const nextTrimEnd = Number(Math.max(session.startTrimStart + minClipDuration, session.startTrimEnd + deltaSeconds).toFixed(2));
        const nextBaseDuration = Number(Math.max(sourceClip.baseDuration, nextTrimEnd).toFixed(2));

        updateTimelineClip(session.clipId, {
          trimEnd: nextTrimEnd,
          baseDuration: nextBaseDuration,
        });
        return;
      }

      const maxDelta = sourceClip.baseDuration - session.startTrimEnd;
      const boundedDelta = clamp(deltaSeconds, minDelta, maxDelta);

      updateTimelineClip(session.clipId, {
        trimEnd: Number((session.startTrimEnd + boundedDelta).toFixed(2)),
      });
    };

    const handlePointerUp = () => {
      const session = timelineClipResizeSessionRef.current;

      if (!session) {
        return;
      }

      const resizedClip = timelineClips.find((clip) => clip.id === session.clipId);
      timelineClipResizeSessionRef.current = null;

      if (!resizedClip) {
        return;
      }

      setMessage(`已调整片段时长到 ${formatSeconds(getClipDuration(resizedClip))}`);
    };

    window.addEventListener('mousemove', handlePointerMove);
    window.addEventListener('mouseup', handlePointerUp);

    return () => {
      window.removeEventListener('mousemove', handlePointerMove);
      window.removeEventListener('mouseup', handlePointerUp);
    };
  }, [assetMap, timelineClips, timelinePixelsPerSecond]);

  useEffect(() => {
    const closeMenus = () => {
      setTrackContextMenu(null);
      setAssetContextMenu(null);
      setClipContextMenu(null);
    };

    window.addEventListener('click', closeMenus);
    window.addEventListener('resize', closeMenus);

    return () => {
      window.removeEventListener('click', closeMenus);
      window.removeEventListener('resize', closeMenus);
    };
  }, []);

  useLayoutEffect(() => {
    if (!trackContextMenu || !trackContextMenuRef.current) {
      return;
    }

    const { offsetWidth, offsetHeight } = trackContextMenuRef.current;
    const nextPosition = getFloatingMenuPosition(trackContextMenu.x, trackContextMenu.y, offsetWidth, offsetHeight);

    if (nextPosition.x !== trackContextMenu.x || nextPosition.y !== trackContextMenu.y) {
      setTrackContextMenu((currentValue) =>
        currentValue
          ? {
              ...currentValue,
              x: nextPosition.x,
              y: nextPosition.y,
            }
          : null,
      );
    }
  }, [trackContextMenu]);

  useLayoutEffect(() => {
    if (!assetContextMenu || !assetContextMenuRef.current) {
      return;
    }

    const { offsetWidth, offsetHeight } = assetContextMenuRef.current;
    const nextPosition = getFloatingMenuPosition(assetContextMenu.x, assetContextMenu.y, offsetWidth, offsetHeight);

    if (nextPosition.x !== assetContextMenu.x || nextPosition.y !== assetContextMenu.y) {
      setAssetContextMenu((currentValue) =>
        currentValue
          ? {
              ...currentValue,
              x: nextPosition.x,
              y: nextPosition.y,
            }
          : null,
      );
    }
  }, [assetContextMenu]);

  useLayoutEffect(() => {
    if (!clipContextMenu || !clipContextMenuRef.current) {
      return;
    }

    const { offsetWidth, offsetHeight } = clipContextMenuRef.current;
    const nextPosition = getFloatingMenuPosition(clipContextMenu.x, clipContextMenu.y, offsetWidth, offsetHeight);

    if (nextPosition.x !== clipContextMenu.x || nextPosition.y !== clipContextMenu.y) {
      setClipContextMenu((currentValue) =>
        currentValue
          ? {
              ...currentValue,
              x: nextPosition.x,
              y: nextPosition.y,
            }
          : null,
      );
    }
  }, [clipContextMenu]);

  useEffect(() => {
    if (!projectReady) {
      return;
    }

    if (isPlaying) {
      return;
    }

    setSaveState('待保存');

    const timer = window.setTimeout(() => {
      void saveProject().catch((error) => {
        setSaveState('保存失败');
        setMessage(error instanceof Error ? error.message : '项目保存失败');
      });
    }, 800);

    return () => {
      window.clearTimeout(timer);
    };
  }, [isPlaying, playheadSeconds, projectName, projectReady, timelineClips, tracks]);

  useEffect(() => {
    const syncFullscreenState = () => {
      const panel = stagePanelRef.current;
      const activeFullscreenElement = document.fullscreenElement;
      setIsPreviewFullscreen(Boolean(panel && activeFullscreenElement && panel.contains(activeFullscreenElement)));
    };

    document.addEventListener('fullscreenchange', syncFullscreenState);
    syncFullscreenState();

    return () => {
      document.removeEventListener('fullscreenchange', syncFullscreenState);
    };
  }, []);

  const mediaUrl = (relativePath?: string) =>
    relativePath ? `${resolvedMediaBaseUrl}/${relativePath}` : '';

  const renderStageAsset = (
    asset: MediaAsset,
    options?: {
      clip?: TimelineClip | null;
      editable?: boolean;
      controls?: boolean;
    },
  ) => {
    const clip = options?.clip ?? null;
    const editable = Boolean(options?.editable);
    const controls = Boolean(options?.controls);
    const scalePercent = clip?.scalePercent ?? libraryPreviewScale;
    const positionXPx = clip?.positionXPx ?? libraryPreviewPosition.x;
    const positionYPx = clip?.positionYPx ?? libraryPreviewPosition.y;
    const rotationDegrees = clip?.rotationDegrees ?? 0;
    const flipX = clip?.flipX ?? false;
    const frameTransform = `scale(${scalePercent / 100}) rotate(${rotationDegrees}deg) scaleX(${flipX ? -1 : 1})`;
    const editorMode = editable && previewTab === 'editor';

    if (asset.kind === 'image') {
      return (
        <div className={`stage-media-shell${editorMode ? ' editor-mode' : ''}`}>
          {editorMode ? (
            <div className="stage-editor-overlay" aria-hidden="true">
              <div
                className={`stage-safe-area${previewSnapState.x && previewSnapState.x !== 'center' ? ' active-x' : ''}${previewSnapState.y && previewSnapState.y !== 'center' ? ' active-y' : ''}`}
              />
              {showVerticalGuide ? <div className="stage-guide vertical" /> : null}
              {showHorizontalGuide ? <div className="stage-guide horizontal" /> : null}
            </div>
          ) : null}
          <div
            className={`stage-media-positioner${editorMode ? ' editor-mode' : ''}`}
            style={{ transform: `translate(${positionXPx}px, ${positionYPx}px)` }}
          >
            <div
              ref={editorMode ? previewFrameRef : undefined}
              className={`stage-media-frame${editorMode ? ' editor-mode' : ''}${editorMode && isResizingPreview ? ' resizing' : ''}`}
              style={{ transform: frameTransform }}
              onMouseDown={editorMode ? startPreviewMove : undefined}
            >
              <img src={mediaUrl(asset.files.original)} alt={asset.title} className="stage-media" />
              {editorMode ? (
                <button
                  type="button"
                  className="stage-resize-handle"
                  onMouseDown={startPreviewResize}
                  aria-label="拖拽缩放素材"
                />
              ) : null}
            </div>
          </div>
        </div>
      );
    }

    if (asset.kind === 'video') {
      return (
        <div className={`stage-media-shell${editorMode ? ' editor-mode' : ''}`}>
          {editorMode ? (
            <div className="stage-editor-overlay" aria-hidden="true">
              <div
                className={`stage-safe-area${previewSnapState.x && previewSnapState.x !== 'center' ? ' active-x' : ''}${previewSnapState.y && previewSnapState.y !== 'center' ? ' active-y' : ''}`}
              />
              {showVerticalGuide ? <div className="stage-guide vertical" /> : null}
              {showHorizontalGuide ? <div className="stage-guide horizontal" /> : null}
            </div>
          ) : null}
          <div
            className={`stage-media-positioner${editorMode ? ' editor-mode' : ''}`}
            style={{ transform: `translate(${positionXPx}px, ${positionYPx}px)` }}
          >
            <div
              ref={editorMode ? previewFrameRef : undefined}
              className={`stage-media-frame${editorMode ? ' editor-mode' : ''}${editorMode && isResizingPreview ? ' resizing' : ''}`}
              style={{ transform: frameTransform }}
              onMouseDown={editorMode ? startPreviewMove : undefined}
            >
              <video
                src={mediaUrl(asset.files.transcoded ?? asset.files.original)}
                className="stage-media"
                controls={controls}
              />
              {editorMode ? (
                <button
                  type="button"
                  className="stage-resize-handle"
                  onMouseDown={startPreviewResize}
                  aria-label="拖拽缩放素材"
                />
              ) : null}
            </div>
          </div>
        </div>
      );
    }

    if (asset.kind === 'audio') {
      return <div className="stage-placeholder">音频素材, 已经可以扔进 A 轨</div>;
    }

    return <div className="stage-placeholder">文件素材可管理, 但不直接预览</div>;
  };

  const renderTextOverlay = (clip: TimelineClip) => {
    const text = clip.text ?? '文字';
    const fontSize = clip.fontSize ?? 48;
    const fontColor = clip.fontColor ?? '#ffffff';
    const scalePercent = clip.scalePercent ?? 100;
    const positionXPx = clip.positionXPx ?? 0;
    const positionYPx = clip.positionYPx ?? 0;
    const rotationDegrees = clip.rotationDegrees ?? 0;
    const flipX = clip.flipX ?? false;
    const frameTransform = `scale(${scalePercent / 100}) rotate(${rotationDegrees}deg) scaleX(${flipX ? -1 : 1})`;

    return (
      <div className="stage-text-overlay">
        <div
          className="stage-media-positioner"
          style={{ transform: `translate(${positionXPx}px, ${positionYPx}px)` }}
        >
          <div
            className="stage-media-frame"
            style={{ transform: frameTransform }}
          >
            <span
              className="stage-text-content"
              style={{
                fontSize: `${fontSize}px`,
                color: fontColor,
              }}
            >
              {text}
            </span>
          </div>
        </div>
      </div>
    );
  };

  const getNextTrackOffset = (trackId: TimelineTrackId) =>
    timelineClips
      .filter((clip) => clip.trackId === trackId)
      .reduce((currentMax, clip) => Math.max(currentMax, clip.offsetSeconds + getClipDuration(clip) + 0.5), 0);

  const createTimelineClip = (asset: MediaAsset, track: TimelineTrack) => {
    if (!canDropOnTrack(asset, track)) {
      setMessage(`素材 ${kindLabelMap[asset.kind]} 不能丢到 ${track.label}`);
      return;
    }

    const duration = getInitialClipDuration(asset);
    const baseDuration = getAssetBaseDuration(asset);
    const createdClip: TimelineClip = {
      id: crypto.randomUUID(),
      assetId: asset.id,
      trackId: track.id,
      offsetSeconds: getNextTrackOffset(track.id),
      trimStart: 0,
      trimEnd: duration,
      baseDuration,
      scalePercent: defaultPreviewScale,
      positionXPx: 0,
      positionYPx: 0,
      rotationDegrees: 0,
      flipX: false,
    };

    setTimelineClips((currentClips) => [...currentClips, createdClip]);
    setSelectedTimelineClipId(createdClip.id);
    setSelectedAssetId(asset.id);
    setMessage(`已把 ${asset.title} 丢进 ${track.label}`);
  };

  const createTrack = (trackType: TimelineTrackType) => {
    const id = nextTrackId(tracks, trackType);
    const createdTrack: TimelineTrack = {
      id,
      label: id,
      type: trackType,
      muted: false,
      disabled: false,
    };

    setTracks((currentTracks) => [...currentTracks, createdTrack]);
    setMessage(`新增${trackTypeLabelMap[trackType]} ${id}`);
  };

  const createTextClip = (track: TimelineTrack) => {
    const createdClip: TimelineClip = {
      id: crypto.randomUUID(),
      trackId: track.id,
      offsetSeconds: getNextTrackOffset(track.id),
      trimStart: 0,
      trimEnd: 5,
      baseDuration: 5,
      text: '输入文字',
      fontSize: 48,
      fontColor: '#ffffff',
    };

    setTimelineClips((currentClips) => [...currentClips, createdClip]);
    setSelectedTimelineClipId(createdClip.id);
    setSelectedAssetId(null);
    setMessage(`已在 ${track.label} 创建文本片段`);
  };

  const updateTrack = (trackId: TimelineTrackId, updater: (track: TimelineTrack) => TimelineTrack) => {
    setTracks((currentTracks) =>
      currentTracks.map((track) => (track.id === trackId ? updater(track) : track)),
    );
  };

  const renameTrack = (track: TimelineTrack) => {
    const nextLabel = window.prompt('轨道新名称', track.label)?.trim();

    if (!nextLabel) {
      return;
    }

    updateTrack(track.id, (currentTrack) => ({
      ...currentTrack,
      label: nextLabel,
    }));
    setMessage(`${track.label} 已重命名为 ${nextLabel}`);
  };

  const deleteTrack = (track: TimelineTrack) => {
    const clipCount = timelineClips.filter((clip) => clip.trackId === track.id).length;
    modal.confirm({
      title: `删除 ${track.label}?`,
      content: `这会同时删除该轨道上的 ${clipCount} 个片段`,
      okText: '删除',
      cancelText: '取消',
      okButtonProps: {
        danger: true,
      },
      centered: true,
      onOk: () => {
        setTracks((currentTracks) => currentTracks.filter((currentTrack) => currentTrack.id !== track.id));
        setTimelineClips((currentClips) => currentClips.filter((clip) => clip.trackId !== track.id));

        if (selectedTimelineClip?.trackId === track.id) {
          setSelectedTimelineClipId(null);
        }

        setMessage(`${track.label} 和它的片段已经删掉`);
      },
    });
  };

  const toggleTrackMuted = (track: TimelineTrack) => {
    updateTrack(track.id, (currentTrack) => ({
      ...currentTrack,
      muted: !currentTrack.muted,
    }));
    setMessage(`${track.label} 已${track.muted ? '取消静音' : '静音'}`);
  };

  const toggleTrackDisabled = (track: TimelineTrack) => {
    updateTrack(track.id, (currentTrack) => ({
      ...currentTrack,
      disabled: !currentTrack.disabled,
    }));
    setMessage(`${track.label} 已${track.disabled ? '启用' : '禁用'}`);
  };

  const moveTrack = (fromTrackId: TimelineTrackId, toTrackId: TimelineTrackId) => {
    if (fromTrackId === toTrackId) {
      return;
    }

    setTracks((currentTracks) => {
      const fromIndex = currentTracks.findIndex((track) => track.id === fromTrackId);
      const toIndex = currentTracks.findIndex((track) => track.id === toTrackId);

      if (fromIndex === -1 || toIndex === -1) {
        return currentTracks;
      }

      const nextTracks = [...currentTracks];
      const [movedTrack] = nextTracks.splice(fromIndex, 1);
      nextTracks.splice(toIndex, 0, movedTrack);
      return nextTracks;
    });
    setMessage('轨道顺序已调整');
  };

  const handleUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = event.target.files;

    if (!selectedFiles?.length) {
      return;
    }

    const files = Array.from(selectedFiles);
    setUploading(true);
    setMessage(`正在分析并上传 ${files.length} 个素材...`);

    try {
      const durations = await Promise.all(
        files.map((file) => {
          if (file.type.startsWith('video/') || file.type.startsWith('audio/')) {
            return computeDuration(file).catch(() => undefined);
          }
          return Promise.resolve(undefined);
        }),
      );

      for (const [index, file] of files.entries()) {
        const formData = new FormData();
        formData.append('files', file);
        formData.append('durationSeconds', String(durations[index] ?? ''));

        const response = await fetch(`${apiBase}/assets/upload`, {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          throw new Error('上传失败');
        }

        const payload = (await response.json()) as AssetsResponse;
        const createdAsset = payload.items[0];

        if (createdAsset) {
          fileMapRef.current.set(createdAsset.id, file);
        }
      }

      await refreshAssets();
      setMessage('上传好了, 时间线这下不空了');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '上传失败');
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  };

  const runAssetJob = async (assetId: string, pathName: 'thumbnail' | 'transcode') => {
    setBusyId(assetId);
    setMessage(pathName === 'thumbnail' ? '正在生成缩略图...' : '正在转码...');

    try {
      let file = fileMapRef.current.get(assetId);

      if (!file) {
        const asset = assets.find((item) => item.id === assetId);
        if (!asset) {
          throw new Error('素材不存在');
        }
        const url = mediaUrl(asset.files.original);
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error('无法获取原始文件');
        }
        const blob = await response.blob();
        file = new File([blob], asset.originalName, { type: asset.mimeType });
        fileMapRef.current.set(assetId, file);
      }

      if (pathName === 'thumbnail') {
        const thumbnailBlob = await generateThumbnail(file, 1);
        const formData = new FormData();
        formData.append('files', thumbnailBlob, 'thumbnail.jpg');
        const response = await fetch(`${apiBase}/assets/${assetId}/thumbnail`, {
          method: 'POST',
          body: formData,
        });
        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { message?: string } | null;
          throw new Error(payload?.message ?? '缩略图生成失败');
        }
        const payload = (await response.json()) as AssetResponse;
        setMediaBaseUrl(payload.mediaBaseUrl ?? guessMediaBaseUrl());
        await refreshAssets();
        setMessage('缩略图搞定了');
      } else {
        const result = await transcodeToMp4(file, (progress) => {
          if (Math.round(progress * 100) % 20 === 0) {
            setMessage(`转码中... ${Math.round(progress * 100)}%`);
          }
        });
        const formData = new FormData();
        formData.append('files', new Blob([result as BlobPart], { type: 'video/mp4' }), 'transcoded.mp4');
        const response = await fetch(`${apiBase}/assets/${assetId}/transcode`, {
          method: 'POST',
          body: formData,
        });
        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { message?: string } | null;
          throw new Error(payload?.message ?? '转码失败');
        }
        const payload = (await response.json()) as AssetResponse;
        setMediaBaseUrl(payload.mediaBaseUrl ?? guessMediaBaseUrl());
        await refreshAssets();
        setMessage('转码搞定了');
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '处理失败');
    } finally {
      setBusyId(null);
    }
  };

  const deleteLibraryAsset = (asset: MediaAsset) => {
    const clipCount = timelineClips.filter((clip) => clip.assetId === asset.id).length;
    const shouldClearSelectedAsset = selectedAssetId === asset.id;
    const shouldClearSelectedClip = selectedTimelineClip?.assetId === asset.id;
    modal.confirm({
      title: `删除素材 ${asset.title}?`,
      content: clipCount > 0 ? `这会同时删掉时间线里引用它的 ${clipCount} 个片段` : '删除后不会出现在素材库里',
      okText: '删除',
      cancelText: '取消',
      okButtonProps: {
        danger: true,
      },
      centered: true,
      onOk: async () => {
        const response = await fetch(`${apiBase}/assets/${asset.id}`, {
          method: 'DELETE',
        });

        if (!response.ok) {
          throw new Error('素材删除失败');
        }

        setAssetContextMenu(null);
        await Promise.all([refreshAssets(), loadProject()]);
        if (shouldClearSelectedAsset) {
          setSelectedAssetId(null);
        }
        if (shouldClearSelectedClip) {
          setSelectedTimelineClipId(null);
        }
        setMessage(`素材 ${asset.title} 已删除`);
      },
    });
  };

  const updatePlayheadByPointer = (event: MouseEvent<HTMLElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const nextSeconds = (event.clientX - rect.left) / timelinePixelsPerSecond;
    setPlayheadSeconds(clamp(Number(nextSeconds.toFixed(2)), 0, projectDuration));
  };

  const applyTimelineZoom = (nextZoom: number, anchorClientX?: number) => {
    const boundedZoom = clamp(Number(nextZoom.toFixed(3)), minTimelineZoom, maxTimelineZoom);

    if (boundedZoom === timelineZoom) {
      return;
    }

    const timelineScroll = timelineScrollRef.current;

    if (timelineScroll) {
      const rect = timelineScroll.getBoundingClientRect();
      const viewportOffset =
        typeof anchorClientX === 'number' ? clamp(anchorClientX - rect.left, 0, rect.width) : rect.width / 2;

      timelineZoomAnchorRef.current = {
        scaleRatio: boundedZoom / timelineZoom,
        viewportOffset,
        contentOffset: timelineScroll.scrollLeft + viewportOffset,
      };
    }

    setTimelineZoom(boundedZoom);
  };

  const handleTimelineWheel = (event: WheelEvent<HTMLDivElement>) => {
    if (!event.ctrlKey && !event.metaKey) {
      return;
    }

    event.preventDefault();

    const dominantDelta = Math.abs(event.deltaY) > Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
    const nextZoom = timelineZoom * Math.exp(-dominantDelta * 0.0035);
    applyTimelineZoom(nextZoom, event.clientX);
  };

  const handleAssetDrop = (track: TimelineTrack, event: DragEvent<HTMLElement>) => {
    event.preventDefault();

    if (track.type === 'text') {
      createTextClip(track);
      return;
    }

    const assetId = event.dataTransfer.getData('text/asset-id');
    const asset = assetMap.get(assetId);
    setDraggingAssetId(null);

    if (!asset) {
      return;
    }

    createTimelineClip(asset, track);
  };

  const startTimelineClipResize = (
    clip: TimelineClip,
    edge: TimelineClipResizeEdge,
    event: MouseEvent<HTMLSpanElement>,
  ) => {
    event.preventDefault();
    event.stopPropagation();

    timelineClipResizeSessionRef.current = {
      clipId: clip.id,
      edge,
      startX: event.clientX,
      startTrimStart: clip.trimStart,
      startTrimEnd: clip.trimEnd,
      startOffsetSeconds: clip.offsetSeconds,
    };
    setSelectedTimelineClipId(clip.id);
    setSelectedAssetId(clip.assetId ?? null);
  };

  const startTimelineClipDrag = (clip: TimelineClip, event: MouseEvent<HTMLButtonElement>) => {
    const target = event.target as HTMLElement | null;

    if (target?.closest('.timeline-clip-resize-handle')) {
      return;
    }

    event.preventDefault();

    timelineClipDragSessionRef.current = {
      clipId: clip.id,
      clipDuration: getClipDuration(clip),
      trackId: clip.trackId,
      startX: event.clientX,
      startOffsetSeconds: clip.offsetSeconds,
      moved: false,
    };
    setDraggingTimelineClipId(clip.id);
    setSelectedTimelineClipId(clip.id);
    setSelectedAssetId(clip.assetId ?? null);
  };

  const updateTimelineClip = (clipId: string, patch: Partial<TimelineClip>) => {
    if (!clipId) {
      return;
    }

    setTimelineClips((currentClips) =>
      currentClips.map((clip) => {
        if (clip.id !== clipId) {
          return clip;
        }

        const nextClip = { ...clip, ...patch };
        const boundedTrimStart = clamp(nextClip.trimStart, 0, nextClip.baseDuration - minClipDuration);
        const boundedTrimEnd = clamp(
          nextClip.trimEnd,
          boundedTrimStart + minClipDuration,
          nextClip.baseDuration,
        );

        return {
          ...nextClip,
          offsetSeconds: clamp(nextClip.offsetSeconds, 0, projectDuration),
          trimStart: boundedTrimStart,
          trimEnd: boundedTrimEnd,
          scalePercent: clamp(nextClip.scalePercent ?? defaultPreviewScale, 20, 200),
          positionXPx: clamp(nextClip.positionXPx ?? 0, -maxPreviewOffsetPx, maxPreviewOffsetPx),
          positionYPx: clamp(nextClip.positionYPx ?? 0, -maxPreviewOffsetPx, maxPreviewOffsetPx),
          rotationDegrees: clamp(nextClip.rotationDegrees ?? 0, -180, 180),
          flipX: Boolean(nextClip.flipX),
          fontSize: nextClip.fontSize != null ? clamp(nextClip.fontSize, 8, 200) : undefined,
        };
      }),
    );
  };

  const updateSelectedClip = (patch: Partial<TimelineClip>) => {
    if (!selectedTimelineClip) {
      return;
    }

    updateTimelineClip(selectedTimelineClip.id, patch);
  };

  const updatePreviewLayout = (patch: Partial<TimelineClip>) => {
    if (previewTimelineClip) {
      updateTimelineClip(previewTimelineClip.id, patch);
      return;
    }

    if (typeof patch.scalePercent === 'number') {
      setLibraryPreviewScale(clamp(patch.scalePercent, 20, 200));
    }

    if (typeof patch.positionXPx === 'number' || typeof patch.positionYPx === 'number') {
      setLibraryPreviewPosition((currentValue) => ({
        x:
          typeof patch.positionXPx === 'number'
            ? clamp(patch.positionXPx, -maxPreviewOffsetPx, maxPreviewOffsetPx)
            : currentValue.x,
        y:
          typeof patch.positionYPx === 'number'
            ? clamp(patch.positionYPx, -maxPreviewOffsetPx, maxPreviewOffsetPx)
            : currentValue.y,
      }));
    }
  };

  const rotatePreview = (deltaDegrees: number) => {
    updatePreviewLayout({
      rotationDegrees: clamp(previewRotationDegrees + deltaDegrees, -180, 180),
    });
  };

  const togglePreviewFlipX = () => {
    updatePreviewLayout({
      flipX: !previewFlipX,
    });
  };

  const togglePreviewFullscreen = async () => {
    const panel = stagePanelRef.current;

    if (!panel) {
      return;
    }

    try {
      if (document.fullscreenElement && panel.contains(document.fullscreenElement)) {
        await document.exitFullscreen();
        return;
      }

      await panel.requestFullscreen();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '预览监视器全屏失败');
    }
  };

  const handlePreviewTabChange = (nextTab: PreviewTab) => {
    setPreviewTab(nextTab);
    setInspectorTab((currentTab) => {
      if (nextTab === 'editor') {
        return 'editor';
      }

      if (currentTab === 'editor') {
        return selectedTimelineClip ? 'clip' : 'project';
      }

      return currentTab;
    });
  };

  const handleInspectorTabChange = (nextTab: InspectorTab) => {
    if (nextTab === 'clip' && !hasClipInspectorTarget) {
      return;
    }

    if (nextTab === 'editor' && !hasEditorInspectorTarget) {
      return;
    }

    setInspectorTab(nextTab);

    if (nextTab === 'editor') {
      setPreviewTab('editor');
    }
  };

  useEffect(() => {
    if (inspectorTab === 'clip' && !hasClipInspectorTarget) {
      setInspectorTab('project');
      return;
    }

    if (inspectorTab === 'editor' && !hasEditorInspectorTarget) {
      setInspectorTab(hasClipInspectorTarget ? 'clip' : 'project');
    }
  }, [hasClipInspectorTarget, hasEditorInspectorTarget, inspectorTab]);

  const startPreviewResize = (event: MouseEvent<HTMLButtonElement>) => {
    if (!canResizePreviewAsset || previewTab !== 'editor') {
      return;
    }

    const previewStage = previewStageRef.current;
    const previewFrame = previewFrameRef.current;

    if (!previewStage || !previewFrame) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const stageRect = previewStage.getBoundingClientRect();
    const frameRect = previewFrame.getBoundingClientRect();
    const centerX = frameRect.left + frameRect.width / 2;
    const centerY = frameRect.top + frameRect.height / 2;
    const startPointerDistance = Math.max(
      Math.hypot(event.clientX - centerX, event.clientY - centerY),
      1,
    );

    previewResizeSessionRef.current = {
      clipId: previewTimelineClip?.id ?? null,
      startX: event.clientX,
      startY: event.clientY,
      startScalePercent: previewScalePercent,
      centerX: clamp(centerX, stageRect.left, stageRect.right),
      centerY: clamp(centerY, stageRect.top, stageRect.bottom),
      startPointerDistance,
    };
    setIsResizingPreview(true);
  };

  const startPreviewMove = (event: MouseEvent<HTMLDivElement>) => {
    if (!canResizePreviewAsset || previewTab !== 'editor') {
      return;
    }

    const target = event.target as HTMLElement | null;

    if (target?.closest('.stage-resize-handle')) {
      return;
    }

    event.preventDefault();

    previewMoveSessionRef.current = {
      clipId: previewTimelineClip?.id ?? null,
      startX: event.clientX,
      startY: event.clientY,
      startPositionXPx: previewPositionXPx,
      startPositionYPx: previewPositionYPx,
    };
    setIsDraggingPreview(true);
  };

  const applyPreviewPreset = (preset: 'center' | 'fit' | 'fill') => {
    if (!canResizePreviewAsset) {
      return;
    }

    if (preset === 'center') {
      updatePreviewLayout({ positionXPx: 0, positionYPx: 0 });
      setPreviewSnapState({ x: 'center', y: 'center' });
      return;
    }

    const previewStage = previewStageRef.current;
    const previewFrame = previewFrameRef.current;

    if (!previewStage || !previewFrame) {
      return;
    }

    const stageRect = previewStage.getBoundingClientRect();
    const frameRect = previewFrame.getBoundingClientRect();
    const baseFrameWidth = frameRect.width / Math.max(previewScale, 0.01);
    const baseFrameHeight = frameRect.height / Math.max(previewScale, 0.01);

    if (baseFrameWidth <= 0 || baseFrameHeight <= 0) {
      return;
    }

    const fitScale = Math.round(Math.min(stageRect.width / baseFrameWidth, stageRect.height / baseFrameHeight) * 100);
    const fillScale = Math.round(Math.max(stageRect.width / baseFrameWidth, stageRect.height / baseFrameHeight) * 100);

    updatePreviewLayout({
      positionXPx: 0,
      positionYPx: 0,
      scalePercent: preset === 'fill' ? fillScale : fitScale,
    });
    setPreviewSnapState({ x: 'center', y: 'center' });
  };

  useEffect(() => {
    if (!isResizingPreview) {
      return;
    }

    const handlePointerMove = (event: globalThis.MouseEvent) => {
      const session = previewResizeSessionRef.current;

      if (!session) {
        return;
      }

      const currentPointerDistance = Math.max(
        Math.hypot(event.clientX - session.centerX, event.clientY - session.centerY),
        1,
      );
      const scaleRatio = currentPointerDistance / session.startPointerDistance;
      const nextScalePercent = Math.round(session.startScalePercent * scaleRatio);
      updatePreviewLayout({ scalePercent: nextScalePercent });
    };

    const handlePointerUp = () => {
      previewResizeSessionRef.current = null;
      setIsResizingPreview(false);
    };

    window.addEventListener('mousemove', handlePointerMove);
    window.addEventListener('mouseup', handlePointerUp);

    return () => {
      window.removeEventListener('mousemove', handlePointerMove);
      window.removeEventListener('mouseup', handlePointerUp);
    };
  }, [isResizingPreview, previewTimelineClip]);

  useEffect(() => {
    if (!isDraggingPreview) {
      return;
    }

    const handlePointerMove = (event: globalThis.MouseEvent) => {
      const session = previewMoveSessionRef.current;

      if (!session) {
        return;
      }

      const nextPositionXPx = session.startPositionXPx + (event.clientX - session.startX);
      const nextPositionYPx = session.startPositionYPx + (event.clientY - session.startY);
      const previewStage = previewStageRef.current;
      const previewFrame = previewFrameRef.current;

      if (!previewStage || !previewFrame) {
        updatePreviewLayout({
          positionXPx: nextPositionXPx,
          positionYPx: nextPositionYPx,
        });
        return;
      }

      const stageRect = previewStage.getBoundingClientRect();
      const frameRect = previewFrame.getBoundingClientRect();
      const safeInsetX = stageRect.width * safeAreaInsetRatio;
      const safeInsetY = stageRect.height * safeAreaInsetRatio;
      const halfWidth = frameRect.width / 2;
      const halfHeight = frameRect.height / 2;
      const snapCandidatesX = [
        { value: 0, axis: 'center' as SnapAxis },
        { value: -stageRect.width / 2 + safeInsetX + halfWidth, axis: 'safe-start' as SnapAxis },
        { value: stageRect.width / 2 - safeInsetX - halfWidth, axis: 'safe-end' as SnapAxis },
      ];
      const snapCandidatesY = [
        { value: 0, axis: 'center' as SnapAxis },
        { value: -stageRect.height / 2 + safeInsetY + halfHeight, axis: 'safe-start' as SnapAxis },
        { value: stageRect.height / 2 - safeInsetY - halfHeight, axis: 'safe-end' as SnapAxis },
      ];

      const snappedX = snapCandidatesX.reduce(
        (currentBest, candidate) =>
          Math.abs(candidate.value - nextPositionXPx) < Math.abs(currentBest.value - nextPositionXPx)
            ? candidate
            : currentBest,
        snapCandidatesX[0],
      );
      const snappedY = snapCandidatesY.reduce(
        (currentBest, candidate) =>
          Math.abs(candidate.value - nextPositionYPx) < Math.abs(currentBest.value - nextPositionYPx)
            ? candidate
            : currentBest,
        snapCandidatesY[0],
      );

      const finalPositionXPx =
        Math.abs(snappedX.value - nextPositionXPx) <= snapThresholdPx ? snappedX.value : nextPositionXPx;
      const finalPositionYPx =
        Math.abs(snappedY.value - nextPositionYPx) <= snapThresholdPx ? snappedY.value : nextPositionYPx;

      setPreviewSnapState({
        x: Math.abs(snappedX.value - nextPositionXPx) <= snapThresholdPx ? snappedX.axis : null,
        y: Math.abs(snappedY.value - nextPositionYPx) <= snapThresholdPx ? snappedY.axis : null,
      });

      updatePreviewLayout({
        positionXPx: finalPositionXPx,
        positionYPx: finalPositionYPx,
      });
    };

    const handlePointerUp = () => {
      previewMoveSessionRef.current = null;
      setIsDraggingPreview(false);
      setPreviewSnapState({ x: null, y: null });
    };

    window.addEventListener('mousemove', handlePointerMove);
    window.addEventListener('mouseup', handlePointerUp);

    return () => {
      window.removeEventListener('mousemove', handlePointerMove);
      window.removeEventListener('mouseup', handlePointerUp);
    };
  }, [isDraggingPreview, previewTimelineClip]);

  const deleteSelectedClip = () => {
    if (!selectedTimelineClip) {
      return;
    }

    deleteTimelineClip(selectedTimelineClip);
  };

  const deleteTimelineClip = (clip: TimelineClip) => {
    setTimelineClips((currentClips) => currentClips.filter((currentClip) => currentClip.id !== clip.id));

    if (selectedTimelineClipId === clip.id) {
      setSelectedTimelineClipId(null);
    }

    setClipContextMenu(null);
    setMessage('片段删掉了');
  };

  const splitTimelineClip = () => {
    const clip = timelineClips.find((c) => {
      const clipEnd = c.offsetSeconds + getClipDuration(c);
      return playheadSeconds > c.offsetSeconds && playheadSeconds < clipEnd;
    });

    if (!clip) {
      setMessage('播放头不在任何片段范围内');
      return;
    }

    const splitPointInSource = clip.trimStart + (playheadSeconds - clip.offsetSeconds);
    const minDuration = 0.5;

    if (splitPointInSource - clip.trimStart < minDuration || clip.trimEnd - splitPointInSource < minDuration) {
      setMessage('切割点太靠近片段边缘，至少保留 0.5 秒');
      return;
    }

    const baseProps = {
      trackId: clip.trackId,
      baseDuration: clip.baseDuration,
      scalePercent: clip.scalePercent,
      positionXPx: clip.positionXPx,
      positionYPx: clip.positionYPx,
      rotationDegrees: clip.rotationDegrees,
      flipX: clip.flipX,
      assetId: clip.assetId,
      text: clip.text,
      fontSize: clip.fontSize,
      fontColor: clip.fontColor,
    };

    const firstClip: TimelineClip = {
      ...baseProps,
      id: crypto.randomUUID(),
      offsetSeconds: clip.offsetSeconds,
      trimStart: clip.trimStart,
      trimEnd: Number(splitPointInSource.toFixed(2)),
    };

    const secondClip: TimelineClip = {
      ...baseProps,
      id: crypto.randomUUID(),
      offsetSeconds: playheadSeconds,
      trimStart: Number(splitPointInSource.toFixed(2)),
      trimEnd: clip.trimEnd,
    };

    setTimelineClips((currentClips) =>
      currentClips.flatMap((c) => (c.id === clip.id ? [firstClip, secondClip] : [c])),
    );

    setSelectedTimelineClipId(secondClip.id);
    if (clip.assetId) {
      setSelectedAssetId(clip.assetId);
    }
    setMessage(`已在 ${formatSeconds(playheadSeconds)} 处切割片段`);
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEditableElement(event.target)) {
        return;
      }

      if (event.key.toLowerCase() === 's') {
        event.preventDefault();
        splitTimelineClip();
        return;
      }

      if ((event.key !== 'Delete' && event.key !== 'Backspace') || !selectedTimelineClip) {
        return;
      }

      event.preventDefault();
      deleteTimelineClip(selectedTimelineClip);
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [selectedTimelineClip, timelineClips, playheadSeconds, trackMap, assetMap]);

  return (
    <>
      {modalContextHolder}
      <main className="editor-page">
        <header className="topbar">
        <div className="brand-block">
          <div className="brand-logo">WV</div>
          <div>
            <p className="eyebrow">webVideoClip</p>
            <h1>视频剪辑工作台</h1>
          </div>
        </div>

        <div className="topbar-actions">
          <input
            className="project-name-input"
            value={projectName}
            onChange={(event) => setProjectName(event.target.value)}
            placeholder="项目名"
          />
          <div className="status-pill">素材 {stats.total}</div>
          <div className="status-pill">轨道 {tracks.length}</div>
          <div className="status-pill">时长 {formatSeconds(projectDuration)}</div>
          <div className="status-pill">{saveState}</div>
          <label className={`primary-button${uploading ? ' disabled' : ''}`}>
            <input type="file" multiple onChange={handleUpload} disabled={uploading} />
            {uploading ? '上传中...' : '导入素材'}
          </label>
          <button
            type="button"
            className="ghost-button"
            onClick={() =>
              void saveProject(true).catch((error) => {
                setSaveState('保存失败');
                setMessage(error instanceof Error ? error.message : '项目保存失败');
              })
            }
          >
            保存项目
          </button>
          <button
            type="button"
            className="primary-ghost-button"
            disabled={busyId === 'export'}
            onClick={() =>
              void runExport().catch((error) => {
                setMessage(error instanceof Error ? error.message : '导出失败');
              })
            }
          >
            {busyId === 'export' ? '导出中...' : '导出视频'}
          </button>
        </div>
        </header>

      <section className="workspace-shell">
        <aside className="asset-panel panel">
          <div className="panel-header">
            <div>
              <p className="panel-label">素材库</p>
              <h2>项目媒体</h2>
            </div>
            <button type="button" className="ghost-button" onClick={() => void refreshAssets()}>
              刷新
            </button>
          </div>

          <div className="search-row">
            <input
              className="search-input"
              placeholder="搜素材, 文件名, 类型"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  void refreshAssets(search);
                }
              }}
            />
            <button type="button" className="ghost-button" onClick={() => void refreshAssets(search)}>
              搜
            </button>
            <Select
              className="asset-kind-filter"
              value={assetKindFilter}
              options={assetKindFilterOptions}
              onChange={(value) => setAssetKindFilter(value)}
              aria-label="按媒体类型筛选素材"
            />
            <Button
              type="text"
              className="asset-layout-toggle"
              icon={assetLayoutMode === 'grid' ? gridLayoutIcon : listLayoutIcon}
              onClick={() => setAssetLayoutMode((current) => (current === 'grid' ? 'list' : 'grid'))}
              aria-label={assetLayoutMode === 'grid' ? '切换为单列素材排版' : '切换为三列素材排版'}
              title={assetLayoutMode === 'grid' ? '切换为单列素材排版' : '切换为三列素材排版'}
            />
          </div>

          <div className="drop-hint">现在可以一直加轨, 素材拖到哪条都能保存到后端</div>

          <div className={`asset-list asset-list-${assetLayoutMode}`}>
            {assets.length === 0 ? (
              <div className="empty-card">
                <strong>还没素材</strong>
                <span>先导入视频或图片, 左边这列才会热闹起来</span>
              </div>
            ) : filteredAssets.length === 0 ? (
              <div className="empty-card">
                <strong>没有这种素材</strong>
                <span>换个媒体类型筛选试试</span>
              </div>
            ) : (
              filteredAssets.map((asset) => {
                const previewUrl = mediaUrl(asset.files.thumbnail ?? asset.files.original);
                const active = selectedLibraryAsset?.id === asset.id;

                return (
                  <button
                    key={asset.id}
                    type="button"
                    className={`asset-list-item${active ? ' active' : ''}`}
                    draggable
                    onContextMenu={(event) => {
                      event.preventDefault();
                      const nextPosition = getFloatingMenuPosition(event.clientX, event.clientY, 176, 132);
                      setAssetContextMenu({
                        assetId: asset.id,
                        x: nextPosition.x,
                        y: nextPosition.y,
                      });
                    }}
                    onDragStart={(event) => {
                      event.dataTransfer.setData('text/asset-id', asset.id);
                      setDraggingAssetId(asset.id);
                    }}
                    onDragEnd={() => setDraggingAssetId(null)}
                    onClick={() => {
                      setSelectedAssetId(asset.id);
                      setSelectedTimelineClipId(null);
                    }}
                  >
                    <div className="asset-thumb">
                      {asset.kind === 'image' && <img src={previewUrl} alt={asset.title} />}
                      {asset.kind === 'video' && asset.files.thumbnail && (
                        <img src={previewUrl} alt={`${asset.title} thumbnail`} />
                      )}
                      {asset.kind === 'video' && !asset.files.thumbnail && <div className="thumb-fallback">VIDEO</div>}
                      {asset.kind === 'audio' && <div className="thumb-fallback">AUDIO</div>}
                      {asset.kind === 'other' && <div className="thumb-fallback">FILE</div>}
                    </div>
                    <div className="asset-item-meta">
                      <strong>{asset.title}</strong>
                      <span>{kindLabelMap[asset.kind]}</span>
                      <span>{formatSize(asset.size)}</span>
                    </div>
                    <span className={`status-badge status-${asset.status}`}>{asset.status}</span>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        <section
          ref={stagePanelRef}
          className={`stage-panel panel${isPreviewFullscreen ? ' stage-panel-fullscreen' : ''}`}
        >
          <div className="panel-header">
            <div>
              <p className="panel-label">预览监视器</p>
              <h2>{stagePreviewTitle}</h2>
            </div>
            <div className="header-meta">
              <span>{stagePreviewKindLabel}</span>
              <span>{stagePreviewAsset ? formatSize(stagePreviewAsset.size) : '--'}</span>
              <span>播放头 {formatSeconds(playheadSeconds)}</span>
            </div>
          </div>

          <div className="stage-toolbar-row">
            <div className="stage-tabs">
              <button
                type="button"
                className={`stage-tab${previewTab === 'player' ? ' active' : ''}`}
                onClick={() => handlePreviewTabChange('player')}
              >
                播放器
              </button>
              <button
                type="button"
                className={`stage-tab${previewTab === 'editor' ? ' active' : ''}`}
                onClick={() => handlePreviewTabChange('editor')}
              >
                视频编辑器
              </button>
            </div>
            <button type="button" className="ghost-button stage-fullscreen-button" onClick={() => void togglePreviewFullscreen()}>
              {isPreviewFullscreen ? '退出全屏' : '全屏预览'}
            </button>
          </div>

          <div
            ref={previewStageRef}
            className={`preview-stage${isResizingPreview ? ' resizing' : ''}${isDraggingPreview ? ' dragging' : ''}`}
            onDoubleClick={() => void togglePreviewFullscreen()}
          >
            {previewTab === 'player' ? (
              <canvas
                ref={canvasRef}
                className="stage-canvas"
                onClick={(e) => {
                  if (!previewStageRef.current) return;
                  const rect = previewStageRef.current.getBoundingClientRect();
                  const clickRatio = (e.clientX - rect.left) / rect.width;
                  setPlayheadSeconds(clamp(Number((clickRatio * projectDuration).toFixed(2)), 0, projectDuration));
                }}
              />
            ) : previewAsset ? (
              <>
                {renderStageAsset(previewAsset, {
                  clip: previewTab === 'editor' ? previewTimelineClip : previewTimelineClip && previewTimelineClip.assetId === previewAsset.id ? previewTimelineClip : null,
                  editable: previewTab === 'editor' && canResizePreviewAsset,
                  controls: false,
                })}
              </>
            ) : (
              <div className="stage-placeholder">导入素材后, 这里就是主预览区</div>
            )}
          </div>

          <div className="transport-bar">
            <div className="transport-group">
              <button
                type="button"
                className="ghost-button"
                onClick={() => setPlayheadSeconds((currentValue) => clamp(currentValue - 1, 0, projectDuration))}
              >
                -1s
              </button>
              <button type="button" className="primary-ghost-button" onClick={() => setIsPlaying((value) => !value)}>
                {isPlaying ? '暂停' : '播放'}
              </button>
              <button
                type="button"
                className="ghost-button"
                onClick={() => setPlayheadSeconds((currentValue) => clamp(currentValue + 1, 0, projectDuration))}
              >
                +1s
              </button>
            </div>

            <div className="status-inline">
              {message}
              {lastSavedAt ? ` · 上次保存 ${new Date(lastSavedAt).toLocaleTimeString()}` : ''}
            </div>

            <div className="transport-group">
              <button
                type="button"
                className="ghost-button"
                disabled={!previewAsset || busyId === previewAsset.id}
                onClick={() => previewAsset && void runAssetJob(previewAsset.id, 'thumbnail')}
              >
                缩略图
              </button>
              <button
                type="button"
                className="primary-ghost-button"
                disabled={!previewAsset || busyId === previewAsset.id}
                onClick={() => previewAsset && void runAssetJob(previewAsset.id, 'transcode')}
              >
                转 MP4
              </button>
            </div>
          </div>
        </section>

        <aside className="inspector-panel panel">
          <div className="panel-header">
            <div>
              <p className="panel-label">检查器</p>
              <h2>属性, 修剪, 编辑, 导出</h2>
            </div>
          </div>
          <div className="inspector-tabs">
            <button
              type="button"
              className={`stage-tab${inspectorTab === 'project' ? ' active' : ''}`}
              onClick={() => handleInspectorTabChange('project')}
            >
              项目
            </button>
            <button
              type="button"
              className={`stage-tab${inspectorTab === 'clip' ? ' active' : ''}`}
              disabled={!hasClipInspectorTarget}
              onClick={() => handleInspectorTabChange('clip')}
              title={hasClipInspectorTarget ? '查看片段属性和修剪' : '先选一个时间线片段'}
            >
              片段
            </button>
            <button
              type="button"
              className={`stage-tab${inspectorTab === 'editor' ? ' active' : ''}`}
              disabled={!hasEditorInspectorTarget}
              onClick={() => handleInspectorTabChange('editor')}
              title={hasEditorInspectorTarget ? '查看视频编辑操作' : '先选图片或视频素材'}
            >
              视频编辑
            </button>
            <button
              type="button"
              className={`stage-tab${inspectorTab === 'export' ? ' active' : ''}`}
              onClick={() => handleInspectorTabChange('export')}
            >
              导出
            </button>
          </div>

          <div className="inspector-content">
            {inspectorTab === 'project' ? (
              <>
                <div className="inspector-section">
                  <span>项目名</span>
                  <strong>{projectName}</strong>
                </div>
                <div className="inspector-section">
                  <span>轨道数量</span>
                  <strong>{tracks.length}</strong>
                </div>
                <div className="inspector-section">
                  <span>当前播放头</span>
                  <strong>{formatSeconds(playheadSeconds)}</strong>
                </div>

                {previewAsset ? (
                  <>
                    <div className="inspector-section">
                      <span>当前素材</span>
                      <strong>{previewAsset.originalName}</strong>
                    </div>
                    <div className="inspector-section">
                      <span>素材类型</span>
                      <strong>{kindLabelMap[previewAsset.kind]}</strong>
                    </div>
                    <div className="inspector-section">
                      <span>快速入轨</span>
                      <div className="quick-actions">
                        {tracks
                          .filter((track) => canDropOnTrack(previewAsset, track))
                          .map((track) => (
                            <button
                              key={track.id}
                              type="button"
                              className="ghost-button"
                              onClick={() => createTimelineClip(previewAsset, track)}
                            >
                              加到 {track.label}
                            </button>
                          ))}
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="empty-card compact">
                    <strong>没选素材</strong>
                    <span>左边点一个, 或者把它拖进时间线</span>
                  </div>
                )}
              </>
            ) : null}

            {inspectorTab === 'clip' ? (
              selectedTimelineClip ? (
                selectedTrack?.type === 'text' ? (
                  <>
                    <div className="inspector-section">
                      <span>当前片段</span>
                      <strong>文本片段</strong>
                    </div>
                    <div className="inspector-section">
                      <span>所在轨道</span>
                      <strong>{selectedTrack.label}</strong>
                    </div>
                    <div className="inspector-section">
                      <span>文字内容</span>
                      <textarea
                        className="text-input"
                        value={selectedTimelineClip.text ?? ''}
                        onChange={(event) => updateSelectedClip({ text: event.target.value })}
                        rows={3}
                      />
                    </div>
                    <div className="inspector-section">
                      <span>字号</span>
                      <strong>{selectedTimelineClip.fontSize ?? 48}px</strong>
                      <input
                        type="range"
                        min="8"
                        max="200"
                        step="1"
                        value={selectedTimelineClip.fontSize ?? 48}
                        onChange={(event) => updateSelectedClip({ fontSize: Number(event.target.value) })}
                      />
                    </div>
                    <div className="inspector-section">
                      <span>颜色</span>
                      <input
                        type="color"
                        className="color-input"
                        value={selectedTimelineClip.fontColor ?? '#ffffff'}
                        onChange={(event) => updateSelectedClip({ fontColor: event.target.value })}
                      />
                    </div>
                    <div className="inspector-section">
                      <span>片段起点</span>
                      <strong>{formatSeconds(selectedTimelineClip.offsetSeconds)}</strong>
                      <input
                        type="range"
                        min="0"
                        max={String(projectDuration)}
                        step="0.5"
                        value={selectedTimelineClip.offsetSeconds}
                        onChange={(event) => updateSelectedClip({ offsetSeconds: Number(event.target.value) })}
                      />
                    </div>
                    <div className="inspector-section">
                      <span>片段时长</span>
                      <strong>{formatSeconds(getClipDuration(selectedTimelineClip))}</strong>
                    </div>
                    <div className="inspector-section">
                      <span>修剪入点</span>
                      <strong>{formatSeconds(selectedTimelineClip.trimStart)}</strong>
                      <input
                        type="range"
                        min="0"
                        max={String(selectedTimelineClip.baseDuration - minClipDuration)}
                        step="0.5"
                        value={selectedTimelineClip.trimStart}
                        onChange={(event) => updateSelectedClip({ trimStart: Number(event.target.value) })}
                      />
                    </div>
                    <div className="inspector-section">
                      <span>修剪出点</span>
                      <strong>{formatSeconds(selectedTimelineClip.trimEnd)}</strong>
                      <input
                        type="range"
                        min={String(selectedTimelineClip.trimStart + minClipDuration)}
                        max={String(selectedTimelineClip.baseDuration)}
                        step="0.5"
                        value={selectedTimelineClip.trimEnd}
                        onChange={(event) => updateSelectedClip({ trimEnd: Number(event.target.value) })}
                      />
                    </div>
                    <div className="link-group">
                      <button type="button" className="ghost-button danger-button" onClick={deleteSelectedClip}>
                        删除片段
                      </button>
                    </div>
                  </>
                ) : previewAsset ? (
                  <>
                    <div className="inspector-section">
                      <span>当前片段</span>
                      <strong>{previewAsset.title}</strong>
                    </div>
                    <div className="inspector-section">
                      <span>所在轨道</span>
                      <strong>{selectedTrack?.label ?? selectedTimelineClip.trackId}</strong>
                      <select
                        className="track-select"
                        value={selectedTimelineClip.trackId}
                        onChange={(event) => updateSelectedClip({ trackId: event.target.value })}
                      >
                        {tracks
                          .filter((track) => canDropOnTrack(previewAsset, track) || track.id === selectedTimelineClip.trackId)
                          .map((track) => (
                            <option key={track.id} value={track.id}>
                              {track.label}
                            </option>
                          ))}
                      </select>
                    </div>
                    <div className="inspector-section">
                      <span>片段起点</span>
                      <strong>{formatSeconds(selectedTimelineClip.offsetSeconds)}</strong>
                      <input
                        type="range"
                        min="0"
                        max={String(projectDuration)}
                        step="0.5"
                        value={selectedTimelineClip.offsetSeconds}
                        onChange={(event) => updateSelectedClip({ offsetSeconds: Number(event.target.value) })}
                      />
                    </div>
                    <div className="inspector-section">
                      <span>修剪入点</span>
                      <strong>{formatSeconds(selectedTimelineClip.trimStart)}</strong>
                      <input
                        type="range"
                        min="0"
                        max={String(selectedTimelineClip.baseDuration - minClipDuration)}
                        step="0.5"
                        value={selectedTimelineClip.trimStart}
                        onChange={(event) => updateSelectedClip({ trimStart: Number(event.target.value) })}
                      />
                    </div>
                    <div className="inspector-section">
                      <span>修剪出点</span>
                      <strong>{formatSeconds(selectedTimelineClip.trimEnd)}</strong>
                      <input
                        type="range"
                        min={String(selectedTimelineClip.trimStart + minClipDuration)}
                        max={String(selectedTimelineClip.baseDuration)}
                        step="0.5"
                        value={selectedTimelineClip.trimEnd}
                        onChange={(event) => updateSelectedClip({ trimEnd: Number(event.target.value) })}
                      />
                    </div>
                    <div className="inspector-section">
                      <span>片段时长</span>
                      <strong>{formatSeconds(getClipDuration(selectedTimelineClip))}</strong>
                    </div>
                    <div className="link-group">
                      <a href={mediaUrl(previewAsset.files.original)} target="_blank" rel="noreferrer">
                        看原文件
                      </a>
                      <button type="button" className="ghost-button danger-button" onClick={deleteSelectedClip}>
                        删除片段
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="empty-card compact">
                    <strong>素材已丢失</strong>
                    <span>该片段引用的素材不存在</span>
                  </div>
                )
              ) : (
                <div className="empty-card compact">
                  <strong>没选时间线片段</strong>
                  <span>点一下轨道里的片段, 这里就能修剪和改轨道</span>
                </div>
              )
            ) : null}

            {inspectorTab === 'editor' ? (
              canResizePreviewAsset ? (
                <>
                  <div className="inspector-section">
                    <span>编辑目标</span>
                    <strong>{previewAsset?.title ?? '当前预览'}</strong>
                    <span className="inspector-note">
                      {previewTimelineClip
                        ? '正在编辑时间线片段, 拖素材改位置, 拖右下角控制点改大小'
                        : '没选片段时, 拖拽和缩放会作用到当前预览素材'}
                    </span>
                  </div>
                  <div className="inspector-section">
                    <span>当前变换</span>
                    <strong>
                      缩放 {previewScalePercent}% · 旋转 {previewRotationDegrees}° · X {Math.round(previewPositionXPx)} · Y{' '}
                      {Math.round(previewPositionYPx)}
                    </strong>
                    <span className="inspector-note">{previewFlipX ? '已开启水平镜像' : '未开启镜像'}</span>
                  </div>
                  <div className="inspector-section">
                    <span>快速操作</span>
                    <div className="editor-action-grid">
                      <button type="button" className="ghost-button" onClick={() => rotatePreview(-90)}>
                        左转 90°
                      </button>
                      <button type="button" className="ghost-button" onClick={() => rotatePreview(90)}>
                        右转 90°
                      </button>
                      <button type="button" className="ghost-button" onClick={togglePreviewFlipX}>
                        {previewFlipX ? '取消镜像' : '水平镜像'}
                      </button>
                      <button type="button" className="ghost-button" onClick={() => applyPreviewPreset('center')}>
                        居中
                      </button>
                      <button type="button" className="ghost-button" onClick={() => applyPreviewPreset('fit')}>
                        适配
                      </button>
                      <button type="button" className="ghost-button" onClick={() => applyPreviewPreset('fill')}>
                        铺满
                      </button>
                    </div>
                  </div>
                  <div className="inspector-section">
                    <span>其他</span>
                    <div className="quick-actions">
                      <button
                        type="button"
                        className="ghost-button"
                        disabled={isPreviewTransformDefault}
                        onClick={() =>
                          updatePreviewLayout({
                            scalePercent: defaultPreviewScale,
                            positionXPx: 0,
                            positionYPx: 0,
                            rotationDegrees: 0,
                            flipX: false,
                          })
                        }
                      >
                        重置变换
                      </button>
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={() => void togglePreviewFullscreen()}
                      >
                        {isPreviewFullscreen ? '退出全屏' : '全屏预览'}
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="empty-card compact">
                  <strong>当前素材不支持视频编辑</strong>
                  <span>只支持图片和视频, 音频/其他文件没法拖拽缩放</span>
                </div>
              )
            ) : null}

            {inspectorTab === 'export' ? (
              <div className="inspector-section">
                <span>导出视频</span>
                <span className="inspector-note">
                  浏览器直接处理视频片段并导出为 MP4 文件下载
                </span>
                <div className="quick-actions">
                  <button
                    type="button"
                    className="primary-ghost-button"
                    disabled={busyId === 'export'}
                    onClick={() =>
                      void runExport().catch((error) => {
                        setMessage(error instanceof Error ? error.message : '导出失败');
                      })
                    }
                  >
                    {busyId === 'export' ? '导出中...' : '开始导出'}
                  </button>
                </div>
                {timelineClips.length === 0 ? (
                  <span className="inspector-note">先往时间线里加几个片段</span>
                ) : null}
              </div>
            ) : null}
          </div>
        </aside>

        <section className="timeline-panel panel">
          <div className="panel-header">
            <div>
              <p className="panel-label">时间线</p>
              <h2>多轨剪辑区</h2>
            </div>
            <div className="timeline-header-actions">
              <div className="timeline-zoom-controls">
                <button type="button" className="ghost-button" onClick={() => applyTimelineZoom(timelineZoom - 0.25)}>
                  -
                </button>
                <span>{Math.round(timelineZoom * 100)}%</span>
                <button type="button" className="ghost-button" onClick={() => applyTimelineZoom(timelineZoom + 0.25)}>
                  +
                </button>
                <button
                  type="button"
                  className="ghost-button"
                  disabled={timelineZoom === defaultTimelineZoom}
                  onClick={() => applyTimelineZoom(defaultTimelineZoom)}
                >
                  重置
                </button>
              </div>
              <button
                type="button"
                className="primary-ghost-button"
                onClick={splitTimelineClip}
                title="在播放头位置切割片段 (快捷键 S)"
              >
                切割 S
              </button>
              <button type="button" className="ghost-button" onClick={() => createTrack('video')}>
                + 视频轨
              </button>
              <button type="button" className="ghost-button" onClick={() => createTrack('audio')}>
                + 音频轨
              </button>
              <button type="button" className="ghost-button" onClick={() => createTrack('text')}>
                + 文本轨
              </button>
            </div>
          </div>

          <div className="timeline-subheader">
            <span>{timelineClips.length} 段片段</span>
            <span>
              {draggingAssetId
                ? '拖着呢, 往任意兼容轨道里丢'
                : `点时间线可移动播放头, 双指捏合 / Ctrl+滚轮缩放 ${Math.round(timelineZoom * 100)}%, 拖动片段会自动吸附`}
            </span>
          </div>

          <div ref={timelineScrollRef} className="timeline-scroll" style={timelineScrollStyle} onWheel={handleTimelineWheel}>
            <div className="timeline-ruler-row">
              <div className="timeline-ruler-spacer" />
              <div className="timeline-ruler-viewport">
                <div
                  className="timeline-ruler timeline-canvas"
                  style={{ width: `${canvasWidth}px` }}
                  onClick={updatePlayheadByPointer}
                >
                  {Array.from({ length: Math.floor(projectDuration / timelineTickStep) + 1 }).map((_, index) => {
                    const tickSecond = index * timelineTickStep;

                    return (
                      <span
                        key={`tick-${tickSecond}`}
                        className="timeline-tick"
                        style={{ left: `${tickSecond * timelinePixelsPerSecond}px` }}
                      >
                        {formatSeconds(tickSecond)}
                      </span>
                    );
                  })}
                  <div className="playhead" style={{ left: `${playheadSeconds * timelinePixelsPerSecond}px` }}>
                    <span>{formatSeconds(playheadSeconds)}</span>
                  </div>
                </div>
              </div>
            </div>

            {tracks.map((track) => (
              <div
                key={track.id}
                className={`track-row${draggingTrackId === track.id ? ' dragging-track' : ''}`}
                onDragOver={(event) => {
                  if (!event.dataTransfer.types.includes('text/track-id')) {
                    return;
                  }

                  event.preventDefault();
                }}
                onDrop={(event) => {
                  const sourceTrackId = event.dataTransfer.getData('text/track-id');

                  if (!sourceTrackId) {
                    return;
                  }

                  event.preventDefault();
                  moveTrack(sourceTrackId, track.id);
                  setDraggingTrackId(null);
                }}
              >
                <div
                  className={`track-label${track.muted ? ' muted' : ''}${track.disabled ? ' disabled' : ''}`}
                  draggable
                  onContextMenu={(event) => {
                    event.preventDefault();
                    const nextPosition = getFloatingMenuPosition(event.clientX, event.clientY, 176, 220);
                    setTrackContextMenu({
                      trackId: track.id,
                      x: nextPosition.x,
                      y: nextPosition.y,
                    });
                  }}
                  onDragStart={(event) => {
                    event.dataTransfer.setData('text/track-id', track.id);
                    event.dataTransfer.effectAllowed = 'move';
                    setDraggingTrackId(track.id);
                  }}
                  onDragEnd={() => setDraggingTrackId(null)}
                  title="右键打开轨道菜单, 拖拽调整轨道顺序"
                >
                  <strong>{track.label}</strong>
                  <span>{trackTypeLabelMap[track.type]}</span>
                  <small>
                    {track.disabled ? '禁用' : track.muted ? '静音' : '右键菜单'}
                  </small>
                </div>
                <div
                  className={`track-lane${draggingAssetId ? ' droppable' : ''}${track.disabled ? ' disabled' : ''}${track.muted ? ' muted' : ''}`}
                  onDragOver={(event) => {
                    if (track.disabled || event.dataTransfer.types.includes('text/track-id')) {
                      return;
                    }

                    event.preventDefault();
                  }}
                  onDrop={(event) => handleAssetDrop(track, event)}
                >
                  <div className="timeline-canvas" style={{ width: `${canvasWidth}px` }} onClick={updatePlayheadByPointer}>
                    <div className="playhead lane-playhead" style={{ left: `${playheadSeconds * timelinePixelsPerSecond}px` }} />
                    {timelineClips
                      .filter((clip) => clip.trackId === track.id)
                      .map((clip) => {
                        const isTextClip = track.type === 'text';
                        const asset = isTextClip ? null : assetMap.get(clip.assetId ?? '');

                        if (!isTextClip && !asset) {
                          return null;
                        }

                        const clipKind = isTextClip ? 'text' : asset!.kind;
                        const filmstripUrl = clipKind === 'video'
                          ? filmstripCacheRef.current.get(`${clip.id}-${clip.trimStart}-${clip.trimEnd}`) ?? ''
                          : '';
                        const clipStyle: CSSProperties = {
                          left: `${clip.offsetSeconds * timelinePixelsPerSecond}px`,
                          width: `${Math.max(56, getClipDuration(clip) * timelinePixelsPerSecond)}px`,
                        };
                        if (filmstripUrl) {
                          clipStyle.backgroundImage = `url(${filmstripUrl})`;
                          clipStyle.backgroundSize = '100% 100%';
                        }

                        return (
                          <button
                            key={clip.id}
                            type="button"
                            className={`timeline-clip clip-${clipKind}${selectedTimelineClipId === clip.id ? ' active' : ''}${
                              draggingTimelineClipId === clip.id ? ' dragging-clip' : ''
                            }${filmstripUrl ? ' has-filmstrip' : ''}`}
                            style={clipStyle}
                            onContextMenu={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              const nextPosition = getFloatingMenuPosition(event.clientX, event.clientY, 176, 132);
                              setSelectedTimelineClipId(clip.id);
                              setSelectedAssetId(isTextClip ? null : asset!.id);
                              setClipContextMenu({
                                clipId: clip.id,
                                x: nextPosition.x,
                                y: nextPosition.y,
                              });
                            }}
                            onMouseDown={(event) => startTimelineClipDrag(clip, event)}
                            onClick={(event) => {
                              event.stopPropagation();

                              if (suppressTimelineClipClickRef.current === clip.id) {
                                suppressTimelineClipClickRef.current = null;
                                return;
                              }

                              setSelectedTimelineClipId(clip.id);
                              setSelectedAssetId(isTextClip ? null : asset!.id);
                            }}
                          >
                            <span
                              className="timeline-clip-resize-handle start"
                              onMouseDown={(event) => startTimelineClipResize(clip, 'start', event)}
                            />
                            <span
                              className="timeline-clip-resize-handle end"
                              onMouseDown={(event) => startTimelineClipResize(clip, 'end', event)}
                            />
                            <strong>{isTextClip ? (clip.text ?? '文字') : asset!.title}</strong>
                            <span>
                              {track.label} · {formatSeconds(getClipDuration(clip))}
                            </span>
                            <div className="trim-chip">
                              {formatSeconds(clip.trimStart)} - {formatSeconds(clip.trimEnd)}
                            </div>
                          </button>
                        );
                      })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </section>

      {trackContextMenu && trackMap.get(trackContextMenu.trackId) ? (
        <div
          ref={trackContextMenuRef}
          className="track-context-menu"
          style={{
            left: trackContextMenu.x,
            top: trackContextMenu.y,
          }}
          onClick={(event) => event.stopPropagation()}
        >
          {(() => {
            const track = trackMap.get(trackContextMenu.trackId)!;

            return (
              <>
                <div className="context-menu-title">{track.label}</div>
                <button
                  type="button"
                  onClick={() => {
                    renameTrack(track);
                    setTrackContextMenu(null);
                  }}
                >
                  重命名轨道
                </button>
                <button
                  type="button"
                  onClick={() => {
                    toggleTrackMuted(track);
                    setTrackContextMenu(null);
                  }}
                >
                  {track.muted ? '取消静音' : '静音轨道'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    toggleTrackDisabled(track);
                    setTrackContextMenu(null);
                  }}
                >
                  {track.disabled ? '启用轨道' : '禁用轨道'}
                </button>
                <button
                  type="button"
                  className="danger-menu-item"
                  onClick={() => {
                    deleteTrack(track);
                    setTrackContextMenu(null);
                  }}
                >
                  删除轨道
                </button>
              </>
            );
          })()}
        </div>
      ) : null}
      {assetContextMenu && assetMap.get(assetContextMenu.assetId) ? (
        <div
          ref={assetContextMenuRef}
          className="track-context-menu"
          style={{
            left: assetContextMenu.x,
            top: assetContextMenu.y,
          }}
          onClick={(event) => event.stopPropagation()}
        >
          {(() => {
            const asset = assetMap.get(assetContextMenu.assetId)!;

            return (
              <>
                <div className="context-menu-title">{asset.title}</div>
                <button
                  type="button"
                  className="danger-menu-item"
                  onClick={() => void deleteLibraryAsset(asset)}
                >
                  删除素材
                </button>
              </>
            );
          })()}
        </div>
      ) : null}
      {clipContextMenu && timelineClips.find((clip) => clip.id === clipContextMenu.clipId) ? (
        <div
          ref={clipContextMenuRef}
          className="track-context-menu"
          style={{
            left: clipContextMenu.x,
            top: clipContextMenu.y,
          }}
          onClick={(event) => event.stopPropagation()}
        >
          {(() => {
            const clip = timelineClips.find((currentClip) => currentClip.id === clipContextMenu.clipId)!;
            const asset = assetMap.get(clip.assetId ?? '');
            const track = trackMap.get(clip.trackId);
            const title = asset ? asset.title : track?.type === 'text' ? (clip.text ?? '文本片段') : clip.id;

            return (
              <>
                <div className="context-menu-title">{title}{track ? ` · ${track.label}` : ''}</div>
                <button
                  type="button"
                  className="danger-menu-item"
                  onClick={() => deleteTimelineClip(clip)}
                >
                  删除片段
                </button>
              </>
            );
          })()}
        </div>
      ) : null}
      <div className="hidden-sources" aria-hidden="true">
        <video
          id="canvas_player"
          ref={canvasPlayerRef}
          preload="auto"
          muted
        />
        {assets
          .filter((asset) => asset.kind === 'video')
          .map((asset) => (
            <video
              key={`src-${asset.id}`}
              ref={(el) => {
                if (el) {
                  el.preload = 'auto';
                  el.muted = true;
                  hiddenVideoMapRef.current.set(asset.id, el);
                } else {
                  hiddenVideoMapRef.current.delete(asset.id);
                }
              }}
              src={mediaUrl(asset.files.transcoded ?? asset.files.original)}
              onLoadedMetadata={() => setFilmstripVersion((v) => v + 1)}
            />
          ))}
        {assets
          .filter((asset) => asset.kind === 'image')
          .map((asset) => (
            <img
              key={`src-${asset.id}`}
              ref={(el) => {
                if (el) {
                  hiddenImageMapRef.current.set(asset.id, el);
                } else {
                  hiddenImageMapRef.current.delete(asset.id);
                }
              }}
              src={mediaUrl(asset.files.original)}
              alt=""
            />
          ))}
      </div>
      </main>
    </>
  );
};

export default App;
