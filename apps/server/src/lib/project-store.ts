import { readFile, writeFile } from 'node:fs/promises';

import type { ProjectState, TimelineClip, TimelineTrack, UpdateProjectPayload } from '@web-video/shared';

import { serverConfig } from '../config.js';
import { ensureParentDir } from './file-utils.js';

const maxPreviewOffsetPx = 20000;

const defaultProject = (): ProjectState => ({
  version: 1,
  name: '默认项目',
  playheadSeconds: 0,
  tracks: [
    { id: 'V1', label: 'V1', type: 'video', muted: false, disabled: false },
    { id: 'V2', label: 'V2', type: 'video', muted: false, disabled: false },
    { id: 'A1', label: 'A1', type: 'audio', muted: false, disabled: false },
    { id: 'A2', label: 'A2', type: 'audio', muted: false, disabled: false },
    { id: 'T1', label: 'T1', type: 'text', muted: false, disabled: false },
  ],
  timelineClips: [],
  updatedAt: new Date().toISOString(),
});

const sanitizeTrack = (track: TimelineTrack): TimelineTrack | null => {
  if (!track || typeof track !== 'object') {
    return null;
  }

  const id = typeof track.id === 'string' ? track.id.trim() : '';
  const label = typeof track.label === 'string' ? track.label.trim() : '';
  const type =
    track.type === 'audio' ? 'audio' : track.type === 'video' ? 'video' : track.type === 'text' ? 'text' : null;

  if (!id || !label || !type) {
    return null;
  }

  return {
    id,
    label,
    type,
    muted: Boolean(track.muted),
    disabled: Boolean(track.disabled),
  };
};

const sanitizeClip = (clip: TimelineClip): TimelineClip => {
  const trimStart = Number.isFinite(clip.trimStart) ? Math.max(0, clip.trimStart) : 0;
  const baseDuration = Number.isFinite(clip.baseDuration) ? Math.max(1, clip.baseDuration) : 1;
  const trimEnd = Number.isFinite(clip.trimEnd) ? clip.trimEnd : baseDuration;
  const boundedTrimStart = Math.min(trimStart, Math.max(0, baseDuration - 1));
  const boundedTrimEnd = Math.min(baseDuration, Math.max(boundedTrimStart + 1, trimEnd));
  const scalePercent = Number.isFinite(clip.scalePercent) ? Math.min(200, Math.max(20, Number(clip.scalePercent))) : 100;
  const positionXPx = Number.isFinite(clip.positionXPx)
    ? Math.min(maxPreviewOffsetPx, Math.max(-maxPreviewOffsetPx, Number(clip.positionXPx)))
    : 0;
  const positionYPx = Number.isFinite(clip.positionYPx)
    ? Math.min(maxPreviewOffsetPx, Math.max(-maxPreviewOffsetPx, Number(clip.positionYPx)))
    : 0;
  const rotationDegrees = Number.isFinite(clip.rotationDegrees) ? Math.min(180, Math.max(-180, Number(clip.rotationDegrees))) : 0;
  const flipX = Boolean(clip.flipX);
  const text = typeof clip.text === 'string' && clip.text.trim() ? clip.text.trim() : undefined;
  const fontSize = Number.isFinite(clip.fontSize) ? Math.min(200, Math.max(8, Number(clip.fontSize))) : undefined;
  const fontColor = typeof clip.fontColor === 'string' && clip.fontColor.trim() ? clip.fontColor.trim() : undefined;

  return {
    id: clip.id,
    assetId: typeof clip.assetId === 'string' && clip.assetId.trim() ? clip.assetId.trim() : undefined,
    trackId: clip.trackId,
    offsetSeconds: Number.isFinite(clip.offsetSeconds) ? Math.max(0, clip.offsetSeconds) : 0,
    trimStart: boundedTrimStart,
    trimEnd: boundedTrimEnd,
    baseDuration,
    scalePercent,
    positionXPx,
    positionYPx,
    rotationDegrees,
    flipX,
    text,
    fontSize,
    fontColor,
  };
};

export const readProject = async (): Promise<ProjectState> => {
  try {
    const raw = await readFile(serverConfig.projectFile, 'utf8');
    const parsed = JSON.parse(raw) as Partial<ProjectState> | null;

    if (!parsed || typeof parsed !== 'object') {
      return defaultProject();
    }

    const fallbackProject = defaultProject();
    const parsedTracks = Array.isArray(parsed.tracks)
      ? parsed.tracks
          .map((track) => sanitizeTrack(track as TimelineTrack))
          .filter((track): track is TimelineTrack => track !== null)
      : fallbackProject.tracks;

    const tracks = parsedTracks.length > 0 ? parsedTracks : fallbackProject.tracks;

    return {
      version: 1,
      name: typeof parsed.name === 'string' && parsed.name.trim() ? parsed.name : '默认项目',
      playheadSeconds:
        typeof parsed.playheadSeconds === 'number' && Number.isFinite(parsed.playheadSeconds)
          ? Math.max(0, parsed.playheadSeconds)
          : 0,
      tracks,
      timelineClips: Array.isArray(parsed.timelineClips)
        ? parsed.timelineClips.map((clip) => sanitizeClip(clip as TimelineClip))
        : [],
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date().toISOString(),
    };
  } catch (error) {
    const maybeErrno = error as NodeJS.ErrnoException;

    if (maybeErrno.code === 'ENOENT') {
      return defaultProject();
    }

    throw error;
  }
};

export const writeProject = async (payload: UpdateProjectPayload) => {
  const fallbackTracks = defaultProject().tracks;
  const tracks = payload.tracks
    .map(sanitizeTrack)
    .filter((track): track is TimelineTrack => track !== null);

  const project: ProjectState = {
    version: 1,
    name: payload.name?.trim() || '默认项目',
    playheadSeconds: Number.isFinite(payload.playheadSeconds) ? Math.max(0, payload.playheadSeconds) : 0,
    tracks: tracks.length > 0 ? tracks : fallbackTracks,
    timelineClips: payload.timelineClips.map(sanitizeClip),
    updatedAt: new Date().toISOString(),
  };

  await ensureParentDir(serverConfig.projectFile);
  await writeFile(serverConfig.projectFile, JSON.stringify(project, null, 2));
  return project;
};
