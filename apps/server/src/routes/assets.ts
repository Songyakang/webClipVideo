import { rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

import Router from '@koa/router';
import type { Context } from 'koa';

import type {
  AssetResponse,
  AssetsResponse,
  MediaAsset,
} from '@web-video/shared';

import { serverConfig } from '../config.js';
import { deleteAsset, getAssetById, insertAsset, listAssets, updateAsset } from '../lib/asset-store.js';
import {
  detectAssetKind,
  ensureDir,
  moveFile,
  safeFilename,
  stripExtension,
  toPosixPath,
} from '../lib/file-utils.js';
import { readProject, writeProject } from '../lib/project-store.js';

type RequestWithFiles = Context['request'] & {
  files?: unknown;
  body?: unknown;
};

type UploadedFile = {
  filepath: string;
  originalFilename?: string | null;
  mimetype?: string | null;
  size: number;
};

const buildAssetsResponse = (items: MediaAsset[]): AssetsResponse => ({
  items,
  mediaBaseUrl: serverConfig.mediaBaseUrl,
});

const buildAssetResponse = (item: MediaAsset): AssetResponse => ({
  item,
  mediaBaseUrl: serverConfig.mediaBaseUrl,
});

const flattenFiles = (input: unknown): UploadedFile[] => {
  if (!input) {
    return [];
  }

  if (Array.isArray(input)) {
    return input.flatMap(flattenFiles);
  }

  if (typeof input === 'object') {
    if ('filepath' in input) {
      return [input as UploadedFile];
    }

    return Object.values(input as Record<string, unknown>).flatMap(flattenFiles);
  }

  return [];
};

const jsonBody = <T extends object>(ctx: Context) => ((ctx.request as RequestWithFiles).body ?? {}) as T;

export const assetsRouter = new Router({ prefix: '/api/assets' });

assetsRouter.get('/', async (ctx) => {
  const search = typeof ctx.query.search === 'string' ? ctx.query.search : undefined;
  const assets = await listAssets(search);
  ctx.body = buildAssetsResponse(assets);
});

assetsRouter.post('/upload', async (ctx) => {
  const files = flattenFiles((ctx.request as RequestWithFiles).files);

  if (files.length === 0) {
    ctx.throw(400, '没拿到上传文件');
  }

  const createdAssets: MediaAsset[] = [];

  for (const file of files) {
    const originalName = safeFilename(file.originalFilename ?? `asset-${Date.now()}`);
    const assetId = randomUUID();
    const assetDir = path.join(serverConfig.libraryDir, assetId);
    const finalPath = path.join(assetDir, originalName);
    const now = new Date().toISOString();

    await ensureDir(assetDir);
    await moveFile(file.filepath, finalPath);
    const kind = detectAssetKind(file.mimetype ?? '');
    const body = (ctx.request as RequestWithFiles).body as Record<string, unknown> | undefined;
    const durationValue = typeof body?.durationSeconds === 'string' ? Number(body.durationSeconds) : body?.durationSeconds;
    const durationSeconds = typeof durationValue === 'number' && Number.isFinite(durationValue) ? durationValue : undefined;

    const asset: MediaAsset = {
      id: assetId,
      title: stripExtension(originalName),
      originalName,
      mimeType: file.mimetype ?? 'application/octet-stream',
      kind,
      size: file.size,
      durationSeconds,
      status: 'ready',
      createdAt: now,
      updatedAt: now,
      files: {
        original: toPosixPath(path.relative(serverConfig.storageRoot, finalPath)),
      },
    };

    await insertAsset(asset);
    createdAssets.push(asset);
  }

  ctx.status = 201;
  ctx.body = buildAssetsResponse(createdAssets);
});

assetsRouter.post('/:assetId/thumbnail', async (ctx) => {
  const asset = await getAssetById(ctx.params.assetId);

  if (!asset) {
    ctx.throw(404, '素材不存在');
    return;
  }

  const files = flattenFiles((ctx.request as RequestWithFiles).files);

  if (files.length === 0) {
    ctx.throw(400, '没收到缩略图文件');
  }

  const file = files[0];
  const outputPath = path.join(serverConfig.derivedDir, `${asset.id}-thumbnail.jpg`);
  const relativeOutputPath = toPosixPath(path.relative(serverConfig.storageRoot, outputPath));

  await ensureDir(serverConfig.derivedDir);
  await moveFile(file.filepath, outputPath);

  const updatedAsset = await updateAsset(asset.id, (currentAsset) => ({
    ...currentAsset,
    status: 'ready',
    updatedAt: new Date().toISOString(),
    files: {
      ...currentAsset.files,
      thumbnail: relativeOutputPath,
    },
  }));

  if (!updatedAsset) {
    ctx.throw(500, '素材更新失败');
    return;
  }

  ctx.body = buildAssetResponse(updatedAsset);
});

assetsRouter.post('/:assetId/transcode', async (ctx) => {
  const asset = await getAssetById(ctx.params.assetId);

  if (!asset) {
    ctx.throw(404, '素材不存在');
    return;
  }

  const files = flattenFiles((ctx.request as RequestWithFiles).files);

  if (files.length === 0) {
    ctx.throw(400, '没收到转码文件');
  }

  const file = files[0];
  const format = file.mimetype === 'video/webm' ? 'webm' : 'mp4';
  const outputPath = path.join(serverConfig.derivedDir, `${asset.id}.${format}`);
  const relativeOutputPath = toPosixPath(path.relative(serverConfig.storageRoot, outputPath));

  await ensureDir(serverConfig.derivedDir);
  await moveFile(file.filepath, outputPath);

  const updatedAsset = await updateAsset(asset.id, (currentAsset) => ({
    ...currentAsset,
    status: 'ready',
    updatedAt: new Date().toISOString(),
    files: {
      ...currentAsset.files,
      transcoded: relativeOutputPath,
    },
  }));

  if (!updatedAsset) {
    ctx.throw(500, '素材更新失败');
    return;
  }

  ctx.body = buildAssetResponse(updatedAsset);
});

assetsRouter.delete('/:assetId', async (ctx) => {
  const asset = await getAssetById(ctx.params.assetId);

  if (!asset) {
    ctx.throw(404, '素材不存在');
    return;
  }

  await Promise.all([
    deleteAsset(asset.id),
    rm(path.join(serverConfig.storageRoot, path.dirname(asset.files.original)), {
      recursive: true,
      force: true,
    }),
    ...[asset.files.thumbnail, asset.files.transcoded]
      .filter((filePath): filePath is string => Boolean(filePath))
      .map((filePath) =>
        rm(path.join(serverConfig.storageRoot, filePath), {
          force: true,
        }),
      ),
  ]);

  const project = await readProject();
  await writeProject({
    name: project.name,
    playheadSeconds: project.playheadSeconds,
    tracks: project.tracks,
    timelineClips: project.timelineClips.filter((clip) => clip.assetId !== asset.id),
  });

  ctx.status = 204;
});
