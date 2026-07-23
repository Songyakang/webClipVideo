import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { loadAssetUrl, loadThumbnailUrl } from "../../lib/assets";
import type { AssetInfo } from "../../lib/types";

interface Props {
  viewportCenter: () => { x: number; y: number };
  onAddImageNode: (fileUrl: string, assetPath: string, x: number, y: number) => void;
  onAddVideoNode: (fileUrl: string, assetPath: string, x: number, y: number) => void;
  onClose: () => void;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function AssetCard({
  asset,
  viewportCenter,
  onAddImageNode,
  onAddVideoNode,
}: {
  asset: AssetInfo;
  viewportCenter: () => { x: number; y: number };
  onAddImageNode: (fileUrl: string, assetPath: string, x: number, y: number) => void;
  onAddVideoNode: (fileUrl: string, assetPath: string, x: number, y: number) => void;
}) {
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const loadedRef = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const load = async () => {
      if (loadedRef.current) return;
      loadedRef.current = true;
      setLoading(true);

      try {
        // Try thumbnail first
        const thumbPath = await invoke<string>("get_asset_thumbnail", { relativePath: asset.relative_path });
        const url = await loadThumbnailUrl(thumbPath);
        if (url) { setThumbUrl(url); return; }
      } catch { /* fall through */ }

      // Fallback: load original image
      if (asset.asset_type === "image") {
        try {
          const url = await loadAssetUrl(asset.relative_path);
          if (url) setThumbUrl(url);
        } catch { /* ignore */ }
      }
      setLoading(false);
    };

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) load();
      },
      { rootMargin: "200px" },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [asset.relative_path, asset.asset_type]);

  const handleClick = useCallback(async () => {
    const pos = viewportCenter();
    const fileUrl = await loadAssetUrl(asset.relative_path);
    if (!fileUrl) return;
    if (asset.asset_type === "image") {
      onAddImageNode(fileUrl, asset.relative_path, pos.x, pos.y);
    } else {
      onAddVideoNode(fileUrl, asset.relative_path, pos.x, pos.y);
    }
  }, [asset, viewportCenter, onAddImageNode, onAddVideoNode]);

  return (
    <div
      ref={ref}
      className="rounded-lg overflow-hidden cursor-pointer border transition-all duration-150 group"
      style={{ background: "#0d1117", borderColor: "#21262d" }}
      onClick={handleClick}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#58a6ff"; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#21262d"; }}
    >
      <div className="aspect-square flex items-center justify-center relative" style={{ background: "#0d1117" }}>
        {thumbUrl ? (
          <img src={thumbUrl} alt={asset.filename} className="w-full h-full object-cover" />
        ) : loading ? (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#30363d" strokeWidth="1.5" style={{ animation: "spin 1s linear infinite" }}>
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" fill="none" opacity="0.2" />
            <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2" fill="none" />
          </svg>
        ) : asset.asset_type === "video" ? (
          <div className="flex flex-col items-center gap-1">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#484f58" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
            <span className="text-xs" style={{ color: "#484f58" }}>视频</span>
          </div>
        ) : (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#30363d" strokeWidth="1.5">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
          </svg>
        )}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: "rgba(0,0,0,0.5)" }}>
          <span className="text-xs font-medium" style={{ color: "#fff" }}>添加到画布</span>
        </div>
      </div>
      <div className="px-2 py-1.5">
        <div className="text-xs truncate" style={{ color: "#8b949e" }} title={asset.filename}>
          {asset.filename}
        </div>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className="text-xs px-1 rounded" style={{ background: "#21262d", color: "#58a6ff", fontSize: 10 }}>
            {asset.asset_type === "image" ? "图片" : "视频"}
          </span>
          <span className="text-xs" style={{ color: "#484f58" }}>{formatSize(asset.size)}</span>
        </div>
      </div>
    </div>
  );
}

export default function AssetLibrary({ viewportCenter, onAddImageNode, onAddVideoNode, onClose }: Props) {
  const [assets, setAssets] = useState<AssetInfo[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    invoke<AssetInfo[]>("list_project_assets")
      .then((list) => setAssets(list))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return assets;
    const q = search.toLowerCase();
    return assets.filter((a) => a.filename.toLowerCase().includes(q));
  }, [assets, search]);

  const hasAssets = assets.length > 0;

  return (
    <div className="flex flex-col rounded-xl overflow-hidden" style={{ background: "#161b22", width: 720, height: 520, maxHeight: "80vh" }}>
      <style>{`.asset-scroll::-webkit-scrollbar { display: none; } .asset-scroll { scrollbar-width: none; }`}</style>

      <div className="flex items-center justify-between px-4 py-3 border-b shrink-0" style={{ borderColor: "#21262d" }}>
        <span className="text-sm font-semibold" style={{ color: "#e6edf3" }}>素材库</span>
        <div className="flex items-center gap-2">
          {hasAssets && (
            <span className="text-xs" style={{ color: "#484f58" }}>{assets.length} 个文件</span>
          )}
          <button
            className="cursor-pointer w-6 h-6 flex items-center justify-center rounded transition-colors"
            style={{ background: "transparent", color: "#8b949e" }}
            onClick={onClose}
            onMouseEnter={(e) => { e.currentTarget.style.background = "#21262d"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>
      </div>

      <div className="px-4 py-2 shrink-0">
        <input
          className="w-full px-3 py-1.5 rounded-md text-xs outline-none border"
          style={{
            background: "#0d1117",
            color: "#e6edf3",
            borderColor: "#21262d",
          }}
          placeholder="搜索文件名..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onFocus={(e) => { e.target.style.borderColor = "#58a6ff"; }}
          onBlur={(e) => { e.target.style.borderColor = "#21262d"; }}
        />
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4 asset-scroll">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <span className="text-xs" style={{ color: "#484f58" }}>加载中...</span>
          </div>
        ) : !hasAssets ? (
          <div className="flex flex-col items-center justify-center h-40 gap-2">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#30363d" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
            <span className="text-xs" style={{ color: "#484f58" }}>暂无素材</span>
            <span className="text-xs" style={{ color: "#30363d" }}>生成的图片或上传的文件会出现在这里</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex items-center justify-center h-40">
            <span className="text-xs" style={{ color: "#484f58" }}>无匹配结果</span>
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-3">
            {filtered.map((asset) => (
              <AssetCard
                key={asset.relative_path}
                asset={asset}
                viewportCenter={viewportCenter}
                onAddImageNode={onAddImageNode}
                onAddVideoNode={onAddVideoNode}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
