import { memo } from "react";
import { type NodeProps, useReactFlow } from "@xyflow/react";
import type { FlowNode } from "./types";

function GroupNode({ id, data, selected }: NodeProps<FlowNode>) {
  const { updateNodeData } = useReactFlow<FlowNode>();
  return (
    <div className={`h-full w-full rounded-2xl border-2 bg-sky-400/5 ${selected ? "border-sky-400 ring-2 ring-sky-400/20" : "border-slate-600/80"}`}>
      <div className="group-drag-handle flex h-12 cursor-grab items-center gap-3 rounded-t-xl bg-slate-800/80 px-4 text-slate-300 active:cursor-grabbing">
        <span aria-hidden="true">⠿</span>
        <input
          aria-label="分组名称"
          className="nodrag nowheel min-w-0 flex-1 rounded bg-transparent px-2 py-1 text-sm font-medium text-slate-100 outline-none focus:bg-slate-700 focus:ring-1 focus:ring-sky-400"
          value={data.label ?? "分组"}
          maxLength={80}
          onChange={(e) => updateNodeData(id, { label: e.target.value })}
          onBlur={(e) => { if (!e.target.value.trim()) updateNodeData(id, { label: "分组" }); }}
        />
        <span className="pointer-events-none text-xs text-slate-400">拖动分组</span>
      </div>
    </div>
  );
}
export default memo(GroupNode);
