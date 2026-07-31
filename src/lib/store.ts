import type { VideoClip, SubtitleTrack } from "./types";
import type { TimelineData } from "../pages/detail/timeline/types";
import { showToast } from "./toast";
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
  dbSaveTimeline,
  dbLoadTimeline,
  dbDeleteTimeline,
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
  dbClearCanvas(id).catch((e) => {
    console.error("clearCanvas failed:", e);
    showToast("清理画布数据失败", "error");
  });
  deleteProjectAssets(id).catch((e) => {
    console.error("deleteProjectAssets failed:", e);
    showToast("删除项目资源失败", "error");
  });

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

export async function saveTimeline(projectId: string, data: TimelineData): Promise<void> {
  return dbSaveTimeline({ projectId, data, updatedAt: Date.now() });
}

export async function loadTimeline(projectId: string): Promise<TimelineData | null> {
  const record = await dbLoadTimeline(projectId);
  return record?.data ?? null;
}

export async function deleteTimeline(projectId: string): Promise<void> {
  return dbDeleteTimeline(projectId);
}
