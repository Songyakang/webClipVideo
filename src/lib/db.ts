import type { Node, Edge } from "@xyflow/react";
import type { VideoClip, SubtitleTrack } from "./types";
import { showToast } from "./toast";

const DB_NAME = "video-clip-editor";
const DB_VERSION = 5;
const STORE_NODES = "nodes";
const STORE_EDGES = "edges";
const STORE_CLIPS = "clips";
const STORE_SUBTITLES = "subtitles";

// ---------------------------------------------------------------------------
// IndexedDB schema record types
// ---------------------------------------------------------------------------

export interface CanvasNodeRecord {
  id: string;
  type?: string | null;
  position: { x: number; y: number };
  data: Record<string, unknown>;
  width?: number | null;
  height?: number | null;
  selected?: boolean | null;
  clipId: string;
}

export interface CanvasEdgeRecord {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  clipId: string;
}

export interface SubtitleRecord extends SubtitleTrack {
  clipId: string;
}

export type ClipRecord = VideoClip;

// ---------------------------------------------------------------------------
// Connection manager (singleton pattern)
// ---------------------------------------------------------------------------

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (event: IDBVersionChangeEvent) => {
      const db = req.result;
      const upgradeTx = req.transaction!;

      // --- nodes store ---
      if (!db.objectStoreNames.contains(STORE_NODES)) {
        const ns = db.createObjectStore(STORE_NODES, { keyPath: "id" });
        ns.createIndex("clipId", "clipId", { unique: false });
      } else {
        const ns = upgradeTx.objectStore(STORE_NODES);
        if (!ns.indexNames.contains("clipId")) {
          ns.createIndex("clipId", "clipId", { unique: false });
        }
      }

      // --- edges store ---
      if (!db.objectStoreNames.contains(STORE_EDGES)) {
        const es = db.createObjectStore(STORE_EDGES, { keyPath: "id" });
        es.createIndex("clipId", "clipId", { unique: false });
      } else {
        const es = upgradeTx.objectStore(STORE_EDGES);
        if (!es.indexNames.contains("clipId")) {
          es.createIndex("clipId", "clipId", { unique: false });
        }
      }

      // --- clips store ---
      if (!db.objectStoreNames.contains(STORE_CLIPS)) {
        const cs = db.createObjectStore(STORE_CLIPS, { keyPath: "id" });
        cs.createIndex("createdAt", "createdAt", { unique: false });
      }

      // --- subtitles store ---
      if (!db.objectStoreNames.contains(STORE_SUBTITLES)) {
        const ss = db.createObjectStore(STORE_SUBTITLES, { keyPath: "id" });
        ss.createIndex("clipId", "clipId", { unique: false });
      } else {
        const ss = upgradeTx.objectStore(STORE_SUBTITLES);
        if (!ss.indexNames.contains("clipId")) {
          ss.createIndex("clipId", "clipId", { unique: false });
        }
      }

      // -- Backfill clipId on legacy records (migration v4 -> v5) --
      if (event.oldVersion > 0 && event.oldVersion < 5) {
        let fallbackClipId = "legacy";
        try {
          const clipStore = upgradeTx.objectStore(STORE_CLIPS);
          const clipCursorReq = clipStore.openCursor();
          clipCursorReq.onsuccess = () => {
            const cursor = clipCursorReq.result;
            if (cursor) {
              fallbackClipId = cursor.value.id;
            }
          };
        } catch {
          // No clips store or empty -- use "legacy" sentinel
        }
        backfillClipIdInStore(upgradeTx, STORE_NODES, fallbackClipId);
        backfillClipIdInStore(upgradeTx, STORE_EDGES, fallbackClipId);
        backfillClipIdInStore(upgradeTx, STORE_SUBTITLES, fallbackClipId);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      showToast("数据库连接失败，请刷新页面", "error");
      reject(req.error);
    };
  });
}

function getDB(): Promise<IDBDatabase> {
  if (!dbPromise) dbPromise = openDB();
  return dbPromise;
}

/** Close the singleton connection (e.g. on app exit). */
export function closeDB(): void {
  if (dbPromise) {
    dbPromise.then((db) => db.close());
    dbPromise = null;
  }
}

// ---------------------------------------------------------------------------
// Low-level helpers
// ---------------------------------------------------------------------------

function storeGetAll<T>(db: IDBDatabase, name: string): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(name, "readonly");
    const store = tx.objectStore(name);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Delete every record in `store` whose `indexName` index key equals `key`.
 * Must be called inside an active readwrite transaction.
 */
function deleteRecordsByIndex(
  store: IDBObjectStore,
  indexName: string,
  key: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const index = store.index(indexName);
    const req = index.openCursor(IDBKeyRange.only(key));
    req.onsuccess = () => {
      const cursor = req.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      } else {
        resolve();
      }
    };
    req.onerror = () => reject(req.error);
  });
}

/**
 * Backfill clipId on legacy records that lack the field.
 * Called during the v4 -> v5 schema migration in onupgradeneeded.
 * The upgrade transaction stays alive until onupgradeneeded returns,
 * so cursor operations queued here complete before the handler exits.
 */
