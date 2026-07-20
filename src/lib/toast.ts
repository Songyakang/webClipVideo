export type ToastType = "error" | "success" | "info";

export interface ToastDetail {
  message: string;
  type: ToastType;
}

/** Trigger a global toast notification. */
export function showToast(message: string, type: ToastType = "info") {
  window.dispatchEvent(new CustomEvent<ToastDetail>("app-toast", { detail: { message, type } }));
}
