import { useState, useRef, useEffect } from "react";
import type { VideoClip } from "../../lib/types";
import { updateClip } from "../../lib/store";

interface Props {
  clip: VideoClip;
  onUpdate: (c: VideoClip) => void;
}

export default function TitleEditor({ clip, onUpdate }: Props) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(clip.title);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  const save = async () => {
    const t = text.trim() || "未命名";
    const updated = await updateClip(clip.id, { title: t });
    if (updated) onUpdate(updated);
    setText(t);
    setEditing(false);
  };

  return editing ? (
    <input
      ref={inputRef}
      className="title-input"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => {
        if (e.key === "Enter") save();
        if (e.key === "Escape") { setText(clip.title); setEditing(false); }
      }}
    />
  ) : (
    <div className="title-display" onClick={() => setEditing(true)} title="点击编辑标题">
      {clip.title}
    </div>
  );
}
