# MP4 拼接重写 & 撤销/重做 — 设计文档

日期：2026-07-02

---

## 一、背景

当前 `mp4-concat.ts` 手工解析 MP4 box 二进制结构拼接片段，依赖所有片段同分辨率、同帧率、同编码参数，异构片段产出坏文件。同时整个编辑器没有任何撤销能力，切割、删除、合并、拖动操作不可逆。

本次改进聚焦两个目标：**拼接输出可靠**、**操作可撤销**。

---

## 二、MP4 重编码合并（WebCodecs + mp4-muxer）

### 2.1 架构

```
选中片段 → transcodeToMp4(各段) → 解码帧 → 统一处理 → 重编码 → mp4-muxer → 单一 MP4
```

### 2.2 新增模块 `src/lib/recoder.ts`

核心函数 `concatWithWebCodecs(clips)`，负责完整管线。

**阶段 1：逐段解码**
- 每个片段的 MP4 buffer 解出 `EncodedVideoChunk`
- `VideoDecoder` 输出 `VideoFrame[]`
- 保留每个帧的原始 timestamp

**阶段 2：统一处理**
- 以第一个片段的宽高、帧率为基准
- 后续片段帧如果分辨率不同，用 OffscreenCanvas 缩放至统一尺寸
- 重新分配 timestamp，保证帧序列连续

**阶段 3：重编码 + 封装**
- `VideoEncoder`（H.264）重新编码所有 `VideoFrame`
- `mp4-muxer` 接收 `EncodedVideoChunk[]` 输出单一 `Uint8Array`
- 如有音频轨，`AudioDecoder` + `AudioEncoder` 同样走一遍，与视频轨一同送入 muxer

### 2.3 错误处理

- 浏览器不支持 WebCodecs → 提示"请使用 Chrome/Edge 94+ 浏览器"
- 单段解码失败 → 跳过该段，继续合并其余段
- 编码超过 60s → 显示进度并允许取消

### 2.4 改动清单

| 文件 | 改动 |
|------|------|
| `src/lib/recoder.ts` | 新增，核心重编码管线 |
| `src/lib/mp4-concat.ts` | 删除 |
| `src/components/timeline-panel.ts` | `_mergeSelectedClips` 调用 `concatWithWebCodecs` |
| `package.json` | 新增 `mp4-muxer` 依赖 |

### 2.5 性能预估

- 1080p/30fps 视频：约 0.3–0.5x 实时
- 10 分钟合并 ≈ 3–5 分钟完成

---

## 三、撤销/重做（快照栈）

### 3.1 方案选择

选快照栈而非指令模式。原因：操作种类少（切/删/合/拖），状态结构简单。快照最可靠，不会有指令反操作逻辑写错的风险。

### 3.2 数据结构

```typescript
interface HistoryEntry {
  project: ProjectState;
  mergedAssetId?: string;   // 合并操作产生的新 asset，撤销时需清理
  timestamp: number;        // 500ms 内同一操作不重复入栈
}
```

两个栈，最多各 50 层：
- `_undoStack: HistoryEntry[]`
- `_redoStack: HistoryEntry[]`

### 3.3 入栈时机

| 操作 | 入栈 | 备注 |
|------|------|------|
| 切割 | 切割前 | |
| 删除 | 删除前 | 被删 asset 暂不物理删除 |
| 合并 | 合并前 | 记录 `mergedAssetId` 供撤销清理 |
| 拖动 | 松手前 | 同一片段连续拖动 debounce，不重复入栈 |

### 3.4 合并的撤销

撤销合并时：
1. 恢复 `HistoryEntry.project`（原片段列表）
2. 调用 `deleteAssetAndFile(mergedAssetId)` 清理合并产物

### 3.5 快捷键

- `Ctrl+Z` — 撤销
- `Ctrl+Shift+Z` / `Ctrl+Y` — 重做

### 3.6 新增模块 `src/lib/history.ts`

```typescript
class HistoryManager {
  save(project: ProjectState, meta?: { mergedAssetId?: string }): void
  undo(): HistoryEntry | null
  redo(): HistoryEntry | null
  get canUndo(): boolean
  get canRedo(): boolean
}
```

### 3.7 改动清单

| 文件 | 改动 |
|------|------|
| `src/lib/history.ts` | 新增，HistoryManager |
| `src/components/timeline-panel.ts` | 操作前调 `history.save()`，键盘绑定 undo/redo，通过事件与父组件通信 |
| `src/video-clip-editor.ts` | 接收 undo/redo 事件，恢复 project 状态和 asset 列表 |
| `src/lib/store.ts` | 新增 `deleteAssetAndFile()` 方法 |

---

## 四、自检清单

- [x] 无 TBD / TODO 占位符
- [x] recoder.ts 与 history.ts 职责清晰，互不依赖
- [x] 两个功能独立：可以先实现一个，另一个不受影响
- [x] 浏览器兼容性明确（WebCodecs 需 Chrome 94+）
- [x] 性能预期有量化指标
- [x] 所有改动文件列出，无遗漏
