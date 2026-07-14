# AGENTS.md

## 分支约束

当前分支 `editor-tarui` 上的所有更改只提交到 `editor-tarui` 分支，不合并到 `main` 或其他分支。

- 所有 commit 和 push 只允许针对 `editor-tarui`
- 不允许切换到其他分支提交
- 不允许合并到 `main` 或 `master`


## Tauri 本地文件加载

在 Tauri 应用中，不能用 `file://` 协议加载本地文件（受 CSP 限制）。应使用 `lib/assets.ts` 中的工具函数：

- **获取文件系统绝对路径**：`resolveAssetPath(relativePath)` — 返回 `/Users/xxx/Documents/editor-tarui/assets/...`，用于传给 Rust 命令
- **加载为 blob URL（前端展示用）**：`loadAssetUrl(relativePath)` — 读取文件内容生成 `blob:` URL，用于 `<video>`、`<img>` 等元素的 `src`

```ts
// 正确：传给 Rust 命令
const fullPath = await resolveAssetPath(videoAssetPath);
await invoke("some_command", { videoPath: fullPath });

// 正确：前端 <video>/<img> 展示
const blobUrl = await loadAssetUrl(videoAssetPath);
videoEl.src = blobUrl;

// 错误：不要用 file://
videoEl.src = `file://${fullPath}`; // 在 Tauri 中不可用
```

## 回复风格
- 全程保持中文回复