import { useState, useRef } from "react";
import * as Select from "@radix-ui/react-select";
import * as Tooltip from "@radix-ui/react-tooltip";
import { invoke } from "@tauri-apps/api/core";
import { useGenerateContext } from "./hooks/GenerateContext";
import type { OptimizePromptResult } from "../../lib/types";
import { showToast } from "../../lib/toast";

const ChevronDown = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

const Spinner = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ animation: "spin 0.8s linear infinite" }}>
    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5" fill="none" opacity="0.25" />
    <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2.5" fill="none" />
  </svg>
);

const MagicIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M15 4V2m0 2v2m0-2h2m-2 0h-2" />
    <path d="M10.5 5.5L4 12l1.5 1.5L10.5 17l6.5-6.5L10.5 5.5z" />
    <path d="M4 20h16" />
  </svg>
);

const ImgIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
    <circle cx="8.5" cy="8.5" r="1.5" />
    <polyline points="21 15 16 10 5 21" />
  </svg>
);

const BrainIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3a3 3 0 0 0-3 3v1a3 3 0 0 0 3 3 3 3 0 0 0 3-3V6a3 3 0 0 0-3-3z" />
    <path d="M9 10a5 5 0 0 0-5 5v1a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-1a5 5 0 0 0-5-5" />
    <line x1="12" y1="17" x2="12" y2="22" />
  </svg>
);

const MODEL_ITEMS = [
  { value: "step-image-edit-2", label: "Image Edit 2", desc: "图像编辑，支持局部修改与风格迁移", icon: ImgIcon },
  { value: "step-2x-large", label: "2X Large", desc: "文生图大模型，高质量图像生成", icon: ImgIcon },
];

const PROVIDER_ITEMS = [
  { value: "deepseek", label: "DeepSeek", desc: "通用大语言模型，擅长结构化输出", icon: BrainIcon },
  { value: "stepfun", label: "StepFun", desc: "阶跃星辰语言模型", icon: BrainIcon },
];

interface Props {
  nodeId: string;
  nodeType: "image" | "text";
  defaultPrompt?: string;
  onOptimized?: (optimizedPrompt: string) => void;
  mode?: string;
}

