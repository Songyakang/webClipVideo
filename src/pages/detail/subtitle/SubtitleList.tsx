import { useState, useRef, useEffect, useCallback } from "react";
import type { SubtitleItem } from "../../../lib/types";
import { formatTime } from "./utils";
import "./SubtitleList.css";

interface Props {
  items: SubtitleItem[];
  currentTime: number;
  editingId: string | null;
  onStartEdit: (id: string) => void;
  onCommitEdit: (id: string, text: string) => void;
  onUpdateTime: (id: string, startTime: number, endTime: number) => void;
  onDelete: (id: string) => void;
  onMergeUp: (id: string) => void;
  onSplit: (id: string) => void;
  onAdd: () => void;
}

export default function SubtitleList({
  items,
  currentTime,
  editingId,
  onStartEdit,
  onCommitEdit,
  onUpdateTime,
  onDelete,
  onMergeUp,
  onSplit,
  onAdd,
}: Props) {
  const listRef = useRef<HTMLDivElement>(null);

  const activeIndex = items.findIndex(
    (item) => currentTime >= item.startTime && currentTime <= item.endTime
  );

  useEffect(() => {
    if (activeIndex === -1 || !listRef.current) return;
    const row = listRef.current.children[activeIndex] as HTMLElement | undefined;
    row?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [activeIndex]);

  if (items.length === 0) {
    return (
      <div className="subtitle-list">
        <div className="subtitle-list-empty">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ opacity: 0.4 }}>
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
            <line x1="8" y1="7" x2="16" y2="7" />
            <line x1="8" y1="11" x2="14" y2="11" />
          </svg>
          <span>暂无字幕</span>
        </div>
        <button className="subtitle-list-add" onClick={onAdd}>+ 添加字幕</button>
      </div>
    );
  }

  return (
    <div className="subtitle-list" ref={listRef}>
      {items.map((item, i) => {
        const isActive = currentTime >= item.startTime && currentTime <= item.endTime;
        const isEditing = editingId === item.id;
        return (
          <SubtitleRow
            key={item.id}
            item={item}
            index={i}
            isActive={isActive}
            isEditing={isEditing}
            isFirst={i === 0}
            onStartEdit={() => onStartEdit(item.id)}
            onCommitEdit={(text) => onCommitEdit(item.id, text)}
            onUpdateTime={(start, end) => onUpdateTime(item.id, start, end)}
            onDelete={() => onDelete(item.id)}
            onMergeUp={() => onMergeUp(item.id)}
            onSplit={() => onSplit(item.id)}
          />
        );
      })}
      <button className="subtitle-list-add" onClick={onAdd}>+ 添加字幕</button>
    </div>
  );
}

function SubtitleRow({
  item,
  index,
  isActive,
  isEditing,
  isFirst,
  onStartEdit,
  onCommitEdit,
  onUpdateTime,
  onDelete,
  onMergeUp,
  onSplit,
}: {
  item: SubtitleItem;
  index: number;
  isActive: boolean;
  isEditing: boolean;
  isFirst: boolean;
  onStartEdit: () => void;
  onCommitEdit: (text: string) => void;
  onUpdateTime: (start: number, end: number) => void;
  onDelete: () => void;
  onMergeUp: () => void;
  onSplit: () => void;
}) {
  const [draftText, setDraftText] = useState(item.text);
  const [editingTime, setEditingTime] = useState<"start" | "end" | null>(null);
  const [timeDraft, setTimeDraft] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setDraftText(item.text);
  }, [item.text]);

  useEffect(() => {
    if (isEditing) {
      textareaRef.current?.focus();
      textareaRef.current?.select();
    }
  }, [isEditing]);

  const commitText = useCallback(() => {
    const trimmed = draftText.trim();
    if (trimmed && trimmed !== item.text) {
      onCommitEdit(trimmed);
    } else if (!trimmed) {
      setDraftText(item.text);
    }
  }, [draftText, item.text, onCommitEdit]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      commitText();
    }
    if (e.key === "Escape") {
      setDraftText(item.text);
      onCommitEdit(item.text);
    }
  };

  const startTimeEdit = (field: "start" | "end") => {
    const val = field === "start" ? item.startTime : item.endTime;
    setTimeDraft(formatTime(val));
    setEditingTime(field);
  };

  const commitTimeEdit = () => {
    if (!editingTime) return;
    const parts = timeDraft.match(/(\d{2}):(\d{2}):(\d{2})[.,](\d{3})/);
    if (parts) {
      const sec =
        parseInt(parts[1]) * 3600 +
        parseInt(parts[2]) * 60 +
        parseInt(parts[3]) +
        parseInt(parts[4]) / 1000;
      if (editingTime === "start") {
        onUpdateTime(sec, item.endTime);
      } else {
        onUpdateTime(item.startTime, sec);
      }
    }
    setEditingTime(null);
  };

  return (
    <div className={`subtitle-row${isActive ? " active" : ""}`}>
      <div className="sub-row-index">{index + 1}</div>
      <div className="sub-row-body">
        <div className="sub-row-time" onDoubleClick={() => startTimeEdit("start")}>
          {editingTime === "start" ? (
            <input
              className="sub-row-time-input"
              value={timeDraft}
              onChange={(e) => setTimeDraft(e.target.value)}
              onBlur={commitTimeEdit}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitTimeEdit();
                if (e.key === "Escape") setEditingTime(null);
              }}
              autoFocus
            />
          ) : (
            formatTime(item.startTime)
          )}
          <span style={{ margin: "0 4px", color: "#30363d" }}>{'→'}</span>
          {editingTime === "end" ? (
            <input
              className="sub-row-time-input"
              value={timeDraft}
              onChange={(e) => setTimeDraft(e.target.value)}
              onBlur={commitTimeEdit}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitTimeEdit();
                if (e.key === "Escape") setEditingTime(null);
              }}
              autoFocus
            />
          ) : (
            <span onDoubleClick={() => startTimeEdit("end")}>
              {formatTime(item.endTime)}
            </span>
          )}
        </div>

        {isEditing ? (
          <textarea
            ref={textareaRef}
            className="sub-row-textarea"
            value={draftText}
            onChange={(e) => {
              setDraftText(e.target.value);
              const el = e.target;
              el.style.height = "auto";
              el.style.height = el.scrollHeight + "px";
            }}
            onBlur={commitText}
            onKeyDown={handleKeyDown}
            rows={1}
          />
        ) : (
          <div className="sub-row-text" onClick={onStartEdit}>
            {item.text || <span style={{ color: "#484f58", fontStyle: "italic" }}>空字幕</span>}
          </div>
        )}
      </div>
      <div className="sub-row-actions">
        {!isFirst && (
          <button className="sub-row-btn" title="合并到上一条" onClick={onMergeUp}>
            {'↑'}
          </button>
        )}
        <button className="sub-row-btn" title="拆分" onClick={onSplit}>
          {'↕'}
        </button>
        <button className="sub-row-btn danger" title="删除" onClick={onDelete}>
          {'×'}
        </button>
      </div>
    </div>
  );
}
