# 按功能划分的 SQLite 存储

运行时数据目录：

- macOS：`~/Documents/editor-tarui/sqlite/`
- Linux：`~/.local/share/editor-tarui/sqlite/`
- Windows：`%APPDATA%/editor-tarui/sqlite/`

| 文件 | 业务表 | 职责 |
| --- | --- | --- |
| `config.db` | `app_settings`、`app_settings_migrations` | 服务密钥、自定义平台、接口参数、上次模型选择及旧 JSON 导入标记 |
| `projects.db` | `clips` | 项目列表和项目信息 |
| `canvas.db` | `nodes`、`edges` | 画布节点、分组、连线 |
| `subtitles.db` | `subtitles` | 字幕内容及状态 |
| `timeline.db` | `timelines` | 时间线项目数据 |

每个文件有独立连接、互斥锁和 `storage_migrations` 迁移标记。Schema 分别位于同名 Rust 模块中。运行时不使用 ATTACH、跨库 JOIN 或跨库事务；跨功能操作由应用层分别调用对应存储。

首次打开时，从原目录的 `data.db` 只读导入各自负责的表。每个目标文件的导入和完成标记在同一事务内提交；失败可重试，已有目标主键数据优先。导入完成后不再访问旧库，删除的新数据不会被旧库恢复。旧数据库保留不删除。

`config.db` 首次读取时会进一步导入旧 `config.json`；若旧 `data.db` 已带有 JSON 导入标记，则不重复导入。旧 JSON 格式错误会返回可重试的错误，不会用空配置覆盖。旧文件保留，但不再写入。

平台选择的旧 `localStorage` 值只在 SQLite 对应键不存在时导入；SQLite 保存成功后才清理旧值。

数据库使用 WAL，运行时可能出现对应的 `-wal`、`-shm` 文件。备份时应使用 SQLite 备份方式，或完全退出应用后复制整个 `sqlite/` 目录。

`Database::open_at` 仅保留用于旧单库迁移测试和兼容性测试；生产启动使用 `Database::new` → `open_directory`。
