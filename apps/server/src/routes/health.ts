import Router from '@koa/router';

export const healthRouter = new Router({ prefix: '/api/health' });

healthRouter.get('/', (ctx) => {
  ctx.body = {
    ok: true,
    timestamp: new Date().toISOString(),
  };
});

