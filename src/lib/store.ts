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
  deleteSubtitleTrack as dbDeleteTrack,
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
  if (ok) {
    // Clean up canvas, subtitles, and asset files
    dbClearCanvas().catch((err) => console.error("Failed to clear canvas:", err));
    deleteProjectAssets(id).catch((err) =>
      console.error("Failed to clean up project assets:", err)
    );
  }
  return ok;
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

export async function deleteSubtitleTrack(nodeId: string): Promise<void> {
  return dbDeleteTrack(nodeId);
}
