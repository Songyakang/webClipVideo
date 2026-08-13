import { describe, it, expect } from "vitest";
import { parseSRT, toSRT, toASS, formatTime, parseTime } from "../../src/pages/detail/subtitle/utils";
import type { SubtitleItem } from "../../src/lib/types";
import { DEFAULT_SUBTITLE_STYLE } from "../../src/lib/types";

// ─── parseSRT 增强测试 ──────────────────────────────────────────────

describe("parseSRT edge cases", () => {
  it("handles SRT with dot timestamps", () => {
    const items = parseSRT("1\n00:00:00.500 --> 00:00:02.300\ntest\n");
    expect(items).toHaveLength(1);
    expect(items[0].startTime).toBe(0.5);
    expect(items[0].endTime).toBe(2.3);
  });

  it("handles SRT with comma timestamps", () => {
    const items = parseSRT("1\n00:00:00,500 --> 00:00:02,300\ntest\n");
    expect(items).toHaveLength(1);
    expect(items[0].startTime).toBe(0.5);
    expect(items[0].endTime).toBe(2.3);
  });

  it("ignores extra metadata lines before timestamp", () => {
    const items = parseSRT(
      "1\n00:00:01,500 --> 00:00:03,000\n{\\an8}subtitle text\n"
    );
    expect(items).toHaveLength(1);
    expect(items[0].text).toBe("{\\an8}subtitle text");
  });

  it("skips blocks with fewer than 3 lines", () => {
    const items = parseSRT("bad block\njust two lines\n");
    expect(items).toEqual([]);
  });

  it("skips blocks where second line is not a timestamp", () => {
    const items = parseSRT("1\nnot a timestamp\nsome text\n\n");
    expect(items).toEqual([]);
  });

  it("preserves multi-line subtitle text", () => {
    const items = parseSRT(
      "1\n00:00:01,000 --> 00:00:03,000\nline one\nline two\n\n"
    );
    expect(items).toHaveLength(1);
    expect(items[0].text).toBe("line one\nline two");
  });

  it("handles carriage return line endings", () => {
    const items = parseSRT(
      "1\r\n00:00:01,000 --> 00:00:02,000\r\ntest\r\n"
    );
    expect(items).toHaveLength(1);
    expect(items[0].text).toBe("test");
  });

  it("handles whitespace-only SRT", () => {
    expect(parseSRT("   \n\n  ")).toEqual([]);
  });
});

// ─── toSRT 增强测试 ─────────────────────────────────────────────────

describe("toSRT edge cases", () => {
  it("round-trips SRT format", () => {
    const items: SubtitleItem[] = [
      { id: "1", startTime: 1.5, endTime: 3.2, text: "hello" },
      { id: "2", startTime: 5.0, endTime: 7.8, text: "world" },
    ];
    const srt = toSRT(items);
    const parsed = parseSRT(srt);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].startTime).toBeCloseTo(1.5, 2);
    expect(parsed[0].endTime).toBeCloseTo(3.2, 2);
    expect(parsed[0].text).toBe("hello");
    expect(parsed[1].startTime).toBeCloseTo(5.0, 2);
    expect(parsed[1].endTime).toBeCloseTo(7.8, 2);
    expect(parsed[1].text).toBe("world");
  });

  it("handles millisecond rounding near boundaries", () => {
    const items: SubtitleItem[] = [
      { id: "x", startTime: 1.9995, endTime: 2.0004, text: "rounding" },
    ];
    const result = toSRT(items);
    // 1.9995 rounds to 2.000, 2.0004 rounds to 2.000
    expect(result).toContain("00:00:02,000");
  });

  it("trailing newline for non-empty array", () => {
    const items: SubtitleItem[] = [
      { id: "x", startTime: 0, endTime: 1, text: "a" },
    ];
    const result = toSRT(items);
    expect(result).toBe("1\n00:00:00,000 --> 00:00:01,000\na\n");
  });
});

// ─── toASS 增强测试 ─────────────────────────────────────────────────

describe("toASS edge cases", () => {
  it("handles empty items array", () => {
    const result = toASS([], DEFAULT_SUBTITLE_STYLE);
    expect(result).toContain("[Script Info]");
    expect(result).toContain("[Events]");
    expect(result).toContain("Format: Layer");
    // No Dialogue lines for empty input
    expect(result).not.toContain("Dialogue:");
  });

  it("properly ASS color conversion (BBGGRR format)", () => {
    const items: SubtitleItem[] = [
      { id: "a", startTime: 0, endTime: 1, text: "color test" },
    ];
    const style = {
      ...DEFAULT_SUBTITLE_STYLE,
      fontColor: "#FF5733", // RGB → should become &H003357FF in ASS (BGR)
      outlineColor: "#000000",
    };
    const result = toASS(items, style);
    // PrimaryColour in ASS is &H00BBGGRR
    expect(result).toContain("3357FF"); // font color in BGR
  });

  it("escapes ASS special characters", () => {
    const items: SubtitleItem[] = [
      { id: "a", startTime: 0, endTime: 1, text: "hello \\ world {test}" },
    ];
    const result = toASS(items, DEFAULT_SUBTITLE_STYLE);
    const dialogueLine = result
      .split("\n")
      .find((l) => l.startsWith("Dialogue:"));
    // Backslash should be escaped, braces escaped
    expect(dialogueLine).toContain("\\\\");
    expect(dialogueLine).toContain("\\{");
    expect(dialogueLine).toContain("\\}");
  });

  it("bold and italic reflected in style line", () => {
    const items: SubtitleItem[] = [
      { id: "a", startTime: 0, endTime: 1, text: "bi" },
    ];
    const boldStyle = { ...DEFAULT_SUBTITLE_STYLE, bold: true, italic: false };
    const result = toASS(items, boldStyle);
    expect(result).toContain("Style: Default"); // bold field value
  });
});

// ─── formatTime 增强测试 ─────────────────────────────────────────────

describe("formatTime edge cases", () => {
  it("pads hours, minutes, seconds to 2 digits", () => {
    expect(formatTime(3661)).toBe("01:01:01,000");
    expect(formatTime(359999.999)).toBe("99:59:59,999");
  });

  it("handles sub-millisecond correctly", () => {
    // 0.0005 → rounds to 0.001 → "00:00:00,001"
    expect(formatTime(0.0005)).toBe("00:00:00,001");
    // 0.0004 → rounds to 0.000 → "00:00:00,000"
    expect(formatTime(0.0004)).toBe("00:00:00,000");
  });
});

// ─── parseTime 增强测试 ──────────────────────────────────────────────

describe("parseTime edge cases", () => {
  it("returns 0 for invalid time string", () => {
    expect(parseTime("not a timestamp")).toBe(0);
    expect(parseTime("")).toBe(0);
  });

  it("handles dot as millisecond separator", () => {
    expect(parseTime("00:00:01.500")).toBe(1.5);
  });

  it("handles comma as millisecond separator", () => {
    expect(parseTime("00:00:01,500")).toBe(1.5);
  });
});
