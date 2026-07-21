import * as Select from "@radix-ui/react-select";
import * as Tooltip from "@radix-ui/react-tooltip";

const ChevronDown = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

export default function ImageToolbox() {
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
            min-width: 150px;
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
        `}</style>

        {/* Section 1 */}
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
            <Tooltip.Content side="top" className="tooltip-content">上传参考图像</Tooltip.Content>
          </Tooltip.Root>
        </div>

        {/* Section 2 - Prompt textarea */}
        <textarea
          className="toolbox-prompt"
          placeholder="可直接文字生图, 或上传图片输入文字指令对图片进行编辑, 如: 将背景改为雪夜"
          rows={3}
        />

        {/* Section 3 */}
        <div className="flex items-center gap-2 flex-nowrap">
          <Select.Root defaultValue="sd">
            <Select.Trigger className="toolbox-select">
              <Select.Value />
              <Select.Icon><ChevronDown /></Select.Icon>
            </Select.Trigger>
            <Select.Portal>
              <Select.Content className="select-dropdown" position="popper" sideOffset={4}>
                <Select.Viewport>
                  <Select.Item value="sd" className="select-item">
                    <Select.ItemText>Stable Diffusion</Select.ItemText>
                  </Select.Item>
                  <Select.Item value="mj" className="select-item">
                    <Select.ItemText>Midjourney</Select.ItemText>
                  </Select.Item>
                  <Select.Item value="dalle" className="select-item">
                    <Select.ItemText>DALL-E 3</Select.ItemText>
                  </Select.Item>
                  <Select.Item value="flux" className="select-item">
                    <Select.ItemText>Flux</Select.ItemText>
                  </Select.Item>
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
              <button className="toolbox-btn">摄像机</button>
            </Tooltip.Trigger>
            <Tooltip.Content side="top" className="tooltip-content">设置摄像机角度</Tooltip.Content>
          </Tooltip.Root>

          <Tooltip.Root>
            <Tooltip.Trigger asChild>
              <button className="toolbox-btn">翻译</button>
            </Tooltip.Trigger>
            <Tooltip.Content side="top" className="tooltip-content">翻译提示词</Tooltip.Content>
          </Tooltip.Root>

          <Tooltip.Root>
            <Tooltip.Trigger asChild>
              <button className="toolbox-btn">图片数量</button>
            </Tooltip.Trigger>
            <Tooltip.Content side="top" className="tooltip-content">设置生成数量</Tooltip.Content>
          </Tooltip.Root>

          <button className="toolbox-btn primary">提交</button>
        </div>

      </div>
    </Tooltip.Provider>
  );
}
