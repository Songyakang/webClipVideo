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
