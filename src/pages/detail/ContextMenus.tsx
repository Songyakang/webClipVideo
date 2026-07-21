import { MAIN_MENU, ADD_NODE_MENU, FLOW_ITEM_MENU } from "./menus";
import type { MenuState } from "./hooks/useContextMenu";

interface Props {
  menu: MenuState;
  onAction: (action: string) => void;
  selectedCount?: number;
}

export default function ContextMenus({ menu, onAction, selectedCount = 1 }: Props) {
  return (
    <>
      {menu.type === "main" && (
        <div className="context-menu" style={{ left: menu.x, top: menu.y }} onMouseDown={(e) => e.stopPropagation()}>
          {MAIN_MENU.map((item) => (
            <button key={item.label} className={`context-menu-item${item.disabled ? " disabled" : ""}`}
              onClick={() => !item.disabled && onAction(item.label)} disabled={item.disabled}>
              <span>{item.label}</span>
              {item.shortcut && <span className="menu-shortcut">{item.shortcut}</span>}
            </button>
          ))}
        </div>
      )}

      {menu.type === "addNode" && (
        <div className="context-menu" style={{ left: menu.x, top: menu.y }} onMouseDown={(e) => e.stopPropagation()}>
          {ADD_NODE_MENU.map((group) => (
            <div key={group.group}>
              <div className="menu-group-title">{group.group}</div>
              {group.items.map((item) => (
                <button key={item.label} className="context-menu-item" onClick={() => onAction(item.label)}>
                  <span className="menu-icon">{item.icon}</span><span>{item.label}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}

      {menu.type === "flowItem" && (
        <div className="context-menu" style={{ left: menu.x, top: menu.y }} onMouseDown={(e) => e.stopPropagation()}>
          {FLOW_ITEM_MENU.map((item) => {
            const isDelete = item.label === "删除";
            const label = isDelete && selectedCount > 1 ? `删除选中 (${selectedCount})` : item.label;
            const action = isDelete && selectedCount > 1 ? "删除选中" : item.label;
            return (
              <button key={item.label} className={`context-menu-item${item.label === "删除" ? " danger" : ""}`}
                onClick={() => onAction(action)}>
                <span>{label}</span>
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}
