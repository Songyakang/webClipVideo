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

const STEPFUN_MODELS = [
  { value: "step-image-edit-2", label: "Step Image Edit 2" },
  { value: "step-2x-large", label: "Step 2X Large" },
];

const LLM_PROVIDERS = [
  { value: "deepseek", label: "DeepSeek" },
  { value: "stepfun", label: "StepFun" },
];

interface Props {
  nodeId: string;
  nodeType: "image" | "text";
  defaultPrompt?: string;
  onOptimized?: (optimizedPrompt: string) => void;
}

export default function ImageToolbox({ nodeId, nodeType, defaultPrompt, onOptimized }: Props) {
  const { generateImage, generatingNodeId } = useGenerateContext();
  const [model, setModel] = useState("step-image-edit-2");
  const [prompt, setPrompt] = useState(defaultPrompt || "");
  const [size, setSize] = useState("1024x1024");
  const [llmProvider, setLlmProvider] = useState("deepseek");
  const [optimizing, setOptimizing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isGenerating = generatingNodeId === nodeId;

  const handleSubmit = async () => {
    if (!prompt.trim()) return;
    await generateImage(
      nodeId,
      prompt,
      model,
      { size: size !== "1024x1024" ? size : undefined },
    );
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
        className="z-[60] flex flex-col gap-2.5 p-4 rounded-xl border select-none"
        style={{ background: "#161b22", borderColor: "#30363d", boxShadow: "0 8px 32px rgba(0,0,0,0.6)" }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <style>{`
          .toolbox-btn {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 7px 16px;
            border: 1px solid #30363d;
            border-radius: 8px;
            background: #21262d;
            color: #c9d1d9;
            font-size: 13px;
            font-family: inherit;
            cursor: pointer;
            white-space: nowrap;
            transition: background 0.15s, border-color 0.15s, color 0.15s;
            outline: none;
          }
          .toolbox-btn:hover {
            background: #30363d;
            border-color: #484f58;
            color: #e6edf3;
          }
          .toolbox-btn:focus-visible {
            border-color: #58a6ff;
            box-shadow: 0 0 0 2px rgba(88, 166, 255, 0.3);
          }
          .toolbox-btn.primary {
            background: #238636;
            border-color: rgba(240, 246, 252, 0.1);
            color: #fff;
            font-weight: 600;
            padding: 7px 24px;
          }
          .toolbox-btn.primary:hover {
            background: #2ea043;
          }
          .toolbox-btn.primary:disabled {
            background: #1a3d24;
            color: #484f58;
            cursor: not-allowed;
          }
          .toolbox-btn.accent {
            background: #1f6feb;
            border-color: rgba(240, 246, 252, 0.1);
            color: #fff;
          }
          .toolbox-btn.accent:hover {
            background: #388bfd;
          }
          .toolbox-btn.accent:disabled {
            background: #0c2d6b;
            color: #484f58;
            cursor: not-allowed;
          }
          .toolbox-prompt {
            width: 100%;
            padding: 10px 14px;
            border: 1px solid #30363d;
            border-radius: 8px;
            background: #0d1117;
            color: #e6edf3;
            font-size: 13px;
            line-height: 1.6;
            font-family: inherit;
            outline: none;
            resize: vertical;
            box-sizing: border-box;
            transition: border-color 0.15s;
          }
          .toolbox-prompt::placeholder {
            color: #484f58;
          }
          .toolbox-prompt:focus {
            border-color: #58a6ff;
            box-shadow: 0 0 0 2px rgba(88, 166, 255, 0.15);
          }
          .toolbox-select {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            padding: 7px 14px;
            border: 1px solid #30363d;
            border-radius: 8px;
            background: #21262d;
            color: #c9d1d9;
            font-size: 13px;
            font-family: inherit;
            cursor: pointer;
            outline: none;
            transition: border-color 0.15s;
            min-width: 180px;
            justify-content: space-between;
          }
          .toolbox-select:hover {
            background: #30363d;
          }
          .toolbox-select:focus {
            border-color: #58a6ff;
            box-shadow: 0 0 0 2px rgba(88, 166, 255, 0.3);
          }
          .toolbox-select span {
            line-height: 1;
          }
          .toolbox-select-sm {
            min-width: 110px;
            padding: 6px 10px;
            font-size: 12px;
          }
          .select-item {
            padding: 8px 14px;
            font-size: 13px;
            color: #c9d1d9;
            cursor: pointer;
            outline: none;
            transition: background 0.1s;
          }
          .select-item:hover {
            background: #30363d;
          }
          .select-item[data-highlighted] {
            background: #1f6feb;
            color: #fff;
          }
        `}</style>

        {/* Section 1 - prompt area with optimize button */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-[#8b949e]">提示词</span>
            <div className="flex items-center gap-1.5">
              <Select.Root value={llmProvider} onValueChange={setLlmProvider}>
                <Select.Trigger className="toolbox-select toolbox-select-sm">
                  <Select.Value />
                  <Select.Icon><ChevronDown /></Select.Icon>
                </Select.Trigger>
                <Select.Portal>
                  <Select.Content className="select-dropdown" position="popper" sideOffset={4} style={{ background: "#21262d", border: "1px solid #30363d", borderRadius: 8 }}>
                    <Select.Viewport>
                      {LLM_PROVIDERS.map((p) => (
                        <Select.Item key={p.value} value={p.value} className="select-item">
                          <Select.ItemText>{p.label}</Select.ItemText>
                        </Select.Item>
                      ))}
                    </Select.Viewport>
                  </Select.Content>
                </Select.Portal>
              </Select.Root>
              <Tooltip.Root>
                <Tooltip.Trigger asChild>
                  <button
                    className="toolbox-btn accent"
                    onClick={handleOptimize}
                    disabled={optimizing || !prompt.trim()}
                    style={{ padding: "6px 12px", fontSize: 12 }}
                  >
                    {optimizing ? <><Spinner /> 优化中</> : <><MagicIcon /> 优化</>}
                  </button>
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

        {/* Section 2 - placeholder tools */}
        <div className="flex items-center gap-2 flex-nowrap">
          <Tooltip.Root>
            <Tooltip.Trigger asChild>
              <button className="toolbox-btn">风格</button>
            </Tooltip.Trigger>
            <Tooltip.Content side="top" className="tooltip-content">选择图像风格预设</Tooltip.Content>
          </Tooltip.Root>

          <Tooltip.Root>
            <Tooltip.Trigger asChild>
              <button className="toolbox-btn">标记</button>
            </Tooltip.Trigger>
            <Tooltip.Content side="top" className="tooltip-content">为图像添加标记</Tooltip.Content>
          </Tooltip.Root>

          <Tooltip.Root>
            <Tooltip.Trigger asChild>
              <button className="toolbox-btn">参考</button>
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
                  {STEPFUN_MODELS.map((m) => (
                    <Select.Item key={m.value} value={m.value} className="select-item">
                      <Select.ItemText>{m.label}</Select.ItemText>
                    </Select.Item>
                  ))}
                </Select.Viewport>
              </Select.Content>
            </Select.Portal>
          </Select.Root>

          <Select.Root value={size} onValueChange={setSize}>
            <Select.Trigger className="toolbox-select" style={{ minWidth: 130 }}>
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
              <button className="toolbox-btn">画质</button>
            </Tooltip.Trigger>
            <Tooltip.Content side="top" className="tooltip-content">设置输出画质</Tooltip.Content>
          </Tooltip.Root>

          <Tooltip.Root>
            <Tooltip.Trigger asChild>
              <button className="toolbox-btn">预设</button>
            </Tooltip.Trigger>
            <Tooltip.Content side="top" className="tooltip-content">选择预设参数</Tooltip.Content>
          </Tooltip.Root>

          <Tooltip.Root>
            <Tooltip.Trigger asChild>
              <button className="toolbox-btn">图片数量</button>
            </Tooltip.Trigger>
            <Tooltip.Content side="top" className="tooltip-content">设置生成数量</Tooltip.Content>
          </Tooltip.Root>

          <button
            className="toolbox-btn primary"
            onClick={handleSubmit}
            disabled={isGenerating || !prompt.trim()}
          >
            {isGenerating ? <><Spinner /> 生成中</> : "提交"}
          </button>
        </div>

      </div>
    </Tooltip.Provider>
  );
}
