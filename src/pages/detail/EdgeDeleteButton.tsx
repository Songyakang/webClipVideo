import styles from "./Detail.module.css";

interface EdgeDeleteInfo {
  id: string;
  x: number;
  y: number;
}

interface Props {
  edgeToDelete: EdgeDeleteInfo | null;
  onDelete: (edgeId: string) => void;
  onDismiss: () => void;
}

export default function EdgeDeleteButton({ edgeToDelete, onDelete, onDismiss }: Props) {
  if (!edgeToDelete) return null;

  return (
    <div
      className={styles["scissors-btn"]}
      style={{ left: edgeToDelete.x - 20, top: edgeToDelete.y - 20 }}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={() => { onDelete(edgeToDelete.id); onDismiss(); }}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="6" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><line x1="20" y1="4" x2="8.12" y2="15.88" /><line x1="14.47" y1="14.48" x2="20" y2="20" /><line x1="8.12" y1="8.12" x2="12" y2="12" />
      </svg>
    </div>
  );
}
