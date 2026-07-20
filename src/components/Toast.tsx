import { useEffect, useRef, useState } from "react";
import type { ToastType } from "../lib/toast";
import styles from "./Toast.module.css";

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
    <div className={styles["toast-container"]}>
      {items.map((item) => (
        <div key={item.id} className={`${styles.toast} ${styles[`toast-${item.type}`] || ""}`} role="alert">
          <span className={styles["toast-msg"]}>{item.message}</span>
          <button className={styles["toast-close"]} onClick={() => dismiss(item.id)} aria-label="关闭">
            &times;
          </button>
        </div>
      ))}
    </div>
  );
}
