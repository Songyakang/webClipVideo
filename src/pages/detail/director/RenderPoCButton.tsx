import { useState } from "react";
import { runOffscreenRenderPoC } from "./renderPoC";
import { showToast } from "../../../lib/toast";

interface Props {
  projectId: string;
}

/** 临时 PoC 触发按钮（方案 §10 验收点 1：离屏渲染一帧 → PNG）— 验证后移除 */
export default function RenderPoCButton({ projectId }: Props) {
  const [running, setRunning] = useState(false);

  const run = async () => {
    setRunning(true);
    const r = await runOffscreenRenderPoC(projectId);
    setRunning(false);
    console.log("[renderPoC]", r);
    showToast(
      r.ok
        ? `PoC 渲染完成（${r.webglVersion}）：${r.frameMs}ms/帧，PNG ${Math.round((r.sizeBytes ?? 0) / 1024)}KB${r.pngPath ? ` → ${r.pngPath}` : ""}`
        : `PoC 渲染失败：${r.error}`,
      r.ok ? "success" : "error",
    );
  };

  return (
    <button
      className="fixed bottom-4 right-4 z-10 px-3 py-1.5 rounded-lg text-[12px] cursor-pointer select-none transition-colors"
      style={{ background: "#161b22", border: "1px solid #30363d", color: running ? "#6e7681" : "#e6edf3" }}
      onClick={run}
      disabled={running}
    >
      {running ? "PoC 渲染中..." : "PoC: 离屏渲染一帧"}
    </button>
  );
}
