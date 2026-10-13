import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

export interface EndpointConfig {
  key: string;
  name: string;
  path: string;
  model: string;
  params?: Record<string, unknown>;
}
export interface Platform {
  id: string;
  name: string;
  platformType: "image" | "video" | "text";
  location: "local" | "online";
  authType?: "none" | "bearer";
  apiKey?: string;
  baseEndpoint: string;
  endpoints: EndpointConfig[];
}
export const FUNCTION_OPTIONS = [
  { key: "generate-image", label: "生成图片" },
  { key: "edit-image", label: "编辑图片" },
  { key: "chat", label: "对话 / 提示词优化" },
  { key: "reverse-prompt", label: "反推提示词" },
];
export function endpointUrl(base: string, path: string) {
  let url: URL;
  try { url = new URL(base.trim()); } catch { throw new Error("请输入有效的 HTTP(S) 服务地址"); }
  if (!["http:", "https:"].includes(url.protocol) || url.search || url.hash || url.username || url.password) {
    throw new Error("服务地址须为 HTTP(S)，不能包含认证信息、查询参数或片段");
  }
  const relative = path.trim().replace(/^\/+/, "");
  if (!relative || /:\/\/|[?#]/.test(relative)) throw new Error("请填写有效的相对接口路径");
  return `${base.trim().replace(/\/+$/, "")}/${relative}`;
}
export function parseParams(input: string): Record<string, unknown> {
  let value: unknown;
  try { value = JSON.parse(input || "{}"); } catch { throw new Error("额外参数必须是有效的 JSON 对象"); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("额外参数必须是 JSON 对象");
  const params = value as Record<string, unknown>;
  for (const key of ["model", "messages", "stream"]) {
    if (key in params) throw new Error(`额外参数不能覆盖 ${key}`);
  }
  if ("temperature" in params && (typeof params.temperature !== "number" || params.temperature < 0 || params.temperature > 2)) {
    throw new Error("temperature 必须是 0 到 2 之间的数字");
  }
  for (const key of ["max_tokens", "max_completion_tokens"]) {
    if (key in params && (typeof params[key] !== "number" || !Number.isSafeInteger(params[key]) || (params[key] as number) <= 0)) {
      throw new Error(`${key} 必须是正整数`);
    }
  }
  if ("max_tokens" in params && "max_completion_tokens" in params) throw new Error("两种输出长度参数只能设置一个");
  return params;
}
export function validatePlatform(form: Platform): Platform {
  const clean = { ...form, name: form.name.trim(), baseEndpoint: form.baseEndpoint.trim().replace(/\/+$/, ""), apiKey: form.apiKey?.trim() };
  if (!clean.name) throw new Error("请填写平台名称");
  if (clean.authType === "bearer" && !clean.apiKey) throw new Error("Bearer 认证需要填写 API Key");
  if (!clean.endpoints.length) throw new Error("请至少配置一个接口");
  const keys = new Set<string>();
  clean.endpoints = clean.endpoints.map((ep) => {
    if (!FUNCTION_OPTIONS.some((f) => f.key === ep.key)) throw new Error("请选择接口功能");
    if (keys.has(ep.key)) throw new Error("同一平台不能重复配置相同功能");
    keys.add(ep.key);
    endpointUrl(clean.baseEndpoint, ep.path);
    if (!ep.model.trim()) throw new Error("请填写模型名称");
    return { ...ep, path: `/${ep.path.trim().replace(/^\/+/, "")}`, model: ep.model.trim(), params: parseParams(JSON.stringify(ep.params ?? {})) };
  });
  return clean;
}
export const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error);
export const PLATFORM_CHANGE_EVENT = "platforms-changed";

export function usePlatforms() {
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    invoke<Platform[]>("get_platforms").then((list) => {
      if (active) { setPlatforms(list); setError(""); }
    }).catch((err) => { if (active) setError(errorMessage(err)); });
    return () => { active = false; };
  }, [revision]);
  useEffect(() => {
    const reload = () => setRevision((r) => r + 1);
    window.addEventListener(PLATFORM_CHANGE_EVENT, reload);
    return () => window.removeEventListener(PLATFORM_CHANGE_EVENT, reload);
  }, []);
  return { platforms, error, retry: () => setRevision((r) => r + 1) };
}

export function platformOptions(platforms: Platform[], capability: "chat" | "reverse-prompt") {
  const builtin = capability === "chat"
    ? [{ value: "deepseek", label: "DeepSeek" }, { value: "stepfun", label: "StepFun" }]
    : [{ value: "stepfun", label: "StepFun · 视觉" }];
  return [...builtin, ...platforms.filter((p) => p.endpoints.some((e) => e.key === capability)).map((p) => ({
    value: `platform:${p.id}`, label: `${p.name} · ${p.endpoints.find((e) => e.key === capability)!.model}`,
  }))];
}
export function platformRequest(value: string) {
  return value.startsWith("platform:") ? { provider: "custom", platformId: value.slice(9) } : { provider: value, platformId: undefined };
}

/** Persist LLM selection in SQLite; import the previous WebView preference once. */
export function useLlmPreference(key: string, fallback: string) {
  const [value, setValue] = useState(() => {
    try { return localStorage.getItem(key) || fallback; } catch { return fallback; }
  });
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    setLoaded(false);
    (async () => {
      try {
        const stored = await invoke<unknown>("get_config_key", { key });
        if (!active) return;
        if (stored != null && typeof stored !== "string") throw new Error("模型选择配置格式错误");
        let legacy: string | null = null;
        try { legacy = localStorage.getItem(key); } catch { /* storage unavailable */ }
        if (stored == null && legacy) await invoke("set_config_key", { key, value: legacy });
        if (!active) return;
        setValue(typeof stored === "string" ? stored : legacy || fallback);
        try { localStorage.removeItem(key); } catch { /* optional cleanup */ }
        setError(""); setLoaded(true);
      } catch (err) { if (active) setError(errorMessage(err)); }
    })();
    return () => { active = false; };
  }, [key, fallback, revision]);
  const save = async (next: string) => {
    if (!loaded) return;
    setLoaded(false);
    try {
      await invoke("set_config_key", { key, value: next });
      setValue(next); setError("");
    } catch (err) { setError(errorMessage(err)); }
    finally { setLoaded(true); }
  };
  return { value, save, loaded, error, retry: () => setRevision((r) => r + 1) };
}
