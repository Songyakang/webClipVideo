import type { Node } from "@xyflow/react";

export interface NodeData extends Record<string, unknown> {
  type: string;
  content: string;
  fileUrl?: string;
  w?: number;
  h?: number;
  videoEl?: HTMLVideoElement | null;
}

export type FlowNode = Node<NodeData>;
