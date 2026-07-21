import type { ReactNode } from "react";

export interface MenuItem {
  label: string;
  shortcut?: string;
  disabled?: boolean;
}

export interface SubMenuItem {
  label: string;
  icon: ReactNode;
}

export const MAIN_MENU: MenuItem[] = [
  { label: "上传" },
  { label: "保存到我的资产" },
  { label: "添加节点" },
  { label: "撤销", shortcut: "Ctrl+Z" },
  { label: "重做", shortcut: "Ctrl+Shift+Z" },
  { label: "粘贴", shortcut: "Ctrl+V", disabled: true },
];

export const FLOW_ITEM_MENU: MenuItem[] = [
  { label: "保存到我的资产" },
  { label: "创建主体" },
  { label: "复制节点" },
  { label: "创建副本" },
  { label: "粘贴" },
  { label: "转为3D模型" },
  { label: "删除" },
  { label: "复制到剪贴板" },
];

const icon = (d: ReactNode) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{d}</svg>
);

export const ADD_NODE_MENU: { group: string; items: SubMenuItem[] }[] = [
  {
    group: "添加节点",
    items: [
      { label: "文本", icon: icon(<><polyline points="4 7 4 4 20 4 20 7" /><line x1="9" y1="20" x2="15" y2="20" /><line x1="12" y1="4" x2="12" y2="20" /></>) },
      { label: "图片", icon: icon(<><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></>) },
      { label: "视频", icon: icon(<polygon points="5 3 19 12 5 21 5 3" />) },
      { label: "导演台", icon: icon(<><rect x="2" y="3" width="20" height="14" rx="2" ry="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" /></>) },
      { label: "音频", icon: icon(<><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></>) },
      { label: "脚本", icon: icon(<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" /></>) },
      { label: "素材库", icon: icon(<><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /></>) },
    ],
  },
  {
    group: "添加资源",
    items: [
      { label: "上传", icon: icon(<><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></>) },
      { label: "从生成历史选择", icon: icon(<><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></>) },
    ],
  },
];
