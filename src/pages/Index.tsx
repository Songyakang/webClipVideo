import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import type { VideoClip } from "../lib/types";
import { getAllClips, addClip, deleteClip, searchClips } from "../lib/store";

export default function Index() {
  const navigate = useNavigate();
  const [clips, setClips] = useState<VideoClip[]>([]);
  const [query, setQuery] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [showMenu, setShowMenu] = useState(false);

  const refresh = useCallback(async () => {
    const data = query ? await searchClips(query) : await getAllClips();
    setClips(data);
  }, [query]);

  useEffect(() => { refresh(); }, [refresh]);

  const handleSearch = async (value: string) => {
    setQuery(value);
    const data = value ? await searchClips(value) : await getAllClips();
    setClips(data);
  };

  const handleAdd = async () => {
    const clip = await addClip({ title: "未命名", description: "", url: "", duration: 0, tags: [] });
    navigate(`/detail/${clip.id}`);
  };

  const handleDeleteConfirm = async () => {
    if (!confirmDeleteId) return;
    const id = confirmDeleteId;
    setConfirmDeleteId(null);
    await deleteClip(id);
    setClips((prev) => prev.filter((c) => c.id !== id));
  };

  const formatDuration = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const formatDate = (ts: number) => {
    const d = new Date(ts);
    return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, "0")}-${d.getDate().toString().padStart(2, "0")}`;
  };

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-6">
      <style>{`
        .clip-card {
          background: #161b22;
          border: 1px solid #30363d;
          box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
          transition: transform 0.15s, box-shadow 0.15s, border-color 0.15s;
        }
        .clip-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
          border-color: #58a6ff;
        }
        .add-card:hover {
          border-color: #58a6ff !important;
          opacity: 1;
        }
        .add-card:hover .add-icon {
          color: #58a6ff;
        }
        .btn-clear:hover {
          color: #79c0ff;
        }
        .btn-delete:hover {
          background: #2d1217;
        }
      `}</style>

      <div className="flex gap-2 mb-6 items-center">
        <input
          type="text"
          className="flex-1 max-w-[400px]"
          placeholder="搜索标题、描述或标签..."
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
        />
        {query && (
          <button
            className="bg-transparent border-none cursor-pointer text-sm"
            style={{ color: "#58a6ff" }}
            onClick={() => handleSearch("")}
          >
            清除
          </button>
        )}
        <div className="flex-1" />
        <div style={{ position: "relative" }}>
          <button
            className="bg-transparent border cursor-pointer rounded-lg px-3 py-1.5 text-[13px]"
            style={{ background: "#161b22", borderColor: "#30363d", color: "#8b949e" }}
            onClick={() => setShowMenu((v) => !v)}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="5" r="1.5" />
              <circle cx="12" cy="12" r="1.5" />
              <circle cx="12" cy="19" r="1.5" />
            </svg>
          </button>
          {showMenu && (
            <>
              <div style={{ position: "fixed", inset: 0, zIndex: 998 }} onClick={() => setShowMenu(false)} />
              <div
                className="context-menu"
                style={{ position: "absolute", right: 0, top: "100%", marginTop: 4, zIndex: 999, minWidth: 120 }}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <button className="context-menu-item" onClick={() => { setShowMenu(false); navigate("/settings"); }}>
                  <span>设置</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="grid gap-5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}>
        {/* Add card */}
        <div
          className="clip-card overflow-hidden cursor-pointer rounded-[10px] border-dashed opacity-70"
          style={{ borderColor: "#30363d" }}
          onClick={handleAdd}
        >
          <div className="flex items-center justify-center" style={{ background: "#0d1117", aspectRatio: "4/3" }}>
            <span className="add-icon" style={{ fontSize: 48, color: "#484f58", fontWeight: 300, lineHeight: 1 }}>+</span>
          </div>
          <div className="px-4 py-[14px]">
            <h3 className="m-0 mb-1.5 text-[15px] font-semibold truncate" style={{ color: "#e6edf3" }}>新增片段</h3>
            <p className="m-0 mb-[10px] text-[13px] line-clamp-2" style={{ color: "#8b949e" }}>添加新的素材到你的收藏</p>
          </div>
        </div>

        {clips.map((clip) => (
          <div
            key={clip.id}
            className="clip-card overflow-hidden cursor-pointer rounded-[10px] border"
            style={{ background: "#161b22", borderColor: "#30363d", boxShadow: "0 1px 4px rgba(0,0,0,0.3)" }}
            onClick={() => navigate(`/detail/${clip.id}`)}
          >
            <div className="relative w-full overflow-hidden" style={{ aspectRatio: "4/3", background: "#0d1117" }}>
              {clip.thumbnail ? (
                <img src={clip.thumbnail} alt={clip.title} className="w-full h-full object-cover" />
              ) : (
                <div className="flex items-center justify-center h-full" style={{ color: "#30363d" }}>
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <polyline points="21 15 16 10 5 21" />
                  </svg>
                </div>
              )}
              {clip.duration > 0 && (
                <span
                  className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded text-xs"
                  style={{ background: "rgba(0,0,0,0.8)", color: "#e6edf3" }}
                >
                  {formatDuration(clip.duration)}
                </span>
              )}
            </div>
            <div className="px-4 py-[14px]">
              <h3 className="m-0 mb-1.5 text-[15px] font-semibold truncate" style={{ color: "#e6edf3" }}>{clip.title}</h3>
              <p className="m-0 mb-[10px] text-[13px] line-clamp-2" style={{ color: "#8b949e" }}>
                {clip.description || "暂无描述"}
              </p>
              <div className="flex flex-wrap gap-1.5 mb-2.5">
                {clip.tags.map((t) => (
                  <span key={t} className="tag">{t}</span>
                ))}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs" style={{ color: "#6e7681" }}>{formatDate(clip.createdAt)}</span>
                <button
                  className="bg-transparent border-none cursor-pointer text-[13px] px-1.5 py-0.5 rounded"
                  style={{ color: "#f85149" }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setConfirmDeleteId(clip.id);
                  }}
                >
                  删除
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Confirm dialog */}
      {confirmDeleteId && (
        <div className="modal-overlay" onClick={() => setConfirmDeleteId(null)}>
          <div className="modal" style={{ width: 360, textAlign: "center" }} onClick={(e) => e.stopPropagation()}>
            <p style={{ color: "#e6edf3", fontSize: 15, margin: "0 0 20px" }}>
              确定删除该片段？
            </p>
            <div className="modal-actions" style={{ justifyContent: "center" }}>
              <button className="btn-cancel" onClick={() => setConfirmDeleteId(null)}>取消</button>
              <button className="btn-primary" style={{ background: "#da3633" }} onClick={handleDeleteConfirm}>确定删除</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
