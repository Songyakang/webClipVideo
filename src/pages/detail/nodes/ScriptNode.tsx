import { createContext, memo, useContext } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import ScriptIcon from "../script/ScriptIcon";
import type { FlowNode } from "./types";

export const OpenScriptContext = createContext<(id: string) => void>(() => {});

export default memo(function ScriptNode({ id, data, selected }: NodeProps<FlowNode>) {
  const open = useContext(OpenScriptContext);
  const script = data.script;
  const shots = script?.shots ?? [];
  return (
    <div className={`w-[520px] overflow-hidden rounded-2xl border bg-[#161b22] text-[#e6edf3] shadow-xl ${selected ? "border-[#b69aff] ring-2 ring-[#b69aff]/20" : "border-[#30363d]"}`}>
      <Handle type="target" position={Position.Left} className="flow-handle" />
      <div className="flex items-center justify-between border-b border-[#30363d] px-6 py-4">
        <span className="flex items-center gap-2 text-sm font-medium text-[#d2b9ff]"><ScriptIcon /> 脚本</span>
        <span className="rounded border border-[#d2b9ff]/20 bg-[#d2b9ff]/5 px-2 py-0.5 text-xs text-[#d2b9ff]">体验版</span>
      </div>
      <div className="p-6">
        <h3 className="m-0 truncate text-xl font-semibold">{script?.title || "未命名脚本"}</h3>
        <p className="mb-5 mt-3 line-clamp-3 min-h-16 text-sm leading-6 text-[#8b949e]">{script?.source || "从一段想法开始，编写原稿，再把故事拆成一个个镜头。"}</p>
        <div className="mb-6 flex gap-5 text-sm text-[#b1bac4]">
          <span>{shots.length} 个镜头</span><span>{shots.reduce((sum, shot) => sum + shot.duration, 0)} 秒</span><span>{script?.aspectRatio || "16:9"}</span>
        </div>
        <button type="button" className="nodrag w-full cursor-pointer rounded-lg border border-[#d2b9ff]/25 bg-[#d2b9ff]/10 px-4 py-2.5 text-sm text-[#d2b9ff] transition-colors hover:bg-[#d2b9ff]/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d2b9ff]" onClick={(event) => { event.stopPropagation(); open(id); }} onDoubleClick={(event) => event.stopPropagation()}>
          编辑脚本 <span aria-hidden="true">↗</span>
        </button>
      </div>
      <Handle type="source" position={Position.Right} className="flow-handle" />
    </div>
  );
});
