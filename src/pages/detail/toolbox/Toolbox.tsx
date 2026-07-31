/**
 * Unified Toolbox — same layout and AI functionality across text / image / video nodes.
 */
import { useState, useRef } from "react";
import * as Tooltip from "@radix-ui/react-tooltip";
import { invoke } from "@tauri-apps/api/core";
import { useGenerateContext } from "../hooks/GenerateContext";
import type { OptimizePromptResult } from "../../../lib/types";
import { showToast } from "../../../lib/toast";
import { Spinner, MagicIcon, ImgIcon, BrainIcon, Label, SelectWrap, PROVIDER_ITEMS, MODEL_ITEMS, SIZE_ITEMS, TOOLBOX_CSS } from "./common";

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
  const [llmProvider, setLlmProvider] = useState("deepseek");
  const [optimizing, setOptimizing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isGenerating = generatingNodeId === nodeId;
  const isReversing = reversingNodeId === nodeId;
  const isBusy = isGenerating || isReversing;

  const isReverse = mode === "reverse";
  const isImage = nodeType === "image";
  const isText = nodeType === "text";
  const isVideo = nodeType === "video";

  const handleSubmit = async () => {
    if (!prompt.trim()) return;
    if (isReverse) {
      const result = await reversePrompt(nodeId, prompt, "stepfun");
      if (result) { setPrompt(result); onOptimized?.(result); }
    } else {
      await generateImage(nodeId, prompt, model, { size: size !== "1024x1024" ? size : undefined });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleOptimize = async () => {
    if (!prompt.trim()) { showToast("请先输入提示词", "error"); return; }
    setOptimizing(true);
    try {
      const result = await invoke<OptimizePromptResult>("optimize_prompt", {
        provider: llmProvider, text: prompt.trim(),
      });
      setPrompt(result.optimized_prompt);
      if (isText) onOptimized?.(result.optimized_prompt);
      showToast("提示词已优化", "success");
    } catch (err) {
      const msg = typeof err === "string" ? err : "优化失败，请稍后重试";
      showToast(msg, "error");
    } finally { setOptimizing(false); }
  };

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

        {/* Section 1 — prompt */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <Label>提示词</Label>
            <div className="flex items-center gap-1.5">
              {!isReverse && !isImage && (
                <SelectWrap value={llmProvider} onValueChange={setLlmProvider}
                  items={PROVIDER_ITEMS.map(p => ({ ...p, icon: BrainIcon }))} />
              )}
              {!isReverse && (
                <Tooltip.Root>
                  <Tooltip.Trigger asChild>
                    <Label active accent disabled={optimizing || !prompt.trim()}
                      onClick={optimizing || !prompt.trim() ? undefined : handleOptimize}>
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
                      onClick={isBusy || !prompt.trim() ? undefined : handleSubmit}>
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
            <SelectWrap value={model} onValueChange={setModel}
              items={MODEL_ITEMS.map(m => ({ ...m, icon: ImgIcon }))} />
            <SelectWrap value={size} onValueChange={setSize} items={SIZE_ITEMS} />

            <Tooltip.Root><Tooltip.Trigger asChild><Label>画质</Label></Tooltip.Trigger><Tooltip.Content side="top" className="tooltip-content">设置输出画质</Tooltip.Content></Tooltip.Root>
            <Tooltip.Root><Tooltip.Trigger asChild><Label>预设</Label></Tooltip.Trigger><Tooltip.Content side="top" className="tooltip-content">选择预设参数</Tooltip.Content></Tooltip.Root>
            {!isVideo && (
              <Tooltip.Root><Tooltip.Trigger asChild><Label>图片数量</Label></Tooltip.Trigger><Tooltip.Content side="top" className="tooltip-content">设置生成数量</Tooltip.Content></Tooltip.Root>
            )}
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
