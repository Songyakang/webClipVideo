import type { MouseMode } from "./hooks/MouseModeContext";

interface Props {
  mode: MouseMode;
  onToggle: () => void;
}

const HandIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 11V6a2 2 0 0 0-2-2 2 2 0 0 0-2 2" />
    <path d="M14 10V4a2 2 0 0 0-2-2 2 2 0 0 0-2 2v2" />
    <path d="M10 10.5V6a2 2 0 0 0-2-2 2 2 0 0 0-2 2v8" />
    <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />
  </svg>
);

const ArrowIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m3 3 7.07 16.97 2.51-7.39 7.39-2.51L3 3z" />
    <path d="m13 13 6 6" />
  </svg>
);

/** 鼠标模式切换按钮：抓手（平移）↔ 箭头（框选），随父容器定位 */
export default function MouseModeToggle({ mode, onToggle }: Props) {
  const isSelect = mode === "select";
  return (
    // 与功能区其他按钮保持一致：无自定义类、无激活色，颜色继承同款白
    <button
      onClick={onToggle}
      aria-label={isSelect ? "框选模式" : "平移模式"}
      title={isSelect ? "鼠标模式：框选（点击切换为平移）" : "鼠标模式：平移（点击切换为框选）"}
    >
      {isSelect ? <ArrowIcon /> : <HandIcon />}
    </button>
  );
}
