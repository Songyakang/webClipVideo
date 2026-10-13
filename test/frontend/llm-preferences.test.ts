import { act, renderHook, waitFor, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { useLlmPreference } from "../../src/lib/platforms";
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
beforeEach(() => { localStorage.clear(); vi.mocked(invoke).mockReset(); });
afterEach(cleanup);
it("imports legacy selection into SQLite then removes localStorage copy", async () => {
  localStorage.setItem("llm-chat", "platform:local");
  vi.mocked(invoke).mockResolvedValue(null);
  const { result } = renderHook(() => useLlmPreference("llm-chat", "deepseek"));
  await waitFor(() => expect(result.current.loaded).toBe(true));
  expect(invoke).toHaveBeenCalledWith("set_config_key", { key: "llm-chat", value: "platform:local" });
  expect(result.current.value).toBe("platform:local");
  expect(localStorage.getItem("llm-chat")).toBeNull();
});
it("SQLite wins over stale localStorage and new choices are written to SQLite", async () => {
  localStorage.setItem("llm-chat", "old");
  vi.mocked(invoke).mockImplementation(async (cmd) => cmd === "get_config_key" ? "platform:db" as any : null);
  const { result } = renderHook(() => useLlmPreference("llm-chat", "deepseek"));
  await waitFor(() => expect(result.current.loaded).toBe(true));
  expect(result.current.value).toBe("platform:db");
  await act(() => result.current.save("stepfun"));
  expect(invoke).toHaveBeenCalledWith("set_config_key", { key: "llm-chat", value: "stepfun" });
  expect(result.current.value).toBe("stepfun");
});
it("failed migration retains the legacy preference and supports retry", async () => {
  localStorage.setItem("llm-chat", "platform:local");
  let fail = true;
  vi.mocked(invoke).mockImplementation(async (cmd) => { if (cmd === "set_config_key" && fail) throw "写入失败"; return null; });
  const { result } = renderHook(() => useLlmPreference("llm-chat", "deepseek"));
  await waitFor(() => expect(result.current.error).toBe("写入失败"));
  expect(result.current.loaded).toBe(false);
  expect(localStorage.getItem("llm-chat")).toBe("platform:local");
  fail = false; act(() => result.current.retry());
  await waitFor(() => expect(result.current.loaded).toBe(true));
  expect(localStorage.getItem("llm-chat")).toBeNull();
});
