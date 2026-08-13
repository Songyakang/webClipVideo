import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { usePanoramaEngine } from "../../src/pages/detail/director/usePanoramaEngine";

describe("usePanoramaEngine 防御分支", () => {
  it("返回 initEngine / dispose / engineRef 三个接口", () => {
    const canvasRef = { current: document.createElement("canvas") };
    const { result } = renderHook(() =>
      usePanoramaEngine({ canvasRef, imageUrl: "asset://mock.jpg" }),
    );
    expect(typeof result.current.initEngine).toBe("function");
    expect(typeof result.current.dispose).toBe("function");
    expect(result.current.engineRef).toBeDefined();
  });

  it("canvas 未挂载时 initEngine 不抛异常", async () => {
    const canvasRef = { current: null };
    const { result } = renderHook(() =>
      usePanoramaEngine({ canvasRef, imageUrl: "asset://mock.jpg" }),
    );
    await expect(result.current.initEngine()).resolves.toBeUndefined();
  });

  it("无 WebGPU 时 initEngine 不抛异常（jsdom 默认无 navigator.gpu）", async () => {
    // jsdom 环境没有 navigator.gpu，initEngine 应在检测处提前返回
    expect((navigator as Navigator & { gpu?: unknown }).gpu).toBeUndefined();

    const canvasRef = { current: document.createElement("canvas") };
    const { result } = renderHook(() =>
      usePanoramaEngine({ canvasRef, imageUrl: "asset://mock.jpg" }),
    );
    await expect(result.current.initEngine()).resolves.toBeUndefined();
  });

  it("dispose 可重复调用且不抛异常", () => {
    const canvasRef = { current: document.createElement("canvas") };
    const { result } = renderHook(() =>
      usePanoramaEngine({ canvasRef, imageUrl: "asset://mock.jpg" }),
    );
    expect(() => result.current.dispose()).not.toThrow();
    expect(() => result.current.dispose()).not.toThrow();
  });

  it("dispose 后 initEngine 仍可安全调用", async () => {
    const canvasRef = { current: document.createElement("canvas") };
    const { result } = renderHook(() =>
      usePanoramaEngine({ canvasRef, imageUrl: "asset://mock.jpg" }),
    );
    result.current.dispose();
    await expect(result.current.initEngine()).resolves.toBeUndefined();
  });

  it("console 不被 initEngine 正常路径污染", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const canvasRef = { current: document.createElement("canvas") };
    const { result } = renderHook(() =>
      usePanoramaEngine({ canvasRef, imageUrl: "asset://mock.jpg" }),
    );
    await result.current.initEngine();
    // jsdom 无 GPU → 提前返回，不应报错
    expect(errSpy).not.toHaveBeenCalled();
    errSpy.mockRestore();
  });
});
