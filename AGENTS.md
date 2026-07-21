# AGENTS.md

## 分支约束

当前分支 `editor-tarui` 上的所有更改只提交到 `editor-tarui` 分支，不合并到 `main` 或其他分支。

- 所有 commit 和 push 只允许针对 `editor-tarui`
- 不允许切换到其他分支提交
- 不允许合并到 `main` 或 `master`


## Tauri 本地文件加载

在 Tauri 应用中，不能用 `file://` 协议加载本地文件（受 CSP 限制）。应使用 `lib/assets.ts` 中的工具函数：

- **获取文件系统绝对路径**：`resolveAssetPath(relativePath)` — 供 Rust 命令使用
- **前端展示用 URL**：`getAssetSrc(relativePath)` — 用 `convertFileSrc` 转成 Tauri 资产协议 URL，**不需要读文件进内存**，适用于视频等大文件
- **读取为 blob URL**：`loadAssetUrl(relativePath)` — 读文件内容生成 `blob:` URL，仅适用于小图片

```ts
// 正确：传给 Rust 命令
const fullPath = await resolveAssetPath(videoAssetPath);
await invoke("some_command", { videoPath: fullPath });

// 正确：前端 <video>/<img> 展示（推荐，不占内存）
const src = await getAssetSrc(videoAssetPath);
videoEl.src = src;

// 正确：小图片用 blob URL（也支持）
const blobUrl = await loadAssetUrl(imgAssetPath);
imgEl.src = blobUrl;

// 错误：不要用 file://
videoEl.src = `file://${fullPath}`; // 在 Tauri 中不可用
```

## 技术选型约束

- **组件库**：统一使用 [Radix UI](https://www.radix-ui.com/primitives) 原语组件。若 Radix UI 中没有对应组件，提示用户考虑其他方案（如 shadcn/ui、手动实现等），不要自行引入额外组件库
- **CSS**：使用 Tailwind CSS 编写样式

## 常见陷阱

### 持久化：IndexedDB 存取必须剔除 DOM 引用

`n.data.videoEl`（VideoNode 通过 ref callback 写入的 HTMLVideoElement）无法被 IndexedDB 序列化（DataCloneError），导致整个 `saveCanvas` 事务静默回滚——画布数据从未写入磁盘。保存前必须 strip：

```ts
const { videoEl, ...cleanData } = n.data || {};
```

### 资产加载：视频大文件不要用 blob URL

`loadAssetUrl` 把整个文件读进内存再转 blob URL，大视频会因内存/超时失败。应使用 `getAssetSrc(relativePath)` → 内部调用 Tauri 的 `convertFileSrc` 生成 `http://asset.localhost/...` URL，零内存拷贝。

`convertFileSrc` 需要在 `tauri.conf.json` 配置 assetProtocol scope：
```json
{ "security": { "assetProtocol": { "enable": true, "scope": ["$DOCUMENT/editor-tarui/**"] } } }
```

### 画布恢复：用 assetPath 而非 fileUrl

`fileUrl` 存的是 `blob:` URL，会话结束后失效。画布恢复时必须用 `assetPath`（持久化的相对路径）调用 `getAssetSrc` 重新生成。

### resolveAssetPath("") 返回空字符串

`resolveAssetPath` 内部有 `!relativePath` 判空，空字符串视为 falsy 直接返回 `""`。不要用它取 baseDir，直接用 `resolveAssetPath(relativePath)` 传实际路径。

## 回复风格
- 全程保持中文回复