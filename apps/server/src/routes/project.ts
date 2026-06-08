import Router from '@koa/router';
import type { Context } from 'koa';

import type {
  ProjectResponse,
  UpdateProjectPayload,
} from '@web-video/shared';

import { readProject, writeProject } from '../lib/project-store.js';

type RequestWithBody = Context['request'] & {
  body?: unknown;
};

const jsonBody = <T extends object>(ctx: Context) => ((ctx.request as RequestWithBody).body ?? {}) as T;

export const projectRouter = new Router({ prefix: '/api/project' });

projectRouter.get('/', async (ctx) => {
  const response: ProjectResponse = {
    project: await readProject(),
  };
  ctx.body = response;
});

projectRouter.put('/', async (ctx) => {
  const payload = jsonBody<UpdateProjectPayload>(ctx);

  if (!Array.isArray(payload.timelineClips)) {
    ctx.throw(400, 'timelineClips 必须是数组');
    return;
  }

  if (!Array.isArray(payload.tracks)) {
    ctx.throw(400, 'tracks 必须是数组');
    return;
  }

  const project = await writeProject(payload);
  const response: ProjectResponse = { project };
  ctx.body = response;
});

