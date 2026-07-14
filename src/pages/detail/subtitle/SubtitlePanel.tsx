import { useReducer, useEffect, useCallback, useRef, useState } from "react";
import type { SubtitleItem, SubtitleTrack, SubtitleStyle, VoiceProfile } from "../../../lib/types";
import { DEFAULT_SUBTITLE_STYLE } from "../../../lib/types";
import { saveSubtitleTrack, loadSubtitleTrack } from "../../../lib/store";
import { parseSRT } from "./utils";
import SubtitlePlayerBar from "./SubtitlePlayerBar";
import SubtitleTimeline from "./SubtitleTimeline";
import SubtitleList from "./SubtitleList";
import SubtitleStyleEditor from "./SubtitleStyleEditor";
import ExportModal from "./ExportModal";
import InpaintModal from "./InpaintModal";
import "./SubtitlePanel.css";

let itemIdCounter = 0;
function newItemId(): string {
  return `si-${Date.now().toString(36)}-${++itemIdCounter}`;
}

type SubtitleAction =
  | { type: "SET_TRACK"; track: SubtitleTrack }
  | { type: "UPDATE_ITEM_TEXT"; id: string; text: string }
  | { type: "UPDATE_ITEM_TIME"; id: string; startTime: number; endTime: number }
  | { type: "DELETE_ITEM"; id: string }
  | { type: "ADD_ITEM"; startTime: number; endTime: number }
  | { type: "MERGE_UP"; id: string }
  | { type: "SPLIT"; id: string }
  | { type: "SET_LANGUAGE"; language: string }
  | { type: "SET_STATUS"; status: SubtitleTrack["status"] }
  | { type: "LOAD_SRT"; srtText: string };

function subtitleReducer(state: SubtitleTrack, action: SubtitleAction): SubtitleTrack {
  switch (action.type) {
    case "SET_TRACK":
      return action.track;

    case "LOAD_SRT": {
      const items = parseSRT(action.srtText);
      return { ...state, items, status: "ready" };
    }

    case "UPDATE_ITEM_TEXT": {
      const items = state.items.map((it) =>
        it.id === action.id ? { ...it, text: action.text } : it
      );
      return { ...state, items, status: "edited" };
    }

    case "UPDATE_ITEM_TIME": {
      const items = state.items.map((it) =>
        it.id === action.id
          ? { ...it, startTime: action.startTime, endTime: action.endTime }
          : it
      );
      return { ...state, items, status: "edited" };
    }

    case "DELETE_ITEM": {
      const items = state.items.filter((it) => it.id !== action.id);
      return { ...state, items, status: "edited" };
    }

    case "ADD_ITEM": {
      const newItem: SubtitleItem = {
        id: newItemId(),
        startTime: action.startTime,
        endTime: action.endTime,
        text: "",
      };
      const items = [...state.items, newItem].sort((a, b) => a.startTime - b.startTime);
      return { ...state, items, status: "edited" };
    }

    case "MERGE_UP": {
      const idx = state.items.findIndex((it) => it.id === action.id);
      if (idx <= 0) return state;
      const prev = state.items[idx - 1];
      const curr = state.items[idx];
      const merged: SubtitleItem = {
        ...prev,
        text: prev.text + curr.text,
        endTime: curr.endTime,
      };
      const items = state.items
        .map((it, i) => (i === idx - 1 ? merged : i === idx ? null : it))
        .filter(Boolean) as SubtitleItem[];
      return { ...state, items, status: "edited" };
    }

    case "SPLIT": {
      const idx = state.items.findIndex((it) => it.id === action.id);
      if (idx === -1) return state;
      const item = state.items[idx];
      const midTime = (item.startTime + item.endTime) / 2;
      const midText = Math.floor(item.text.length / 2);
      let splitPoint = midText;
      const spaceIdx = item.text.indexOf(" ", midText - 5);
      if (spaceIdx !== -1 && spaceIdx < midText + 5) {
        splitPoint = spaceIdx;
      }
      const first: SubtitleItem = {
        id: newItemId(),
        startTime: item.startTime,
        endTime: midTime,
        text: item.text.slice(0, splitPoint).trim(),
      };
      const second: SubtitleItem = {
        id: item.id,
        startTime: midTime,
        endTime: item.endTime,
        text: item.text.slice(splitPoint).trim(),
      };
      const items = [
        ...state.items.slice(0, idx),
        first,
        second,
        ...state.items.slice(idx + 1),
      ];
      return { ...state, items, status: "edited" };
    }

    case "SET_LANGUAGE":
      return { ...state, language: action.language };

    case "SET_STATUS":
      return { ...state, status: action.status };

    default:
      return state;
  }
}

function emptyTrack(nodeId: string): SubtitleTrack {
  return {
    id: nodeId,
    items: [],
    language: "zh",
    status: "empty",
  };
}

