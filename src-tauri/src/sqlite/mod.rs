//! Feature-owned SQLite files. Legacy imports are transactional and idempotent per file.
pub mod canvas;
pub mod config;
pub mod projects;
pub mod subtitles;
pub mod timeline;

use rusqlite::{Connection, OpenFlags};
use std::path::Path;
use std::sync::{Arc, Mutex};

pub(crate) fn open_feature(
    directory: &Path,
    name: &str,
    schema: &str,
    tables: &[&str],
    legacy: Option<&Path>,
) -> Result<Arc<Mutex<Connection>>, String> {
    std::fs::create_dir_all(directory).map_err(|e| format!("创建 SQLite 目录失败：{}", e))?;
    let mut conn = Connection::open(directory.join(format!("{}.db", name)))
        .map_err(|e| format!("打开 {} 数据库失败：{}", name, e))?;
    conn.busy_timeout(std::time::Duration::from_secs(5))
        .map_err(|e| e.to_string())?;
    conn.execute_batch(schema)
        .map_err(|e| format!("初始化 {} 表结构失败：{}", name, e))?;
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS storage_migrations (name TEXT PRIMARY KEY NOT NULL);",
    )
    .map_err(|e| e.to_string())?;
    import_legacy(&mut conn, tables, legacy)
        .map_err(|e| format!("迁移 {} 数据失败：{}", name, e))?;
    conn.execute_batch("PRAGMA journal_mode=WAL;")
        .map_err(|e| e.to_string())?;
    Ok(Arc::new(Mutex::new(conn)))
}

