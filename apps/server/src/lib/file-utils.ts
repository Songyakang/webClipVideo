import { copyFile, mkdir, rename, rm } from 'node:fs/promises';
import path from 'node:path';

import type { AssetKind } from '@web-video/shared';

export const ensureDir = async (targetPath: string) => {
  await mkdir(targetPath, { recursive: true });
};

export const ensureParentDir = async (targetPath: string) => {
  await ensureDir(path.dirname(targetPath));
};

export const moveFile = async (fromPath: string, toPath: string) => {
  await ensureParentDir(toPath);

  try {
    await rename(fromPath, toPath);
  } catch (error) {
    const maybeErrno = error as NodeJS.ErrnoException;

    if (maybeErrno.code !== 'EXDEV') {
      throw error;
    }

    await copyFile(fromPath, toPath);
    await rm(fromPath, { force: true });
  }
};

export const toPosixPath = (inputPath: string) => inputPath.split(path.sep).join('/');

export const safeFilename = (inputName: string) => {
  const trimmed = inputName.trim();
  const sanitized = trimmed.replace(/[\\/:*?"<>|]/g, '-');
  return sanitized || 'untitled-file';
};

export const stripExtension = (inputName: string) => {
  const parsed = path.parse(inputName);
  return parsed.name || inputName;
};

export const detectAssetKind = (mimeType: string): AssetKind => {
  if (mimeType.startsWith('image/')) {
    return 'image';
  }

  if (mimeType.startsWith('video/')) {
    return 'video';
  }

  if (mimeType.startsWith('audio/')) {
    return 'audio';
  }

  return 'other';
};

