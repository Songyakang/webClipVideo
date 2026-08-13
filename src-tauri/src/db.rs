/// SQLite database module.
///
/// Database file is stored at `~/Documents/editor-tarui/data.db`,
/// alongside assets and config.json.
///
/// Uses rusqlite with "bundled" feature (static SQLite compilation).

use rusqlite::Connection;
use std::path::PathBuf;
use std::sync::Mutex;

/// Thread-safe wrapper around SQLite connection.
pub struct Database {
    pub conn: Mutex<Connection>,
}

impl Database {
    /// Open (or create) the SQLite database at the default path and run migrations.
    pub fn new() -> Result<Self, String> {
        let db_path = db_path()?;
        Self::open_at(&db_path)
    }

    /// Open (or create) the SQLite database at a custom path (useful for tests).
    pub fn open_at(db_path: &std::path::Path) -> Result<Self, String> {
        if let Some(parent) = db_path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create db dir: {}", e))?;
        }

        let conn = Connection::open(db_path)
            .map_err(|e| format!("Failed to open database: {}", e))?;

        // Enable WAL mode for better concurrent read performance
        conn.execute_batch("PRAGMA journal_mode=WAL;")
            .map_err(|e| format!("Failed to set WAL mode: {}", e))?;

        run_migrations(&conn)?;

        Ok(Self {
            conn: Mutex::new(conn),
        })
    }
}

/// Determine the database file path.
/// On macOS: ~/Documents/editor-tarui/data.db
fn db_path() -> Result<PathBuf, String> {
    #[cfg(target_os = "macos")]
    {
        let home =
            std::env::var("HOME").map_err(|_| "HOME environment variable not set".to_string())?;
        Ok(PathBuf::from(home)
            .join("Documents")
            .join("editor-tarui")
            .join("data.db"))
    }
    #[cfg(target_os = "linux")]
    {
        let home =
            std::env::var("HOME").map_err(|_| "HOME environment variable not set".to_string())?;
        Ok(PathBuf::from(home)
            .join(".local")
            .join("share")
            .join("editor-tarui")
            .join("data.db"))
    }
    #[cfg(target_os = "windows")]
    {
        let appdata = std::env::var("APPDATA")
            .map_err(|_| "APPDATA environment variable not set".to_string())?;
        Ok(PathBuf::from(appdata).join("editor-tarui").join("data.db"))
    }
    #[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
    {
        Err("Unsupported platform".to_string())
    }
}

