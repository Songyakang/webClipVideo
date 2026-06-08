## 1. Backend Metadata

- [x] 1.1 为 `MediaAsset` 增加 `durationSeconds` 字段并同步共享类型
- [x] 1.2 在素材上传流程里用 `ffprobe` 探测视频和音频时长
- [x] 1.3 为时长探测失败补充安全回退, 不阻断上传

## 2. Timeline Resize Model

- [x] 2.1 新建视频和音频片段时用素材真实时长填充 `baseDuration`
- [x] 2.2 保持默认展示时长预设, 但允许拖拽手柄向外扩展到真实时长
- [x] 2.3 同步检查器滑杆和片段更新边界, 避免保存时被裁回默认值

## 3. Persistence And Export

- [x] 3.1 确认项目保存和读取保留扩展后的 `trimStart`、`trimEnd`、`baseDuration`
- [x] 3.2 确认导出计划对扩展片段使用正确的 `-ss` 和 `-t`

## 4. Verification

- [ ] 4.1 用超过默认预设长度的视频验证“先缩短再拉长”流程
- [ ] 4.2 用短音频验证不会超出真实素材边界
- [ ] 4.3 验证保存后刷新页面, 片段时长不回退