function backfillClipIdInStore(
  tx: IDBTransaction,
  storeName: string,
  fallbackClipId: string,
): void {
  const store = tx.objectStore(storeName);
  const cursorReq = store.openCursor();
  cursorReq.onsuccess = () => {
    const cursor = cursorReq.result;
    if (cursor) {
      const record = cursor.value as Record<string, unknown>;
      if (!record.clipId) {
        record.clipId = fallbackClipId;
        cursor.update(record);
      }
      cursor.continue();
    }
  };
}

/**
 * Assign clipId to any legacy records that lack the field.
 * Intended to run inside an active readwrite transaction so the caller can
 * subsequently operate on those records (update or delete) by clipId index.
 * Requests are queued FIFO within a transaction, so this cursor completes
 * before any cursor opened after it.
 */
function assignClipIdToLegacyRecords(
  store: IDBObjectStore,
  _indexName: string,
  clipId: string,
): void {
  const req = store.openCursor();
  req.onsuccess = () => {
    const cursor = req.result;
    if (cursor) {
      const record = cursor.value as Record<string, unknown>;
      if (!record.clipId) {
        record.clipId = clipId;
        cursor.update(record);
      }
      cursor.continue();
    }
  };
}

// ---------------------------------------------------------------------------
// Canvas (per-clip isolation via clipId field)
// ---------------------------------------------------------------------------

export async function saveCanvas(
  clipId: string,
  nodes: Node[],
  edges: Edge[],
) {
  if (!clipId) return;

  const db = await getDB();
  const tx = db.transaction([STORE_NODES, STORE_EDGES], "readwrite");
  const nodeStore = tx.objectStore(STORE_NODES);
  const edgeStore = tx.objectStore(STORE_EDGES);

  // Precisely delete this clip's old nodes and edges via the clipId index
  await deleteRecordsByIndex(nodeStore, "clipId", clipId);
  await deleteRecordsByIndex(edgeStore, "clipId", clipId);

  // Assign clipId to any legacy records that lack it (backward compat)
  assignClipIdToLegacyRecords(nodeStore, "clipId", clipId);
  assignClipIdToLegacyRecords(edgeStore, "clipId", clipId);

  // Tag new records with clipId, strip DOM refs
  const cleanNodes: CanvasNodeRecord[] = nodes.map((n) => {
    const { videoEl, ...cleanData } = n.data || {};
    return {
      id: n.id,
      type: n.type,
      position: n.position,
      data: cleanData,
      width: n.width,
      height: n.height,
      selected: n.selected,
      clipId,
    };
  });
  const cleanEdges: CanvasEdgeRecord[] = edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle,
    targetHandle: e.targetHandle,
    clipId,
  }));

  for (const n of cleanNodes) nodeStore.put(n);
  for (const e of cleanEdges) edgeStore.put(e);

  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => {
      console.error("IndexedDB saveCanvas failed:", tx.error);
      showToast("保存画布数据失败", "error");
      reject(tx.error);
    };
  });
}

function storeGetAllByIndex<T>(
  db: IDBDatabase,
  storeName: string,
  indexName: string,
  key: string,
): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const store = tx.objectStore(storeName);
    const index = store.index(indexName);
    const req = index.getAll(IDBKeyRange.only(key));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function loadCanvas(clipId: string): Promise<{
  nodes: Node[];
  edges: Edge[];
}> {
  if (!clipId) return { nodes: [], edges: [] };

  const db = await getDB();
  const [rawNodes, rawEdges] = await Promise.all([
    storeGetAllByIndex<CanvasNodeRecord>(db, STORE_NODES, "clipId", clipId),
    storeGetAllByIndex<CanvasEdgeRecord>(db, STORE_EDGES, "clipId", clipId),
  ]);

  const nodes: Node[] = rawNodes.map((n) => ({
    id: n.id,
    type: n.type || "text",
    position: n.position || { x: 0, y: 0 },
    data: { ...n.data, fileUrl: (n.data as Record<string, unknown>)?.fileUrl || "" },
    width: n.width ?? undefined,
    height: n.height ?? undefined,
    selected: false,
    dragging: false,
  }));

  const edges: Edge[] = rawEdges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle,
    targetHandle: e.targetHandle,
  }));

  return { nodes, edges };
}

export async function clearCanvas(clipId: string) {
  if (!clipId) return;

  const db = await getDB();
  const tx = db.transaction([STORE_NODES, STORE_EDGES, STORE_SUBTITLES], "readwrite");
  const nodeStore = tx.objectStore(STORE_NODES);
  const edgeStore = tx.objectStore(STORE_EDGES);
  const subStore = tx.objectStore(STORE_SUBTITLES);

  // Assign clipId to legacy records first so they get picked up by the delete pass
  assignClipIdToLegacyRecords(nodeStore, "clipId", clipId);
  assignClipIdToLegacyRecords(edgeStore, "clipId", clipId);
  assignClipIdToLegacyRecords(subStore, "clipId", clipId);

  await deleteRecordsByIndex(nodeStore, "clipId", clipId);
  await deleteRecordsByIndex(edgeStore, "clipId", clipId);
  await deleteRecordsByIndex(subStore, "clipId", clipId);

  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => {
      console.error("IndexedDB clearCanvas failed:", tx.error);
      showToast("清理画布数据失败", "error");
      reject(tx.error);
    };
  });
}

