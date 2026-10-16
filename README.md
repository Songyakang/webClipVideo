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
- 文本生成 3D 动画体验（场景描述 → 几何组合建模 → 关键帧动画）
- 3D 资产库体验（应用内导入 GLB / Blend、整理依赖、预览与版本登记）

### 3D 资产库体验

入口：首页 → 体验功能 → 3D 资产库（`/experiments/assets3d`）。点击「导入 3D 资产」或拖入文件，检查 Collection、尺寸倍率、朝向与缺失贴图，再点击「整理模型并生成预览」。完成后确认名称、分类、标签、来源以及人工确认的能力，点击「确认入库」。支持搜索、修改信息、停用、复用重复资产以及为已有资产创建新版本。

原始文件不被修改。正式产物位于画布素材目录的 `assets/3d-library/<资产ID>/<版本ID>/`，包含源文件、依赖、制作版 `.blend` 和可用的 GLB/缩略图；索引和导入任务独立存放在 `sqlite/assets3d.db`。这些模型属于长期素材，不是可随意清理的缓存。备份时应同时保留素材目录和数据库。

导入使用独立 Blender 后台进程，不依赖交互窗口的 MCP 连接，也不覆盖正在编辑的场景。macOS 默认查找 `/Applications/Blender.app/Contents/MacOS/Blender`；其他系统要求 `blender` 在 PATH 中。新增了 Tauri 原生文件选择插件，更新后需要重启桌面开发进程，单独刷新前端不会加载新增后端命令。

当前交付为第一阶段导入与管理主流程，尚未接入文本生成场景的资产匹配或正式视频渲染。预览使用现有 Orillusion/WebGPU；GLB 转换失败时保留 Blender 制作版本。动作片段仅检测、不宣称已验证；UDIM、序列和视频纹理会提示需要处理。复杂链接库、跨 Collection 约束和生产级角色仍需专项验收。完整边界与测试记录见 [方案文档](docs/plans/3d-asset-library-plan.md)。

### 文本生成 3D 动画体验

入口：首页 → 体验功能 → 文本生成 3D 动画（`/experiments/text-scene`）。在桌面应用的「设置」中配置文本平台后，输入主体、环境、动作和期望时长，点击「生成 3D 场景与动画」。支持播放、暂停、拖动进度和回到开头；失败或取消重新生成会保留上一版场景。

该功能复用现有文本平台、Tauri LLM 请求与取消机制，使用现有 `@orillusion/core` / WebGPU 渲染。模型返回结构化场景数据，由后端验证后搭建；不执行模型输出的代码。物体由立方体、球体、圆柱和圆锥组合，动画通过位置、旋转和缩放关键帧实现，镜头支持相机位置和朝向关键帧。Blender 输出是预览的模型与动画来源：前端不再按原始场景 JSON 重算动作、检查人物/地面零件或自动剖墙。当前 Orillusion 导入器未实现普通 glTF 动画和相机实例化，因此使用兼容层读取 GLB 内的 TRS 轨道与相机参数，支持 LINEAR/STEP、四元数插值、播放/暂停与任意跳转；相机局部 -Z 朝向转换为引擎的 +Z。复杂骨骼、变形和未烘焙曲线不在当前生成范围内。

当前体验范围：描述最多 4000 字、时长 1～60 秒、最多 24 个物体、每个物体最多 32 个零件，总计最多 256 个几何零件。不支持精细雕刻、骨骼动画或物理模拟。需要 WebGPU；不支持时会提示并提供重试。生成后由本地 Blender MCP 创建独立场景、导出 `.blend` 和 `.glb` 到应用资产目录，页面使用现有 Orillusion/WebGPU 加载 GLB 预览；平台选择沿用 `config.db` 持久化。Blender 建模期间需保持 Blender 打开，当前任务不会覆盖用户正在编辑的场景。

## 技术栈

- 前端: React 19 + TypeScript + Vite
- 桌面框架: Tauri 2 (Rust)
- 画布: @xyflow/react
- 3D 渲染: @orillusion/core (WebGPU)
- 数据存储: IndexedDB

## 依赖

### 系统依赖（必须预先安装）

| 依赖 | 用途 |
|---|---|
| **ffmpeg** + **ffprobe** | 视频/音频处理：提取音频、烧录字幕、裁剪、编码 PNG 序列、变速、缩略图生成 |
| **Python** 3.10+ | 运行 Python CLI 脚本（inpainting、声音提取、TTS） |
| **Rust** 工具链 (rustc, cargo) | 编译 Tauri 后端 |
| **Node.js** + **pnpm** | 前端包管理和构建 |
| **whisper-cli** (whisper.cpp) | 语音识别 / 字幕生成（期望路径 `~/whisper.cpp/build/bin/whisper-cli`） |
| **whisper 模型** (`ggml-medium.bin`) | ASR 模型文件（期望路径 `~/whisper.cpp/models/ggml-medium.bin`） |
| **WebGPU** 兼容 GPU | 3D 导演台渲染 |

### NPM 依赖

**生产依赖:**

