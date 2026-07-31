import { useState, useCallback, useRef, useEffect } from "react";
import type { TimelineData, TimelineTrack, TimelineClip, ClipFilter } from "./types";
import { nextClipId, nextTrackId, FILTER_PRESETS } from "./types";
import { loadTimeline, saveTimeline } from "../../../lib/store";

interface UseTimelineEngineProps {
  projectId: string;
  initialAssetPath?: string;
  initialFileUrl?: string;
  initialTitle?: string;
}

export interface TimelineEngine {
  data: TimelineData;
  zoom: number;
  currentTime: number;
  selectedClipId: string | null;

  // Clip ops
  addClip: (trackId: string, clip: Omit<TimelineClip, "id">) => string;
  updateClip: (clipId: string, changes: Partial<TimelineClip>) => void;
  removeClip: (clipId: string) => void;
  moveClip: (clipId: string, newStart: number) => void;
  trimClip: (clipId: string, edge: "left" | "right", newTime: number) => void;

  // Filter ops
  updateClipFilter: (clipId: string, filter: ClipFilter) => void;
  applyFilterPreset: (clipId: string, presetName: string) => void;
  resetClipFilter: (clipId: string) => void;

  // Track ops
  addTrack: (type: TimelineTrack["type"], name: string) => string;

  // Playback
  setCurrentTime: (t: number) => void;
  setZoom: (z: number) => void;
  selectClip: (id: string | null) => void;

  // Duration
  totalDuration: number;
}

export function useTimelineEngine(props: UseTimelineEngineProps): TimelineEngine {
  const { projectId, initialAssetPath, initialFileUrl, initialTitle } = props;

  const [data, setData] = useState<TimelineData>(() => ({
    tracks: [
      { id: nextTrackId(), name: "视频轨", type: "video", clips: [], order: 0 },
      { id: nextTrackId(), name: "音频轨", type: "audio", clips: [], order: 1 },
    ],
    fps: 30,
  }));

  const [zoom, setZoom] = useState(80); // pixels per second
  const [currentTime, setCurrentTime] = useState(0);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const loadedRef = useRef(false);

  // Load from IndexedDB on mount
  useEffect(() => {
    loadTimeline(projectId).then((saved) => {
      if (saved) {
        setData(saved);
      } else if (initialAssetPath && initialFileUrl) {
        // Seed with initial video clip from the node
        setData((prev) => {
          const tracks = [...prev.tracks];
          const clip: TimelineClip = {
            id: nextClipId(),
            title: initialTitle || "素材",
            type: "video",
            startTime: 0,
            duration: 60,
            assetPath: initialAssetPath,
            fileUrl: initialFileUrl,
            sourceStart: 0,
            sourceEnd: 60,
          };
          tracks[0] = { ...tracks[0], clips: [...tracks[0].clips, clip] };
          return { ...prev, tracks };
        });
      }
      loadedRef.current = true;
      setInitialized(true);
    });
  }, [projectId]);

  // Auto-save with 500ms debounce
  useEffect(() => {
    if (!loadedRef.current || !initialized) return;
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveTimeline(projectId, data);
    }, 500);
    return () => clearTimeout(saveTimerRef.current);
  }, [data, projectId]);

  // Total duration = max end time across all clips + 2s padding
  const totalDuration = (() => {
    let max = 10;
    for (const track of data.tracks) {
      for (const clip of track.clips) {
        const end = clip.startTime + clip.duration;
        if (end > max) max = end;
      }
    }
    return max + 2;
  })();

  // ── Clip operations ──

  const addClip = useCallback((trackId: string, clip: Omit<TimelineClip, "id">): string => {
    const id = nextClipId();
    setData((prev) => ({
      ...prev,
      tracks: prev.tracks.map((t) =>
        t.id === trackId
          ? { ...t, clips: [...t.clips, { ...clip, id }] }
          : t,
      ),
    }));
    return id;
  }, []);

  const updateClip = useCallback((clipId: string, changes: Partial<TimelineClip>) => {
    setData((prev) => ({
      ...prev,
      tracks: prev.tracks.map((t) => ({
        ...t,
        clips: t.clips.map((c) => (c.id === clipId ? { ...c, ...changes } : c)),
      })),
    }));
  }, []);

  const removeClip = useCallback((clipId: string) => {
    setData((prev) => ({
      ...prev,
      tracks: prev.tracks.map((t) => ({
        ...t,
        clips: t.clips.filter((c) => c.id !== clipId),
      })),
    }));
  }, []);

  const moveClip = useCallback((clipId: string, newStart: number) => {
    setData((prev) => ({
      ...prev,
      tracks: prev.tracks.map((t) => ({
        ...t,
        clips: t.clips.map((c) =>
          c.id === clipId
            ? { ...c, startTime: Math.max(0, newStart) }
            : c,
        ),
      })),
    }));
  }, []);

  const trimClip = useCallback((clipId: string, edge: "left" | "right", newTime: number) => {
    setData((prev) => ({
      ...prev,
      tracks: prev.tracks.map((t) => ({
        ...t,
        clips: t.clips.map((c) => {
          if (c.id !== clipId) return c;
          if (edge === "left") {
            const d = newTime - c.startTime;
            return {
              ...c,
              startTime: Math.max(0, newTime),
              duration: Math.max(0.1, c.duration - d),
              sourceStart: c.sourceStart + d,
            };
          } else {
            return {
              ...c,
              duration: Math.max(0.1, newTime - c.startTime),
              sourceEnd: c.sourceEnd + (newTime - (c.startTime + c.duration)),
            };
          }
        }),
      })),
    }));
  }, []);

  // ── Track operations ──

  const addTrack = useCallback((type: TimelineTrack["type"], name: string): string => {
    const id = nextTrackId();
    setData((prev) => ({
      ...prev,
      tracks: [...prev.tracks, { id, name, type, clips: [], order: prev.tracks.length }],
    }));
    return id;
  }, []);

  // ── Selection ──

  const selectClip = useCallback((id: string | null) => {
    setSelectedClipId(id);
  }, []);

  // ── Filter operations ──

  const updateClipFilter = useCallback((clipId: string, filter: ClipFilter) => {
    setData((prev) => ({
      ...prev,
      tracks: prev.tracks.map((t) => ({
        ...t,
        clips: t.clips.map((c) =>
          c.id === clipId ? { ...c, filter: { ...c.filter, ...filter } } : c,
        ),
      })),
    }));
  }, []);

  const applyFilterPreset = useCallback((clipId: string, presetName: string) => {
    const preset = FILTER_PRESETS[presetName];
    if (!preset) return;
    setData((prev) => ({
      ...prev,
      tracks: prev.tracks.map((t) => ({
        ...t,
        clips: t.clips.map((c) =>
          c.id === clipId
            ? { ...c, filter: { ...preset } as ClipFilter, filterPreset: presetName }
            : c,
        ),
      })),
    }));
  }, []);

  const resetClipFilter = useCallback((clipId: string) => {
    setData((prev) => ({
      ...prev,
      tracks: prev.tracks.map((t) => ({
        ...t,
        clips: t.clips.map((c) =>
          c.id === clipId ? { ...c, filter: undefined, filterPreset: undefined } : c,
        ),
      })),
    }));
  }, []);

  return {
    data,
    zoom,
    currentTime,
    selectedClipId,
    addClip,
    updateClip,
    removeClip,
    moveClip,
    trimClip,
    updateClipFilter,
    applyFilterPreset,
    resetClipFilter,
    addTrack,
    setCurrentTime,
    setZoom,
    selectClip,
    totalDuration,
  };
}
