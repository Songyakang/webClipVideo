import React from "react";
import * as Select from "@radix-ui/react-select";
import * as Tooltip from "@radix-ui/react-tooltip";

// ---------------------------------------------------------------------------
// Shared icons
// ---------------------------------------------------------------------------

export const ChevronDown = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

export const Spinner = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ animation: "tb-spin 0.8s linear infinite" }}>
    <style>{`@keyframes tb-spin { to { transform: rotate(360deg); } }`}</style>
    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5" fill="none" opacity="0.25" />
    <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2.5" fill="none" />
  </svg>
);

export const MagicIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M15 4V2m0 2v2m0-2h2m-2 0h-2" />
    <path d="M10.5 5.5L4 12l1.5 1.5L10.5 17l6.5-6.5L10.5 5.5z" />
    <path d="M4 20h16" />
  </svg>
);

export const ImgIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
    <circle cx="8.5" cy="8.5" r="1.5" />
    <polyline points="21 15 16 10 5 21" />
  </svg>
);

export const BrainIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3a3 3 0 0 0-3 3v1a3 3 0 0 0 3 3 3 3 0 0 0 3-3V6a3 3 0 0 0-3-3z" />
    <path d="M9 10a5 5 0 0 0-5 5v1a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-1a5 5 0 0 0-5-5" />
    <line x1="12" y1="17" x2="12" y2="22" />
  </svg>
);

export const FilmIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18" />
    <line x1="7" y1="2" x2="7" y2="22" /><line x1="17" y1="2" x2="17" y2="22" />
    <line x1="2" y1="12" x2="22" y2="12" /><line x1="2" y1="7" x2="7" y2="7" />
    <line x1="2" y1="17" x2="7" y2="17" /><line x1="17" y1="7" x2="22" y2="7" />
    <line x1="17" y1="17" x2="22" y2="17" />
  </svg>
);

export const ScissorsIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="6" cy="6" r="3" /><circle cx="6" cy="18" r="3" />
    <line x1="20" y1="4" x2="8.12" y2="15.88" /><line x1="14.47" y1="14.48" x2="20" y2="20" />
  </svg>
);

// ---------------------------------------------------------------------------
// Shared data
// ---------------------------------------------------------------------------

export const MODEL_ITEMS = [
  { value: "step-image-edit-2", label: "Image Edit 2", desc: "图像编辑，支持局部修改与风格迁移" },
  { value: "step-2x-large", label: "2X Large", desc: "文生图大模型，高质量图像生成" },
];

export const PROVIDER_ITEMS = [
  { value: "deepseek", label: "DeepSeek", desc: "通用大语言模型，擅长结构化输出" },
  { value: "stepfun", label: "StepFun", desc: "阶跃星辰语言模型" },
];

export const SIZE_ITEMS = [
  { value: "1024x1024", label: "1024x1024 (方形)" },
  { value: "768x768", label: "768x768" },
  { value: "512x512", label: "512x512" },
  { value: "1280x800", label: "1280x800 (16:9)" },
  { value: "800x1280", label: "800x1280 (9:16)" },
];

// ---------------------------------------------------------------------------
// Shared UI components
// ---------------------------------------------------------------------------

export function Label({ className, ...props }: React.HTMLAttributes<HTMLSpanElement> & { active?: boolean; accent?: boolean; primary?: boolean; disabled?: boolean }) {
  const { active, accent, primary, disabled, ...rest } = props as any;
  let cls = "tb-label";
  if (active) cls += " tb-action";
  if (accent) cls += " tb-accent";
  if (primary) cls += " tb-primary";
  if (disabled) cls += " tb-disabled";
  return <span className={cls + (className ? " " + className : "")} {...rest} />;
}

export function TooltipWrap({ children, tip }: { children: React.ReactNode; tip: string }) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
      <Tooltip.Content side="top" className="tooltip-content">{tip}</Tooltip.Content>
    </Tooltip.Root>
  );
}

export function SelectWrap({ value, onValueChange, items, className }: {
  value: string;
  onValueChange: (v: string) => void;
  items: { value: string; label: string; desc?: string; icon?: () => React.ReactNode }[];
  className?: string;
}) {
  return (
    <Select.Root value={value} onValueChange={onValueChange}>
      <Select.Trigger className={"tb-select" + (className ? " " + className : "")}>
        <Select.Value />
        <Select.Icon><ChevronDown /></Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content className="select-dropdown" position="popper" sideOffset={4} style={{ background: "#21262d", border: "1px solid #30363d", borderRadius: 8 }}>
          <Select.Viewport>
            {items.map((m) => (
              <Select.Item key={m.value} value={m.value} className="select-item">
                <Select.ItemText>{m.label}</Select.ItemText>
                <div className="item-row">
                  {m.icon && <div className="item-icon"><m.icon /></div>}
                  <div className="item-text">
                    <div className="item-name">{m.label}</div>
                    {m.desc && <div className="item-desc">{m.desc}</div>}
                  </div>
                </div>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}

// ---------------------------------------------------------------------------
// Shared CSS
// ---------------------------------------------------------------------------

export const TOOLBOX_CSS = `
.tb-label {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 5px 10px; border-radius: 6px;
  color: #8b949e; font-size: 12px; font-family: inherit;
  white-space: nowrap; cursor: default; user-select: none;
}
.tb-action {
  color: #c9d1d9; cursor: pointer; background: rgb(22, 27, 34);
  transition: background 0.15s, color 0.15s;
}
.tb-action:hover { background: #30363d; color: #e6edf3; }
.tb-accent { background: #1f6feb; color: #fff; font-weight: 600; }
.tb-accent:hover { background: #388bfd; }
.tb-disabled { background: #0c2d6b; color: #484f58; cursor: not-allowed; }
.tb-accent.tb-disabled { background: #0c2d6b; color: #484f58; }
.tb-primary { background: #238636; color: #fff; font-weight: 600; padding: 6px 20px; font-size: 13px; }
.tb-primary:hover { background: #2ea043; }
.tb-primary.tb-disabled { background: #1a3d24; color: #484f58; cursor: not-allowed; }
.tb-prompt {
  width: 100%; padding: 10px 14px; border-radius: 8px;
  background: #0d1117; color: #e6edf3; font-size: 13px;
  line-height: 1.6; font-family: inherit; outline: none;
  resize: vertical; box-sizing: border-box;
}
.tb-prompt::placeholder { color: #484f58; }
.tb-prompt:focus { box-shadow: 0 0 0 2px rgba(88,166,255,0.15); }
.tb-select {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 5px 10px; border-radius: 6px;
  background: rgb(22, 27, 34); color: #c9d1d9;
  font-size: 12px; font-family: inherit; cursor: pointer;
  outline: none; transition: background 0.15s;
  justify-content: space-between;
}
.tb-select:hover { background: #30363d; }
.tb-select:focus { box-shadow: 0 0 0 2px rgba(88,166,255,0.3); }
.tb-select span { line-height: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tb-input {
  width: 100%; padding: 6px 10px; border-radius: 6px;
  background: #0d1117; border: 1px solid #30363d;
  color: #e6edf3; font-size: 12px; font-family: monospace;
  outline: none; box-sizing: border-box;
}
.tb-input:focus { border-color: #58a6ff; box-shadow: 0 0 0 2px rgba(88,166,255,0.15); }
`;
