import type { Node, Edge } from "@xyflow/react";
import type { SubtitleTrack } from "./types";

const DB_NAME = "video-clip-editor";
const DB_VERSION = 4;
const STORE_NODES = "nodes";
const STORE_EDGES = "edges";
const STORE_CLIPS = "clips";
const STORE_SUBTITLES = "subtitles";

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
      if (!db.objectStoreNames.contains(STORE_SUBTITLES)) {
        db.createObjectStore(STORE_SUBTITLES, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
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

// -- Canvas (per-clip isolation via clipId field) --

export async function saveCanvas(
  clipId: string,
  nodes: Node[],
  edges: Edge[],
) {
  if (!clipId) return;

  const db = await openDB();

  // Load all records, keep those belonging to OTHER clips
  const allNodes = await storeGetAll(db, STORE_NODES);
  const allEdges = await storeGetAll(db, STORE_EDGES);

  const otherNodes = allNodes.filter((n: any) => n.clipId && n.clipId !== clipId);
  const otherEdges = allEdges.filter((e: any) => e.clipId && e.clipId !== clipId);

  // Tag new records with clipId, strip DOM refs
  const cleanNodes = nodes.map((n) => {
    const { videoEl, ...cleanData } = n.data || {};
    return {
      id: n.id, type: n.type, position: n.position,
      data: cleanData, width: n.width, height: n.height,
      selected: n.selected, clipId,
    };
  });
  const cleanEdges = edges.map((e) => ({
    id: e.id, source: e.source, target: e.target,
    sourceHandle: e.sourceHandle, targetHandle: e.targetHandle,
    clipId,
  }));

  // Replace this clip's records, preserve others
  const tx = db.transaction([STORE_NODES, STORE_EDGES], "readwrite");
  const nodeStore = tx.objectStore(STORE_NODES);
  const edgeStore = tx.objectStore(STORE_EDGES);

  // Clear stores, then re-insert other clips' + this clip's records
  nodeStore.clear();
  edgeStore.clear();
  for (const n of [...otherNodes, ...cleanNodes]) nodeStore.put(n);
  for (const e of [...otherEdges, ...cleanEdges]) edgeStore.put(e);

  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function loadCanvas(clipId: string): Promise<{
  nodes: Node[];
  edges: Edge[];
}> {
  if (!clipId) return { nodes: [], edges: [] };

  const db = await openDB();
  const rawNodes = await storeGetAll(db, STORE_NODES);
  const rawEdges = await storeGetAll(db, STORE_EDGES);
  db.close();

  // Filter by clipId; also ignore legacy records that have no clipId field
  const clipNodes = rawNodes.filter((n: any) => n.clipId && n.clipId === clipId);
  const clipEdges = rawEdges.filter((e: any) => e.clipId && e.clipId === clipId);

  const nodes = clipNodes.map((n: any) => ({
    id: n.id,
    type: n.type || "text",
    position: n.position || { x: 0, y: 0 },
    data: { ...n.data, fileUrl: n.data?.fileUrl || "" },
    width: n.width,
    height: n.height,
    selected: false,
    dragging: false,
  }));

  const edges = clipEdges.map((e: any) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle,
    targetHandle: e.targetHandle,
  }));

  return { nodes, edges };
}

export async function clearCanvas(clipId: string) {
  const db = await openDB();

  const allNodes = await storeGetAll(db, STORE_NODES);
  const allEdges = await storeGetAll(db, STORE_EDGES);
  const allSubtitles = await storeGetAll(db, STORE_SUBTITLES);

  const keepNodes = allNodes.filter((n: any) => n.clipId !== clipId);
  const keepEdges = allEdges.filter((e: any) => e.clipId !== clipId);
  const keepSubtitles = allSubtitles.filter((s: any) => s.clipId !== clipId);

  const tx = db.transaction([STORE_NODES, STORE_EDGES, STORE_SUBTITLES], "readwrite");
  const nodeStore = tx.objectStore(STORE_NODES);
  const edgeStore = tx.objectStore(STORE_EDGES);
  const subStore = tx.objectStore(STORE_SUBTITLES);

  nodeStore.clear();
  edgeStore.clear();
  subStore.clear();
  for (const n of keepNodes) nodeStore.put(n);
  for (const e of keepEdges) edgeStore.put(e);
  for (const s of keepSubtitles) subStore.put(s);

  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
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
  const tx = db.transaction(STORE_CLIPS, "readwrite");
  const store = tx.objectStore(STORE_CLIPS);
  const existing: VideoClip | undefined = await new Promise((resolve, reject) => {
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  if (!existing) { db.close(); return false; }
  store.delete(id);
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
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

export async function saveSubtitleTrack(track: SubtitleTrack): Promise<void> {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_SUBTITLES, "readwrite");
    tx.objectStore(STORE_SUBTITLES).put(track);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function loadSubtitleTrack(nodeId: string): Promise<SubtitleTrack | null> {
  const db = await openDB();
  const track = await new Promise<SubtitleTrack | undefined>((resolve, reject) => {
    const req = db.transaction(STORE_SUBTITLES, "readonly").objectStore(STORE_SUBTITLES).get(nodeId);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return track || null;
}
