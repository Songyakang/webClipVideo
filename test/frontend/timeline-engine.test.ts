import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useTimelineEngine } from "../../src/pages/detail/timeline/useTimelineEngine";
import type { TimelineClip } from "../../src/pages/detail/timeline/types";

// Mock the store module to prevent IndexedDB access
vi.mock("../../src/lib/store", () => ({
  loadTimeline: vi.fn().mockResolvedValue(null),
  saveTimeline: vi.fn().mockResolvedValue(undefined),
}));

function makeClip(overrides?: Partial<TimelineClip>): Omit<TimelineClip, "id"> {
  return {
    title: "test-clip",
    type: "video",
    startTime: 0,
    duration: 10,
    sourceStart: 0,
    sourceEnd: 10,
    ...overrides,
  };
}

describe("useTimelineEngine", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ─── Initial state ─────────────────────────────────────────────────

  it("initializes with 2 default tracks (video + audio)", () => {
    const { result } = renderHook(() =>
      useTimelineEngine({ projectId: "test-proj" })
    );
    expect(result.current.data.tracks).toHaveLength(2);
    expect(result.current.data.tracks[0].name).toBe("视频轨");
    expect(result.current.data.tracks[0].type).toBe("video");
    expect(result.current.data.tracks[1].name).toBe("音频轨");
    expect(result.current.data.tracks[1].type).toBe("audio");
    expect(result.current.data.fps).toBe(30);
  });

  it("starts with zoom 80, currentTime 0, no selection", () => {
    const { result } = renderHook(() =>
      useTimelineEngine({ projectId: "test-proj" })
    );
    expect(result.current.zoom).toBe(80);
    expect(result.current.currentTime).toBe(0);
    expect(result.current.selectedClipId).toBeNull();
  });

  it("totalDuration is at least 12 (10 floor + 2 padding) with empty tracks", () => {
    const { result } = renderHook(() =>
      useTimelineEngine({ projectId: "test-proj" })
    );
    expect(result.current.totalDuration).toBe(12);
  });

  // ─── addClip ───────────────────────────────────────────────────────

  it("addClip appends to the correct track and returns id", () => {
    const { result } = renderHook(() =>
      useTimelineEngine({ projectId: "test-proj" })
    );
    const trackId = result.current.data.tracks[0].id;

    let clipId = "";
    act(() => {
      clipId = result.current.addClip(trackId, makeClip({ title: "my-clip" }));
    });

    expect(clipId).toMatch(/^tlc_/);
    const track = result.current.data.tracks[0];
    expect(track.clips).toHaveLength(1);
    expect(track.clips[0].title).toBe("my-clip");
    expect(track.clips[0].id).toBe(clipId);
  });

  it("addClip to unknown track does not modify any track", () => {
    const { result } = renderHook(() =>
      useTimelineEngine({ projectId: "test-proj" })
    );
    act(() => {
      result.current.addClip("nonexistent", makeClip());
    });
    expect(result.current.data.tracks[0].clips).toHaveLength(0);
    expect(result.current.data.tracks[1].clips).toHaveLength(0);
  });

  // ─── updateClip ────────────────────────────────────────────────────

  it("updateClip merges partial changes", () => {
    const { result } = renderHook(() =>
      useTimelineEngine({ projectId: "test-proj" })
    );
    const trackId = result.current.data.tracks[0].id;
    let clipId = "";
    act(() => {
      clipId = result.current.addClip(trackId, makeClip());
    });
    act(() => {
      result.current.updateClip(clipId, { title: "updated", duration: 20 });
    });
    const clip = result.current.data.tracks[0].clips[0];
    expect(clip.title).toBe("updated");
    expect(clip.duration).toBe(20);
    // unchanged fields preserved
    expect(clip.startTime).toBe(0);
  });

  // ─── removeClip ────────────────────────────────────────────────────

  it("removeClip removes from the correct track", () => {
    const { result } = renderHook(() =>
      useTimelineEngine({ projectId: "test-proj" })
    );
    const trackId = result.current.data.tracks[0].id;
    let clipId = "";
    act(() => {
      clipId = result.current.addClip(trackId, makeClip());
    });
    expect(result.current.data.tracks[0].clips).toHaveLength(1);

    act(() => {
      result.current.removeClip(clipId);
    });
    expect(result.current.data.tracks[0].clips).toHaveLength(0);
  });

  // ─── moveClip ──────────────────────────────────────────────────────

  it("moveClip sets new startTime, clamped to >= 0", () => {
    const { result } = renderHook(() =>
      useTimelineEngine({ projectId: "test-proj" })
    );
    const trackId = result.current.data.tracks[0].id;
    let clipId = "";
    act(() => {
      clipId = result.current.addClip(trackId, makeClip());
    });
    act(() => {
      result.current.moveClip(clipId, 5);
    });
    expect(result.current.data.tracks[0].clips[0].startTime).toBe(5);

    // Negative clamped to 0
    act(() => {
      result.current.moveClip(clipId, -10);
    });
    expect(result.current.data.tracks[0].clips[0].startTime).toBe(0);
  });

  // ─── trimClip ──────────────────────────────────────────────────────

  it("trimClip from left edge adjusts startTime, duration, sourceStart", () => {
    const { result } = renderHook(() =>
      useTimelineEngine({ projectId: "test-proj" })
    );
    const trackId = result.current.data.tracks[0].id;
    let clipId = "";
    act(() => {
      clipId = result.current.addClip(
        trackId,
        makeClip({ startTime: 0, duration: 10, sourceStart: 0, sourceEnd: 10 })
      );
    });
    // Trim left edge from 0 to 3
    act(() => {
      result.current.trimClip(clipId, "left", 3);
    });
    const clip = result.current.data.tracks[0].clips[0];
    expect(clip.startTime).toBe(3);
    expect(clip.duration).toBe(7); // 10 - (3-0) = 7
    expect(clip.sourceStart).toBe(3);
  });

  it("trimClip from right edge adjusts duration and sourceEnd", () => {
    const { result } = renderHook(() =>
      useTimelineEngine({ projectId: "test-proj" })
    );
    const trackId = result.current.data.tracks[0].id;
    let clipId = "";
    act(() => {
      clipId = result.current.addClip(
        trackId,
        makeClip({ startTime: 0, duration: 10, sourceStart: 0, sourceEnd: 10 })
      );
    });
    // Trim right edge from end (10) to 6
    act(() => {
      result.current.trimClip(clipId, "right", 6);
    });
    const clip = result.current.data.tracks[0].clips[0];
    expect(clip.duration).toBe(6);
    expect(clip.sourceEnd).toBe(6);
  });

  it("trimClip left edge clamps startTime to >= 0", () => {
    const { result } = renderHook(() =>
      useTimelineEngine({ projectId: "test-proj" })
    );
    const trackId = result.current.data.tracks[0].id;
    let clipId = "";
    act(() => {
      clipId = result.current.addClip(
        trackId,
        makeClip({ startTime: 0, duration: 10 })
      );
    });
    act(() => {
      result.current.trimClip(clipId, "left", -5);
    });
    expect(result.current.data.tracks[0].clips[0].startTime).toBe(0);
  });

  it("trimClip duration is clamped to minimum 0.1s", () => {
    const { result } = renderHook(() =>
      useTimelineEngine({ projectId: "test-proj" })
    );
    const trackId = result.current.data.tracks[0].id;
    let clipId = "";
    act(() => {
      clipId = result.current.addClip(
        trackId,
        makeClip({ startTime: 0, duration: 1 })
      );
    });
    // Trim right edge to near-zero → should clamp to 0.1
    act(() => {
      result.current.trimClip(clipId, "right", 0.05);
    });
    expect(result.current.data.tracks[0].clips[0].duration).toBe(0.1);
  });

  // ─── addTrack ──────────────────────────────────────────────────────

  it("addTrack appends a new track with incrementing order", () => {
    const { result } = renderHook(() =>
      useTimelineEngine({ projectId: "test-proj" })
    );
    let newId = "";
    act(() => {
      newId = result.current.addTrack("text", "字幕轨");
    });
    expect(newId).toMatch(/^tlt_/);
    expect(result.current.data.tracks).toHaveLength(3);
    expect(result.current.data.tracks[2].name).toBe("字幕轨");
    expect(result.current.data.tracks[2].type).toBe("text");
    expect(result.current.data.tracks[2].order).toBe(2);
  });

  // ─── Filter operations ─────────────────────────────────────────────

  it("updateClipFilter merges filter properties", () => {
    const { result } = renderHook(() =>
      useTimelineEngine({ projectId: "test-proj" })
    );
    const trackId = result.current.data.tracks[0].id;
    let clipId = "";
    act(() => {
      clipId = result.current.addClip(trackId, makeClip());
    });
    act(() => {
      result.current.updateClipFilter(clipId, { brightness: 0.5 });
    });
    expect(result.current.data.tracks[0].clips[0].filter?.brightness).toBe(0.5);

    // Merge: add contrast, brightness preserved
    act(() => {
      result.current.updateClipFilter(clipId, { contrast: -0.2 });
    });
    const filter = result.current.data.tracks[0].clips[0].filter;
    expect(filter?.brightness).toBe(0.5);
    expect(filter?.contrast).toBe(-0.2);
  });

  it("applyFilterPreset replaces entire filter with preset", () => {
    const { result } = renderHook(() =>
      useTimelineEngine({ projectId: "test-proj" })
    );
    const trackId = result.current.data.tracks[0].id;
    let clipId = "";
    act(() => {
      clipId = result.current.addClip(trackId, makeClip());
    });
    // Set a custom filter first
    act(() => {
      result.current.updateClipFilter(clipId, { brightness: 0.8 });
    });
    // Apply a preset → replaces filter entirely
    act(() => {
      result.current.applyFilterPreset(clipId, "bw");
    });
    const clip = result.current.data.tracks[0].clips[0];
    expect(clip.filterPreset).toBe("bw");
    expect(clip.filter?.brightness).toBeUndefined(); // overwritten by bw preset
    expect(clip.filter?.saturation).toBe(-1); // bw preset value
  });

  it("applyFilterPreset with unknown name is a no-op", () => {
    const { result } = renderHook(() =>
      useTimelineEngine({ projectId: "test-proj" })
    );
    const trackId = result.current.data.tracks[0].id;
    let clipId = "";
    act(() => {
      clipId = result.current.addClip(trackId, makeClip());
    });
    act(() => {
      result.current.applyFilterPreset(clipId, "nonexistent-preset");
    });
    expect(result.current.data.tracks[0].clips[0].filter).toBeUndefined();
  });

  it("resetClipFilter clears both filter and filterPreset", () => {
    const { result } = renderHook(() =>
      useTimelineEngine({ projectId: "test-proj" })
    );
    const trackId = result.current.data.tracks[0].id;
    let clipId = "";
    act(() => {
      clipId = result.current.addClip(trackId, makeClip());
    });
    act(() => {
      result.current.applyFilterPreset(clipId, "warm");
    });
    expect(result.current.data.tracks[0].clips[0].filter).toBeDefined();

    act(() => {
      result.current.resetClipFilter(clipId);
    });
    const clip = result.current.data.tracks[0].clips[0];
    expect(clip.filter).toBeUndefined();
    expect(clip.filterPreset).toBeUndefined();
  });

  // ─── totalDuration ─────────────────────────────────────────────────

  it("totalDuration = max(end time) + 2 padding", () => {
    const { result } = renderHook(() =>
      useTimelineEngine({ projectId: "test-proj" })
    );
    const trackId = result.current.data.tracks[0].id;
    act(() => {
      result.current.addClip(
        trackId,
        makeClip({ startTime: 5, duration: 15 })
      );
    });
    // Max end = 5 + 15 = 20, + 2 padding = 22
    expect(result.current.totalDuration).toBe(22);
  });

  it("totalDuration works across multiple tracks", () => {
    const { result } = renderHook(() =>
      useTimelineEngine({ projectId: "test-proj" })
    );
    const vidTrackId = result.current.data.tracks[0].id;
    const audTrackId = result.current.data.tracks[1].id;

    act(() => {
      result.current.addClip(vidTrackId, makeClip({ startTime: 0, duration: 8 }));
    });
    act(() => {
      result.current.addClip(audTrackId, makeClip({ startTime: 2, duration: 20 }));
    });
    // Max end = 2 + 20 = 22, + 2 = 24
    expect(result.current.totalDuration).toBe(24);
  });

  // ─── selectClip / setCurrentTime / setZoom ─────────────────────────

  it("selectClip sets selectedClipId", () => {
    const { result } = renderHook(() =>
      useTimelineEngine({ projectId: "test-proj" })
    );
    act(() => {
      result.current.selectClip("some-id");
    });
    expect(result.current.selectedClipId).toBe("some-id");

    act(() => {
      result.current.selectClip(null);
    });
    expect(result.current.selectedClipId).toBeNull();
  });

  it("setCurrentTime updates currentTime", () => {
    const { result } = renderHook(() =>
      useTimelineEngine({ projectId: "test-proj" })
    );
    act(() => {
      result.current.setCurrentTime(15.5);
    });
    expect(result.current.currentTime).toBe(15.5);
  });

  it("setZoom updates zoom", () => {
    const { result } = renderHook(() =>
      useTimelineEngine({ projectId: "test-proj" })
    );
    act(() => {
      result.current.setZoom(120);
    });
    expect(result.current.zoom).toBe(120);
  });
});
