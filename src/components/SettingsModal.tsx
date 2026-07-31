import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";

interface Platform {
  id: string;
  name: string;
  platformType: "image" | "video" | "text";
  location: "local" | "online";
  apiKey?: string;
  endpoint?: string;
  model?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
}

const TABS = [
  { key: "image" as const, label: "图片" },
  { key: "video" as const, label: "视频" },
  { key: "text" as const, label: "文本" },
];

const EMPTY_FORM: Platform = {
  id: "",
  name: "",
  platformType: "image",
  location: "online",
  apiKey: "",
  endpoint: "",
  model: "",
};

function genId() {
  return "p_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export default function SettingsModal({ open, onClose }: Props) {
  const [activeTab, setActiveTab] = useState<"image" | "video" | "text">("image");
  const [platforms, setPlatforms] = useState<Platform[]>([]);

  // sub-modal for add/edit
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Platform | null>(null);
  const [form, setForm] = useState<Platform>({ ...EMPTY_FORM });

  // legacy keys
  const [stepfunKey, setStepfunKey] = useState("");
  const [deepseekKey, setDeepseekKey] = useState("");
  const [tripoKey, setTripoKey] = useState("");
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});

  // track if we've loaded so we don't auto-save the initial values
  const loadedRef = useRef(false);

  // ---- load ----
  useEffect(() => {
    if (!open) return;
    loadedRef.current = false;
    let cancelled = false;
    (async () => {
      try {
        const config = await invoke<Record<string, unknown>>("get_all_config");
        if (cancelled) return;
        setStepfunKey((config?.stepfun_api_key as string) || "");
        setDeepseekKey((config?.deepseek_api_key as string) || "");
        setTripoKey((config?.tripo_api_key as string) || "");
      } catch { /* ignore */ }
      try {
        const list = await invoke<Platform[]>("get_platforms");
        if (!cancelled) setPlatforms(list || []);
      } catch { /* ignore */ }
      loadedRef.current = true;
    })();
    return () => { cancelled = true; };
  }, [open]);

  // ---- auto-save legacy keys on blur ----
  const saveLegacyKey = useCallback(async (key: string, value: string) => {
    if (!loadedRef.current) return;
    try {
      await invoke("set_config_key", { key, value });
    } catch { /* ignore */ }
  }, []);

  // ---- platforms CRUD (auto-save immediately) ----
  const savePlatforms = useCallback(async (list: Platform[]) => {
    setPlatforms(list);
    try {
      await invoke("save_platforms", { platforms: list });
    } catch { /* ignore */ }
  }, []);

  const openAddForm = () => {
    setEditing(null);
    setForm({ ...EMPTY_FORM, platformType: activeTab });
    setShowForm(true);
  };

  const openEditForm = (p: Platform) => {
    setEditing(p);
    setForm({ ...p });
    setShowForm(true);
  };

  const handleFormSave = async () => {
    if (!form.name.trim()) return;
    let list: Platform[];
    if (editing) {
      list = platforms.map((p) => (p.id === editing.id ? { ...form } : p));
    } else {
      const item: Platform = { ...form, id: genId() };
      list = [...platforms, item];
    }
    setShowForm(false);
    setEditing(null);
    await savePlatforms(list);
  };

  const handleDelete = async (id: string) => {
    const list = platforms.filter((p) => p.id !== id);
    await savePlatforms(list);
  };

  const filteredPlatforms = platforms.filter((p) => p.platformType === activeTab);

  if (!open) return null;

  return (
    <>
      {/* backdrop */}
      <div className="fixed inset-0 z-[999]" style={{ background: "rgba(0,0,0,0.6)" }} onClick={onClose} />

      {/* main modal */}
      <div
        className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[1000] rounded-xl overflow-hidden"
        style={{
          width: 500, maxHeight: "85vh",
          background: "#161b22", border: "1px solid #30363d",
          boxShadow: "0 8px 48px rgba(0,0,0,0.7)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <style>{`
          .s-input {
            width: 100%; padding: 7px 10px; border-radius: 6px;
            border: 1px solid #30363d; background: #0d1117;
            color: #e6edf3; font-size: 13px; outline: none;
            box-sizing: border-box; font-family: monospace;
          }
          .s-input:focus { border-color: #58a6ff; }
          .s-label { display:block; margin-bottom:3px; color:#8b949e; font-size:12px; }
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
          }
          .s-btn-primary { background:#238636; color:#fff; border-color:#238636; }
          .s-btn-primary:hover { background:#2ea043; }
          .s-btn-danger { background:transparent; color:#f85149; }
          .s-btn-danger:hover { background:#2d1217; }
          .s-btn-ghost { background:transparent; color:#8b949e; }
          .s-btn-ghost:hover { background:#21262d; color:#e6edf3; }
          .s-card {
            background:#0d1117; border:1px solid #21262d; border-radius:8px;
            padding:12px; margin-bottom:8px;
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
          .s-close {
            width:28px; height:28px; display:flex; align-items:center;
            justify-content:center; border-radius:6px; border:none;
            background:transparent; color:#8b949e; cursor:pointer; font-size:18px;
          }
          .s-close:hover { background:#21262d; color:#e6edf3; }
        `}</style>

        {/* header */}
        <div style={{ padding: "14px 20px 0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ margin: 0, color: "#e6edf3", fontSize: 15, fontWeight: 600 }}>设置</h2>
          <button className="s-close" onClick={onClose} title="关闭">&times;</button>
        </div>

        {/* tabs */}
        <div style={{ display: "flex", borderBottom: "1px solid #21262d", marginTop: 10, padding: "0 20px" }}>
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

        {/* tab content */}
        <div style={{ padding: "16px 20px", maxHeight: "50vh", overflowY: "auto" }}>
          {/* legacy keys */}
          <div style={{ marginBottom: 16 }}>
            <h3 style={{ color: "#e6edf3", fontSize: 13, margin: "0 0 10px" }}>默认密钥</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {activeTab === "image" && (
                <>
                  <div>
                    <label className="s-label">
                      StepFun API Key
                      <button className="s-btn s-btn-ghost" style={{ padding: "1px 6px", fontSize: 10, marginLeft: 6 }}
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
                      <button className="s-btn s-btn-ghost" style={{ padding: "1px 6px", fontSize: 10, marginLeft: 6 }}
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
                    <button className="s-btn s-btn-ghost" style={{ padding: "1px 6px", fontSize: 10, marginLeft: 6 }}
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
                <p style={{ color: "#484f58", fontSize: 12, margin: 0 }}>
                  视频处理使用本地工具（ffmpeg/whisper），无需在线密钥
                </p>
              )}
            </div>
          </div>

          <div style={{ borderTop: "1px solid #21262d", margin: "16px 0" }} />

          {/* custom platforms */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <h3 style={{ color: "#e6edf3", fontSize: 13, margin: 0 }}>自定义平台</h3>
            <button className="s-btn s-btn-primary" onClick={openAddForm}>+ 新增</button>
          </div>

          {filteredPlatforms.length === 0 && (
            <p style={{ color: "#484f58", fontSize: 12, textAlign: "center", padding: 20 }}>
              暂无自定义平台，点击"+ 新增"添加
            </p>
          )}
          {filteredPlatforms.map((p) => (
            <div key={p.id} className="s-card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ color: "#e6edf3", fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
                    {p.name}
                    <span style={{
                      marginLeft: 8, padding: "1px 6px", borderRadius: 4, fontSize: 10,
                      background: p.location === "local" ? "#1a2a3d" : "#2d1a3d",
                      color: p.location === "local" ? "#58a6ff" : "#bc8cff",
                    }}>
                      {p.location === "local" ? "本地" : "线上"}
                    </span>
                  </div>
                  {p.endpoint && <div style={{ color: "#8b949e", fontSize: 11, fontFamily: "monospace" }}>{p.endpoint}</div>}
                  {p.model && <div style={{ color: "#6e7681", fontSize: 11 }}>Model: {p.model}</div>}
                </div>
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  <button className="s-btn s-btn-ghost" onClick={() => openEditForm(p)}>编辑</button>
                  <button className="s-btn s-btn-danger" onClick={() => handleDelete(p.id)}>删除</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ---- sub-modal: add/edit platform ---- */}
      {showForm && (
        <>
          <div className="fixed inset-0 z-[1001]" style={{ background: "rgba(0,0,0,0.4)" }}
            onClick={() => { setShowForm(false); setEditing(null); }} />
          <div
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[1002] rounded-xl p-5"
            style={{
              width: 380, background: "#161b22", border: "1px solid #30363d",
              boxShadow: "0 8px 48px rgba(0,0,0,0.8)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h3 style={{ color: "#e6edf3", fontSize: 14, fontWeight: 600, margin: 0 }}>
                {editing ? "编辑平台" : "新增平台"}
              </h3>
              <button className="s-close" onClick={() => { setShowForm(false); setEditing(null); }}>&times;</button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div>
                <label className="s-label">名称</label>
                <input className="s-input" placeholder="例如: 我的图片模型"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div>
                <label className="s-label">位置</label>
                <div className="s-toggle-group">
                  <button className={`s-toggle-btn${form.location === "local" ? " active" : ""}`}
                    onClick={() => setForm({ ...form, location: "local", apiKey: "" })}>本地</button>
                  <button className={`s-toggle-btn${form.location === "online" ? " active" : ""}`}
                    onClick={() => setForm({ ...form, location: "online" })}>线上</button>
                </div>
              </div>
              {form.location === "online" && (
                <div>
                  <label className="s-label">API Key</label>
                  <input className="s-input" type="password" placeholder="sk-..."
                    value={form.apiKey || ""}
                    onChange={(e) => setForm({ ...form, apiKey: e.target.value })} />
                </div>
              )}
              <div>
                <label className="s-label">Endpoint</label>
                <input className="s-input" placeholder="https://api.example.com/v1"
                  value={form.endpoint || ""}
                  onChange={(e) => setForm({ ...form, endpoint: e.target.value })} />
              </div>
              <div>
                <label className="s-label">Model</label>
                <input className="s-input" placeholder="model-name"
                  value={form.model || ""}
                  onChange={(e) => setForm({ ...form, model: e.target.value })} />
              </div>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 6 }}>
                <button className="s-btn s-btn-ghost"
                  onClick={() => { setShowForm(false); setEditing(null); }}>取消</button>
                <button className="s-btn s-btn-primary" onClick={handleFormSave}>
                  {editing ? "更新" : "添加"}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
