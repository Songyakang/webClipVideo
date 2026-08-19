import { createContext, useContext } from "react";

export type MouseMode = "hand" | "select";

/** 当前鼠标模式：hand=抓手平移 / select=箭头框选（节点组件据此决定是否显示 toolbox） */
export const MouseModeContext = createContext<MouseMode>("hand");

export function useMouseMode() {
  return useContext(MouseModeContext);
}
