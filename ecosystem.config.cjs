const path = require('node:path');

module.exports = {
  apps: [
    {
      name: 'web-video-server',
      cwd: path.join(__dirname, 'apps/server'),
      script: 'pnpm',
      args: ['start:watch'],
      watch: ['src', path.join(__dirname, 'packages/shared/src')],
      ignore_watch: ['data', 'dist', 'node_modules', 'storage'],
      watch_delay: 600,
      restart_delay: 800,
      env: {
        NODE_ENV: 'development',
      },
    },
  ],
};
