// Schema owned exclusively by subtitles.db.
pub const SCHEMA: &str = r#"
CREATE TABLE IF NOT EXISTS subtitles (
            id       TEXT NOT NULL,
            items    TEXT NOT NULL DEFAULT '[]',
            language TEXT NOT NULL DEFAULT '',
            status   TEXT NOT NULL DEFAULT '',
            clip_id  TEXT NOT NULL DEFAULT '',
            PRIMARY KEY (id, clip_id)
        );
        CREATE INDEX IF NOT EXISTS idx_subtitles_clip_id ON subtitles(clip_id);
"#;
