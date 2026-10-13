import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";

import { type Platform, type EndpointConfig, FUNCTION_OPTIONS, validatePlatform, endpointUrl, parseParams, errorMessage, PLATFORM_CHANGE_EVENT } from "../lib/platforms";
import { showToast } from "../lib/toast";
import { SelectWrap, TOOLBOX_CSS } from "./detail/toolbox/common";

const TABS = [
  { key: "image" as const, label: "图片" },
  { key: "video" as const, label: "视频" },
  { key: "text" as const, label: "文本" },
];

const PRESET_ENDPOINTS: Record<string, EndpointConfig[]> = {
  image: [
    { key: "generate-image", name: "生成图片", path: "/images/generations", model: "" },
    { key: "edit-image", name: "编辑图片", path: "/images/edits", model: "" },
  ],
  text: [
    { key: "chat", name: "对话", path: "/chat/completions", model: "" },
  ],
};

const EMPTY_FORM: Platform = {
  id: "",
  name: "",
  platformType: "image",
  location: "online",
  apiKey: "",
  authType: "bearer",
  baseEndpoint: "",
  endpoints: [],
};

function genId() {
  return "p_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export default function Settings() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<"image" | "video" | "text">("image");
  const [platforms, setPlatforms] = useState<Platform[]>([]);

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Platform | null>(null);
  const [form, setForm] = useState<Platform>({ ...EMPTY_FORM });

  const [stepfunKey, setStepfunKey] = useState("");
  const [deepseekKey, setDeepseekKey] = useState("");
  const [tripoKey, setTripoKey] = useState("");
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});

  const loadedRef = useRef(false);
  const savingRef = useRef(false);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [formError, setFormError] = useState("");
  const [revision, setRevision] = useState(0);
  const [paramText, setParamText] = useState<string[]>([]);
  const [testing, setTesting] = useState<string | null>(null);
  const formVersion = useRef(0);
  const [testResult, setTestResult] = useState("");

  // ---- load ----
  useEffect(() => {
    loadedRef.current = false;
    let cancelled = false;
    setLoadError("");
    (async () => {
      try {
        const [config, list] = await Promise.all([
          invoke<Record<string, unknown>>("get_all_config"), invoke<Platform[]>("get_platforms"),
        ]);
        if (cancelled) return;
        setStepfunKey((config?.stepfun_api_key as string) || "");
        setDeepseekKey((config?.deepseek_api_key as string) || "");
        setTripoKey((config?.tripo_api_key as string) || "");
        setPlatforms(list);
        loadedRef.current = true;
      } catch (err) { if (!cancelled) setLoadError(errorMessage(err)); }
    })();
    return () => { cancelled = true; };
  }, [revision]);

  // ---- auto-save ----
  const saveLegacyKey = useCallback(async (key: string, value: string) => {
    if (!loadedRef.current) return;
    try { await invoke("set_config_key", { key, value: value.trim() }); showToast("密钥已保存", "success"); } catch (err) { showToast(`保存失败：${errorMessage(err)}`, "error"); }
  }, []);

  const savePlatforms = useCallback(async (list: Platform[]) => {
    if (!loadedRef.current) throw new Error("配置尚未加载成功，请先重试加载");
    await invoke("save_platforms", { platforms: list });
    setPlatforms(list);
    window.dispatchEvent(new Event(PLATFORM_CHANGE_EVENT));
  }, []);

  const openAddForm = () => {
    if (!loadedRef.current || savingRef.current) return;
    setFormError(""); setTestResult("");
    setParamText((PRESET_ENDPOINTS[activeTab] || []).map(() => "{}"));
    setEditing(null);
    setForm({
      ...EMPTY_FORM,
      platformType: activeTab,
      endpoints: (PRESET_ENDPOINTS[activeTab] || []).map((e) => ({ ...e })),
    });
    setShowForm(true);
  };

  const openEditForm = (p: Platform) => {
    if (savingRef.current) return;
    setFormError(""); setTestResult("");
    setParamText(p.endpoints.map((e) => JSON.stringify(e.params ?? {}, null, 2)));
    setEditing(p);
    setForm({
      ...p,
      authType: p.authType ?? (p.apiKey?.trim() ? "bearer" : "none"),
      endpoints: p.endpoints.map((e) => ({ ...e, params: e.params ? { ...e.params } : undefined })),
    });
    setShowForm(true);
  };

  const preparedForm = () => validatePlatform({ ...form, endpoints: form.endpoints.map((ep, i) => ({
    ...ep, params: parseParams(paramText[i] ?? "{}"),
  })) });

  const handleFormSave = async () => {
    if (savingRef.current) return;
    setFormError("");
    try {
      const clean = preparedForm();
      savingRef.current = true; setSaving(true);
      const list = editing ? platforms.map((p) => p.id === editing.id ? clean : p) : [...platforms, { ...clean, id: genId() }];
      await savePlatforms(list);
      setShowForm(false); setEditing(null);
      showToast("平台已保存", "success");
    } catch (err) { setFormError(errorMessage(err)); }
    finally { savingRef.current = false; setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (savingRef.current) return;
    savingRef.current = true; setSaving(true);
    try { await savePlatforms(platforms.filter((p) => p.id !== id)); }
    catch (err) { showToast(`删除失败：${errorMessage(err)}`, "error"); }
    finally { savingRef.current = false; setSaving(false); }
  };

  const testConnection = async (functionKey: string) => {
    if (testing) return;
    const version = formVersion.current;
    setTestResult(""); setFormError("");
    try {
      const platform = preparedForm();
      setTesting(functionKey);
      const result = await invoke<{ model: string; latencyMs: number }>("test_llm_connection", { platform, functionKey });
      if (version === formVersion.current) setTestResult(`连接成功：${result.model} · ${result.latencyMs} ms`);
    } catch (err) { if (version === formVersion.current) setFormError(errorMessage(err)); }
    finally { setTesting(null); }
  };

  useEffect(() => { formVersion.current++; setTestResult(""); }, [form, paramText, showForm]);

  // ---- endpoint helpers (in form) ----
  const addEndpoint = () => {
    setParamText((p) => [...p, "{}"]);
    setForm({ ...form, endpoints: [...form.endpoints, { key: "", name: "", path: "", model: "" }] });
  };

  const updateEndpoint = (idx: number, field: string, value: string) => {
    const eps = form.endpoints.map((e, i) => {
      if (i !== idx) return e;
      const updated = { ...e, [field]: value };
      // when key changes, auto-fill name from FUNCTION_OPTIONS
      if (field === "key") {
        const opt = FUNCTION_OPTIONS.find((o) => o.key === value);
        if (opt) updated.name = opt.label;
      }
      return updated;
    });
    setForm({ ...form, endpoints: eps });
  };

  const removeEndpoint = (idx: number) => {
    setParamText((p) => p.filter((_, i) => i !== idx));
    setForm({ ...form, endpoints: form.endpoints.filter((_, i) => i !== idx) });
  };

  const filtered = platforms.filter((p) => p.platformType === activeTab);

  return (
    <div className="mx-auto max-w-[680px] px-4 py-6">
      <style>{TOOLBOX_CSS}</style>
      <style>{`
        .s-input {
          width: 100%; padding: 8px 12px; border-radius: 6px;
          border: 1px solid #30363d; background: #0d1117;
          color: #e6edf3; font-size: 13px; outline: none;
          box-sizing: border-box; font-family: monospace;
        }
        .s-input:focus { border-color: #58a6ff; }
        .s-label { display:block; margin-bottom:4px; color:#8b949e; font-size:12px; }
        .s-tab {
          flex:1; text-align:center; padding: 10px 0; font-size:13px;
          cursor:pointer; border:none; background:transparent; color:#8b949e;
          border-bottom: 2px solid transparent; transition: all 0.15s;
        }
        .s-tab:hover { color:#e6edf3; }
        .s-tab.active { color:#58a6ff; border-bottom-color:#58a6ff; }
        .s-btn {
          padding: 6px 14px; border-radius: 6px; font-size:12px;
          cursor:pointer; border:1px solid #30363d; transition: all 0.15s;
          background:transparent; color:#8b949e;
        }
        .s-btn:hover { background:#21262d; color:#e6edf3; }
        .s-btn-primary { background:#238636; color:#fff; border-color:#238636; }
        .s-btn-primary:hover { background:#2ea043; }
        .s-btn-danger { color:#f85149; }
        .s-btn-danger:hover { background:#2d1217; }
        .s-btn-sm { padding:2px 8px; font-size:11px; }
        .s-card {
          background:#0d1117; border:1px solid #21262d; border-radius:8px;
          padding:14px; margin-bottom:8px;
        }
        .s-toggle-group {
          display:inline-flex; border-radius:6px; overflow:hidden;
          border:1px solid #30363d;
        }
        .s-toggle-btn {
          padding:5px 12px; font-size:12px; cursor:pointer; border:none;
          background:transparent; color:#8b949e; transition:all 0.15s;
        }
        .s-toggle-btn.active { background:#238636; color:#fff; }
        .s-toggle-btn:not(.active):hover { background:#21262d; }
        .s-badge {
          display:inline-block; padding:2px 8px; border-radius:4px;
          font-size:10px; margin-right:4px;
        }
        .s-endpoint-row {
          display:flex; gap:8px; align-items:center; padding:8px;
          background:#161b22; border-radius:6px; margin-bottom:6px;
        }
        .s-endpoint-row input { flex:1; min-width:0; }
      `}</style>

      {/* header */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24 }}>
        <button
          className="bg-transparent border cursor-pointer rounded-lg px-4 py-2 text-sm"
          style={{ background: "#161b22", borderColor: "#30363d", color: "#58a6ff" }}
          onClick={() => navigate(-1)}
        >
          &larr; 返回
        </button>
        <h1 style={{ margin: 0, color: "#e6edf3", fontSize: 18, fontWeight: 600 }}>设置</h1>
      </div>

      {/* tabs */}
      <div style={{ display: "flex", borderBottom: "1px solid #21262d", marginBottom: 24 }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`s-tab${activeTab === t.key ? " active" : ""}`}
            onClick={() => setActiveTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* default keys */}
      <section style={{ marginBottom: 28 }}>
        <h3 style={{ color: "#e6edf3", fontSize: 14, margin: "0 0 12px" }}>默认密钥</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {activeTab === "image" && (
            <>
              <div>
                <label className="s-label">
                  StepFun API Key
                  <button className="s-btn s-btn-sm" style={{ marginLeft: 6 }}
                    onClick={() => setShowKeys((p) => ({ ...p, stepfun: !p.stepfun }))}>
                    {showKeys.stepfun ? "隐藏" : "显示"}
                  </button>
                </label>
                <input className="s-input"
                  type={showKeys.stepfun ? "text" : "password"}
                  placeholder="sk-..." value={stepfunKey}
                  onChange={(e) => setStepfunKey(e.target.value)}
                  onBlur={() => saveLegacyKey("stepfun_api_key", stepfunKey)}
                />
              </div>
              <div>
                <label className="s-label">
                  Tripo3D API Key
                  <button className="s-btn s-btn-sm" style={{ marginLeft: 6 }}
                    onClick={() => setShowKeys((p) => ({ ...p, tripo: !p.tripo }))}>
                    {showKeys.tripo ? "隐藏" : "显示"}
                  </button>
                </label>
                <input className="s-input"
                  type={showKeys.tripo ? "text" : "password"}
                  placeholder="tsk-..." value={tripoKey}
                  onChange={(e) => setTripoKey(e.target.value)}
                  onBlur={() => saveLegacyKey("tripo_api_key", tripoKey)}
                />
              </div>
            </>
          )}
          {activeTab === "text" && (
            <div>
              <label className="s-label">
                DeepSeek API Key
                <button className="s-btn s-btn-sm" style={{ marginLeft: 6 }}
                  onClick={() => setShowKeys((p) => ({ ...p, deepseek: !p.deepseek }))}>
                  {showKeys.deepseek ? "隐藏" : "显示"}
                </button>
              </label>
              <input className="s-input"
                type={showKeys.deepseek ? "text" : "password"}
                placeholder="sk-..." value={deepseekKey}
                onChange={(e) => setDeepseekKey(e.target.value)}
                onBlur={() => saveLegacyKey("deepseek_api_key", deepseekKey)}
              />
            </div>
          )}
          {activeTab === "video" && (
            <p style={{ color: "#484f58", fontSize: 13, margin: 0 }}>
              视频处理使用本地工具（ffmpeg/whisper），无需在线密钥
            </p>
          )}
        </div>
      </section>

      <div style={{ borderTop: "1px solid #21262d", margin: "24px 0" }} />

      {loadError && <div role="alert" className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">
        配置加载失败：{loadError} <button onClick={() => setRevision((r) => r + 1)} className="ml-2 underline">重试加载</button>
      </div>}
      {/* custom platforms */}
      <section>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h3 style={{ color: "#e6edf3", fontSize: 14, margin: 0 }}>自定义平台</h3>
          <button className="s-btn s-btn-primary" disabled={saving || !loadedRef.current} onClick={openAddForm}>+ 新增</button>
        </div>

        {filtered.length === 0 && (
          <p style={{ color: "#484f58", fontSize: 13, textAlign: "center", padding: 40 }}>
            暂无自定义平台，点击"+ 新增"添加
          </p>
        )}

        {filtered.map((p) => (
          <div key={p.id} className="s-card">
            <div style={{ marginBottom: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <span style={{ color: "#e6edf3", fontSize: 14, fontWeight: 500 }}>{p.name}</span>
                <div style={{ display: "flex", gap: 6 }}>
                  <button className="s-btn s-btn-sm" disabled={saving} onClick={() => openEditForm(p)}>编辑</button>
                  <button className="s-btn s-btn-sm s-btn-danger" disabled={saving} onClick={() => handleDelete(p.id)}>删除</button>
                </div>
              </div>
              <div style={{ marginBottom: 4 }}>
                <span className="s-badge" style={{
                  background: p.location === "local" ? "#1a2a3d" : "#2d1a3d",
                  color: p.location === "local" ? "#58a6ff" : "#bc8cff",
                }}>
                  {p.location === "local" ? "本地" : "线上"}
                </span>
              </div>
              <div style={{ color: "#8b949e", fontSize: 12, fontFamily: "monospace" }}>
                {p.baseEndpoint}
              </div>
            </div>

            {/* endpoint list */}
            {p.endpoints.length > 0 && (
              <div style={{ borderTop: "1px solid #21262d", paddingTop: 8 }}>
                {p.endpoints.map((ep, i) => (
                  <div key={i} style={{
                    display: "flex", alignItems: "center", gap: 12,
                    padding: "4px 0", fontSize: 12,
                  }}>
                    <span style={{ color: "#58a6ff", fontWeight: 500, minWidth: 56 }}>{ep.name}</span>
                    <span style={{ color: "#8b949e", fontFamily: "monospace", flex: 1 }}>{ep.path}</span>
                    <span style={{ color: "#6e7681" }}>{ep.model}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </section>

      {/* ---- add/edit popup ---- */}
      {showForm && (
        <>
          <div className="fixed inset-0 z-[1001]" style={{ background: "rgba(0,0,0,0.5)" }}
            onClick={() => { if (!savingRef.current) { setShowForm(false); setEditing(null); } }} />
          <div
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[1002] rounded-xl p-5"
            style={{
              width: 520, maxHeight: "85vh", overflowY: "auto",
              background: "#161b22", border: "1px solid #30363d",
              boxShadow: "0 8px 48px rgba(0,0,0,0.8)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ color: "#e6edf3", fontSize: 14, fontWeight: 600, margin: "0 0 16px" }}>
              {editing ? "编辑平台" : "新增平台"}
            </h3>

            <fieldset disabled={saving} className="m-0 flex min-w-0 flex-col gap-3 border-0 p-0 disabled:opacity-60">
              <div className="flex items-center gap-2 text-sm text-slate-300">
                <span>服务预设</span>
                <SelectWrap contentZIndex={1100} value="custom" items={[{ value: "custom", label: "手动配置" }, { value: "deepseek", label: "DeepSeek" }, { value: "ollama", label: "Ollama（兼容接口）" }, { value: "lmstudio", label: "LM Studio" }]}
                  onValueChange={(preset) => {
                    if (preset === "custom") return;
                    const local = preset !== "deepseek";
                    setForm({ ...form, name: local ? (preset === "ollama" ? "Ollama" : "LM Studio") : "DeepSeek", platformType: "text",
                      location: local ? "local" : "online", authType: local ? "none" : "bearer",
                      baseEndpoint: local ? (preset === "ollama" ? "http://localhost:11434/v1" : "http://localhost:1234/v1") : "https://api.deepseek.com/v1",
                      endpoints: [{ key: "chat", name: "对话", path: "/chat/completions", model: local ? "" : "deepseek-chat" }] });
                    setParamText(["{}"]);
                  }} />
              </div>
              {/* basic info */}
              <div style={{ display: "flex", gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <label className="s-label">名称</label>
                  <input className="s-input" placeholder="例如: 我的图片服务"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </div>
                <div>
                  <label className="s-label">位置</label>
                  <div className="s-toggle-group">
                    <button className={`s-toggle-btn${form.location === "local" ? " active" : ""}`}
                      onClick={() => setForm({ ...form, location: "local", authType: "none" })}>本地</button>
                    <button className={`s-toggle-btn${form.location === "online" ? " active" : ""}`}
                      onClick={() => setForm({ ...form, location: "online" })}>线上</button>
                  </div>
                </div>
              </div>

              <div>
                <label className="s-label">Base Endpoint</label>
                <input className="s-input" placeholder="https://api.example.com/v1"
                  value={form.baseEndpoint}
                  onChange={(e) => setForm({ ...form, baseEndpoint: e.target.value })} />
              </div>

              {form.authType === "bearer" && (
                <div>
                  <label className="s-label">API Key</label>
                  <input className="s-input" type="password" placeholder="sk-..."
                    value={form.apiKey || ""}
                    onChange={(e) => setForm({ ...form, apiKey: e.target.value })} />
                </div>
              )}

              <div className="flex items-center gap-3 text-sm text-slate-300">
                <span>认证方式</span>
                <SelectWrap contentZIndex={1100} value={form.authType ?? "bearer"} onValueChange={(authType) => setForm({ ...form, authType: authType as Platform["authType"] })}
                  items={[{ value: "bearer", label: "Bearer API Key" }, { value: "none", label: "无认证" }]} />
              </div>
              <p className="text-xs text-slate-400">文本功能支持 Chat Completions 兼容接口。反推提示词需要支持图片输入的模型。</p>
              {/* endpoints */}
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <label className="s-label" style={{ margin: 0 }}>接口配置</label>
                  <button className="s-btn s-btn-sm" onClick={addEndpoint}>+ 添加接口</button>
                </div>

                {form.endpoints.length === 0 && (
                  <p style={{ color: "#484f58", fontSize: 12, margin: 0 }}>
                    未配置接口，点击"+ 添加接口"（如图片生成 /images/generations）
                  </p>
                )}

                {form.endpoints.map((ep, idx) => (
                  <div key={idx} className="mb-3 rounded-lg border border-slate-700 p-3">
                    <div className="s-endpoint-row">
                    <SelectWrap contentZIndex={1100} value={ep.key || "unselected"} onValueChange={(value) => updateEndpoint(idx, "key", value)}
                      items={[{ value: "unselected", label: "选择功能" }, ...FUNCTION_OPTIONS.map((o) => ({ value: o.key, label: o.label }))]} />
                    <input className="s-input"
                      placeholder="路径 /images/generations" value={ep.path}
                      onChange={(e) => updateEndpoint(idx, "path", e.target.value)} />
                    <input className="s-input"
                      placeholder="model" value={ep.model}
                      onChange={(e) => updateEndpoint(idx, "model", e.target.value)} />
                    <button className="s-btn s-btn-sm s-btn-danger" style={{ flexShrink: 0 }}
                      onClick={() => removeEndpoint(idx)}>&times;</button>
                    </div>
                    <p className="my-2 break-all text-xs text-slate-400">最终地址：{(() => { try { return endpointUrl(form.baseEndpoint, ep.path); } catch { return "请填写有效地址和接口路径"; } })()}</p>
                    {["chat", "reverse-prompt"].includes(ep.key) && <label className="block text-xs text-slate-400">额外参数（JSON）
                      <textarea aria-label={`${ep.name || "接口"}额外参数`} className="mt-1 w-full rounded border border-slate-700 bg-slate-950 p-2 font-mono text-xs text-slate-200"
                        rows={3} value={paramText[idx] ?? "{}"}
                        onChange={(e) => setParamText((p) => p.map((v, i) => i === idx ? e.target.value : v))} />
                    </label>}
                    {["chat", "reverse-prompt"].includes(ep.key) && <button type="button" className="s-btn s-btn-sm mt-2" disabled={!!testing || saving} onClick={() => testConnection(ep.key)}>
                      {testing === ep.key ? "测试中…" : "测试连接"}
                    </button>}
                  </div>
                ))}
              </div>

              <p className="text-xs text-slate-500">连接测试会发送一次最小文本请求，可能产生少量费用；图片能力需用实际图片验证。</p>
              {formError && <p role="alert" className="text-sm text-red-400">{formError}</p>}
              {testResult && <p role="status" className="text-sm text-emerald-400">{testResult}</p>}
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
                <button className="s-btn" onClick={() => { if (!savingRef.current) { setShowForm(false); setEditing(null); } }}>取消</button>
                <button className="s-btn s-btn-primary" disabled={saving} onClick={handleFormSave}>
                  {saving ? "保存中…" : editing ? "更新" : "添加"}
                </button>
              </div>
            </fieldset>
          </div>
        </>
      )}
    </div>
  );
}
