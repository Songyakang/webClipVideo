import * as Select from "@radix-ui/react-select";
import * as Tooltip from "@radix-ui/react-tooltip";
import "./ImageToolbox.css";

interface Props {
  style: React.CSSProperties;
}

const ChevronDown = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

export default function ImageToolbox({ style }: Props) {
  return (
    <Tooltip.Provider delayDuration={300}>
      <div className="image-toolbox" style={style} onMouseDown={(e) => e.stopPropagation()}>

        {/* Section 1 */}
        <div className="toolbox-row">
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
        <div className="toolbox-row">
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
