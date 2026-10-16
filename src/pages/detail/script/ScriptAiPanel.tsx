import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { errorMessage, platformOptions, platformRequest, useLlmPreference, usePlatforms } from "../../../lib/platforms";
import { Choice, scriptButton as button } from "./ScriptControls";
import type { ScriptDocument, ScriptShot } from "./types";

type GeneratedShot = Omit<ScriptShot, "id" | "assetNodeId">;
interface Candidate {
  shots: GeneratedShot[];
  input: string;
}
interface Props {
  document: ScriptDocument;
  disabled: boolean;
  previewTarget: HTMLDivElement | null;
  onDraftChange: (available: boolean) => void;
  onApply: (shots: ScriptShot[], mode: "replace" | "append") => void;
}

export default function ScriptAiPanel(props: Props) {
  if (!isTauri()) {
    return (
      <section aria-label="AI 拆分镜头" className="rounded-xl border border-[#b69aff]/20 bg-[#b69aff]/5 p-4">
        <h3 className="m-0 text-sm font-medium text-[#d2b9ff]">✧ AI 拆分镜头</h3>
        <p className="my-3 text-sm leading-6 text-[#8b949e]">根据原稿生成分镜草稿，预览后再决定替换或追加。在桌面应用中配置文本平台后即可使用。</p>
        <button className={`${button} w-full`} disabled>请在桌面应用中使用</button>
      </section>
    );
  }
  return <ConnectedScriptAiPanel {...props} />;
}

