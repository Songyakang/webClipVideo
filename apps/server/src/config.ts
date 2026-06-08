import path from 'node:path';

export const serverConfig = {
  port: Number(process.env.PORT ?? 4000),
  storageRoot: path.resolve(process.cwd(), 'storage'),
  libraryDir: path.resolve(process.cwd(), 'storage/library'),
  derivedDir: path.resolve(process.cwd(), 'storage/derived'),
  tempDir: path.resolve(process.cwd(), 'storage/tmp'),
  dataFile: path.resolve(process.cwd(), 'data/assets.json'),
  projectFile: path.resolve(process.cwd(), 'data/project.json'),
  mediaBaseUrl:
    process.env.MEDIA_BASE_URL ?? `http://localhost:${Number(process.env.PORT ?? 4000)}/media`,
} as const;
