import { useState, useEffect, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getAssetSrc } from "../../../lib/assets";

interface AssetInfo {
  relative_path: string;
  filename: string;
  asset_type: "image" | "video";
  size: number;
  node_id: string;
}

interface Props {
  projectId: string;
  onSelect: (assetPath: string, filename: string, assetType: "image" | "video") => void;
  onClose?: () => void;
  inline?: boolean;
}

type FilterType = "全部" | "视频" | "音频" | "图片";
const FILTERS: FilterType[] = ["全部", "视频", "音频", "图片"];

const TYPE_ICON: Record<string, string> = {
  视频: "🎬",
  音频: "🎵",
  图片: "🖼️",
  全部: "📁",
};

const TYPE_COLOR: Record<string, string> = {
  视频: "#1f6feb",
  音频: "#d29922",
  图片: "#2ea043",
  全部: "#8b949e",
};

export default function TimelineAssetPanel({ projectId, onSelect, onClose, inline }: Props) {
  const [assets, setAssets] = useState<AssetInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterType>("全部");

  useEffect(() => {
    invoke<AssetInfo[]>("list_project_assets", { projectId })
      .then((list) => setAssets(list))
      .catch(() => setAssets([]))
      .finally(() => setLoading(false));
  }, [projectId]);

  const filtered = useMemo(() => {
    let list = assets;

    // Type filter
    if (filter === "视频") list = list.filter((a) => a.asset_type === "video");
    else if (filter === "图片") list = list.filter((a) => a.asset_type === "image");
    // 音频暂时过滤掉（目前资产类型只有 image/video，音频来自视频的音频轨道）

    // Search
    if (search) {
      list = list.filter((a) => a.filename.toLowerCase().includes(search.toLowerCase()));
    }

    return list;
  }, [assets, filter, search]);

  const handleSelect = (a: AssetInfo) => {
    const assetType = a.asset_type === "video" ? "video" : "image";
    onSelect(a.relative_path, a.filename, assetType);
    if (!inline) onClose?.();
  };

  const content = (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#0d1117" }}>
      {/* Header */}
      <div
        style={{
          padding: "6px 10px",
          borderBottom: "1px solid #21262d",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexShrink: 0,
        }}
      >
        <span style={{ color: "#c9d1d9", fontWeight: 600, fontSize: 12 }}>素材</span>
        {onClose && (
          <button onClick={onClose} style={iconBtn}>✕</button>
        )}
      </div>

      {/* Search */}
      <div style={{ padding: "6px 10px", flexShrink: 0 }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜索..."
          style={{
            width: "100%", padding: "4px 8px",
            background: "#161b22", border: "1px solid #30363d",
            borderRadius: 4, color: "#c9d1d9", fontSize: 11,
            outline: "none", boxSizing: "border-box",
          }}
        />
      </div>

      {/* Filter tabs */}
      <div
        style={{
          display: "flex", gap: 2, padding: "0 10px 6px",
          borderBottom: "1px solid #21262d", flexShrink: 0,
        }}
      >
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: "2px 10px",
              borderRadius: 4,
              border: "none",
              cursor: "pointer",
              fontSize: 11,
              fontWeight: filter === f ? 600 : 400,
              background: filter === f ? `${TYPE_COLOR[f]}22` : "transparent",
              color: filter === f ? TYPE_COLOR[f] : "#8b949e",
              transition: "all 0.15s",
            }}
          >
            {TYPE_ICON[f]} {f}
          </button>
        ))}
      </div>

      {/* Card grid */}
      <div style={{ flex: 1, overflow: "auto", padding: 8 }}>
        {loading ? (
          <div style={{ color: "#484f58", textAlign: "center", padding: 24, fontSize: 12 }}>加载中...</div>
        ) : filtered.length === 0 ? (
          <div style={{ color: "#484f58", textAlign: "center", padding: 24, fontSize: 12 }}>
            {filter === "音频" ? "音频素材需先从视频提取" : "无素材"}
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))",
              gap: 6,
            }}
          >
            {filtered.map((a) => (
              <div
                key={a.relative_path}
                onClick={() => handleSelect(a)}
                title={`${a.filename}\n${formatSize(a.size)}`}
                style={{
                  background: "#161b22",
                  borderRadius: 6,
                  border: "1px solid #21262d",
                  cursor: "pointer",
                  overflow: "hidden",
                  transition: "border-color 0.15s, transform 0.1s",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.borderColor = TYPE_COLOR[a.asset_type === "video" ? "视频" : "图片"];
                  (e.currentTarget as HTMLElement).style.transform = "scale(1.02)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.borderColor = "#21262d";
                  (e.currentTarget as HTMLElement).style.transform = "scale(1)";
                }}
              >
                {/* Card preview with real thumbnail */}
                <div
                  style={{
                    height: 64,
                    background: "#0d1117",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    borderBottom: "1px solid #21262d",
                    position: "relative",
                    overflow: "hidden",
                  }}
                >
                  <AssetThumbnail assetPath={a.relative_path} assetType={a.asset_type} />
                  {/* Type badge */}
                  <span
                    style={{
                      position: "absolute", top: 3, right: 3,
                      fontSize: 9, color: "#fff",
                      background: TYPE_COLOR[a.asset_type === "video" ? "视频" : "图片"],
                      borderRadius: 2, padding: "0 4px",
                      fontWeight: 500,
                      textShadow: "0 1px 2px rgba(0,0,0,0.6)",
                    }}
                  >
                    {a.asset_type === "video" ? "视频" : "图片"}
                  </span>
                </div>

                {/* Card info */}
                <div style={{ padding: "4px 6px" }}>
                  <div
                    style={{
                      color: "#c9d1d9", fontSize: 10,
                      lineHeight: 1.3, fontWeight: 500,
                      overflow: "hidden", textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {a.filename}
                  </div>
                  <div style={{ color: "#484f58", fontSize: 9, marginTop: 1 }}>
                    {formatSize(a.size)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  // Modal mode
  if (!inline) {
    return (
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0, zIndex: 1100,
          background: "rgba(0,0,0,0.6)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            width: 620, maxHeight: "80vh",
            background: "#161b22", borderRadius: 8,
            border: "1px solid #30363d",
            display: "flex", flexDirection: "column", overflow: "hidden",
          }}
        >
          {content}
        </div>
      </div>
    );
  }

  // Inline mode
  return (
    <div style={{ height: "100%", borderLeft: "1px solid #21262d" }}>
      {content}
    </div>
  );
}

/** Lazy-load thumbnail for an asset. Video: first frame via ffmpeg. Image: direct render. */
function AssetThumbnail({ assetPath, assetType }: { assetPath: string; assetType: string }) {
  const [thumbSrc, setThumbSrc] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (assetType === "image") {
          const url = await getAssetSrc(assetPath);
          if (!cancelled) setThumbSrc(url);
        } else {
          // Video: get thumbnail via Rust command (extracts frame, scales to 200px wide)
          const thumbRel = await invoke<string>("get_asset_thumbnail", { relativePath: assetPath });
          if (!cancelled && thumbRel) {
            // thumbRel is relative to editor-tarui/ base, e.g. ".thumbnails/xxx.jpg"
            // Use convertFileSrc directly since it's already under the base
            if (thumbRel.startsWith(".thumbnails")) {
              const { documentDir, join } = await import("@tauri-apps/api/path");
              const docDir = await documentDir();
              const fullPath = await join(docDir, "editor-tarui", thumbRel);
              const { convertFileSrc } = await import("@tauri-apps/api/core");
              setThumbSrc(convertFileSrc(fullPath));
            } else {
              const url = await getAssetSrc(thumbRel);
              if (!cancelled) setThumbSrc(url);
            }
          }
        }
      } catch {
        // Fallback: show icon
      }
    })();
    return () => { cancelled = true; };
  }, [assetPath, assetType]);

  if (thumbSrc) {
    return (
      <img
        src={thumbSrc}
        alt=""
        style={{ width: "100%", height: "100%", objectFit: "cover" }}
      />
    );
  }

  return (
    <span style={{ fontSize: 24, opacity: 0.6 }}>
      {assetType === "video" ? "🎬" : "🖼️"}
    </span>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const iconBtn: React.CSSProperties = {
  background: "none", border: "none",
  color: "#8b949e", cursor: "pointer", fontSize: 14,
};
