import { describe, it, expect } from "vitest";
import { parseSRT, toSRT, toASS, formatTime, parseTime } from "../../src/pages/detail/subtitle/utils";
import type { SubtitleItem } from "../../src/lib/types";
import { DEFAULT_SUBTITLE_STYLE } from "../../src/lib/types";

const sampleSRT = `1
00:00:01,200 --> 00:00:03,500
大家好，欢迎收看本期视频

2
00:00:03,500 --> 00:00:07,100
今天我们来聊聊字幕编辑器

`;

describe("parseSRT", () => {
  it("parses valid SRT into SubtitleItem array", () => {
    const items = parseSRT(sampleSRT);
    expect(items).toHaveLength(2);
    expect(items[0]).toEqual({
      id: expect.any(String),
      startTime: 1.2,
      endTime: 3.5,
      text: "大家好，欢迎收看本期视频",
    });
    expect(items[1]).toEqual({
      id: expect.any(String),
      startTime: 3.5,
      endTime: 7.1,
      text: "今天我们来聊聊字幕编辑器",
    });
  });

  it("returns empty array for empty input", () => {
    expect(parseSRT("")).toEqual([]);
  });

  it("handles SRT with trailing newlines", () => {
    const items = parseSRT("1\n00:00:00,000 --> 00:00:01,000\nhello\n\n");
    expect(items).toHaveLength(1);
    expect(items[0].text).toBe("hello");
  });
});

describe("toSRT", () => {
  it("converts SubtitleItem array to valid SRT string", () => {
    const items: SubtitleItem[] = [
      { id: "a", startTime: 1.2, endTime: 3.5, text: "大家好" },
      { id: "b", startTime: 3.5, endTime: 7.1, text: "今天" },
    ];
    const result = toSRT(items);
    expect(result).toContain("00:00:01,200 --> 00:00:03,500");
    expect(result).toContain("大家好");
    expect(result).toContain("00:00:03,500 --> 00:00:07,100");
    expect(result).toContain("今天");
  });

  it("returns empty string for empty array", () => {
    expect(toSRT([])).toBe("");
  });
});

describe("toASS", () => {
  it("generates ASS header with style information", () => {
    const items: SubtitleItem[] = [
      { id: "a", startTime: 0, endTime: 2, text: "test" },
    ];
    const result = toASS(items, DEFAULT_SUBTITLE_STYLE);
    expect(result).toContain("[Script Info]");
    expect(result).toContain("[V4+ Styles]");
    expect(result).toContain("Style: Default");
    expect(result).toContain("Fontsize");
    expect(result).toContain("[Events]");
    expect(result).toContain("Dialogue:");
    expect(result).toContain("test");
  });
});

describe("formatTime", () => {
  it("formats seconds to SRT timestamp", () => {
    expect(formatTime(0)).toBe("00:00:00,000");
    expect(formatTime(1.2)).toBe("00:00:01,200");
    expect(formatTime(61.5)).toBe("00:01:01,500");
    expect(formatTime(3661.999)).toBe("01:01:01,999");
  });
});

describe("parseTime", () => {
  it("parses SRT timestamp to seconds", () => {
    expect(parseTime("00:00:00,000")).toBe(0);
    expect(parseTime("00:00:01,200")).toBe(1.2);
    expect(parseTime("00:01:01,500")).toBe(61.5);
  });
});
