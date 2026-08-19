import { useState, useRef, useEffect, useReducer, memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Toolbox } from "../toolbox";

const tryParsePrompt = (content: string): string => {
  try {
    const obj = JSON.parse(content);
    if (obj && typeof obj.prompt === "string") return obj.prompt;
  } catch {}
  return content;
};

const OptionButton = ({ label, onClick }: { label: string; onClick: () => void }) => (
  <button
    className="cursor-pointer px-4 py-2 rounded-lg text-sm border transition-colors"
    style={{ background: "#21262d", borderColor: "#30363d", color: "#c9d1d9" }}
    onClick={(e) => { e.stopPropagation(); onClick(); }}
    onMouseEnter={(e) => { e.currentTarget.style.background = "#30363d"; e.currentTarget.style.borderColor = "#58a6ff"; e.currentTarget.style.color = "#e6edf3"; }}
    onMouseLeave={(e) => { e.currentTarget.style.background = "#21262d"; e.currentTarget.style.borderColor = "#30363d"; e.currentTarget.style.color = "#c9d1d9"; }}
  >
    {label}
  </button>
);

const REVERSE_PROMPT = "根据图片生成结构化中文提示词，包括主体描述、环境、光影、镜头语言、风格关键词。";

export default memo(function TextNode({ id, data, selected, dragging }: NodeProps) {
  const d = data as any;
  const w = d.w || 680;
  const h = d.h || 400;
  const isEditing = d.isEditing === true;
  const [text, setText] = useState(d.content || "");
  const [, forceUpdate] = useReducer((x: number) => x + 1, 0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isEditing) textareaRef.current?.focus();
  }, [isEditing]);

  const commit = () => {
    d.content = text;
    d.isEditing = false;
  };

  const isEmpty = !d.content && !isEditing;
  const showOptions = isEmpty && selected && !d.mode;

  const handleOption = (mode: string) => {
    d.mode = mode;
    if (mode === "text") {
      d.isEditing = true;
    } else if (mode === "video") {
      d.onCreateVideoNode?.();
    } else if (mode === "image") {
      d.onCreateImageNode?.();
    } else if (mode === "reverse") {
      d.onReversePrompt?.();
    }
    forceUpdate();
  };

  const defaultPrompt = d.mode === "reverse" ? REVERSE_PROMPT : tryParsePrompt(d.content || "");

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
            borderRadius: 12,
            fontFamily: "inherit",
            boxSizing: "border-box",
          }}
        />
      ) : showOptions ? (
        <div className="node-content flex flex-col items-center justify-center gap-3">
          <span className="text-sm mb-1" style={{ color: "#8b949e" }}>选择文本节点模式</span>
          <div className="flex flex-wrap justify-center gap-2">
            <OptionButton label="自己编写内容" onClick={() => handleOption("text")} />
            <OptionButton label="文生视频" onClick={() => handleOption("video")} />
            <OptionButton label="文生图片" onClick={() => handleOption("image")} />
            <OptionButton label="图片反推提示词" onClick={() => handleOption("reverse")} />
          </div>
        </div>
      ) : (
        <div className="node-content">
          {tryParsePrompt(d.content) || <span className="node-placeholder">双击编辑文本</span>}
        </div>
      )}

      <Handle type="source" position={Position.Right} className="flow-handle" />
      {selected && !isEditing && !dragging && !showOptions && (
        <div className="node-toolbox-wrapper">
          <Toolbox
            nodeId={id}
            nodeType="text"
            defaultPrompt={defaultPrompt}
            mode={d.mode}
            onOptimized={(optimizedPrompt) => {
              d.content = JSON.stringify({ prompt: optimizedPrompt });
              forceUpdate();
            }}
          />
        </div>
      )}
    </div>
  );
});