// ---------------------------------------------------------------------------
// VideoClip (Index page)
// ---------------------------------------------------------------------------

export async function getAllClips(): Promise<VideoClip[]> {
  const db = await getDB();
  const clips: VideoClip[] = await storeGetAll<ClipRecord>(db, STORE_CLIPS);
  return clips.sort((a, b) => b.createdAt - a.createdAt);
}

export async function getClipById(id: string): Promise<VideoClip | undefined> {
  const db = await getDB();
  const tx = db.transaction(STORE_CLIPS, "readonly");
  const store = tx.objectStore(STORE_CLIPS);
  const clip = await new Promise<VideoClip | undefined>((resolve, reject) => {
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result ?? undefined);
    req.onerror = () => {
      showToast("读取数据失败", "error");
      reject(req.error);
    };
  });
  return clip;
}

export async function addClip(data: Omit<VideoClip, "id" | "createdAt">): Promise<VideoClip> {
  const db = await getDB();
  const clip: VideoClip = {
    ...data,
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 9),
    createdAt: Date.now(),
  };
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_CLIPS, "readwrite");
    const req = tx.objectStore(STORE_CLIPS).put(clip);
    req.onsuccess = () => resolve();
    req.onerror = () => {
      console.error("IndexedDB addClip failed:", req.error);
      showToast("保存失败，请检查磁盘空间", "error");
      reject(req.error);
    };
    tx.oncomplete = () => resolve();
  });
  return clip;
}

export async function updateClip(
  id: string,
  data: Partial<Omit<VideoClip, "id" | "createdAt">>,
): Promise<VideoClip | undefined> {
  const db = await getDB();
  const tx = db.transaction(STORE_CLIPS, "readwrite");
  const store = tx.objectStore(STORE_CLIPS);
  const existing = await new Promise<VideoClip | undefined>((resolve, reject) => {
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result ?? undefined);
    req.onerror = () => reject(req.error);
  });
  if (!existing) return undefined;
  const updated = { ...existing, ...data };
  await new Promise<void>((resolve, reject) => {
    const req = store.put(updated);
    req.onsuccess = () => resolve();
    req.onerror = () => {
      showToast("更新失败，请重试", "error");
      reject(req.error);
    };
  });
  return updated;
}

export async function deleteClip(id: string): Promise<boolean> {
  const db = await getDB();
  const tx = db.transaction(STORE_CLIPS, "readwrite");
  const store = tx.objectStore(STORE_CLIPS);
  const existing = await new Promise<VideoClip | undefined>((resolve, reject) => {
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result ?? undefined);
    req.onerror = () => reject(req.error);
  });
  if (!existing) return false;
  store.delete(id);
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => {
      console.error("IndexedDB deleteClip failed:", tx.error);
      showToast("删除失败，请稍后重试", "error");
      reject(tx.error);
    };
  });
  return true;
}

export async function searchClips(query: string): Promise<VideoClip[]> {
  const db = await getDB();
  const tx = db.transaction(STORE_CLIPS, "readonly");
  const store = tx.objectStore(STORE_CLIPS);
  const q = query.toLowerCase();

  const results: VideoClip[] = [];
  await new Promise<void>((resolve, reject) => {
    const req = store.openCursor();
    req.onsuccess = () => {
      const cursor = req.result;
      if (cursor) {
        const clip = cursor.value as VideoClip;
        if (
          clip.title.toLowerCase().includes(q) ||
          clip.description.toLowerCase().includes(q) ||
          clip.tags.some((t) => t.toLowerCase().includes(q))
        ) {
          results.push(clip);
        }
        cursor.continue();
      } else {
        resolve();
      }
    };
    req.onerror = () => reject(req.error);
  });

  return results.sort((a, b) => b.createdAt - a.createdAt);
}

// ---------------------------------------------------------------------------
// Subtitles
// ---------------------------------------------------------------------------

export async function saveSubtitleTrack(track: SubtitleTrack): Promise<void> {
  const db = await getDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_SUBTITLES, "readwrite");
    tx.objectStore(STORE_SUBTITLES).put(track);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadSubtitleTrack(nodeId: string): Promise<SubtitleTrack | null> {
  const db = await getDB();
  const track = await new Promise<SubtitleTrack | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE_SUBTITLES, "readonly");
    const req = tx.objectStore(STORE_SUBTITLES).get(nodeId);
    req.onsuccess = () => resolve(req.result ?? undefined);
    req.onerror = () => reject(req.error);
  });
  return track || null;
}
