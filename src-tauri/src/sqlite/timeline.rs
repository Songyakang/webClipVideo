// Schema owned exclusively by timeline.db.
pub const SCHEMA: &str = r#"
CREATE TABLE IF NOT EXISTS timelines (
            project_id TEXT PRIMARY KEY,
            data       TEXT NOT NULL DEFAULT '{}',
            updated_at INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_timelines_updated_at ON timelines(updated_at);
"#;