function ConnectedScriptAiPanel({ document: doc, disabled, onApply, previewTarget, onDraftChange }: Props) {
  const { platforms, error: platformError, retry } = usePlatforms();
  const preference = useLlmPreference("llm-script-split", "deepseek");
  const options = platformOptions(platforms, "chat");
  const available = options.some((option) => option.value === preference.value);
  const visibleOptions = available ? options : [...options, { value: preference.value, label: "所选平台已不可用，请重新选择" }];
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const requestRef = useRef<string | null>(null);
  const mountedRef = useRef(true);
  const previewRef = useRef<HTMLDivElement>(null);
  const input = JSON.stringify({ title: doc.title, brief: doc.brief, source: doc.source, targetDuration: doc.targetDuration, aspectRatio: doc.aspectRatio });
  const stale = candidate !== null && candidate.input !== input;
  const settingsError = platformError || preference.error;
  const canGenerate = !disabled && !busy && preference.loaded && !settingsError && available && !!doc.source.trim();

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      const id = requestRef.current;
      requestRef.current = null;
      if (id) void invoke("cancel_llm_request", { requestId: id }).catch(() => {});
    };
  }, []);

  useEffect(() => {
    if (candidate) previewRef.current?.focus({ preventScroll: true });
  }, [candidate]);

  const generate = async () => {
    if (!canGenerate || requestRef.current) return;
    const requestId = crypto.randomUUID();
    requestRef.current = requestId;
    setBusy(true);
    setError("");
    setStatus("");
    setConfirmReplace(false);
    try {
      const result = await invoke<{ shots: GeneratedShot[] }>("split_script_shots", {
        ...platformRequest(preference.value), requestId, input: JSON.parse(input),
      });
      if (!mountedRef.current || requestRef.current !== requestId) return;
      if (!result || !Array.isArray(result.shots) || !result.shots.length) throw new Error("模型未返回有效分镜，请重试");
      setCandidate({ shots: result.shots, input });
      onDraftChange(true);
    } catch (reason) {
      if (mountedRef.current && requestRef.current === requestId) setError(errorMessage(reason));
    } finally {
      if (requestRef.current === requestId) {
        requestRef.current = null;
        if (mountedRef.current) setBusy(false);
      }
    }
  };

  const cancel = () => {
    const requestId = requestRef.current;
    requestRef.current = null;
    setBusy(false);
    setStatus("已取消生成，现有分镜保持不变。");
    if (requestId) void invoke("cancel_llm_request", { requestId }).catch(() => {
      if (mountedRef.current) setStatus("无法停止远端请求，返回结果将被忽略。");
    });
  };

  const apply = (mode: "replace" | "append") => {
    if (!candidate || stale || busy || disabled) return;
    // 本地分配稳定 ID，不采用模型可能提供的 ID 或素材引用。
    const shots = candidate.shots.map((shot) => ({
      id: crypto.randomUUID(), title: shot.title, description: shot.description,
      duration: shot.duration, camera: shot.camera, dialogue: shot.dialogue,
      sound: shot.sound, prompt: shot.prompt,
    }));
    onApply(shots, mode);
    setCandidate(null);
    onDraftChange(false);
    setConfirmReplace(false);
    setStatus(`已${mode === "append" ? "追加" : "采用"} ${shots.length} 个镜头，可撤销；请保存到画布。`);
  };

  const total = candidate?.shots.reduce((sum, shot) => sum + shot.duration, 0) ?? 0;

  return (
    <section aria-label="AI 拆分镜头" className="space-y-3 rounded-xl border border-[#b69aff]/20 bg-[#b69aff]/5 p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="m-0 text-sm font-medium text-[#d2b9ff]">✧ AI 拆分镜头</h3>
        <span className="text-[11px] text-[#8b949e]">先预览，再采用</span>
      </div>
      <p className="m-0 text-sm leading-6 text-[#8b949e]">结合原稿、创作要求和目标时长生成分镜。使用「设置」中已配置的文本平台。</p>
      <div className="flex flex-col gap-2">
        <span className="text-xs text-[#b1bac4]">文本平台 / 模型</span>
        <Choice label="分镜生成平台" value={preference.value} options={visibleOptions} disabled={busy || disabled || !preference.loaded} onChange={(value) => { void preference.save(value); }} />
      </div>
      {settingsError && <p role="alert" className="m-0 text-sm leading-6 text-[#ffaba8]">平台配置加载或保存失败：{settingsError} <button className="cursor-pointer underline" onClick={() => { retry(); preference.retry(); }}>重试加载配置</button></p>}
      {!available && <p role="alert" className="m-0 text-xs text-[#e3b341]">所选平台不可用，请重新选择。</p>}
      {busy ? (
        <div className="flex items-center justify-between gap-2">
          <span role="status" className="text-xs text-[#d2b9ff]">正在构思镜头…</span>
          <button className={button} onClick={cancel}>取消生成</button>
        </div>
      ) : (
        <button onClick={generate} disabled={!canGenerate} className={`${button} w-full !border-[#b69aff]/30 !bg-[#b69aff]/10 !text-[#d2b9ff] hover:!bg-[#b69aff]/20`}>
          {candidate ? "重新生成分镜" : "AI 拆分镜头"}
        </button>
      )}
      {!doc.source.trim() && <p className="m-0 text-xs text-[#8b949e]">填写故事原稿后即可生成。</p>}
      {error && <p role="alert" className="m-0 break-words text-sm leading-6 text-[#ffaba8]">{error}。现有分镜已保留。</p>}
      {status && <p role="status" className="m-0 text-sm leading-6 text-[#b1bac4]">{status}</p>}

      {candidate && previewTarget && createPortal(
        <div ref={previewRef} tabIndex={-1} role="region" aria-label="AI 分镜草稿预览" className="space-y-4 outline-none">
          <div className="flex items-center justify-between gap-2 text-xs">
            <h4 className="m-0 font-medium text-[#e6edf3]">分镜草稿 · {candidate.shots.length} 个镜头</h4>
            <span className={total > doc.targetDuration ? "text-[#e3b341]" : "text-[#8b949e]"}>{total} 秒</span>
          </div>
          {total !== doc.targetDuration && <p className="m-0 text-xs leading-5 text-[#8b949e]">与目标时长相差 {Math.abs(total - doc.targetDuration)} 秒，采用后可继续调整。</p>}
          <ol className="m-0 list-none space-y-4 p-0">
            {candidate.shots.map((shot, index) => (
              <li key={index} className="rounded-xl border border-[#30363d] bg-[#161b22] p-5">
                <div className="flex items-start justify-between gap-2"><strong className="text-base leading-6 text-[#e6edf3]">{String(index + 1).padStart(2, "0")} · {shot.title}</strong><span className="shrink-0 text-[11px] text-[#8b949e]">{shot.duration} 秒</span></div>
                <p className="mb-2 mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-[#b1bac4]">{shot.description}</p>
                <details className="text-sm leading-6 text-[#8b949e]">
                  <summary className="cursor-pointer text-[#d2b9ff]">镜头、声音与提示词</summary>
                  <dl className="mb-0 mt-2 space-y-2">
                    {[['景别与运镜', shot.camera], ['旁白 / 对白', shot.dialogue], ['声音说明', shot.sound], ['生成提示词', shot.prompt]].map(([label, text]) => (
                      <div key={label}><dt className="text-[#b1bac4]">{label}</dt><dd className="m-0 whitespace-pre-wrap break-words">{text || "未设置"}</dd></div>
                    ))}
                  </dl>
                </details>
              </li>
            ))}
          </ol>
          <div className="sticky bottom-0 z-10 space-y-3 rounded-xl border border-[#30363d] bg-[#161b22]/95 p-4 shadow-xl backdrop-blur">
          <p className="m-0 text-sm text-[#b1bac4]">{candidate.shots.length} 个镜头 · 预计 {total} 秒 <span className="ml-2 text-xs text-[#8b949e]">采用后仍可编辑或撤销</span></p>
          {stale && <p role="alert" className="m-0 text-sm leading-6 text-[#e3b341]">原稿或创作设置已修改，这份草稿基于旧内容。请重新生成后再采用。</p>}
          {confirmReplace && !stale ? (
            <div role="alert" className="space-y-3 rounded-lg border border-[#e3b341]/25 bg-[#e3b341]/5 p-3">
              <p className="m-0 text-sm leading-6 text-[#e3b341]">将替换现有 {doc.shots.length} 个镜头及其素材关联。原稿和画布素材会保留，替换后可撤销。</p>
              <div className="flex flex-wrap gap-2"><button className={button} disabled={disabled || busy} onClick={() => apply("replace")}>确认替换现有分镜</button><button className={button} onClick={() => setConfirmReplace(false)}>取消替换</button></div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <button className={button} disabled={stale || busy || disabled} onClick={() => doc.shots.length ? setConfirmReplace(true) : apply("replace")}>{doc.shots.length ? "替换现有分镜" : "采用分镜"}</button>
              {!!doc.shots.length && <button className={button} disabled={stale || busy || disabled} onClick={() => apply("append")}>追加到末尾</button>}
              <button className={button} disabled={busy || disabled} onClick={() => { setCandidate(null); onDraftChange(false); setConfirmReplace(false); }}>丢弃草稿</button>
            </div>
          )}
          </div>
        </div>, previewTarget
      )}
    </section>
  );
}
