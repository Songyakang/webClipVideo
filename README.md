# webVideoClip

一个开箱即用的素材库骨架:

- 后端: `Koa2 + TypeScript`
- 前端: `React + Vite`
- 素材库: 本地文件上传, 元数据 JSON 存储
- 视频处理: 直接调用系统 `ffmpeg`

## 目录

```txt
apps/
  server/   Koa2 服务, 上传和 ffmpeg 任务
  web/      React 素材库界面
packages/
  shared/   前后端共享类型
```

## 快速开始

1. 安装依赖

```bash
pnpm install
```

2. 安装 `ffmpeg`

```bash
brew install ffmpeg
```

3. 启动开发环境

```bash
pnpm dev
```

- 前端默认: `http://localhost:5173`
- 后端默认: `http://localhost:4000`
- 后端开发模式由 `PM2 watch` 托管, 监听 `apps/server/src` 和 `packages/shared/src`

## PM2 后端命令

```bash
pnpm pm2:server
pnpm pm2:server:restart
pnpm pm2:server:stop
pnpm pm2:server:logs
```

## 已带能力

- 上传多个素材文件
- 按名称搜索素材
- 自动保存素材元数据
- 支持新增多条视频/音频轨
- 右键轨道可删除、重命名、静音、禁用
- 使用拖拽调整轨道顺序
- 生成视频缩略图
- 转码输出 `mp4` 或 `webm`
- 直接预览图片和视频

## 关键接口

- `GET /api/health`
- `GET /api/assets`
- `POST /api/assets/upload`
- `POST /api/assets/:assetId/thumbnail`
- `POST /api/assets/:assetId/transcode`
- `GET /api/project`
- `PUT /api/project`
- `GET /api/project/export-plan`

## 环境变量

参考 `apps/server/.env.example`

- `PORT`: 服务端口
- `FFMPEG_BIN`: `ffmpeg` 可执行文件路径
- `FFPROBE_BIN`: `ffprobe` 可执行文件路径
- `MEDIA_BASE_URL`: 对外暴露的素材访问前缀

## 存储说明

- 上传原文件: `apps/server/storage/library`
- ffmpeg 派生文件: `apps/server/storage/derived`
- 元数据文件: `apps/server/data/assets.json`
- 项目时间线文件: `apps/server/data/project.json`
