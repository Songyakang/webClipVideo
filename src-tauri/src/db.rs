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
    /// Open (or create) the SQLite database and run migrations.
    pub fn new() -> Result<Self, String> {
        let db_path = db_path()?;

        // Ensure parent directory exists
        if let Some(parent) = db_path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create db dir: {}", e))?;
        }

        let conn = Connection::open(&db_path)
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
fn run_migrations(conn: &Connection) -> Result<(), String> {
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
            id        TEXT PRIMARY KEY,
            type      TEXT NOT NULL DEFAULT 'text',
            pos_x     REAL NOT NULL DEFAULT 0,
            pos_y     REAL NOT NULL DEFAULT 0,
            data      TEXT NOT NULL DEFAULT '{}',
            width     REAL,
            height    REAL,
            selected  INTEGER NOT NULL DEFAULT 0,
            clip_id   TEXT NOT NULL DEFAULT ''
        );
        CREATE INDEX IF NOT EXISTS idx_nodes_clip_id ON nodes(clip_id);

        CREATE TABLE IF NOT EXISTS edges (
            id            TEXT PRIMARY KEY,
            source        TEXT NOT NULL DEFAULT '',
            target        TEXT NOT NULL DEFAULT '',
            source_handle TEXT NOT NULL DEFAULT '',
            target_handle TEXT NOT NULL DEFAULT '',
            clip_id       TEXT NOT NULL DEFAULT ''
        );
        CREATE INDEX IF NOT EXISTS idx_edges_clip_id ON edges(clip_id);

        CREATE TABLE IF NOT EXISTS subtitles (
            id       TEXT PRIMARY KEY,
            items    TEXT NOT NULL DEFAULT '[]',
            language TEXT NOT NULL DEFAULT '',
            status   TEXT NOT NULL DEFAULT '',
            clip_id  TEXT NOT NULL DEFAULT ''
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
