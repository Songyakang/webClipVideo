import type { Node, Edge } from "@xyflow/react";

const DB_NAME = "video-clip-editor";
const DB_VERSION = 2;
const STORE_NODES = "nodes";
const STORE_EDGES = "edges";
const STORE_CLIPS = "clips";

export interface VideoClip {
  id: string;
  title: string;
  description: string;
  url: string;
  thumbnail?: string;
  duration: number;
  createdAt: number;
  tags: string[];
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NODES)) {
        db.createObjectStore(STORE_NODES, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORE_EDGES)) {
        db.createObjectStore(STORE_EDGES, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORE_CLIPS)) {
        const cs = db.createObjectStore(STORE_CLIPS, { keyPath: "id" });
        cs.createIndex("createdAt", "createdAt", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function storePut(db: IDBDatabase, name: string, items: { id: string; [key: string]: any }[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(name, "readwrite");
    const store = tx.objectStore(name);
    store.clear();
    for (const item of items) {
      store.put(item);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function storeGetAll(db: IDBDatabase, name: string): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(name, "readonly");
    const store = tx.objectStore(name);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveCanvas(
  nodes: Node[],
  edges: Edge[],
) {
  const db = await openDB();

  // Save nodes (strip circular refs and non-serializable data)
  const cleanNodes = nodes.map((n) => ({
    id: n.id,
    type: n.type,
    position: n.position,
    data: n.data,
    width: n.width,
    height: n.height,
    selected: n.selected,
  }));
  await storePut(db, STORE_NODES, cleanNodes);

  // Save edges
  const cleanEdges = edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle,
    targetHandle: e.targetHandle,
  }));
  await storePut(db, STORE_EDGES, cleanEdges);

  db.close();
}

export async function loadCanvas(): Promise<{
  nodes: Node[];
  edges: Edge[];
}> {
  const db = await openDB();
  const rawNodes = await storeGetAll(db, STORE_NODES);
  const rawEdges = await storeGetAll(db, STORE_EDGES);

  db.close();

  // Restore nodes with proper defaults
  const nodes = rawNodes.map((n: any) => ({
    id: n.id,
    type: n.type || "text",
    position: n.position || { x: 0, y: 0 },
    data: {
      ...n.data,
      fileUrl: n.data?.fileUrl || "",
    },
    width: n.width,
    height: n.height,
    selected: false,
    dragging: false,
  }));

  const edges = rawEdges.map((e: any) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle,
    targetHandle: e.targetHandle,
  }));

  return { nodes, edges };
}

export async function clearCanvas() {
  const db = await openDB();
  for (const name of [STORE_NODES, STORE_EDGES]) {
    storePut(db, name, []);
  }
  db.close();
}

// -- VideoClip (Index page) --

export async function getAllClips(): Promise<VideoClip[]> {
  const db = await openDB();
  const clips: VideoClip[] = await storeGetAll(db, STORE_CLIPS);
  db.close();
  return clips.sort((a, b) => b.createdAt - a.createdAt);
}

export async function getClipById(id: string): Promise<VideoClip | undefined> {
  const db = await openDB();
  const store = db.transaction(STORE_CLIPS, "readonly").objectStore(STORE_CLIPS);
  const clip: VideoClip | undefined = await new Promise((resolve, reject) => {
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return clip;
}

export async function addClip(data: Omit<VideoClip, "id" | "createdAt">): Promise<VideoClip> {
  const db = await openDB();
  const clip: VideoClip = {
    ...data,
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 9),
    createdAt: Date.now(),
  };
  await new Promise<void>((resolve, reject) => {
    const req = db.transaction(STORE_CLIPS, "readwrite").objectStore(STORE_CLIPS).put(clip);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
  db.close();
  return clip;
}

export async function updateClip(
  id: string,
  data: Partial<Omit<VideoClip, "id" | "createdAt">>,
): Promise<VideoClip | undefined> {
  const db = await openDB();
  const store = db.transaction(STORE_CLIPS, "readwrite").objectStore(STORE_CLIPS);
  const existing: VideoClip | undefined = await new Promise((resolve, reject) => {
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  if (!existing) { db.close(); return; }
  const updated = { ...existing, ...data };
  await new Promise<void>((resolve, reject) => {
    const req = store.put(updated);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
  db.close();
  return updated;
}

export async function deleteClip(id: string): Promise<boolean> {
  const db = await openDB();
  const store = db.transaction(STORE_CLIPS, "readwrite").objectStore(STORE_CLIPS);
  const existing: VideoClip | undefined = await new Promise((resolve, reject) => {
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  if (!existing) { db.close(); return false; }
  await new Promise<void>((resolve, reject) => {
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
  db.close();
  return true;
}

export async function searchClips(query: string): Promise<VideoClip[]> {
  const clips = await getAllClips();
  const q = query.toLowerCase();
  return clips.filter(
    (c) =>
      c.title.toLowerCase().includes(q) ||
      c.description.toLowerCase().includes(q) ||
      c.tags.some((t) => t.toLowerCase().includes(q)),
  );
}
