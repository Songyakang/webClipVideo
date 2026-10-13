// Schema owned exclusively by projects.db.
pub const SCHEMA: &str = r#"
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
"#;
