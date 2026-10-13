/**
 * Unified Toolbox — same layout and AI functionality across text / image / video nodes.
 */
import { useState, useRef, useEffect } from "react";
import * as Tooltip from "@radix-ui/react-tooltip";
import { invoke } from "@tauri-apps/api/core";
import { useGenerateContext } from "../hooks/GenerateContext";
import type { OptimizePromptResult } from "../../../lib/types";
import { usePlatforms, useLlmPreference, platformOptions, platformRequest } from "../../../lib/platforms";
import { showToast } from "../../../lib/toast";
import { Spinner, MagicIcon, ImgIcon, BrainIcon, Label, SelectWrap, MODEL_ITEMS, SIZE_ITEMS, TOOLBOX_CSS } from "./common";

interface Props {
  nodeId: string;
  nodeType: "text" | "image" | "video";
  defaultPrompt?: string;
  mode?: string;
  onOptimized?: (optimizedPrompt: string) => void;
}

export default function Toolbox({ nodeId, nodeType, defaultPrompt, mode, onOptimized }: Props) {
  const { generateImage, generatingNodeId, reversePrompt, reversingNodeId } = useGenerateContext();
  const [model, setModel] = useState(nodeType === "image" ? "step-image-edit-2" : "step-2x-large");
  const [prompt, setPrompt] = useState(defaultPrompt || "");
  const [size, setSize] = useState("1024x1024");
  const { platforms, error: platformError, retry } = usePlatforms();
  const chatPreference = useLlmPreference("llm-chat", "deepseek");
  const visionPreference = useLlmPreference("llm-vision", "stepfun");
  const llmProvider = chatPreference.value;
  const visionProvider = visionPreference.value;
  const [language, setLanguage] = useState("en");
  const [style, setStyle] = useState("auto");
  const [candidate, setCandidate] = useState<{ text: string; source: string } | null>(null);
  const requestRef = useRef<string | null>(null);
  const mountedRef = useRef(true);
  const chatOptions = platformOptions(platforms, "chat");
  const visionOptions = platformOptions(platforms, "reverse-prompt");
  const chatValue = llmProvider;
  const visionValue = visionProvider;
  const missingOption = (value: string) => ({ value, label: "所选平台不可用，请重新选择" });
  const visibleChatOptions = chatOptions.some((p) => p.value === chatValue) ? chatOptions : [...chatOptions, missingOption(chatValue)];
  const visibleVisionOptions = visionOptions.some((p) => p.value === visionValue) ? visionOptions : [...visionOptions, missingOption(visionValue)];
  const choose = (value: string, vision = false) => {
    void (vision ? visionPreference : chatPreference).save(value);
  };
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (requestRef.current) void invoke("cancel_llm_request", { requestId: requestRef.current }).catch(() => {});
      requestRef.current = null;
    };
  }, []);
  const [optimizing, setOptimizing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { setPrompt(defaultPrompt || ""); }, [defaultPrompt]);

  const isGenerating = generatingNodeId === nodeId;
  const isReversing = reversingNodeId === nodeId;
  const isBusy = isGenerating || isReversing || optimizing;

  const isReverse = mode === "reverse";
  const isImage = nodeType === "image";
  const isVideo = nodeType === "video";

  const runLlm = async (vision: boolean) => {
    if (!prompt.trim() || requestRef.current) return;
    if (!(vision ? visionPreference : chatPreference).loaded) { showToast("平台选择正在加载或保存，请稍后重试", "info"); return; }
    if (!(vision ? visionOptions : chatOptions).some((p) => p.value === (vision ? visionValue : chatValue))) {
      showToast("所选平台不可用，请重新选择", "error"); return;
    }
    const source = prompt;
    const requestId = crypto.randomUUID();
    requestRef.current = requestId;
    setOptimizing(true); setCandidate(null);
    const selection = platformRequest(vision ? visionValue : chatValue);
    try {
      const text = vision
        ? await reversePrompt(nodeId, source, selection.provider, selection.platformId, requestId)
        : (await invoke<OptimizePromptResult>("optimize_prompt", {
            ...selection, text: source.trim(), requestId, outputLanguage: language,
            style: style === "auto" ? undefined : style,
          })).optimized_prompt;
      if (mountedRef.current && requestRef.current === requestId) {
        if (text.trim()) setCandidate({ text: text.trim(), source });
        else if (!vision) showToast("模型返回内容为空，原提示词已保留", "error");
      }
    } catch (err) {
      if (mountedRef.current && requestRef.current === requestId) showToast(typeof err === "string" ? err : "请求失败，请稍后重试", "error");
    } finally {
      if (requestRef.current === requestId) { requestRef.current = null; if (mountedRef.current) setOptimizing(false); }
    }
  };
  const cancelRequest = () => {
    const requestId = requestRef.current;
    requestRef.current = null; setOptimizing(false);
    if (requestId) void invoke("cancel_llm_request", { requestId }).catch(() => showToast("无法停止远端请求，返回结果将被忽略", "info"));
  };
  const handleSubmit = async () => {
    if (!prompt.trim() || isBusy || requestRef.current) return;
    if (isReverse) await runLlm(true);
    else await generateImage(nodeId, prompt, model, { size: size !== "1024x1024" ? size : undefined });
  };
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void handleSubmit(); }
  };
  const handleOptimize = () => runLlm(false);

  const placeholderText = isImage
    ? "输入文字指令对图片进行编辑，如：将背景改为雪夜"
    : isReverse
      ? "根据图片生成结构化中文提示词，包括主体描述、环境、光影、镜头语言、风格关键词。"
      : "输入提示词生成图片，如：一只坐在窗边的猫，阳光柔和";

  const submitLabel = isBusy
    ? <><Spinner /> {isReversing ? "分析中" : "生成中"}</>
    : isReverse ? "反向推理" : "提交";

  return (
    <Tooltip.Provider delayDuration={300}>
      <div
        className="z-[60] flex flex-col gap-2.5 p-4 rounded-xl select-none"
        style={{ background: "rgb(22, 27, 34)", boxShadow: "0 8px 32px rgba(0,0,0,0.6)", width: 690 }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <style>{TOOLBOX_CSS}</style>

        {(chatPreference.error || visionPreference.error) && <div role="alert" className="text-xs text-red-300">
          平台选择保存或加载失败：{chatPreference.error || visionPreference.error}
          <button className="ml-2 underline" onClick={() => { chatPreference.retry(); visionPreference.retry(); }}>重试</button>
        </div>}
        {platformError && <div role="alert" className="text-xs text-red-300">平台加载失败：{platformError} <button className="underline" onClick={retry}>重试</button></div>}
        {!isReverse && <div className="flex items-center gap-2 text-xs text-slate-400">
          <span>优化输出</span><SelectWrap value={language} onValueChange={setLanguage} items={[{ value: "en", label: "英文" }, { value: "zh", label: "中文" }]} />
          <SelectWrap value={style} onValueChange={setStyle} items={[{ value: "auto", label: "自动风格" }, { value: "photorealistic", label: "写实摄影" }, { value: "illustration", label: "插画" }, { value: "cinematic", label: "电影感" }]} />
        </div>}
        {/* Section 1 — prompt */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <Label>提示词</Label>
            <div className="flex items-center gap-1.5">
              {!isReverse && (
                <SelectWrap value={chatValue} onValueChange={(v) => choose(v)}
                  items={visibleChatOptions.map(p => ({ ...p, icon: BrainIcon }))} />
              )}
              {(isReverse || isImage) && <SelectWrap value={visionValue} onValueChange={(v) => choose(v, true)} items={visibleVisionOptions} />}
              {!isReverse && (
                <Tooltip.Root>
                  <Tooltip.Trigger asChild>
                    <Label active accent disabled={isBusy || !prompt.trim()}
                      onClick={isBusy || !prompt.trim() ? undefined : handleOptimize}>
                      {optimizing ? <><Spinner /> 优化中</> : <><MagicIcon /> 优化</>}
                    </Label>
                  </Tooltip.Trigger>
                  <Tooltip.Content side="top" className="tooltip-content">
                    使用 LLM 将文本优化为图片生成提示词
                  </Tooltip.Content>
                </Tooltip.Root>
              )}
              {isImage && (
                <Tooltip.Root>
                  <Tooltip.Trigger asChild>
                    <Label active accent disabled={isBusy || !prompt.trim()}
                      onClick={isBusy || !prompt.trim() ? undefined : () => runLlm(true)}>
                      {isReversing ? <><Spinner /> 分析中</> : <><MagicIcon /> 反推</>}
                    </Label>
                  </Tooltip.Trigger>
                  <Tooltip.Content side="top" className="tooltip-content">根据图片反推结构化提示词</Tooltip.Content>
                </Tooltip.Root>
              )}
            </div>
          </div>
          <textarea
            ref={textareaRef}
            className="tb-prompt"
            placeholder={placeholderText}
            rows={3}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
          />
        </div>

        {optimizing && <button className="self-end text-xs text-slate-300 underline" onClick={cancelRequest}>取消请求</button>}
        {candidate && <div className="rounded-lg border border-sky-700/50 bg-sky-950/30 p-3 text-sm text-slate-200">
          <p className="mb-2 text-xs text-sky-300">候选结果{candidate.source !== prompt ? " · 原提示词已修改，请核对后应用" : ""}</p>
          <p className="max-h-40 overflow-auto whitespace-pre-wrap break-words">{candidate.text}</p>
          <div className="mt-3 flex justify-end gap-3">
            <button className="rounded px-3 py-1 text-slate-400 hover:bg-slate-800" onClick={() => setCandidate(null)}>保留原文</button>
            <button disabled={isBusy} className="disabled:opacity-50 rounded bg-sky-600 px-3 py-1 text-white hover:bg-sky-500" onClick={() => {
              setPrompt(candidate.text); onOptimized?.(candidate.text); setCandidate(null);
            }}>应用结果</button>
          </div>
        </div>}
        {/* Section 2 — labels row */}
        {!isReverse && (
          <div className="flex items-center gap-2 flex-nowrap">
            <Tooltip.Root><Tooltip.Trigger asChild><Label>风格</Label></Tooltip.Trigger><Tooltip.Content side="top" className="tooltip-content">选择图像风格预设</Tooltip.Content></Tooltip.Root>
            <Tooltip.Root><Tooltip.Trigger asChild><Label>标记</Label></Tooltip.Trigger><Tooltip.Content side="top" className="tooltip-content">为图像添加标记</Tooltip.Content></Tooltip.Root>
            <Tooltip.Root><Tooltip.Trigger asChild><Label>参考</Label></Tooltip.Trigger><Tooltip.Content side="top" className="tooltip-content">连线到图片节点即视为参考</Tooltip.Content></Tooltip.Root>
          </div>
        )}

        {/* Section 3 — model, size, submit */}
        <div className="flex items-center gap-2 flex-nowrap justify-between">
          <div className="flex items-center gap-2 flex-nowrap">
            {!isReverse && <>
            <SelectWrap value={model} onValueChange={setModel}
              items={MODEL_ITEMS.map(m => ({ ...m, icon: ImgIcon }))} />
            <SelectWrap value={size} onValueChange={setSize} items={SIZE_ITEMS} />

            <Tooltip.Root><Tooltip.Trigger asChild><Label>画质</Label></Tooltip.Trigger><Tooltip.Content side="top" className="tooltip-content">设置输出画质</Tooltip.Content></Tooltip.Root>
            <Tooltip.Root><Tooltip.Trigger asChild><Label>预设</Label></Tooltip.Trigger><Tooltip.Content side="top" className="tooltip-content">选择预设参数</Tooltip.Content></Tooltip.Root>
            {!isVideo && (
              <Tooltip.Root><Tooltip.Trigger asChild><Label>图片数量</Label></Tooltip.Trigger><Tooltip.Content side="top" className="tooltip-content">设置生成数量</Tooltip.Content></Tooltip.Root>
            )}
            </>}
          </div>

          <Label primary disabled={isBusy || !prompt.trim()}
            onClick={isBusy || !prompt.trim() ? undefined : handleSubmit}>
            {submitLabel}
          </Label>
        </div>
      </div>
    </Tooltip.Provider>
  );
}