| 包 | 版本 | 用途 |
|---|---|---|
| `@orillusion/core` | ^0.9.1 | WebGPU 3D 引擎 |
| `@radix-ui/react-select` | ^2.3.3 | 无障碍下拉选择组件 |
| `@radix-ui/react-toggle-group` | ^1.1.15 | 切换按钮组 |
| `@radix-ui/react-tooltip` | ^1.2.12 | 提示框组件 |
| `@tailwindcss/vite` | ^4.3.3 | Tailwind CSS Vite 插件 |
| `@tauri-apps/api` | ^2 | Tauri 前端 API |
| `@tauri-apps/plugin-fs` | ^2.5.1 | Tauri 文件系统插件 |
| `@tauri-apps/plugin-opener` | ^2 | Tauri 打开文件/URL 插件 |
| `@types/dagre` | ^0.7.54 | dagre 类型定义 |
| `@xyflow/react` | ^12.11.2 | 节点图/画布组件 |
| `dagre` | ^0.8.5 | 图布局算法（节点自动排列） |
| `react` | ^19.1.0 | UI 框架 |
| `react-dom` | ^19.1.0 | React DOM 渲染 |
| `react-router-dom` | ^7.18.1 | 前端路由 |
| `tailwindcss` | ^4.3.3 | 原子化 CSS 框架 |

**开发依赖:**

| 包 | 版本 | 用途 |
|---|---|---|
| `@tauri-apps/cli` | ^2 | Tauri 构建命令行工具 |
| `@testing-library/jest-dom` | ^6.9.1 | DOM 测试匹配器 |
| `@testing-library/react` | ^16.3.2 | React 组件测试工具 |
| `@types/react` | ^19.1.8 | React 类型定义 |
| `@types/react-dom` | ^19.1.6 | ReactDOM 类型定义 |
| `@vitejs/plugin-react` | ^4.6.0 | Vite React 插件 |
| `jsdom` | ^29.1.1 | 测试用 DOM 环境 |
| `typescript` | ~5.8.3 | TypeScript 编译器 |
| `vite` | ^7.0.4 | 构建工具和开发服务器 |
| `vitest` | ^4.1.10 | 单元测试运行器 |

### Rust/Cargo 依赖

| Crate | 版本 | 用途 |
|---|---|---|
| `tauri` | 2 | 桌面应用框架 |
| `tauri-plugin-opener` | 2 | 打开 URL/文件 |
| `tauri-plugin-fs` | 2 | 文件系统访问 |
| `serde` | 1 | 序列化/反序列化 |
| `serde_json` | 1 | JSON 解析 |
| `reqwest` | 0.12 | HTTP 客户端（调用外部 API） |
| `tokio` | 1 | 异步运行时 |
| `base64` | 0.22 | Base64 编解码 |

### Python 依赖

> Python 依赖已全部可选。核心功能已迁移至 Rust：
> - **inpainting** → 纯 Rust (`image` + `imageproc` crates)
> - **TTS** → StepFun API / Edge TTS (Rust WebSocket)
> - **音色转换** → StepFun 音色复刻预览 API
> - **说话人识别** → Rust ONNX Runtime (`ort` crate)，降级时用 Python
>
> 仅 `scripts/export_campp_onnx.py` 需在首次使用时运行一次导出 CAM++ ONNX 模型。
>
> 如需 Python 降级支持，安装以下包：
>
> | 包 | 用途 |
> |---|---|
> | **torch** + **modelscope** | CAM++ 说话人 embedding（降级 fallback） |
> | **onnxruntime** | ONNX 模型验证 |
> | **openvoice** | 音色转换（已废弃，被 StepFun 替代） |
>
> ```bash
> python3 -m venv venv && source venv/bin/activate
> pip install torch modelscope onnxruntime
> # openvoice / opencv-python / edge-tts / soundfile / librosa 不再需要
> ```

```bash
python3 -m venv venv
source venv/bin/activate
pip install torch numpy opencv-python soundfile librosa modelscope edge-tts onnxruntime
```

> **注意**: `openvoice` 需要从 [OpenVoice 仓库](https://github.com/myshell-ai/OpenVoice) 额外下载预训练模型，放置于 `~/whisper.cpp/models/openvoice/` 目录下。

### 外部 API 服务

| 服务 | 端点 | 用途 | 需配置 Key |
|---|---|---|---|
| **StepFun API** | `api.stepfun.com/v1` | 图片生成/编辑、反向提示词、**TTS 语音合成**、**音色复刻** | `stepfun_api_key` |
| **Tripo3D API** | `openapi.tripo3d.com/v3` | 图片转 3D 模型 | `tripo_api_key` |
| **DeepSeek API** | `api.deepseek.com/v1` | 提示词优化 | `deepseek_api_key` |
| **Microsoft Edge TTS** | WebSocket (Rust 直连) | TTS 降级方案（当 StepFun 不可用时） | 免费，无需 Key |

API Key 存放于项目根目录（或上级目录）的 `config.json` 中，格式：

```json
{
  "stepfun_api_key": "sk-...",
  "tripo_api_key": "...",
  "deepseek_api_key": "sk-..."
}
```

## 运行

```bash
# 安装前端依赖
pnpm install

# 启动开发模式
pnpm tauri dev
```

需要 Rust 环境和 Tauri CLI。

低多边形质量：零件支持 `metallic`（0～1）、`roughness`（0.04～1）、`bevel`（0～0.1 米，0 关闭倒角）。Blender 将尺寸烘焙进网格后倒角，避免细长物体倒角变形；不提供这些可选字段的旧场景保持兼容。导出文件直接保存在画布素材目录 `assets/blender/<job_id>/`，没有临时目录中转。实时预览使用项目灯光和阴影，GLB 不包含 Blender 世界环境和面积光，不能保证与 Blender 离线渲染逐像素一致。
