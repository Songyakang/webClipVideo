import { mkdir } from 'node:fs/promises';

import cors from '@koa/cors';
import Koa from 'koa';
import { koaBody } from 'koa-body';
import serve from 'koa-static';

import { serverConfig } from './config.js';
import { assetsRouter } from './routes/assets.js';
import { healthRouter } from './routes/health.js';
import { projectRouter } from './routes/project.js';

const app = new Koa();
const serveMedia = serve(serverConfig.storageRoot);

const bootstrap = async () => {
  await Promise.all([
    mkdir(serverConfig.libraryDir, { recursive: true }),
    mkdir(serverConfig.derivedDir, { recursive: true }),
    mkdir(serverConfig.tempDir, { recursive: true }),
  ]);

  app.use(cors());
  app.use(
    koaBody({
      multipart: true,
      jsonLimit: '10mb',
      formidable: {
        uploadDir: serverConfig.tempDir,
        keepExtensions: true,
        multiples: true,
        maxFileSize: 1024 * 1024 * 1024,
      },
    }),
  );

  app.use(async (ctx, next) => {
    if (!ctx.path.startsWith('/media')) {
      await next();
      return;
    }

    const originalPath = ctx.path;
    ctx.path = ctx.path.slice('/media'.length) || '/';
    await serveMedia(ctx, next);
    ctx.path = originalPath;
  });

  app.use(async (ctx, next) => {
    try {
      await next();
    } catch (error) {
      const message = error instanceof Error ? error.message : '服务开小差了';
      const statusCode =
        typeof (error as { status?: unknown }).status === 'number'
          ? (error as { status: number }).status
          : 500;

      ctx.status = statusCode;
      ctx.body = {
        message,
      };
      ctx.app.emit('error', error, ctx);
    }
  });

  app.use(healthRouter.routes());
  app.use(healthRouter.allowedMethods());
  app.use(assetsRouter.routes());
  app.use(assetsRouter.allowedMethods());
  app.use(projectRouter.routes());
  app.use(projectRouter.allowedMethods());

  app.use((ctx) => {
    ctx.body = {
      name: 'web-video-clip-server',
      docs: {
        health: '/api/health',
        assets: '/api/assets',
        project: '/api/project',
      },
    };
  });

  app.on('error', (error) => {
    console.error('[server] error', error);
  });

  app.listen(serverConfig.port, () => {
    console.log(`[server] listening on http://localhost:${serverConfig.port}`);
  });
};

void bootstrap();
