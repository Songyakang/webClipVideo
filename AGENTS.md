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

## SQLite 存储约束

- **按功能分库**：持久化配置和业务数据统一存放在应用数据目录的 `sqlite/` 文件夹中，按功能划分独立 `.db` 文件。禁止将不同功能重新集中到一个 `data.db`，或将配置继续写入 `config.json`、`localStorage`。
- **目录位置**：macOS 为 `~/Documents/editor-tarui/sqlite/`，Linux 为 `~/.local/share/editor-tarui/sqlite/`，Windows 为 `%APPDATA%/editor-tarui/sqlite/`。路径由后端统一解析，前端通过 Tauri 命令读写。
- **职责划分**：

  | 数据库 | 职责 |
  | --- | --- |
  | `config.db` | API Key、自定义平台、接口参数、用户偏好（包括上次选择的平台） |
  | `projects.db` | 项目列表和项目信息 |
  | `canvas.db` | 画布节点、分组、连线 |
  | `subtitles.db` | 字幕内容和状态 |
  | `timeline.db` | 时间线编辑数据 |

- **功能隔离**：各数据库使用独立连接和锁；表结构与迁移代码按功能组织在 `src-tauri/src/sqlite/` 下。新增功能应归入职责匹配的数据库，独立业务域应新增对应数据库及模块，不能为方便而写入无关功能的库。
- **避免跨库耦合**：运行时禁止使用 ATTACH、跨库 JOIN 或跨库事务连接业务；跨功能操作由应用层协调各自的存储接口。
- **兼容旧数据**：旧 `data.db`、`config.json` 和相关 `localStorage` 值只作为一次性迁移来源。每个目标库的导入及完成标记必须在同一事务内提交，失败可重试；已有目标数据优先，完成后不得重复导入或恢复已删除数据。旧文件保留，不再日常读写；旧 `localStorage` 值仅在 SQLite 保存成功后清理。
- **迁移验证**：数据库结构或迁移逻辑变更需验证数据保留、功能隔离、失败回滚、重复执行及重新打开数据库后的持久化结果，测试使用临时数据库，不操作真实用户数据。

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
