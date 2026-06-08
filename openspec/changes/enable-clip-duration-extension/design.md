## Overview

当前模型把“片段当前展示时长”和“素材可用源时长”混成了一个 `baseDuration`。这个设计会把所有新建视频片段锁死在 8 秒, 音频锁死在 10 秒, 所以只能缩短, 没法延长。

这次改动保留现有 `trimStart` / `trimEnd` 模型, 但把 `baseDuration` 明确定义成“素材可用于修剪的最大源时长”。前端默认仍只展示一个较短片段, 只是允许用户继续往右或往左扩展到素材真实边界。

## Data Model

- 给 `MediaAsset` 增加 `durationSeconds?: number`
- 视频、音频上传后通过 `ffprobe` 读取真实时长
- 新建时间线片段时:
  - `baseDuration = asset.durationSeconds ?? defaultClipDuration(asset)`
  - `trimStart = 0`
  - `trimEnd = min(defaultClipDuration(asset), baseDuration)`

## Backend Changes

- 在上传阶段探测视频、音频素材时长并写入素材存储
- 已有导出逻辑继续使用 `trimStart` 和 `trimEnd - trimStart`, 但前提是项目里保存的 `baseDuration` 已经是真实时长
- 项目读写的 sanitize 逻辑继续以 `baseDuration` 作为上界, 不再把扩展后的片段裁回默认预设

## Frontend Changes

- 时间线新建片段时使用素材真实时长作为最大修剪边界
- 左右拖拽手柄的边界改为基于 `baseDuration`
- 检查器里“修剪入点 / 修剪出点”的滑杆边界同步改成真实时长
- 片段被缩短后, 用户可以再次把它拉长到素材真实边界

## Risks

- 老素材没有 `durationSeconds` 时仍会退回默认预设, 需要允许前端平滑兼容
- `ffprobe` 失败时不能阻断上传, 但要回退到当前默认时长策略
- 极短素材要保证 `trimEnd >= trimStart + 1`
