import { describe, it, expect, vi } from "vitest";
import { showToast, type ToastDetail } from "../../src/lib/toast";

describe("showToast", () => {
  it("dispatches an 'app-toast' custom event on window", () => {
    const handler = vi.fn();
    window.addEventListener("app-toast", handler);

    showToast("hello", "info");

    expect(handler).toHaveBeenCalledTimes(1);
    const detail: ToastDetail = (handler.mock.calls[0][0] as CustomEvent<ToastDetail>).detail;
    expect(detail.message).toBe("hello");
    expect(detail.type).toBe("info");

    window.removeEventListener("app-toast", handler);
  });

  it("defaults type to 'info'", () => {
    const handler = vi.fn();
    window.addEventListener("app-toast", handler);

    showToast("test");

    const detail: ToastDetail = (handler.mock.calls[0][0] as CustomEvent<ToastDetail>).detail;
    expect(detail.type).toBe("info");

    window.removeEventListener("app-toast", handler);
  });

  it("passes 'success' type correctly", () => {
    const handler = vi.fn();
    window.addEventListener("app-toast", handler);

    showToast("done", "success");

    const detail: ToastDetail = (handler.mock.calls[0][0] as CustomEvent<ToastDetail>).detail;
    expect(detail.type).toBe("success");

    window.removeEventListener("app-toast", handler);
  });

  it("passes 'error' type correctly", () => {
    const handler = vi.fn();
    window.addEventListener("app-toast", handler);

    showToast("fail", "error");

    const detail: ToastDetail = (handler.mock.calls[0][0] as CustomEvent<ToastDetail>).detail;
    expect(detail.type).toBe("error");

    window.removeEventListener("app-toast", handler);
  });
});
