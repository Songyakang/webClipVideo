import { useState } from "react";
import { runOffscreenRenderPoC, runMultiFramePoC, runGlbRenderPoC } from "./renderPoC";
import { showToast } from "../../../lib/toast";

interface Props {
  projectId: string;
}

/** 临时 PoC 触发按钮组（方案 §10 三个验收点）— 验证完成后移除 */
export default function RenderPoCButton({ projectId }: Props) {
  const [running, setRunning] = useState<string | null>(null);

  const run = async (key: string, fn: () => Promise<void>) => {
    setRunning(key);
    try {
      await fn();
    } finally {
      setRunning(null);
    }
  };

  const poc1 = async () => {
    const r = await runOffscreenRenderPoC(projectId);
    console.log("[renderPoC 1]", r);
    showToast(
      r.ok
        ? `PoC1 单帧（${r.webglVersion}）：${r.frameMs}ms/帧，PNG ${Math.round((r.sizeBytes ?? 0) / 1024)}KB`
        : `PoC1 失败：${r.error}`,
      r.ok ? "success" : "error",
    );
  };

  const poc2 = async () => {
    const r = await runMultiFramePoC(projectId);
    console.log("[renderPoC 2]", r);
    showToast(
      r.ok
        ? `PoC2 20帧：平均 ${r.avgFrameMs}ms（render ${r.renderOnlyMs}ms / readback ${r.readbackMs}ms），UI 最大间隔 ${r.uiMaxGapMs}ms、长帧 ${r.uiLongFrames} 次`
        : `PoC2 失败：${r.error}`,
      r.ok ? "success" : "error",
    );
  };

  const poc3 = async () => {
    const r = await runGlbRenderPoC(projectId);
    console.log("[renderPoC 3]", r);
    showToast(
      r.ok
        ? `PoC3 GLB 白模：${r.glbName}（${r.meshCount} mesh / 替换 ${r.replacedMaterials} 材质），${r.durationMs}ms`
        : `PoC3 失败：${r.error}`,
      r.ok ? "success" : "error",
    );
  };

  const btnStyle: React.CSSProperties = {
    background: "#161b22",
    border: "1px solid #30363d",
    color: "#e6edf3",
  };

  return (
    <div className="fixed bottom-4 right-4 z-10 flex flex-col gap-1.5 select-none">
      <button className="px-3 py-1.5 rounded-lg text-[12px] cursor-pointer transition-colors" style={btnStyle}
        onClick={() => run("poc1", poc1)} disabled={running !== null}>
        {running === "poc1" ? "渲染中..." : "PoC1: 离屏单帧"}
      </button>
      <button className="px-3 py-1.5 rounded-lg text-[12px] cursor-pointer transition-colors" style={btnStyle}
        onClick={() => run("poc2", poc2)} disabled={running !== null}>
        {running === "poc2" ? "渲染中..." : "PoC2: 20帧读回"}
      </button>
      <button className="px-3 py-1.5 rounded-lg text-[12px] cursor-pointer transition-colors" style={btnStyle}
        onClick={() => run("poc3", poc3)} disabled={running !== null}>
        {running === "poc3" ? "渲染中..." : "PoC3: GLB白模"}
      </button>
    </div>
  );
}
