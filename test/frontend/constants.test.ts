import { describe, it, expect } from "vitest";
import { DEFAULT_SUBTITLE_STYLE } from "../../src/lib/types";
import { RESOLUTION_OPTIONS as TIMELINE_RESOLUTIONS } from "../../src/pages/detail/timeline/types";
import {
  RESOLUTION_OPTIONS as DIRECTOR_RESOLUTIONS,
  DEFAULT_RESOLUTION,
} from "../../src/pages/detail/director/types";
import { FILTER_PRESET_NAMES, FILTER_LABELS } from "../../src/pages/detail/timeline/types";
import type { ClipFilter } from "../../src/pages/detail/timeline/types";

// ─── DEFAULT_SUBTITLE_STYLE ──────────────────────────────────────────

describe("DEFAULT_SUBTITLE_STYLE", () => {
  it("has expected default values", () => {
    expect(DEFAULT_SUBTITLE_STYLE).toEqual({
      fontSize: 24,
      fontColor: "#FFFFFF",
      outlineColor: "#000000",
      outlineWidth: 2,
      alignment: 2,
      marginV: 50,
      bold: false,
      italic: false,
    });
  });

  it("alignment is within valid range (1, 2, or 3)", () => {
    expect([1, 2, 3]).toContain(DEFAULT_SUBTITLE_STYLE.alignment);
  });
});

// ─── TIMELINE RESOLUTION_OPTIONS ─────────────────────────────────────

describe("Timeline RESOLUTION_OPTIONS", () => {
  it("contains 1080p, 720p, and original-resolution options", () => {
    expect(TIMELINE_RESOLUTIONS).toHaveLength(3);
    expect(TIMELINE_RESOLUTIONS[0]).toEqual({
      label: "1080p (1920×1080)",
      width: 1920,
      height: 1080,
    });
    expect(TIMELINE_RESOLUTIONS[1]).toEqual({
      label: "720p (1280×720)",
      width: 1280,
      height: 720,
    });
    expect(TIMELINE_RESOLUTIONS[2]).toEqual({
      label: "原分辨率",
      width: 0,
      height: 0,
    });
  });
});

// ─── DIRECTOR RESOLUTION_OPTIONS ─────────────────────────────────────

describe("Director RESOLUTION_OPTIONS", () => {
  it("contains all 5 resolutions", () => {
    expect(DIRECTOR_RESOLUTIONS).toHaveLength(5);
  });

  it("1080p is first (index 0)", () => {
    expect(DIRECTOR_RESOLUTIONS[0]).toEqual({
      label: "720p",
      width: 1280,
      height: 720,
    });
  });

  it("DEFAULT_RESOLUTION is 1080p at index 1", () => {
    expect(DEFAULT_RESOLUTION).toEqual({
      label: "1080p",
      width: 1920,
      height: 1080,
    });
    expect(DEFAULT_RESOLUTION).toBe(DIRECTOR_RESOLUTIONS[1]);
  });

  it("4K resolutions have correct dimensions", () => {
    expect(DIRECTOR_RESOLUTIONS[3]).toEqual({
      label: "4K UHD",
      width: 3840,
      height: 2160,
    });
    expect(DIRECTOR_RESOLUTIONS[4]).toEqual({
      label: "4K DCI",
      width: 4096,
      height: 2160,
    });
  });
});

// ─── FILTER_PRESET_NAMES / FILTER_LABELS ─────────────────────────────

describe("Filter constants", () => {
  it("FILTER_PRESET_NAMES has exactly 8 entries", () => {
    expect(FILTER_PRESET_NAMES).toHaveLength(8);
  });

  it("FILTER_LABELS covers all ClipFilter keys", () => {
    const filterKeys: (keyof ClipFilter)[] = [
      "brightness",
      "contrast",
      "saturation",
      "hue",
      "blur",
      "sharpen",
      "temperature",
      "vignette",
    ];
    for (const key of filterKeys) {
      expect(FILTER_LABELS[key]).toBeTruthy();
      expect(typeof FILTER_LABELS[key]).toBe("string");
    }
    // No extra keys
    expect(Object.keys(FILTER_LABELS)).toHaveLength(filterKeys.length);
  });

  it("FILTER_LABELS values are all unique Chinese labels", () => {
    const labels = Object.values(FILTER_LABELS);
    const unique = new Set(labels);
    expect(unique.size).toBe(labels.length);
  });
});
