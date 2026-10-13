// Schema owned exclusively by canvas.db.
pub const SCHEMA: &str = r#"
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
"#;
