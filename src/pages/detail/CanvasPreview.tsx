import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import type { Edge } from "@xyflow/react";
import { loadAssetUrl } from "../../lib/assets";
import type { FlowNode } from "./nodes/types";

interface Props {
  nodes: FlowNode[];
  edges: Edge[];
  onClose: () => void;
}

function computeSequence(nodes: FlowNode[], edges: Edge[]): FlowNode[] {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const inDegree = new Map<string, number>();
  const outEdges = new Map<string, string[]>();

  for (const n of nodes) {
    inDegree.set(n.id, 0);
    outEdges.set(n.id, []);
  }
  for (const e of edges) {
    inDegree.set(e.target, (inDegree.get(e.target) || 0) + 1);
    outEdges.get(e.source)?.push(e.target);
  }

  const queue: string[] = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id);
  }

  const visited = new Set<string>();
  const seq: FlowNode[] = [];

  while (queue.length > 0) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    const node = nodeMap.get(id);
    if (node) seq.push(node);
    for (const t of outEdges.get(id) || []) {
      const d = (inDegree.get(t) || 1) - 1;
      inDegree.set(t, d);
      if (d === 0 && !visited.has(t)) queue.push(t);
    }
  }

  for (const n of nodes) {
    if (!visited.has(n.id)) seq.push(n);
  }

  return seq;
}

function tryParsePrompt(content: string): string {
  try {
    const obj = JSON.parse(content);
    if (obj && typeof obj.prompt === "string") return obj.prompt;
  } catch {}
  return content;
}

const SPINNER = (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#888" strokeWidth="2" style={{ animation: "spin 0.8s linear infinite" }}>
    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" fill="none" opacity="0.2" />
    <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2" fill="none" />
  </svg>
);

interface NodeContentProps {
  node: FlowNode;
  onVideoEnded: () => void;
}

function NodeContent({ node, onVideoEnded }: NodeContentProps) {
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const d = node.data as any;
  const nodeType = d.type || node.type || "";

  useEffect(() => {
    setImgUrl(null);
    if (nodeType === "image" || nodeType === "image-upload") {
      if (d.fileUrl) {
        setImgUrl(d.fileUrl);
      } else if (d.assetPath) {
        loadAssetUrl(d.assetPath).then(setImgUrl);
      }
    }
  }, [node.id, nodeType, d.fileUrl, d.assetPath]);

  if (nodeType === "video" || nodeType === "video-upload") {
    const src = d.fileUrl || "";
    if (!src) return <span style={{ color: "#8b949e" }}>视频不可用</span>;
    return (
      <video
        key={node.id}
        src={src}
        controls={false}
        autoPlay
        playsInline
        onEnded={onVideoEnded}
        style={{ maxWidth: "90vw", maxHeight: "70vh", borderRadius: 8 }}
      />
    );
  }

  if (nodeType === "image" || nodeType === "image-upload") {
    if (!imgUrl) return SPINNER;
    return (
      <img
        src={imgUrl}
        alt=""
        style={{ maxWidth: "90vw", maxHeight: "75vh", objectFit: "contain", borderRadius: 8 }}
      />
    );
  }

  // Text node or fallback
  const content = d.content || "";
  if (!content) return <span style={{ color: "#484f58" }}>空文本节点</span>;
  return (
    <div style={{ maxWidth: "80vw", maxHeight: "70vh", overflow: "auto", fontSize: 24, lineHeight: 1.8, color: "#e6edf3", textAlign: "center" }}>
      {tryParsePrompt(content)}
    </div>
  );
}

