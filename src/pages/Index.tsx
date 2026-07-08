import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import type { VideoClip } from "../lib/types";
import { getAllClips, addClip, deleteClip, searchClips } from "../lib/store";
import "./Index.css";

export default function Index() {
  const navigate = useNavigate();
  const [clips, setClips] = useState<VideoClip[]>([]);
  const [query, setQuery] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({
    title: "",
    description: "",
    url: "",
    duration: "",
    tags: "",
  });

  const refresh = useCallback(() => {
    setClips(query ? searchClips(query) : getAllClips());
  }, [query]);

  useEffect(() => refresh(), [refresh]);

  const handleSearch = (value: string) => {
    setQuery(value);
    setClips(value ? searchClips(value) : getAllClips());
  };

  const handleAdd = () => {
    if (!form.title.trim() || !form.url.trim()) return;
    const duration = parseFloat(form.duration) || 0;
    addClip({
      title: form.title.trim(),
      description: form.description.trim(),
      url: form.url.trim(),
      duration,
      tags: form.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
    });
    setForm({ title: "", description: "", url: "", duration: "", tags: "" });
    setShowModal(false);
    refresh();
  };

  const handleDelete = (id: string) => {
    if (!window.confirm("确定删除该片段？")) return;
    deleteClip(id);
    refresh();
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
    <div className="index-page">
      <div className="search-bar">
        <input
          type="text"
          placeholder="搜索标题、描述或标签..."
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
        />
        {query && (
          <button className="btn-clear" onClick={() => handleSearch("")}>
            清除
          </button>
        )}
      </div>

      {clips.length === 0 && !query ? (
        <div className="empty-state">
          <p>暂无片段，点击下方卡片新增</p>
        </div>
      ) : clips.length === 0 && query ? (
        <div className="empty-state">
          <p>没有匹配的片段</p>
        </div>
      ) : null}

      <div className="card-grid">
        <div className="clip-card add-card" onClick={() => setShowModal(true)}>
          <div className="card-thumb add-thumb">
            <span className="add-icon">+</span>
          </div>
          <div className="card-body">
            <h3 className="card-title">新增片段</h3>
            <p className="card-desc">添加新的素材到你的收藏</p>
          </div>
        </div>

        {clips.map((clip) => (
          <div
            key={clip.id}
            className="clip-card"
            onClick={() => navigate(`/detail/${clip.id}`)}
          >
            <div className="card-thumb">
              {clip.thumbnail ? (
                <img src={clip.thumbnail} alt={clip.title} />
              ) : (
                <div className="thumb-placeholder">
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <polyline points="21 15 16 10 5 21" />
                  </svg>
                </div>
              )}
              {clip.duration > 0 && (
                <span className="card-duration">
                  {formatDuration(clip.duration)}
                </span>
              )}
            </div>
            <div className="card-body">
              <h3 className="card-title">{clip.title}</h3>
              <p className="card-desc">
                {clip.description || "暂无描述"}
              </p>
              <div className="card-tags">
                {clip.tags.map((t) => (
                  <span key={t} className="tag">
                    {t}
                  </span>
                ))}
              </div>
              <div className="card-footer">
                <span className="card-date">{formatDate(clip.createdAt)}</span>
                <button
                  className="btn-delete"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(clip.id);
                  }}
                >
                  删除
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>新增片段</h2>
            <div className="form-group">
              <label>标题 *</label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="输入标题"
              />
            </div>
            <div className="form-group">
              <label>链接 *</label>
              <input
                type="text"
                value={form.url}
                onChange={(e) => setForm({ ...form, url: e.target.value })}
                placeholder="链接或本地路径"
              />
            </div>
            <div className="form-group">
              <label>描述</label>
              <textarea
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
                placeholder="输入描述信息"
                rows={3}
              />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>时长（秒）</label>
                <input
                  type="number"
                  value={form.duration}
                  onChange={(e) =>
                    setForm({ ...form, duration: e.target.value })
                  }
                  placeholder="0"
                  min="0"
                  step="0.1"
                />
              </div>
            </div>
            <div className="form-group">
              <label>标签（逗号分隔）</label>
              <input
                type="text"
                value={form.tags}
                onChange={(e) => setForm({ ...form, tags: e.target.value })}
                placeholder="如：风景, 旅行, 自然"
              />
            </div>
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setShowModal(false)}>
                取消
              </button>
              <button
                className="btn-primary"
                onClick={handleAdd}
                disabled={!form.title.trim() || !form.url.trim()}
              >
                确认添加
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
