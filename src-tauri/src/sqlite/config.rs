// Schema owned exclusively by config.db.
pub const SCHEMA: &str = r#"
CREATE TABLE IF NOT EXISTS app_settings (
            key TEXT PRIMARY KEY NOT NULL,
            value TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS app_settings_migrations (
            name TEXT PRIMARY KEY NOT NULL
        );
"#;
