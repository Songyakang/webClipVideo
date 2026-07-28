import { useState, useEffect, useMemo, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { loadAssetUrl, loadThumbnailUrl } from "../../../lib/assets";
import type { AssetInfo } from "../../../lib/types";

interface Props {
  onAddModel: (assetPath: string) => void;
  onClose: () => void;
}

function AssetThumb({ asset }: { asset: AssetInfo }) {
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const loadedRef = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const load = async () => {
      if (loadedRef.current) return;
      loadedRef.current = true;
      try {
        const thumbPath = await invoke<string>("get_asset_thumbnail", { relativePath: asset.relative_path });
        const url = await loadThumbnailUrl(thumbPath);
        if (url) { setThumbUrl(url); return; }
      } catch { /* fall through */ }
      try {
        const url = await loadAssetUrl(asset.relative_path);
        if (url) setThumbUrl(url);
      } catch { /* ignore */ }
    };

    const observer = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) load(); },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [asset.relative_path]);

  return (
    <div ref={ref} className="aspect-square flex items-center justify-center" style={{ background: "#0d1117" }}>
      {thumbUrl ? (
        <img src={thumbUrl} alt={asset.filename} className="w-full h-full object-cover" />
      ) : (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#30363d" strokeWidth="1.5">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <polyline points="21 15 16 10 5 21" />
        </svg>
      )}
    </div>
  );
}

export default function DirectorAssetPanel({ onAddModel, onClose }: Props) {
  const [assets, setAssets] = useState<AssetInfo[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    invoke<AssetInfo[]>("list_project_assets")
      .then((list) => setAssets(list.filter((a) => a.asset_type === "image")))
      .catch(console.error);
  }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return assets;
    const q = search.toLowerCase();
    return assets.filter((a) => a.filename.toLowerCase().includes(q));
  }, [assets, search]);

  return (
    <>
      <style>{`
        .dap-scroll::-webkit-scrollbar { display: none; }
        .dap-scroll { scrollbar-width: none; }
        .dap-card { transition: border-color 0.15s; }
      `}</style>
      <div className="rounded-xl overflow-hidden" style={{ background: "#161b22", width: 480, height: 400 }}>
        <div className="flex items-center justify-between px-4 py-3 border-b shrink-0" style={{ borderColor: "#21262d" }}>
          <span className="text-sm font-semibold" style={{ color: "#e6edf3" }}>素材库 · 拖拽到视口添加模型</span>
          <button
            className="cursor-pointer w-6 h-6 flex items-center justify-center rounded transition-colors"
            style={{ background: "transparent", color: "#8b949e" }}
            onClick={onClose}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        <div className="px-4 py-2 shrink-0">
          <input
            className="w-full px-3 py-1.5 rounded-md text-xs outline-none border"
            style={{ background: "#0d1117", color: "#e6edf3", borderColor: "#21262d" }}
            placeholder="搜索图片..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="overflow-y-auto px-4 pb-4 dap-scroll" style={{ maxHeight: 300 }}>
          {filtered.length === 0 ? (
            <div className="flex items-center justify-center h-24">
              <span className="text-xs" style={{ color: "#484f58" }}>暂无图片素材</span>
            </div>
          ) : (
            <div className="grid grid-cols-4 gap-2">
              {filtered.map((asset) => (
                <div
                  key={asset.relative_path}
                  className="dap-card rounded-lg overflow-hidden cursor-pointer border"
                  style={{ background: "#0d1117", borderColor: "#21262d" }}
                  draggable={true}
                  onDragStart={(e) => {
                    e.dataTransfer.setData("application/x-asset-path", asset.relative_path);
                    e.dataTransfer.effectAllowed = "copy";
                  }}
                  onClick={() => onAddModel(asset.relative_path)}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#58a6ff"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#21262d"; }}
                >
                  <AssetThumb asset={asset} />
                  <div className="px-1.5 py-1">
                    <div className="text-[10px] truncate" style={{ color: "#8b949e" }}>{asset.filename}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