/// Create tables if they don't exist.
///
/// 版本化迁移（PRAGMA user_version）：
/// - v0 → v1：nodes / edges / subtitles 主键从单列 `id` 改为复合主键
///   `(id, clip_id)`。旧 schema 下 id 全局唯一，但应用侧计数器按片段
///   各自从 0 开始，跨片段会撞主键（保存报错 / INSERT OR REPLACE 静默
///   覆盖其他片段数据）。SQLite 无法直接修改主键，采用重建表迁移。
pub(crate) fn run_migrations(conn: &Connection) -> Result<(), String> {
    let version: i64 = conn
        .query_row("PRAGMA user_version", [], |r| r.get(0))
        .unwrap_or(0);

    if version < 1 {
        migrate_v1_composite_keys(conn)?;
        conn.execute_batch("PRAGMA user_version = 1;")
            .map_err(|e| format!("Migration version failed: {}", e))?;
    }

    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS clips (
            id          TEXT PRIMARY KEY,
            title       TEXT NOT NULL DEFAULT '',
            description TEXT NOT NULL DEFAULT '',
            url         TEXT NOT NULL DEFAULT '',
            thumbnail   TEXT NOT NULL DEFAULT '',
            duration    REAL NOT NULL DEFAULT 0,
            tags        TEXT NOT NULL DEFAULT '[]',
            created_at  INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_clips_created_at ON clips(created_at);

        CREATE TABLE IF NOT EXISTS nodes (
            id        TEXT NOT NULL,
            type      TEXT NOT NULL DEFAULT 'text',
            pos_x     REAL NOT NULL DEFAULT 0,
            pos_y     REAL NOT NULL DEFAULT 0,
            data      TEXT NOT NULL DEFAULT '{}',
            width     REAL,
            height    REAL,
            selected  INTEGER NOT NULL DEFAULT 0,
            clip_id   TEXT NOT NULL DEFAULT '',
            PRIMARY KEY (id, clip_id)
        );
        CREATE INDEX IF NOT EXISTS idx_nodes_clip_id ON nodes(clip_id);

        CREATE TABLE IF NOT EXISTS edges (
            id            TEXT NOT NULL,
            source        TEXT NOT NULL DEFAULT '',
            target        TEXT NOT NULL DEFAULT '',
            source_handle TEXT NOT NULL DEFAULT '',
            target_handle TEXT NOT NULL DEFAULT '',
            clip_id       TEXT NOT NULL DEFAULT '',
            PRIMARY KEY (id, clip_id)
        );
        CREATE INDEX IF NOT EXISTS idx_edges_clip_id ON edges(clip_id);

        CREATE TABLE IF NOT EXISTS subtitles (
            id       TEXT NOT NULL,
            items    TEXT NOT NULL DEFAULT '[]',
            language TEXT NOT NULL DEFAULT '',
            status   TEXT NOT NULL DEFAULT '',
            clip_id  TEXT NOT NULL DEFAULT '',
            PRIMARY KEY (id, clip_id)
        );
        CREATE INDEX IF NOT EXISTS idx_subtitles_clip_id ON subtitles(clip_id);

        CREATE TABLE IF NOT EXISTS timelines (
            project_id TEXT PRIMARY KEY,
            data       TEXT NOT NULL DEFAULT '{}',
            updated_at INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_timelines_updated_at ON timelines(updated_at);
        ",
    )
    .map_err(|e| format!("Migration failed: {}", e))
}

/// v0 → v1：把单列主键表重建为复合主键 (id, clip_id)，保留数据。
/// 检测依据：旧 DDL 含 `id TEXT PRIMARY KEY`；新 schema / 空库跳过。
fn migrate_v1_composite_keys(conn: &Connection) -> Result<(), String> {
    let rebuilds: [(&str, &str); 3] = [
        (
            "nodes",
            "CREATE TABLE nodes (
                id        TEXT NOT NULL,
                type      TEXT NOT NULL DEFAULT 'text',
                pos_x     REAL NOT NULL DEFAULT 0,
                pos_y     REAL NOT NULL DEFAULT 0,
                data      TEXT NOT NULL DEFAULT '{}',
                width     REAL,
                height    REAL,
                selected  INTEGER NOT NULL DEFAULT 0,
                clip_id   TEXT NOT NULL DEFAULT '',
                PRIMARY KEY (id, clip_id)
            )",
        ),
        (
            "edges",
            "CREATE TABLE edges (
                id            TEXT NOT NULL,
                source        TEXT NOT NULL DEFAULT '',
                target        TEXT NOT NULL DEFAULT '',
                source_handle TEXT NOT NULL DEFAULT '',
                target_handle TEXT NOT NULL DEFAULT '',
                clip_id       TEXT NOT NULL DEFAULT '',
                PRIMARY KEY (id, clip_id)
            )",
        ),
        (
            "subtitles",
            "CREATE TABLE subtitles (
                id       TEXT NOT NULL,
                items    TEXT NOT NULL DEFAULT '[]',
                language TEXT NOT NULL DEFAULT '',
                status   TEXT NOT NULL DEFAULT '',
                clip_id  TEXT NOT NULL DEFAULT '',
                PRIMARY KEY (id, clip_id)
            )",
        ),
    ];

    for (table, new_ddl) in rebuilds {
        let ddl: Option<String> = conn
            .query_row(
                "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?1",
                rusqlite::params![table],
                |r| r.get(0),
            )
            .ok();
        let Some(ddl) = ddl else { continue }; // 表不存在（新库）
        if !ddl.contains("id TEXT PRIMARY KEY") {
            continue; // 已是复合主键
        }

        let sql = format!(
            "BEGIN;
             ALTER TABLE {t} RENAME TO {t}_old;
             {ddl};
             INSERT INTO {t} SELECT * FROM {t}_old;
             DROP TABLE {t}_old;
             COMMIT;",
            t = table,
            ddl = new_ddl,
        );
        conn.execute_batch(&sql)
            .map_err(|e| format!("Migrate {} composite key failed: {}", table, e))?;
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    /// Run migrations on an in-memory database and verify all tables exist.
    #[test]
    fn migrations_create_all_tables() {
        let conn = Connection::open_in_memory().expect("in-memory db");
        run_migrations(&conn).expect("migrations");

        let tables: Vec<String> = conn
            .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
            .unwrap()
            .query_map([], |row| row.get(0))
            .unwrap()
            .filter_map(|r| r.ok())
            .collect();

        assert!(tables.contains(&"clips".to_string()));
        assert!(tables.contains(&"nodes".to_string()));
        assert!(tables.contains(&"edges".to_string()));
        assert!(tables.contains(&"subtitles".to_string()));
        assert!(tables.contains(&"timelines".to_string()));
    }

    #[test]
    fn migrations_are_idempotent() {
        let conn = Connection::open_in_memory().expect("in-memory db");
        // Running twice should not error
        run_migrations(&conn).expect("first migration");
        run_migrations(&conn).expect("second migration");
    }

    #[test]
    fn clips_table_schema() {
        let conn = Connection::open_in_memory().expect("in-memory db");
        run_migrations(&conn).expect("migrations");

        let columns: Vec<(String, String)> = conn
            .prepare("PRAGMA table_info(clips)")
            .unwrap()
            .query_map([], |row| Ok((row.get(1)?, row.get(2)?)))
            .unwrap()
            .filter_map(|r| r.ok())
            .collect();

        let names: Vec<&str> = columns.iter().map(|(n, _)| n.as_str()).collect();
        assert!(names.contains(&"id"));
        assert!(names.contains(&"title"));
        assert!(names.contains(&"description"));
        assert!(names.contains(&"tags"));
        assert!(names.contains(&"created_at"));
    }

    #[test]
    fn insert_and_query_clip() {
        let conn = Connection::open_in_memory().expect("in-memory db");
        run_migrations(&conn).expect("migrations");

        conn.execute(
            "INSERT INTO clips (id, title, description, duration, tags, created_at)
             VALUES ('test1', 'My Clip', 'A test clip', 30.0, '[\"ai\",\"video\"]', 1234567890)",
            [],
        )
        .unwrap();

        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM clips", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count, 1);
    }

    #[test]
    fn migration_v1_composite_keys_preserves_data_and_allows_cross_clip_ids() {
        let conn = Connection::open_in_memory().expect("in-memory db");
        // 构造旧 schema（单列主键）并写入数据
        conn.execute_batch(
            "
            CREATE TABLE nodes (
                id TEXT PRIMARY KEY, type TEXT NOT NULL DEFAULT 'text',
                pos_x REAL NOT NULL DEFAULT 0, pos_y REAL NOT NULL DEFAULT 0,
                data TEXT NOT NULL DEFAULT '{}', width REAL, height REAL,
                selected INTEGER NOT NULL DEFAULT 0, clip_id TEXT NOT NULL DEFAULT ''
            );
            CREATE TABLE edges (
                id TEXT PRIMARY KEY, source TEXT NOT NULL DEFAULT '',
                target TEXT NOT NULL DEFAULT '', source_handle TEXT NOT NULL DEFAULT '',
                target_handle TEXT NOT NULL DEFAULT '', clip_id TEXT NOT NULL DEFAULT ''
            );
            CREATE TABLE subtitles (
                id TEXT PRIMARY KEY, items TEXT NOT NULL DEFAULT '[]',
                language TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT '',
                clip_id TEXT NOT NULL DEFAULT ''
            );
            INSERT INTO nodes (id, clip_id) VALUES ('node-1', 'clip-a');
            INSERT INTO edges (id, clip_id) VALUES ('edge-1', 'clip-a');
            INSERT INTO subtitles (id, clip_id) VALUES ('node-1', 'clip-a');
            ",
        )
        .expect("old schema");

        run_migrations(&conn).expect("migrate");

        // 旧数据保留
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM nodes WHERE clip_id = 'clip-a'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count, 1);

        // 同 id 不同 clip 可共存（复合主键）
        conn.execute("INSERT INTO nodes (id, clip_id) VALUES ('node-1', 'clip-b')", [])
            .expect("cross-clip node");
        conn.execute("INSERT INTO edges (id, clip_id) VALUES ('edge-1', 'clip-b')", [])
            .expect("cross-clip edge");
        conn.execute("INSERT INTO subtitles (id, clip_id) VALUES ('node-1', 'clip-b')", [])
            .expect("cross-clip subtitle");

        let a: i64 = conn
            .query_row("SELECT COUNT(*) FROM nodes WHERE clip_id = 'clip-a'", [], |r| r.get(0))
            .unwrap();
        let b: i64 = conn
            .query_row("SELECT COUNT(*) FROM nodes WHERE clip_id = 'clip-b'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(a, 1);
        assert_eq!(b, 1);
    }

    #[test]
    fn migration_sets_user_version_and_is_idempotent() {
        let conn = Connection::open_in_memory().expect("in-memory db");
        run_migrations(&conn).expect("first migration");
        let v: i64 = conn
            .query_row("PRAGMA user_version", [], |r| r.get(0))
            .unwrap();
        assert_eq!(v, 1);
        run_migrations(&conn).expect("second migration");
    }
}
