import { describe, it, expect } from "vitest";
import {
  isFilterEmpty,
  clipFilterToCSS,
  vignetteCSS,
  temperatureCSS,
  FILTER_PRESETS,
  FILTER_PRESET_NAMES,
  FILTER_LABELS,
  nextClipId,
  nextTrackId,
  type ClipFilter,
} from "../../src/pages/detail/timeline/types";

// ─── ClipFilter utilities ────────────────────────────────────────────

describe("isFilterEmpty", () => {
  it("returns true for undefined", () => {
    expect(isFilterEmpty(undefined)).toBe(true);
  });

  it("returns true for empty object", () => {
    expect(isFilterEmpty({})).toBe(true);
  });

  it("returns true when all values are 0", () => {
    expect(isFilterEmpty({ brightness: 0, contrast: 0, saturation: 0 })).toBe(true);
  });

  it("returns false when any value is non-zero", () => {
    expect(isFilterEmpty({ brightness: 0.1 })).toBe(false);
    expect(isFilterEmpty({ contrast: -0.1 })).toBe(false);
    expect(isFilterEmpty({ vignette: 0.5 })).toBe(false);
  });
});

describe("clipFilterToCSS", () => {
  it("returns empty string for undefined filter", () => {
    expect(clipFilterToCSS(undefined)).toBe("");
  });

  it("returns empty string for empty filter", () => {
    expect(clipFilterToCSS({})).toBe("");
  });

  it("maps brightness correctly", () => {
    expect(clipFilterToCSS({ brightness: 0.2 })).toContain("brightness(1.20)");
    expect(clipFilterToCSS({ brightness: -0.5 })).toContain("brightness(0.50)");
  });

  it("maps contrast correctly", () => {
    expect(clipFilterToCSS({ contrast: 0.3 })).toContain("contrast(1.30)");
    expect(clipFilterToCSS({ contrast: -0.2 })).toContain("contrast(0.80)");
  });

  it("maps saturation correctly", () => {
    expect(clipFilterToCSS({ saturation: 0.5 })).toContain("saturate(1.50)");
    expect(clipFilterToCSS({ saturation: -1 })).toContain("saturate(0.00)");
  });

  it("maps hue correctly", () => {
    expect(clipFilterToCSS({ hue: 90 })).toContain("hue-rotate(90deg)");
    expect(clipFilterToCSS({ hue: -45 })).toContain("hue-rotate(-45deg)");
  });

  it("maps blur correctly", () => {
    expect(clipFilterToCSS({ blur: 5 })).toContain("blur(5px)");
  });

  it("skips blur when zero", () => {
    expect(clipFilterToCSS({ blur: 0 })).not.toContain("blur");
  });

  it("skips sharpen (not CSS-representable)", () => {
    expect(clipFilterToCSS({ sharpen: 0.8 })).not.toContain("sharpen");
  });

  it("combines multiple filters in one string", () => {
    const css = clipFilterToCSS({ brightness: 0.1, contrast: -0.1, blur: 3 });
    expect(css).toContain("brightness");
    expect(css).toContain("contrast");
    expect(css).toContain("blur");
    const parts = css.split(" ");
    expect(parts.length).toBe(3);
  });
});

describe("vignetteCSS", () => {
  it("returns null for undefined filter", () => {
    expect(vignetteCSS(undefined)).toBeNull();
  });

  it("returns null when vignette is 0", () => {
    expect(vignetteCSS({ vignette: 0 })).toBeNull();
  });

  it("returns radial-gradient for positive vignette", () => {
    const result = vignetteCSS({ vignette: 0.5 });
    expect(result).toContain("radial-gradient");
    expect(result).toContain("rgba(0,0,0,");
  });

  it("scales alpha with vignette value", () => {
    const r1 = vignetteCSS({ vignette: 0.5 });
    const r2 = vignetteCSS({ vignette: 1.0 });
    expect(r1).not.toBe(r2);
    expect(r2!).toContain("0.60"); // 1.0 * 0.6
  });
});

describe("temperatureCSS", () => {
  it("returns null for undefined filter", () => {
    expect(temperatureCSS(undefined)).toBeNull();
  });

  it("returns null when temperature is 0", () => {
    expect(temperatureCSS({ temperature: 0 })).toBeNull();
  });

  it("returns sepia for warm temperature", () => {
    const result = temperatureCSS({ temperature: 0.5 });
    expect(result).toContain("sepia");
  });

  it("returns hue-rotate for cool temperature", () => {
    const result = temperatureCSS({ temperature: -0.5 });
    expect(result).toContain("hue-rotate");
  });
});

// ─── FILTER_PRESETS ──────────────────────────────────────────────────

describe("FILTER_PRESETS", () => {
  it("has 'none' preset that is empty", () => {
    expect(FILTER_PRESETS.none).toEqual({});
  });

  it("has all named presets", () => {
    expect(FILTER_PRESET_NAMES).toContain("none");
    expect(FILTER_PRESET_NAMES).toContain("cinematic");
    expect(FILTER_PRESET_NAMES).toContain("vintage");
    expect(FILTER_PRESET_NAMES).toContain("warm");
    expect(FILTER_PRESET_NAMES).toContain("cool");
    expect(FILTER_PRESET_NAMES).toContain("bw");
    expect(FILTER_PRESET_NAMES).toContain("sharp");
    expect(FILTER_PRESET_NAMES).toContain("soft");
  });

  it("bw preset sets saturation to -1", () => {
    expect(FILTER_PRESETS.bw.saturation).toBe(-1);
  });

  it("cinematic preset includes vignette", () => {
    expect(FILTER_PRESETS.cinematic.vignette).toBeGreaterThan(0);
  });
});

// ─── FILTER_LABELS ───────────────────────────────────────────────────

describe("FILTER_LABELS", () => {
  it("has Chinese labels for all 8 filter params", () => {
    expect(FILTER_LABELS.brightness).toBe("亮度");
    expect(FILTER_LABELS.contrast).toBe("对比度");
    expect(FILTER_LABELS.saturation).toBe("饱和度");
    expect(FILTER_LABELS.hue).toBe("色相");
    expect(FILTER_LABELS.blur).toBe("模糊");
    expect(FILTER_LABELS.sharpen).toBe("锐化");
    expect(FILTER_LABELS.temperature).toBe("色温");
    expect(FILTER_LABELS.vignette).toBe("暗角");
  });
});

// ─── ID generators ───────────────────────────────────────────────────

describe("nextClipId", () => {
  it("generates unique IDs", () => {
    const a = nextClipId();
    const b = nextClipId();
    expect(a).not.toBe(b);
  });

  it("prefixes with tlc_", () => {
    expect(nextClipId()).toMatch(/^tlc_/);
  });
});

describe("nextTrackId", () => {
  it("generates unique IDs", () => {
    const a = nextTrackId();
    const b = nextTrackId();
    expect(a).not.toBe(b);
  });

  it("prefixes with tlt_", () => {
    expect(nextTrackId()).toMatch(/^tlt_/);
  });
});