export default function ImageToolbox({ nodeId, nodeType, defaultPrompt, onOptimized, mode }: Props) {
  const { generateImage, generatingNodeId, reversePrompt, reversingNodeId } = useGenerateContext();
  const [model, setModel] = useState("step-image-edit-2");
  const [prompt, setPrompt] = useState(defaultPrompt || "");
  const [size, setSize] = useState("1024x1024");
  const [llmProvider, setLlmProvider] = useState("deepseek");
  const [optimizing, setOptimizing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isGenerating = generatingNodeId === nodeId;
  const isReversing = reversingNodeId === nodeId;
  const isBusy = isGenerating || isReversing;

  const handleSubmit = async () => {
    if (!prompt.trim()) return;
    if (mode === "reverse") {
      const result = await reversePrompt(nodeId, prompt, "stepfun");
      if (result) {
        setPrompt(result);
        onOptimized?.(result);
      }
    } else {
      await generateImage(
        nodeId,
        prompt,
        model,
        { size: size !== "1024x1024" ? size : undefined },
      );
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleOptimize = async () => {
    if (!prompt.trim()) {
      showToast("请先输入提示词", "error");
      return;
    }
    setOptimizing(true);
    try {
      const result = await invoke<OptimizePromptResult>("optimize_prompt", {
        provider: llmProvider,
        text: prompt.trim(),
      });
      setPrompt(result.optimized_prompt);
      if (nodeType === "text") {
        onOptimized?.(result.optimized_prompt);
      }
      showToast("提示词已优化", "success");
    } catch (err) {
      console.error("optimize_prompt failed:", err);
      const msg = typeof err === "string" ? err : "优化失败，请稍后重试";
      showToast(msg, "error");
    } finally {
      setOptimizing(false);
    }
  };

  return (
    <Tooltip.Provider delayDuration={300}>
      <div
        className="z-[60] flex flex-col gap-2.5 p-4 rounded-xl select-none"
        style={{ background: "rgb(22, 27, 34)", boxShadow: "0 8px 32px rgba(0,0,0,0.6)" }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <style>{`
          .toolbox-label {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            padding: 5px 10px;
            border-radius: 6px;
            color: #8b949e;
            font-size: 12px;
            font-family: inherit;
            white-space: nowrap;
            cursor: default;
            user-select: none;
          }
          .toolbox-label.action {
            color: #c9d1d9;
            cursor: pointer;
            background: rgb(22, 27, 34);
            transition: background 0.15s, color 0.15s;
          }
          .toolbox-label.action:hover {
            background: #30363d;
            color: #e6edf3;
          }
          .toolbox-label.accent {
            background: #1f6feb;
            color: #fff;
            font-weight: 600;
          }
          .toolbox-label.accent:hover {
            background: #388bfd;
          }
          .toolbox-label.accent.disabled {
            background: #0c2d6b;
            color: #484f58;
            cursor: not-allowed;
          }
          .toolbox-label.primary {
            background: #238636;
            color: #fff;
            font-weight: 600;
            padding: 6px 20px;
            font-size: 13px;
          }
          .toolbox-label.primary:hover {
            background: #2ea043;
          }
          .toolbox-label.primary.disabled {
            background: #1a3d24;
            color: #484f58;
            cursor: not-allowed;
          }
          .toolbox-prompt {
            width: 100%;
            padding: 10px 14px;
            border-radius: 8px;
            background: #0d1117;
            color: #e6edf3;
            font-size: 13px;
            line-height: 1.6;
            font-family: inherit;
            outline: none;
            resize: vertical;
            box-sizing: border-box;
          }
          .toolbox-prompt::placeholder {
            color: #484f58;
          }
          .toolbox-prompt:focus {
            box-shadow: 0 0 0 2px rgba(88, 166, 255, 0.15);
          }
          .toolbox-select {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            padding: 5px 10px;
            border-radius: 6px;
            background: rgb(22, 27, 34);
            color: #c9d1d9;
            font-size: 12px;
            font-family: inherit;
            cursor: pointer;
            outline: none;
            transition: background 0.15s;
            justify-content: space-between;
          }
          .toolbox-select:hover {
            background: #30363d;
          }
          .toolbox-select:focus {
            box-shadow: 0 0 0 2px rgba(88, 166, 255, 0.3);
          }
          .toolbox-select span {
            line-height: 1;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }
          .select-dropdown {
            background: rgb(22, 27, 34);
            border-radius: 8px;
            padding: 4px;
            min-width: 140px;
          }
          .select-item {
            padding: 8px 14px;
            font-size: 13px;
            color: #c9d1d9;
            cursor: pointer;
            outline: none;
            transition: background 0.1s;
            border-radius: 4px;
          }
          .select-item > span:first-of-type {
            display: none;
          }
          .select-item:hover {
            background: #30363d;
          }
          .select-item[data-highlighted] {
            background: #1f6feb;
            color: #fff;
          }
          .select-item .item-row {
            display: flex;
            align-items: stretch;
            gap: 10px;
          }
          .select-item .item-icon {
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
            width: 32px;
          }
          .select-item .item-text {
            display: flex;
            flex-direction: column;
            justify-content: center;
            min-height: 32px;
          }
          .select-item .item-name {
            font-size: 13px;
            color: #c9d1d9;
          }
          .select-item .item-desc {
            font-size: 11px;
            color: #8b949e;
            max-height: 0;
            overflow: hidden;
            transition: max-height 0.2s ease;
          }
          .select-item:hover .item-desc {
            max-height: 16px;
          }
          .select-item[data-highlighted] .item-desc {
            color: rgba(255,255,255,0.7);
          }
          .select-item[data-highlighted] .item-name {
            color: #fff;
          }
        `}</style>

        {/* Section 1 - prompt area with optimize button */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="toolbox-label">提示词</span>
            <div className="flex items-center gap-1.5">
              <Select.Root value={llmProvider} onValueChange={setLlmProvider}>
                <Select.Trigger className="toolbox-select">
                  <Select.Value />
                  <Select.Icon><ChevronDown /></Select.Icon>
                </Select.Trigger>
                <Select.Portal>
                  <Select.Content className="select-dropdown" sideOffset={4}>
                    <Select.Viewport>
                      {PROVIDER_ITEMS.map((p) => (
                        <Select.Item key={p.value} value={p.value} className="select-item">
                          <Select.ItemText>{p.label}</Select.ItemText>
                          <div className="item-row">
                            <div className="item-icon"><p.icon /></div>
                            <div className="item-text">
                              <div className="item-name">{p.label}</div>
                              <div className="item-desc">{p.desc}</div>
                            </div>
                          </div>
                        </Select.Item>
                      ))}
                    </Select.Viewport>
                  </Select.Content>
                </Select.Portal>
              </Select.Root>
              <Tooltip.Root>
                <Tooltip.Trigger asChild>
                  <span
                    className={`toolbox-label action accent${optimizing || !prompt.trim() ? " disabled" : ""}`}
                    onClick={optimizing || !prompt.trim() ? undefined : handleOptimize}
                  >
                    {optimizing ? <><Spinner /> 优化中</> : <><MagicIcon /> 优化</>}
                  </span>
                </Tooltip.Trigger>
                <Tooltip.Content side="top" className="tooltip-content">
                  使用 LLM 将文本优化为图片生成提示词
                </Tooltip.Content>
              </Tooltip.Root>
            </div>
          </div>
          <textarea
            ref={textareaRef}
            className="toolbox-prompt"
            placeholder={nodeType === "image" ? "输入文字指令对图片进行编辑，如：将背景改为雪夜" : "输入提示词生成图片，如：一只坐在窗边的猫，阳光柔和"}
            rows={3}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
          />
        </div>

        {/* Section 2 - labels */}
        <div className="flex items-center gap-2 flex-nowrap">
          <Tooltip.Root>
            <Tooltip.Trigger asChild>
              <span className="toolbox-label">风格</span>
            </Tooltip.Trigger>
            <Tooltip.Content side="top" className="tooltip-content">选择图像风格预设</Tooltip.Content>
          </Tooltip.Root>
          <Tooltip.Root>
            <Tooltip.Trigger asChild>
              <span className="toolbox-label">标记</span>
            </Tooltip.Trigger>
            <Tooltip.Content side="top" className="tooltip-content">为图像添加标记</Tooltip.Content>
          </Tooltip.Root>
          <Tooltip.Root>
            <Tooltip.Trigger asChild>
              <span className="toolbox-label">参考</span>
            </Tooltip.Trigger>
            <Tooltip.Content side="top" className="tooltip-content">连线到图片节点即视为参考</Tooltip.Content>
          </Tooltip.Root>
        </div>

        {/* Section 3 - model, size, submit */}
        <div className="flex items-center gap-2 flex-nowrap">
          <Select.Root value={model} onValueChange={setModel}>
            <Select.Trigger className="toolbox-select">
              <Select.Value />
              <Select.Icon><ChevronDown /></Select.Icon>
            </Select.Trigger>
            <Select.Portal>
              <Select.Content className="select-dropdown" position="popper" sideOffset={4} style={{ background: "#21262d", border: "1px solid #30363d", borderRadius: 8 }}>
                <Select.Viewport>
                  {MODEL_ITEMS.map((m) => (
                    <Select.Item key={m.value} value={m.value} className="select-item">
                      <Select.ItemText>{m.label}</Select.ItemText>
                      <div className="item-row">
                        <div className="item-icon"><m.icon /></div>
                        <div className="item-text">
                          <div className="item-name">{m.label}</div>
                          <div className="item-desc">{m.desc}</div>
                        </div>
                      </div>
                    </Select.Item>
                  ))}
                </Select.Viewport>
              </Select.Content>
            </Select.Portal>
          </Select.Root>

          <Select.Root value={size} onValueChange={setSize}>
            <Select.Trigger className="toolbox-select">
              <Select.Value />
              <Select.Icon><ChevronDown /></Select.Icon>
            </Select.Trigger>
            <Select.Portal>
              <Select.Content className="select-dropdown" position="popper" sideOffset={4} style={{ background: "#21262d", border: "1px solid #30363d", borderRadius: 8 }}>
                <Select.Viewport>
                  <Select.Item value="1024x1024" className="select-item"><Select.ItemText>1024x1024 (方形)</Select.ItemText></Select.Item>
                  <Select.Item value="768x768" className="select-item"><Select.ItemText>768x768</Select.ItemText></Select.Item>
                  <Select.Item value="512x512" className="select-item"><Select.ItemText>512x512</Select.ItemText></Select.Item>
                  <Select.Item value="1280x800" className="select-item"><Select.ItemText>1280x800 (16:9)</Select.ItemText></Select.Item>
                  <Select.Item value="800x1280" className="select-item"><Select.ItemText>800x1280 (9:16)</Select.ItemText></Select.Item>
                </Select.Viewport>
              </Select.Content>
            </Select.Portal>
          </Select.Root>

          <Tooltip.Root>
            <Tooltip.Trigger asChild>
              <span className="toolbox-label">画质</span>
            </Tooltip.Trigger>
            <Tooltip.Content side="top" className="tooltip-content">设置输出画质</Tooltip.Content>
          </Tooltip.Root>

          <Tooltip.Root>
            <Tooltip.Trigger asChild>
              <span className="toolbox-label">预设</span>
            </Tooltip.Trigger>
            <Tooltip.Content side="top" className="tooltip-content">选择预设参数</Tooltip.Content>
          </Tooltip.Root>

          <Tooltip.Root>
            <Tooltip.Trigger asChild>
              <span className="toolbox-label">图片数量</span>
            </Tooltip.Trigger>
            <Tooltip.Content side="top" className="tooltip-content">设置生成数量</Tooltip.Content>
          </Tooltip.Root>

          <span
            className={`toolbox-label action primary${isBusy || !prompt.trim() ? " disabled" : ""}`}
            onClick={isBusy || !prompt.trim() ? undefined : handleSubmit}
          >
            {isBusy ? <><Spinner /> {isReversing ? "分析中" : "生成中"}</> : mode === "reverse" ? "反向推理" : "提交"}
          </span>
        </div>

      </div>
    </Tooltip.Provider>
  );
}
