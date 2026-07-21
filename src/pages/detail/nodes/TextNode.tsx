import { useState, useRef, useEffect } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import ImageToolbox from "../ImageToolbox";

export default function TextNode({ data, selected, dragging }: NodeProps) {
  const d = data as any;
  const w = d.w || 700;
  const h = d.h || 400;
  const isEditing = d.isEditing === true;
  const [text, setText] = useState(d.content || "");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isEditing) textareaRef.current?.focus();
  }, [isEditing]);

  const commit = () => {
    // Write back to node data — ReactFlow's onNodesChange will pick it up
    d.content = text;
    d.isEditing = false;
  };

  return (
    <div
      className={`flow-node text-node${selected ? " selected" : ""}`}
      style={{ width: w, height: h }}
    >
      <Handle type="target" position={Position.Left} className="flow-handle" />

      {isEditing ? (
        <textarea
          ref={textareaRef}
          className="node-textarea"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          style={{
            width: "100%",
            height: "100%",
            resize: "none",
            border: "none",
            outline: "none",
            background: "#0d1117",
            color: "#e6edf3",
            fontSize: 14,
            lineHeight: 1.6,
            padding: "20px 28px",
            fontFamily: "inherit",
            boxSizing: "border-box",
          }}
        />
      ) : (
        <div className="node-content">
          {d.content || <span className="node-placeholder">双击编辑文本</span>}
        </div>
      )}

      <Handle type="source" position={Position.Right} className="flow-handle" />
      {selected && !isEditing && !dragging && (
        <div className="node-toolbox-wrapper">
          <ImageToolbox />
        </div>
      )}
    </div>
  );
}
