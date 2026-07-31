import { useState, useCallback, useRef } from "react";
import type { FlowNode } from "../nodes/types";
import { useTimelineEngine } from "./useTimelineEngine";
import { useTimelinePlayer } from "./useTimelinePlayer";
import TimelineRuler from "./TimelineRuler";
import TimelineTrack from "./TimelineTrack";
import TimelinePlayhead from "./TimelinePlayhead";
import TimelineControls from "./TimelineControls";
import TimelinePreview from "./TimelinePreview";
import TimelineAssetPanel from "./TimelineAssetPanel";
import TimelineExportModal from "./TimelineExportModal";
import FilterPanel from "./FilterPanel";
import type { TimelineClip } from "./types";
import { loadAssetUrl } from "../../../lib/assets";

interface Props {
  projectId: string;
  initialAssetPath?: string;
  initialFileUrl?: string;
  initialTitle?: string;
  projectNodes: FlowNode[];
  onClose: () => void;
}

const TRACK_HEIGHT = 48;
const LABEL_WIDTH = 120;

export default function TimelineEditor({
  projectId,
  initialAssetPath,
  initialFileUrl,
  initialTitle,
  projectNodes,
  onClose,
}: Props) {
  const engine = useTimelineEngine({
    projectId,
    initialAssetPath,
    initialFileUrl,
    initialTitle,
  });

  const player = useTimelinePlayer({
    totalDuration: engine.totalDuration,
  });

  // Sync player time back to engine for preview display
  const currentTime = player.currentTime;
  const totalWidth = engine.totalDuration * engine.zoom;

  // Keyboard shortcuts
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === " ") {
        e.preventDefault();
        player.toggle();
      }
    },
    [player],
  );

  const [showAssetPanel, setShowAssetPanel] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showFilter, setShowFilter] = useState(false);

  // Find selected clip
  const selectedClip = engine.selectedClipId
    ? engine.data.tracks.flatMap((t) => t.clips).find((c) => c.id === engine.selectedClipId) || null
    : null;

  // Auto-show filter panel when clip is selected
  const handleSelectClip = useCallback(
    (id: string | null) => {
      engine.selectClip(id);
      if (id) setShowFilter(true);
    },
    [engine],
  );

  // Handle adding clip from asset panel
  const handleAddClipFromAsset = useCallback(
    async (assetPath: string, filename: string, assetType: "image" | "video") => {
      const videoTrack = engine.data.tracks.find((t) => t.type === "video");
      if (!videoTrack) return;

      let fileUrl = "";
      try {
        fileUrl = await loadAssetUrl(assetPath);
      } catch {
        fileUrl = assetPath;
      }

      const clipType = assetType === "video" ? "video" : "image";
      const defaultDuration = clipType === "image" ? 5 : 30;

      engine.addClip(videoTrack.id, {
        title: filename,
        type: clipType as TimelineClip["type"],
        startTime: currentTime,
        duration: defaultDuration,
        assetPath,
        fileUrl,
        sourceStart: 0,
        sourceEnd: defaultDuration,
      });
    },
    [engine, currentTime],
  );

  // Handle adding clip from project nodes
  const handleAddClipFromNode = useCallback(
    (node: FlowNode) => {
      const videoTrack = engine.data.tracks.find((t) => t.type === "video");
      if (!videoTrack) return;

      const d = node.data as any;
      const assetPath = d.assetPath;
      const fileUrl = d.fileUrl;
      if (!assetPath) return;

      const isVideo = d.type === "video-upload" || d.type === "video";
      const clipType = isVideo ? "video" : "image";
      const defaultDuration = clipType === "image" ? 5 : 30;

      engine.addClip(videoTrack.id, {
        title: d.label || d.content || `节点 ${node.id.slice(0, 6)}`,
        type: clipType as TimelineClip["type"],
        startTime: currentTime,
        duration: defaultDuration,
        assetPath,
        fileUrl,
        sourceStart: 0,
        sourceEnd: defaultDuration,
      });
    },
    [engine, currentTime],
  );

  const scrollRef = useRef<HTMLDivElement>(null);

  const handleSeek = useCallback(
    (time: number) => {
      player.seek(time);
    },
    [player],
  );

  return (
    <div
      onKeyDown={handleKeyDown}
      tabIndex={0}
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        outline: "none",
        overflow: "hidden",
      }}
    >
      {/* Top bar */}
      <div
        style={{
          height: 40,
          background: "#161b22",
          borderBottom: "1px solid #21262d",
          display: "flex",
          alignItems: "center",
          padding: "0 12px",
          flexShrink: 0,
        }}
      >
        <span style={{ color: "#c9d1d9", fontWeight: 600, fontSize: 14 }}>
          剪辑台
        </span>
        <span style={{ color: "#484f58", fontSize: 11, marginLeft: 8, fontFamily: "monospace" }}>
          {projectId.slice(0, 8)}
        </span>

        {/* Project nodes quick-add */}
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", gap: 4, marginRight: 12 }}>
          {projectNodes
            .filter(
              (n) =>
                (n.data.type === "video-upload" ||
                  n.data.type === "image-upload") &&
                (n.data as any).assetPath,
            )
            .slice(0, 6)
            .map((n) => (
              <button
                key={n.id}
                onClick={() => handleAddClipFromNode(n)}
                title={`添加: ${(n.data as any).label || n.data.content || n.id}`}
                style={{
                  background: "#21262d",
                  border: "1px solid #30363d",
                  borderRadius: 3,
                  color: "#8b949e",
                  cursor: "pointer",
                  fontSize: 10,
                  padding: "2px 6px",
                  maxWidth: 100,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                + {(n.data as any).label || n.data.content || "素材"}
              </button>
            ))}
        </div>

        <button
          onClick={onClose}
          style={{
            background: "none",
            border: "none",
            color: "#8b949e",
            cursor: "pointer",
            fontSize: 18,
            padding: "0 4px",
          }}
        >
          ✕
        </button>
      </div>

      {/* Body: 12/13 grid — left video, right timeline+assets */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* Area 1: Video preview (left, full height) */}
        <TimelinePreview
          data={engine.data}
          currentTime={currentTime}
          playing={player.playing}
        />

        {/* Area 2+3: Right column (assets top, timeline bottom) */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>
          {/* Area 3: Asset panel (top, fills remaining height) */}
          <div style={{ flex: 1, overflow: "hidden" }}>
            <TimelineAssetPanel
              inline
              projectId={projectId}
              onSelect={handleAddClipFromAsset}
            />
          </div>

          {/* Area 2: Timeline tracks (bottom, fixed 3-track height) */}
          <div
            style={{
              flexShrink: 0,
              display: "flex",
              flexDirection: "column",
              borderTop: "1px solid #21262d",
              height: 3 * TRACK_HEIGHT + 24 + 48, // 3 tracks + ruler + controls
            }}
          >
            {/* Ruler */}
            <div style={{ overflow: "hidden", flexShrink: 0, marginLeft: LABEL_WIDTH }}>
              <div
                ref={scrollRef}
                style={{ overflowX: "auto", overflowY: "hidden" }}
                onScroll={(e) => {
                  const tracksEl = (e.currentTarget.parentElement?.nextSibling as HTMLElement)?.querySelector?.("[data-scroll-area]");
                  if (tracksEl) tracksEl.scrollLeft = (e.target as HTMLElement).scrollLeft;
                }}
              >
                <TimelineRuler
                  duration={engine.totalDuration}
                  zoom={engine.zoom}
                  onSeek={handleSeek}
                />
              </div>
            </div>

            {/* Tracks */}
            <div style={{ flex: 1, overflow: "hidden" }}>
              <div
                data-scroll-area
                style={{ overflowX: "auto", overflowY: "auto", height: "100%" }}
              >
                <div style={{ position: "relative", minWidth: `${totalWidth + LABEL_WIDTH}px` }}>
                  {engine.data.tracks.map((track) => (
                    <TimelineTrack
                      key={track.id} track={track} zoom={engine.zoom}
                      selectedClipId={engine.selectedClipId}
                      onSelectClip={handleSelectClip}
                      onMoveClip={(id, start) => engine.moveClip(id, start)}
                      onTrimClip={(id, edge, time) => engine.trimClip(id, edge, time)}
                    />
                  ))}
                  <div style={{ position: "absolute", left: LABEL_WIDTH, top: 0, height: `${engine.data.tracks.length * TRACK_HEIGHT}px`, pointerEvents: "none" }}>
                    <TimelinePlayhead currentTime={currentTime} zoom={engine.zoom} height={engine.data.tracks.length * TRACK_HEIGHT} />
                  </div>
                </div>
              </div>
            </div>

            {/* Controls bar */}
            <TimelineControls
              currentTime={currentTime} totalDuration={engine.totalDuration}
              playing={player.playing} zoom={engine.zoom}
              hasSelectedClip={selectedClip != null} showFilter={showFilter}
              onToggle={player.toggle} onSeek={handleSeek} onZoomChange={engine.setZoom}
              onAddClip={() => setShowAssetPanel(true)} onExport={() => setShowExport(true)}
              onToggleFilter={() => setShowFilter((v) => !v)}
            />
          </div>
        </div>

        {/* Filter panel (right side, conditional) */}
        {showFilter && (
          <FilterPanel
            clip={selectedClip}
            onUpdateClipFilter={engine.updateClipFilter}
            onApplyFilterPreset={engine.applyFilterPreset}
            onResetClipFilter={engine.resetClipFilter}
            onClose={() => setShowFilter(false)}
          />
        )}
      </div>

      {/* Asset panel modal (fallback when opened from + button) */}
      {showAssetPanel && (
        <TimelineAssetPanel
          projectId={projectId}
          onSelect={handleAddClipFromAsset}
          onClose={() => setShowAssetPanel(false)}
        />
      )}

      {/* Export modal */}
      {showExport && (
        <TimelineExportModal data={engine.data} onClose={() => setShowExport(false)} />
      )}
    </div>
  );
}