export default function CanvasPreview({ nodes, edges, onClose }: Props) {
  const sequence = useMemo(() => computeSequence(nodes, edges), [nodes, edges]);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [showControls, setShowControls] = useState(true);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const videoAdvanceRef = useRef(false);

  const current = sequence[index];
  const total = sequence.length;
  const canPrev = index > 0;
  const canNext = index < total - 1;

  const advance = useCallback(() => {
    if (index < total - 1) {
      setIndex((i) => i + 1);
      videoAdvanceRef.current = false;
    } else {
      setPlaying(false);
    }
  }, [index, total]);

  const goBack = useCallback(() => {
    if (index > 0) {
      setIndex((i) => i - 1);
      videoAdvanceRef.current = false;
    }
  }, [index]);

  // Auto-advance for non-video nodes
  useEffect(() => {
    if (!playing || total === 0) return;
    const d = current?.data as any;
    const isVideo = d?.type === "video" || d?.type === "video-upload";
    if (isVideo) return; // video handles its own advance via onEnded

    const timer = setTimeout(advance, 4000);
    return () => clearTimeout(timer);
  }, [playing, index, current, advance, total]);

  // Show controls on mouse move, hide after delay
  const showControlsTemp = useCallback(() => {
    setShowControls(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setShowControls(false), 2500);
  }, []);

  useEffect(() => {
    if (playing) {
      hideTimer.current = setTimeout(() => setShowControls(false), 2500);
    }
    return () => clearTimeout(hideTimer.current);
  }, [playing]);

  // Keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      switch (e.key) {
        case "Escape": onClose(); break;
        case " ": e.preventDefault(); setPlaying((p) => !p); break;
        case "ArrowRight": if (canNext) advance(); break;
        case "ArrowLeft": if (canPrev) goBack(); break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, advance, goBack, canNext, canPrev]);

  if (total === 0) {
    return (
      <div className="fixed inset-0 z-40 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.92)" }}>
        <span style={{ color: "#8b949e" }}>画布上没有可预览的节点</span>
      </div>
    );
  }

  const handleVideoEnded = () => {
    if (!videoAdvanceRef.current) {
      videoAdvanceRef.current = true;
      advance();
    }
  };

  return (
    <div
      className="fixed inset-0 z-40 flex flex-col select-none"
      style={{ background: "rgba(0,0,0,0.94)" }}
      onMouseMove={showControlsTemp}
      onClick={() => setPlaying((p) => !p)}
    >
      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: scale(0.97); } to { opacity: 1; transform: scale(1); } }
        .preview-fade { animation: fadeIn 0.3s ease-out; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      {/* Content area */}
      <div className="flex-1 flex items-center justify-center" key={current?.id}>
        <div className="preview-fade">
          {current && <NodeContent node={current} onVideoEnded={handleVideoEnded} />}
        </div>
      </div>

      {/* Controls bar */}
      <div
        className="absolute bottom-0 left-0 right-0 flex flex-col items-center pb-6 px-6 transition-opacity duration-300"
        style={{ opacity: showControls ? 1 : 0, pointerEvents: showControls ? "auto" : "none", background: "linear-gradient(transparent, rgba(0,0,0,0.7))" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Progress dots */}
        <div className="flex items-center gap-1.5 mb-4">
          {sequence.map((n, i) => (
            <button
              key={n.id}
              className="rounded-full transition-all duration-200 cursor-pointer border-0"
              style={{
                width: i === index ? 24 : 8,
                height: 8,
                background: i === index ? "#58a6ff" : i < index ? "#484f58" : "#21262d",
              }}
              onClick={() => { setIndex(i); videoAdvanceRef.current = false; }}
            />
          ))}
        </div>

        {/* Buttons */}
        <div className="flex items-center gap-4">
          <button
            className="cursor-pointer border-0 bg-transparent p-2 rounded-lg transition-colors"
            style={{ color: canPrev ? "#e6edf3" : "#21262d" }}
            onClick={() => canPrev && goBack()}
            disabled={!canPrev}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" /></svg>
          </button>

          <button
            className="cursor-pointer border-0 p-3 rounded-full transition-colors"
            style={{ background: "rgba(255,255,255,0.1)", color: "#e6edf3" }}
            onClick={() => setPlaying((p) => !p)}
          >
            {playing ? (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>
            ) : (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><polygon points="8,5 19,12 8,19" /></svg>
            )}
          </button>

          <button
            className="cursor-pointer border-0 bg-transparent p-2 rounded-lg transition-colors"
            style={{ color: canNext ? "#e6edf3" : "#21262d" }}
            onClick={() => canNext && advance()}
            disabled={!canNext}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zm2-8v8h2V6h-2v8z" /></svg>
          </button>
        </div>

        {/* Close hint */}
        <button
          className="absolute top-4 right-4 cursor-pointer border-0 bg-transparent p-2 rounded-lg transition-colors"
          style={{ color: "#8b949e" }}
          onClick={onClose}
          onMouseEnter={(e) => { e.currentTarget.style.color = "#e6edf3"; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = "#8b949e"; }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        </button>
      </div>
    </div>
  );
}
