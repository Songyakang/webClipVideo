interface Props {
  currentTime: number;
  zoom: number;
  height: number;
}

export default function TimelinePlayhead({ currentTime, zoom, height }: Props) {
  return (
    <div
      style={{
        position: "absolute",
        left: `${currentTime * zoom}px`,
        top: 0,
        width: "2px",
        height: `${height}px`,
        background: "#f85149",
        zIndex: 10,
        pointerEvents: "none",
      }}
    >
      {/* Diamond marker at top */}
      <div
        style={{
          position: "absolute",
          top: -5,
          left: -4,
          width: 10,
          height: 10,
          background: "#f85149",
          transform: "rotate(45deg)",
        }}
      />
    </div>
  );
}
