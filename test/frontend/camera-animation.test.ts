import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { useCameraAnimation } from "../../src/pages/detail/director/useCameraAnimation";
import type { CameraTrack } from "../../src/lib/types";

function makeTrack(overrides?: Partial<CameraTrack>): CameraTrack {
  return {
    id: "track-1",
    name: "Camera 1",
    enabled: true,
    easing: "linear",
    keyframes: [
      {
        time: 0,
        fov: 60,
        position: [0, 0, 10],
        lookAt: [0, 0, 0],
      },
      {
        time: 2,
        fov: 90,
        position: [2, 0, 8],
        lookAt: [0, 1, 0],
      },
      {
        time: 5,
        fov: 45,
        position: [0, 5, 12],
        lookAt: [2, 0, 0],
      },
    ],
    ...overrides,
  };
}

// ─── getCameraAtTime ─────────────────────────────────────────────────

describe("getCameraAtTime", () => {
  it("returns null when track has no keyframes", () => {
    const track = makeTrack({ keyframes: [] });
    const { result } = renderHook(() => useCameraAnimation({ track }));
    expect(result.current.getCameraAtTime(1)).toBeNull();
  });

  it("returns null when track is undefined", () => {
    const { result } = renderHook(() => useCameraAnimation({ track: undefined }));
    expect(result.current.getCameraAtTime(1)).toBeNull();
  });

  it("returns first keyframe when t <= first keyframe time", () => {
    const track = makeTrack();
    const { result } = renderHook(() => useCameraAnimation({ track }));
    const cam = result.current.getCameraAtTime(0);
    expect(cam).not.toBeNull();
    expect(cam!.fov).toBe(60);
    expect(cam!.position).toEqual([0, 0, 10]);
  });

  it("returns last keyframe when t >= last keyframe time", () => {
    const track = makeTrack();
    const { result } = renderHook(() => useCameraAnimation({ track }));
    const cam = result.current.getCameraAtTime(10);
    expect(cam).not.toBeNull();
    expect(cam!.fov).toBe(45);
    expect(cam!.position).toEqual([0, 5, 12]);
  });

  it("linear interpolation at midpoint", () => {
    const track = makeTrack({ easing: "linear" });
    const { result } = renderHook(() => useCameraAnimation({ track }));
    // At t=1.0, ratio = (1-0)/(2-0) = 0.5, linear easing = 0.5
    const cam = result.current.getCameraAtTime(1.0);
    expect(cam).not.toBeNull();
    expect(cam!.fov).toBeCloseTo(75); // 60 + (90-60)*0.5 = 75
    expect(cam!.position[0]).toBeCloseTo(1); // 0 + (2-0)*0.5 = 1
    expect(cam!.lookAt[1]).toBeCloseTo(0.5); // 0 + (1-0)*0.5 = 0.5
  });

  it("ease-in interpolation at midpoint", () => {
    const track = makeTrack({ easing: "ease-in" });
    const { result } = renderHook(() => useCameraAnimation({ track }));
    // at t=1.0, ratio=0.5, ease-in = 0.5*0.5 = 0.25
    const cam = result.current.getCameraAtTime(1.0);
    expect(cam!.fov).toBeCloseTo(60 + 30 * 0.25); // 67.5
  });

  it("ease-out interpolation at midpoint", () => {
    const track = makeTrack({ easing: "ease-out" });
    const { result } = renderHook(() => useCameraAnimation({ track }));
    // at t=1.0, ratio=0.5, ease-out = 0.5*(2-0.5) = 0.75
    const cam = result.current.getCameraAtTime(1.0);
    expect(cam!.fov).toBeCloseTo(60 + 30 * 0.75); // 82.5
  });

  it("ease-in-out at midpoint", () => {
    const track = makeTrack({ easing: "ease-in-out" });
    const { result } = renderHook(() => useCameraAnimation({ track }));
    // at t=1.0, ratio=0.5, ease-in-out = 2*0.5*0.5 = 0.5
    const cam = result.current.getCameraAtTime(1.0);
    expect(cam!.fov).toBeCloseTo(60 + 30 * 0.5); // 75 (same as linear at midpoint)
  });

  it("ease-in-out at quarter point", () => {
    // Only need easing curve, test with minimal track
    const track = makeTrack({
      easing: "ease-in-out",
      keyframes: [
        { time: 0, fov: 0, position: [0, 0, 0], lookAt: [0, 0, 0] },
        { time: 4, fov: 100, position: [100, 0, 0], lookAt: [0, 0, 0] },
      ],
    });
    const { result } = renderHook(() => useCameraAnimation({ track }));
    // at t=1.0, ratio = 1/4 = 0.25, ease-in-out = 2*0.25^2 = 0.125
    const cam = result.current.getCameraAtTime(1.0);
    expect(cam!.fov).toBeCloseTo(100 * 0.125); // 12.5
  });

  it("single keyframe returns that keyframe for any time", () => {
    const track = makeTrack({
      keyframes: [
        { time: 3, fov: 42, position: [1, 2, 3], lookAt: [0, 0, 0] },
      ],
    });
    const { result } = renderHook(() => useCameraAnimation({ track }));
    const cam = result.current.getCameraAtTime(0);
    expect(cam!.fov).toBe(42);
    const cam2 = result.current.getCameraAtTime(100);
    expect(cam2!.fov).toBe(42);
  });

  it("returns interpolated time value in result", () => {
    const track = makeTrack({ easing: "linear" });
    const { result } = renderHook(() => useCameraAnimation({ track }));
    const cam = result.current.getCameraAtTime(1.5);
    expect(cam!.time).toBe(1.5);
  });
});

// ─── duration ────────────────────────────────────────────────────────

describe("duration", () => {
  it("returns last keyframe time", () => {
    const track = makeTrack();
    const { result } = renderHook(() => useCameraAnimation({ track }));
    expect(result.current.duration).toBe(5);
  });

  it("returns 5 when track is undefined", () => {
    const { result } = renderHook(() => useCameraAnimation({ track: undefined }));
    expect(result.current.duration).toBe(5);
  });

  it("returns 5 when keyframes are empty", () => {
    const track = makeTrack({ keyframes: [] });
    const { result } = renderHook(() => useCameraAnimation({ track }));
    expect(result.current.duration).toBe(5);
  });
});

// ─── initial state ───────────────────────────────────────────────────

describe("initial state", () => {
  it("starts paused with currentTime 0", () => {
    const track = makeTrack();
    const { result } = renderHook(() => useCameraAnimation({ track }));
    expect(result.current.playing).toBe(false);
    expect(result.current.currentTime).toBe(0);
  });
});
