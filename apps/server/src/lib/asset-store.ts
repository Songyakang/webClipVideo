import { readFile, writeFile } from 'node:fs/promises';

import type { MediaAsset } from '@web-video/shared';

import { serverConfig } from '../config.js';
import { ensureParentDir } from './file-utils.js';

const sortByCreatedAt = (assets: MediaAsset[]) =>
  [...assets].sort((left, right) => right.createdAt.localeCompare(left.createdAt));

const readAssets = async (): Promise<MediaAsset[]> => {
  try {
    const raw = await readFile(serverConfig.dataFile, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as MediaAsset[]) : [];
  } catch (error) {
    const maybeErrno = error as NodeJS.ErrnoException;

    if (maybeErrno.code === 'ENOENT') {
      return [];
    }

    throw error;
  }
};

const writeAssets = async (assets: MediaAsset[]) => {
  await ensureParentDir(serverConfig.dataFile);
  await writeFile(serverConfig.dataFile, JSON.stringify(sortByCreatedAt(assets), null, 2));
};

export const listAssets = async (search?: string) => {
  const assets = await readAssets();

  if (!search?.trim()) {
    return sortByCreatedAt(assets);
  }

  const keyword = search.trim().toLowerCase();
  return sortByCreatedAt(
    assets.filter((asset) =>
      [asset.title, asset.originalName, asset.mimeType].some((field) =>
        field.toLowerCase().includes(keyword),
      ),
    ),
  );
};

export const getAssetById = async (assetId: string) => {
  const assets = await readAssets();
  return assets.find((asset) => asset.id === assetId) ?? null;
};

export const insertAsset = async (asset: MediaAsset) => {
  const assets = await readAssets();
  assets.push(asset);
  await writeAssets(assets);
  return asset;
};

export const updateAsset = async (
  assetId: string,
  updater: (asset: MediaAsset) => MediaAsset,
) => {
  const assets = await readAssets();
  const index = assets.findIndex((asset) => asset.id === assetId);

  if (index === -1) {
    return null;
  }

  const updatedAsset = updater(assets[index]);
  assets[index] = updatedAsset;
  await writeAssets(assets);
  return updatedAsset;
};

export const deleteAsset = async (assetId: string) => {
  const assets = await readAssets();
  const asset = assets.find((currentAsset) => currentAsset.id === assetId) ?? null;

  if (!asset) {
    return null;
  }

  await writeAssets(assets.filter((currentAsset) => currentAsset.id !== assetId));
  return asset;
};
