import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import type { VideoClip } from "../lib/types";
import { getAllClips, addClip, deleteClip, searchClips } from "../lib/store";
import "./Index.css";

export default function Index() {
  const navigate = useNavigate();
  const [clips, setClips] = useState<VideoClip[]>([]);
  const [query, setQuery] = useState("");

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

  const handleDelete = async (id: string) => {
    if (!window.confirm("确定删除该片段？")) return;
    await deleteClip(id);
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

      <div className="card-grid">
        <div className="clip-card add-card" onClick={handleAdd}>
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
    </div>
  );
}
