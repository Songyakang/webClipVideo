import type { TimelineTrack as TimelineTrackType, TimelineClip } from "./types";
import TimelineClipBlock from "./TimelineClipBlock";

interface Props {
  track: TimelineTrackType;
  zoom: number;
  selectedClipId: string | null;
  onSelectClip: (id: string) => void;
  onMoveClip: (clipId: string, newStart: number) => void;
  onTrimClip: (clipId: string, edge: "left" | "right", newTime: number) => void;
}

const TRACK_HEIGHT = 48;
const LABEL_WIDTH = 120;

const TRACK_COLORS: Record<string, string> = {
  video: "#1f6feb33",
  audio: "#d2992233",
  text: "#a371f733",
};

export default function TimelineTrack({
  track,
  zoom,
  selectedClipId,
  onSelectClip,
  onMoveClip,
  onTrimClip,
}: Props) {
  const bg = TRACK_COLORS[track.type] || "transparent";

  return (
    <div
      style={{
        display: "flex",
        height: TRACK_HEIGHT,
        borderBottom: "1px solid #21262d",
        flexShrink: 0,
      }}
    >
      {/* Track header */}
      <div
        style={{
          width: LABEL_WIDTH,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          paddingLeft: 8,
          fontSize: 11,
          color: "#8b949e",
          fontFamily: "monospace",
          background: "#0d1117",
          borderRight: "1px solid #21262d",
          userSelect: "none",
        }}
      >
        {track.locked && "🔒 "}
        {track.muted && "🔇 "}
        {track.name}
      </div>

      {/* Track clips area */}
      <div
        style={{
          flex: 1,
          position: "relative",
          background: bg,
        }}
      >
        {track.clips.map((clip: TimelineClip) => (
          <TimelineClipBlock
            key={clip.id}
            clip={clip}
            zoom={zoom}
            trackHeight={TRACK_HEIGHT}
            selected={clip.id === selectedClipId}
            onSelect={onSelectClip}
            onMove={onMoveClip}
            onTrim={onTrimClip}
          />
        ))}
      </div>
    </div>
  );
}
