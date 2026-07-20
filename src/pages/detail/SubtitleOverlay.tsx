import type { FlowNode } from "./nodes/types";
import SubtitlePanel from "./subtitle/SubtitlePanel";

interface Props {
  showSubtitles: boolean;
  selectedVideoNode: FlowNode | null;
  projectId: string;
  onClose: () => void;
}

export default function SubtitleOverlay({ showSubtitles, selectedVideoNode, projectId, onClose }: Props) {
  if (!showSubtitles || !selectedVideoNode) return null;

  return (
    <SubtitlePanel
      nodeId={selectedVideoNode.id}
      videoEl={
        document.querySelector(
          `.react-flow__node[data-id="${selectedVideoNode.id}"] video`
        ) as HTMLVideoElement | null
      }
      videoAssetPath={selectedVideoNode.data?.assetPath}
      projectId={projectId}
      onClose={onClose}
    />
  );
}
