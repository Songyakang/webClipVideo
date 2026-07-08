export type MenuType = "main" | "addNode" | "flowItem";

export interface ContextMenuState {
  x: number;
  y: number;
  canvasX: number;
  canvasY: number;
  type: MenuType;
  nodeId?: string;
}

export interface CanvasNodeData {
  id: string;
  type: string;
  x: number;
  y: number;
  content: string;
  editing: boolean;
}

export interface EdgeData {
  id: string;
  fromNode: string;
  toNode: string;
}
