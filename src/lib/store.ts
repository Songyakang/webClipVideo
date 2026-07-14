import type { VideoClip, SubtitleTrack } from "./types";
import { deleteProjectAssets } from "./assets";
import {
  getAllClips as dbGetAll,
  getClipById as dbGetById,
  addClip as dbAdd,
  deleteClip as dbDelete,
  updateClip as dbUpdate,
  searchClips as dbSearch,
  saveSubtitleTrack as dbSaveTrack,
  loadSubtitleTrack as dbLoadTrack,
  clearCanvas as dbClearCanvas,
} from "./db";

export async function getAllClips(): Promise<VideoClip[]> {
  return dbGetAll();
}

export async function getClipById(id: string): Promise<VideoClip | undefined> {
  return dbGetById(id);
}

export async function addClip(
  data: Omit<VideoClip, "id" | "createdAt">,
): Promise<VideoClip> {
  return dbAdd(data);
}

export async function deleteClip(id: string): Promise<boolean> {
  const ok = await dbDelete(id);
  if (!ok) return false;

  // Cascade cleanup (non-blocking): canvas + subtitles + asset files
  dbClearCanvas().catch((e) => console.error("clearCanvas failed:", e));
  deleteProjectAssets(id).catch((e) => console.error("deleteProjectAssets failed:", e));

  return true;
}

export async function updateClip(
  id: string,
  data: Partial<Omit<VideoClip, "id" | "createdAt">>,
): Promise<VideoClip | undefined> {
  return dbUpdate(id, data);
}

export async function searchClips(query: string): Promise<VideoClip[]> {
  return dbSearch(query);
}

export async function saveSubtitleTrack(track: SubtitleTrack): Promise<void> {
  return dbSaveTrack(track);
}

export async function loadSubtitleTrack(nodeId: string): Promise<SubtitleTrack | null> {
  return dbLoadTrack(nodeId);
}
