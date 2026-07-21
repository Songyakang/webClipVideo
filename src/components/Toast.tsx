import { useEffect, useRef, useState } from "react";
import type { ToastType } from "../lib/toast";

interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
}

let nextId = 0;
const AUTO_DISMISS_MS = 3000;

export default function Toast() {
  const [items, setItems] = useState<ToastItem[]>([]);
  const timeoutsRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    const handler = (e: Event) => {
      const { message, type } = (e as CustomEvent).detail;
      const id = nextId++;
      setItems((prev) => [...prev, { id, message, type }]);
      const timeoutId = setTimeout(() => {
        timeoutsRef.current.delete(id);
        setItems((prev) => prev.filter((item) => item.id !== id));
      }, AUTO_DISMISS_MS);
      timeoutsRef.current.set(id, timeoutId);
    };
    window.addEventListener("app-toast", handler);
    return () => {
      window.removeEventListener("app-toast", handler);
      timeoutsRef.current.forEach((tid) => clearTimeout(tid));
      timeoutsRef.current.clear();
    };
  }, []);

  const dismiss = (id: number) => {
    const tid = timeoutsRef.current.get(id);
    if (tid) {
      clearTimeout(tid);
      timeoutsRef.current.delete(id);
    }
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  if (items.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
      <style>{`
        .toast {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 16px;
          border-radius: 8px;
          font-size: 14px;
          line-height: 1.4;
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
          pointer-events: auto;
          animation: toast-in 0.2s ease-out;
          max-width: 360px;
          word-break: break-word;
        }
        .toast-error {
          background: #3d1111;
          border: 1px solid #da3633;
          color: #ffa198;
        }
        .toast-success {
          background: #11231e;
          border: 1px solid #238636;
          color: #7ee787;
        }
        .toast-info {
          background: #0c2d48;
          border: 1px solid #1f6feb;
          color: #79c0ff;
        }
        .toast-close:hover {
          opacity: 1;
          background: rgba(255, 255, 255, 0.1);
        }
        @keyframes toast-in {
          from { opacity: 0; transform: translateX(40px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>
      {items.map((item) => (
        <div key={item.id} className={`toast toast-${item.type}`} role="alert">
          <span className="flex-1">{item.message}</span>
          <button
            className="flex-shrink-0 w-6 h-6 border-none bg-transparent text-inherit text-lg leading-none cursor-pointer opacity-70 flex items-center justify-center rounded"
            onClick={() => dismiss(item.id)}
            aria-label="关闭"
          >
            &times;
          </button>
        </div>
      ))}
    </div>
  );
}
