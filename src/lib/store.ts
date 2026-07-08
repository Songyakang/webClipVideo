import type { VideoClip } from "./types";

const STORAGE_KEY = "video-clips";

function loadClips(): VideoClip[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveClips(clips: VideoClip[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(clips));
}

let clips = loadClips();

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

export function getAllClips(): VideoClip[] {
  return clips.sort((a, b) => b.createdAt - a.createdAt);
}

export function getClipById(id: string): VideoClip | undefined {
  return clips.find((c) => c.id === id);
}

export function addClip(
  data: Omit<VideoClip, "id" | "createdAt">,
): VideoClip {
  const clip: VideoClip = {
    ...data,
    id: generateId(),
    createdAt: Date.now(),
  };
  clips.unshift(clip);
  saveClips(clips);
  return clip;
}

export function deleteClip(id: string): boolean {
  const idx = clips.findIndex((c) => c.id === id);
  if (idx === -1) return false;
  clips.splice(idx, 1);
  saveClips(clips);
  return true;
}

export function updateClip(
  id: string,
  data: Partial<Omit<VideoClip, "id" | "createdAt">>,
): VideoClip | undefined {
  const clip = clips.find((c) => c.id === id);
  if (!clip) return;
  Object.assign(clip, data);
  saveClips(clips);
  return clip;
}

export function searchClips(query: string): VideoClip[] {
  const q = query.toLowerCase();
  return clips
    .filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q) ||
        c.tags.some((t) => t.toLowerCase().includes(q)),
    )
    .sort((a, b) => b.createdAt - a.createdAt);
}
