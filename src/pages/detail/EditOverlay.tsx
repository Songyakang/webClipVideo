import { useState, useRef, useEffect } from "react";
import type { FlowNode } from "./nodes/types";

interface Props {
  node: FlowNode;
  onCommit: (text: string) => void;
  rfInstance: React.MutableRefObject<any>;
}

export default function EditOverlay({ node, onCommit, rfInstance }: Props) {
  const [text, setText] = useState(node.data.content || "");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pos = rfInstance.current?.flowToScreenPosition?.(node.position) ?? { x: 0, y: 0 };
  const zoom = rfInstance.current?.getZoom?.() ?? 0.5;

  useEffect(() => { textareaRef.current?.focus(); }, []);

  return (
    <textarea
      ref={textareaRef}
      className="canvas-textarea"
      style={{
        position: "fixed",
        left: pos.x + 32 * zoom,
        top: pos.y + 36 * zoom,
        width: ((node.data.w || 700) - 64) * zoom,
        height: ((node.data.h || 400) - 72) * zoom,
        fontSize: 14 * zoom,
      }}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => onCommit(text)}
      placeholder="输入文本..."
    />
  );
}
