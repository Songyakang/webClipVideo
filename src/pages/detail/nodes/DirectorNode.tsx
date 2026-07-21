import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { DirectorNodeData, SceneModel } from "../../../lib/types";

function DirectorNode({ data, selected }: NodeProps) {
  const d = data as unknown as DirectorNodeData;
  const modelCount = d.models?.length ?? 0;
  const readyCount = d.models?.filter((m: SceneModel) => m.status === "ready").length ?? 0;
  const loadingCount = d.models?.filter((m: SceneModel) => m.status === "loading").length ?? 0;

  return (
    <div className={`director-node${selected ? " selected" : ""}`}>
      <Handle type="target" position={Position.Left} />
      <div className="director-node-header">
        <span className="director-icon">🎬</span>
        <span className="director-label">{d.label || "导演台"}</span>
      </div>
      <div className="director-node-body">
        <div className="director-model-count">
          模型: {readyCount}/{modelCount}
          {loadingCount > 0 && <span className="director-loading-badge"> 生成中...</span>}
        </div>
        {modelCount === 0 && (
          <div className="director-empty-hint">右键图片节点 → 转为3D模型</div>
        )}
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

export default memo(DirectorNode);