interface Props {
  nodeId: string;
  videoEl: HTMLVideoElement | null;
  videoAssetPath?: string;
  projectId?: string;
  onClose: () => void;
}

export default function SubtitlePanel({ nodeId, videoEl, videoAssetPath, projectId, onClose }: Props) {
  const [track, dispatch] = useReducer(subtitleReducer, emptyTrack(nodeId));
  const [currentTime, setCurrentTime] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [subtitleStyle, setSubtitleStyle] = useState<SubtitleStyle>(DEFAULT_SUBTITLE_STYLE);
  const [showExport, setShowExport] = useState(false);
  const [showInpaint, setShowInpaint] = useState(false);
  const [voiceProfile, setVoiceProfile] = useState<VoiceProfile | null>(null);
  const [synthesizing, setSynthesizing] = useState(false);
  const [audioMap, setAudioMap] = useState<Map<string, string>>(new Map());
  const [selectedVoice, setSelectedVoice] = useState<string>("original");
  const loadedRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    loadSubtitleTrack(nodeId).then((saved) => {
      if (saved) {
        dispatch({ type: "SET_TRACK", track: saved });
      }
      loadedRef.current = true;
    });
  }, [nodeId]);

  useEffect(() => {
    if (!loadedRef.current) return;
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveSubtitleTrack(track);
    }, 500);
    return () => clearTimeout(saveTimerRef.current);
  }, [track]);

  const duration = videoEl?.duration || 0;

  const handleGenerate = useCallback(async () => {
    if (!videoEl || !videoAssetPath) return;
    setGenerating(true);
    dispatch({ type: "SET_STATUS", status: "generating" });

    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const { resolveAssetPath } = await import("../../../lib/assets");
      const fullPath = await resolveAssetPath(videoAssetPath);
      if (!fullPath) {
        dispatch({ type: "SET_STATUS", status: "empty" });
        setGenerating(false);
        return;
      }
      const srtText = await invoke<string>("generate_subtitles", {
        videoPath: fullPath,
        language: track.language,
      });
      dispatch({ type: "LOAD_SRT", srtText });
    } catch (err) {
      console.error("ASR failed:", err);
      dispatch({ type: "SET_STATUS", status: "empty" });
    } finally {
      setGenerating(false);
    }
  }, [videoEl, videoAssetPath, track.language]);

  const handleExport = useCallback(() => {
    setShowExport(true);
  }, []);

  const handleExtractVoice = useCallback(async () => {
    if (!videoAssetPath) return;
    setGenerating(true);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const { resolveAssetPath } = await import("../../../lib/assets");
      const fullPath = await resolveAssetPath(videoAssetPath);
      if (!fullPath) return;
      const profile = await invoke<VoiceProfile>("extract_voice_profile", {
        videoPath: fullPath,
        nodeId: nodeId,
      });
      setVoiceProfile(profile);
    } catch (err) {
      console.error("Voice extraction failed:", err);
    } finally {
      setGenerating(false);
    }
  }, [videoAssetPath, nodeId]);

  const handleGenerateSpeech = useCallback(async () => {
    setSynthesizing(true);
    const newAudioMap = new Map<string, string>();

    try {
      const { invoke } = await import("@tauri-apps/api/core");

      for (const item of track.items) {
        if (!item.text.trim()) continue;
        try {
          const targetDuration = item.endTime - item.startTime;
          const wavPath = await invoke<string>("synthesize_speech", {
            nodeId: nodeId,
            itemId: item.id,
            text: item.text,
            targetDuration,
            voice: selectedVoice,
          });
          newAudioMap.set(item.id, wavPath);
        } catch (err) {
          console.error(`TTS failed for item ${item.id}:`, err);
        }
      }
    } finally {
      setSynthesizing(false);
    }

    setAudioMap(newAudioMap);
  }, [track.items, nodeId, selectedVoice]);

  return (
    <>
      <div className="subtitle-panel-overlay" onClick={onClose} />
      <div className="subtitle-panel">
        <div className="sub-panel-header">
          <h3>字幕</h3>
          <div className="sub-panel-header-controls">
            <select
              className="sub-panel-lang-select"
              value={track.language}
              onChange={(e) => dispatch({ type: "SET_LANGUAGE", language: e.target.value })}
              disabled={generating}
            >
              <option value="zh">中文</option>
              <option value="en">English</option>
              <option value="ja">日本語</option>
              <option value="auto">自动</option>
            </select>
            {track.status === "empty" && (
              <button
                className="sub-panel-btn primary"
                onClick={handleGenerate}
                disabled={!videoEl || generating}
              >
                生成字幕
              </button>
            )}
            {(track.status === "ready" || track.status === "edited") && (
              <button className="sub-panel-btn primary" onClick={handleGenerate} disabled={generating}>
                重新生成
              </button>
            )}
            <button
              className="sub-panel-btn"
              onClick={() => setShowInpaint(true)}
              disabled={!videoAssetPath}
            >
              擦除字幕
            </button>
            <button className="sub-panel-btn" onClick={onClose}>{'×'}</button>
          </div>
        </div>

        {generating && (
          <div className="sub-panel-generating">
            <div className="sub-panel-progress-bar">
              <div className="sub-panel-progress-fill" />
            </div>
            <span>正在识别语音...</span>
          </div>
        )}

        {!generating && track.items.length === 0 && (
          <div className="sub-panel-empty">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ opacity: 0.4 }}>
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
              <line x1="8" y1="7" x2="16" y2="7" />
              <line x1="8" y1="11" x2="14" y2="11" />
            </svg>
            <span>该视频暂无字幕</span>
            <span style={{ fontSize: 12 }}>选择语言后点击"生成字幕"进行语音识别</span>
          </div>
        )}

        {!generating && track.items.length > 0 && (
          <>
            <div style={{ padding: "8px 16px", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <button
                className="sub-panel-btn"
                onClick={handleExtractVoice}
                disabled={generating}
              >
                {voiceProfile ? "✓ 已提取声纹" : "提取声音特征"}
              </button>
              <select
                className="sub-panel-lang-select"
                value={selectedVoice}
                onChange={(e) => setSelectedVoice(e.target.value)}
                style={{ fontSize: 12 }}
              >
                <option value="original">原声（需提取声纹）</option>
                <option value="zh-CN-XiaoxiaoNeural">晓晓 (女)</option>
                <option value="zh-CN-YunxiNeural">云希 (男)</option>
                <option value="zh-CN-XiaoyiNeural">晓伊 (女)</option>
                <option value="zh-CN-YunjianNeural">云健 (男)</option>
                <option value="zh-CN-YunxiaNeural">云夏 (男)</option>
              </select>
              <button
                className="sub-panel-btn primary"
                onClick={handleGenerateSpeech}
                disabled={synthesizing || (selectedVoice === "original" && !voiceProfile)}
              >
                {synthesizing ? "生成中..." : "生成语音"}
              </button>
            </div>
            <SubtitlePlayerBar
              videoEl={videoEl}
              currentTime={currentTime}
              onTimeUpdate={setCurrentTime}
              duration={duration}
            />
            <SubtitleTimeline
              items={track.items}
              duration={duration}
              currentTime={currentTime}
              onSeek={(t) => { if (videoEl) videoEl.currentTime = t; }}
              onUpdateItemTime={(id, start, end) => {
                dispatch({ type: "UPDATE_ITEM_TIME", id, startTime: start, endTime: end });
              }}
              activeItemId={
                track.items.find(
                  (it) => currentTime >= it.startTime && currentTime <= it.endTime
                )?.id
              }
            />
            <SubtitleList
              items={track.items}
              currentTime={currentTime}
              editingId={editingId}
              onStartEdit={setEditingId}
              onCommitEdit={(id, text) => {
                dispatch({ type: "UPDATE_ITEM_TEXT", id, text });
                setEditingId(null);
              }}
              onUpdateTime={(id, startTime, endTime) => {
                dispatch({ type: "UPDATE_ITEM_TIME", id, startTime, endTime });
              }}
              onDelete={(id) => dispatch({ type: "DELETE_ITEM", id })}
              onMergeUp={(id) => dispatch({ type: "MERGE_UP", id })}
              onSplit={(id) => dispatch({ type: "SPLIT", id })}
              onAdd={() => {
                const t = videoEl?.currentTime || 0;
                dispatch({ type: "ADD_ITEM", startTime: t, endTime: t + 3 });
              }}
            />
          </>
        )}

        {!generating && track.items.length > 0 && (
          <>
            <SubtitleStyleEditor style={subtitleStyle} onChange={setSubtitleStyle} />
            <div style={{ padding: "12px 16px", borderTop: "1px solid #21262d" }}>
              <button className="sub-panel-btn primary" style={{ width: "100%" }} onClick={handleExport}>
                导出字幕 / 烧录
              </button>
            </div>
          </>
        )}
      </div>

      {showExport && (
        <ExportModal
          items={track.items}
          style={subtitleStyle}
          nodeId={nodeId}
          videoAssetPath={videoAssetPath || ""}
          audioMap={audioMap}
          onClose={() => setShowExport(false)}
        />
      )}

      {showInpaint && (
        <InpaintModal
          videoAssetPath={videoAssetPath || ""}
          nodeId={nodeId}
          projectId={projectId || ""}
          onClose={() => setShowInpaint(false)}
          onReplaceVideo={(newPath) => {
            window.dispatchEvent(new CustomEvent("video-replaced", {
              detail: { nodeId, newPath },
            }));
          }}
        />
      )}
    </>
  );
}
