/**
 * 协作会话单例存储：宿主发起 / 客户端加入后写入，Detail 画布订阅后建立同步。
 * P0：会话级简单状态；P2 迁移到房间管理（成员/权限/多 clip）。
 */
export type CollabRole = "host" | "client";

export interface CollabSession {
  role: CollabRole;
  /** 邀请码（= 房间 ID） */
  code: string;
  /** 连接地址 host（宿主自身为 127.0.0.1） */
  host: string;
  port: number;
}

let current: CollabSession | null = null;
const listeners = new Set<(s: CollabSession | null) => void>();

export function getCollabSession(): CollabSession | null {
  return current;
}

export function setCollabSession(session: CollabSession | null) {
  current = session;
  listeners.forEach((l) => l(session));
}

export function subscribeCollabSession(listener: (s: CollabSession | null) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
