# webVideoClip - 视频剪辑编辑器

基于 Tauri + React + TypeScript 的桌面端视频剪辑工具。

## 功能

- 可视化节点画布编辑（基于 @xyflow/react）
- 视频/图片节点管理
- 字幕生成与编辑（ASR）
- 语音提取与合成（TTS）
- 内嵌字幕擦除
- 图片转 3D 模型（Tripo API）
- 3D 导演台预览（基于 Orillusion WebGPU 引擎）

## 技术栈

- 前端: React 19 + TypeScript + Vite
- 桌面框架: Tauri 2 (Rust)
- 画布: @xyflow/react
- 3D 渲染: @orillusion/core (WebGPU)
- 数据存储: IndexedDB

## 运行

```bash
pnpm install
pnpm tauri dev
```

需要 Rust 环境和 Tauri CLI。
