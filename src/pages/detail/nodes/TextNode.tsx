import { Handle, Position, type NodeProps } from "@xyflow/react";
export default function TextNode({ data, selected }: NodeProps) {
  const d = data as any;
  const w = d.w || 700;
  const h = d.h || 400;
  return (
    <div
      className={`flow-node text-node${selected ? " selected" : ""}`}
      style={{ width: w, height: h }}
    >
      <Handle type="target" position={Position.Left} className="flow-handle" />
      <div className="node-content">
        {d.content || <span className="node-placeholder">双击编辑文本</span>}
      </div>
      <Handle type="source" position={Position.Right} className="flow-handle" />
    </div>
  );
}
