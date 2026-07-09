import type { VideoClip } from "./types";
import {
  getAllClips as dbGetAll,
  getClipById as dbGetById,
  addClip as dbAdd,
  deleteClip as dbDelete,
  updateClip as dbUpdate,
  searchClips as dbSearch,
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
  return dbDelete(id);
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
