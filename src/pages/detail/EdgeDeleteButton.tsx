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
    <>
      <style>{`
        @keyframes scissors-pop {
          from { transform: scale(0); }
          to { transform: scale(1); }
        }
      `}</style>
      <div
        className="fixed z-[150] w-10 h-10 rounded-full border-none cursor-pointer flex items-center justify-center"
        style={{
          left: edgeToDelete.x - 20,
          top: edgeToDelete.y - 20,
          background: "#f85149",
          color: "#fff",
          boxShadow: "0 2px 8px rgba(0,0,0,0.5)",
          animation: "scissors-pop 0.15s ease-out",
        }}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={() => { onDelete(edgeToDelete.id); onDismiss(); }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="6" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><line x1="20" y1="4" x2="8.12" y2="15.88" /><line x1="14.47" y1="14.48" x2="20" y2="20" /><line x1="8.12" y1="8.12" x2="12" y2="12" />
        </svg>
      </div>
    </>
  );
}