fn import_legacy(
    conn: &mut Connection,
    tables: &[&str],
    legacy: Option<&Path>,
) -> Result<(), String> {
    let tx = conn
        .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)
        .map_err(|e| e.to_string())?;
    let completed: bool = tx
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM storage_migrations WHERE name = 'legacy_data_db_v1')",
            [],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    if completed {
        return Ok(());
    }
    // Read-only source: the original database and its schema remain untouched.
    if let Some(path) = legacy.filter(|p| p.exists()) {
        let source = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY)
            .map_err(|e| e.to_string())?;
        source.execute_batch("BEGIN;").map_err(|e| e.to_string())?;
        for table in tables {
            let exists: bool = source
                .query_row(
                    "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?1)",
                    [table],
                    |r| r.get(0),
                )
                .map_err(|e| e.to_string())?;
            if !exists {
                continue;
            }
            let mut source_columns = source
                .prepare(&format!("PRAGMA table_info(\"{}\")", table))
                .map_err(|e| e.to_string())?;
            let columns = source_columns
                .query_map([], |r| r.get::<_, String>(1))
                .map_err(|e| e.to_string())?
                .collect::<Result<Vec<_>, _>>()
                .map_err(|e| e.to_string())?;
            // The source predates the split; preserve all known fields and new-table defaults.
            let mut target_columns = tx
                .prepare(&format!("PRAGMA table_info(\"{}\")", table))
                .map_err(|e| e.to_string())?;
            let target = target_columns
                .query_map([], |r| r.get::<_, String>(1))
                .map_err(|e| e.to_string())?
                .collect::<Result<Vec<_>, _>>()
                .map_err(|e| e.to_string())?;
            let columns: Vec<_> = columns.into_iter().filter(|c| target.contains(c)).collect();
            if columns.is_empty() {
                return Err(format!("旧表 {} 没有可迁移的字段", table));
            }
            let fields = columns
                .iter()
                .map(|c| format!("\"{}\"", c.replace('"', "\"\"")))
                .collect::<Vec<_>>()
                .join(",");
            let placeholders = (0..columns.len())
                .map(|_| "?")
                .collect::<Vec<_>>()
                .join(",");
            let mut query = source
                .prepare(&format!("SELECT {} FROM \"{}\"", fields, table))
                .map_err(|e| e.to_string())?;
            let mut rows = query.query([]).map_err(|e| e.to_string())?;
            let mut insert = tx
                .prepare(&format!(
                    "INSERT INTO \"{}\" ({}) VALUES ({}) ON CONFLICT DO NOTHING",
                    table, fields, placeholders
                ))
                .map_err(|e| e.to_string())?;
            while let Some(row) = rows.next().map_err(|e| e.to_string())? {
                let values = (0..columns.len())
                    .map(|i| row.get::<_, rusqlite::types::Value>(i))
                    .collect::<Result<Vec<_>, _>>()
                    .map_err(|e| e.to_string())?;
                insert
                    .execute(rusqlite::params_from_iter(values))
                    .map_err(|e| e.to_string())?;
            }
        }
    }
    tx.execute(
        "INSERT INTO storage_migrations (name) VALUES ('legacy_data_db_v1')",
        [],
    )
    .map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::Database;

    fn table_names(path: &Path) -> Vec<String> {
        let conn = Connection::open(path).unwrap();
        let mut stmt = conn
            .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
            .unwrap();
        stmt.query_map([], |r| r.get(0))
            .unwrap()
            .collect::<Result<Vec<_>, _>>()
            .unwrap()
    }

    #[test]
    fn independent_files_tables_and_connections() {
        let dir = tempfile::tempdir().unwrap();
        let db = Database::open_directory(dir.path(), None).unwrap();
        for (file, mut expected) in [
            (
                "config",
                vec![
                    "app_settings",
                    "app_settings_migrations",
                    "storage_migrations",
                ],
            ),
            ("projects", vec!["clips", "storage_migrations"]),
            ("canvas", vec!["nodes", "edges", "storage_migrations"]),
            ("subtitles", vec!["subtitles", "storage_migrations"]),
            ("timeline", vec!["timelines", "storage_migrations"]),
        ] {
            expected.sort();
            assert_eq!(
                table_names(&dir.path().join(format!("{}.db", file))),
                expected
            );
        }
        let _canvas_lock = db.conn.lock().unwrap();
        assert!(db.config.try_lock().is_ok());
        assert!(db.projects.try_lock().is_ok());
        assert!(db.subtitles.try_lock().is_ok());
        assert!(db.timeline.try_lock().is_ok());
    }

    #[test]
    fn migrate_all_features_preserve_original_and_never_resurrect_deleted_data() {
        let root = tempfile::tempdir().unwrap();
        let old_path = root.path().join("data.db");
        let old = Database::open_at(&old_path).unwrap();
        {
            let conn = old.conn.lock().unwrap();
            conn.execute_batch(
                "INSERT INTO clips(id,title) VALUES('p','Project');
                INSERT INTO nodes(id,clip_id,data) VALUES('n','p','{\"parentId\":\"group\"}');
                INSERT INTO edges(id,clip_id,source,target) VALUES('e','p','n','n2');
                INSERT INTO subtitles(id,clip_id,items) VALUES('s','p','[1]');
                INSERT INTO timelines(project_id,data) VALUES('p','{\"tracks\":[]}');
                INSERT INTO app_settings(key,value) VALUES('deepseek_api_key','\"test-key\"');
                INSERT INTO app_settings_migrations(name) VALUES('legacy_config_json_v1');",
            )
            .unwrap();
        }
        drop(old);
        let directory = root.path().join("sqlite");
        let db = Database::open_directory(&directory, Some(&old_path)).unwrap();
        assert_eq!(
            db.projects
                .lock()
                .unwrap()
                .query_row("SELECT title FROM clips", [], |r| r.get::<_, String>(0))
                .unwrap(),
            "Project"
        );
        assert_eq!(
            db.conn
                .lock()
                .unwrap()
                .query_row("SELECT data FROM nodes", [], |r| r.get::<_, String>(0))
                .unwrap(),
            r#"{"parentId":"group"}"#
        );
        assert_eq!(
            db.conn
                .lock()
                .unwrap()
                .query_row("SELECT COUNT(*) FROM edges", [], |r| r.get::<_, i64>(0))
                .unwrap(),
            1
        );
        assert_eq!(
            db.subtitles
                .lock()
                .unwrap()
                .query_row("SELECT items FROM subtitles", [], |r| r.get::<_, String>(0))
                .unwrap(),
            "[1]"
        );
        assert_eq!(
            db.timeline
                .lock()
                .unwrap()
                .query_row("SELECT data FROM timelines", [], |r| r.get::<_, String>(0))
                .unwrap(),
            r#"{"tracks":[]}"#
        );
        assert_eq!(
            db.config
                .lock()
                .unwrap()
                .query_row("SELECT value FROM app_settings", [], |r| r
                    .get::<_, String>(0))
                .unwrap(),
            "\"test-key\""
        );
        assert_eq!(
            db.config
                .lock()
                .unwrap()
                .query_row("SELECT COUNT(*) FROM app_settings_migrations", [], |r| r
                    .get::<_, i64>(0))
                .unwrap(),
            1
        );
        db.conn
            .lock()
            .unwrap()
            .execute("DELETE FROM nodes", [])
            .unwrap();
        drop(db);
        let db = Database::open_directory(&directory, Some(&old_path)).unwrap();
        assert_eq!(
            db.conn
                .lock()
                .unwrap()
                .query_row("SELECT COUNT(*) FROM nodes", [], |r| r.get::<_, i64>(0))
                .unwrap(),
            0
        );
        let source = Connection::open(old_path).unwrap();
        assert_eq!(
            source
                .query_row("SELECT COUNT(*) FROM nodes", [], |r| r.get::<_, i64>(0))
                .unwrap(),
            1
        );
    }

    #[test]
    fn legacy_single_column_keys_are_imported_into_composite_schema() {
        let root = tempfile::tempdir().unwrap();
        let legacy = root.path().join("data.db");
        let old = Connection::open(&legacy).unwrap();
        old.execute_batch("CREATE TABLE nodes(id TEXT PRIMARY KEY, data TEXT, clip_id TEXT); INSERT INTO nodes VALUES('n','{}','p');").unwrap();
        drop(old);
        let db = Database::open_directory(&root.path().join("sqlite"), Some(&legacy)).unwrap();
        let conn = db.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO nodes(id,clip_id) VALUES('n','another-project')",
            [],
        )
        .unwrap();
        assert_eq!(
            conn.query_row("SELECT COUNT(*) FROM nodes", [], |r| r.get::<_, i64>(0))
                .unwrap(),
            2
        );
    }

    #[test]
    fn import_failure_rolls_back_feature_and_retries_without_overwriting_existing_rows() {
        let root = tempfile::tempdir().unwrap();
        let legacy = root.path().join("data.db");
        let source = Connection::open(&legacy).unwrap();
        source.execute_batch("CREATE TABLE nodes(id TEXT,clip_id TEXT); INSERT INTO nodes VALUES('a','p'),('z','p');").unwrap();
        let mut conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(canvas::SCHEMA).unwrap();
        conn.execute_batch("CREATE TABLE storage_migrations(name TEXT PRIMARY KEY); INSERT INTO nodes(id,clip_id,data) VALUES('a','p','existing');
            CREATE TRIGGER reject_node BEFORE INSERT ON nodes WHEN NEW.id='z' BEGIN SELECT RAISE(ABORT,'test'); END;").unwrap();
        assert!(import_legacy(&mut conn, &["nodes"], Some(&legacy)).is_err());
        assert_eq!(
            conn.query_row("SELECT COUNT(*) FROM storage_migrations", [], |r| r
                .get::<_, i64>(0))
                .unwrap(),
            0
        );
        assert_eq!(
            conn.query_row("SELECT COUNT(*) FROM nodes", [], |r| r.get::<_, i64>(0))
                .unwrap(),
            1
        );
        conn.execute_batch("DROP TRIGGER reject_node;").unwrap();
        import_legacy(&mut conn, &["nodes"], Some(&legacy)).unwrap();
        assert_eq!(
            conn.query_row("SELECT data FROM nodes WHERE id='a'", [], |r| r
                .get::<_, String>(0))
                .unwrap(),
            "existing"
        );
        assert_eq!(
            conn.query_row("SELECT COUNT(*) FROM nodes", [], |r| r.get::<_, i64>(0))
                .unwrap(),
            2
        );
    }
}
