//! Independent, recoverable asset-library metadata. Files are published before the DB transaction.
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::{path::Path, sync::Mutex};

pub struct AssetLibraryDb(pub Mutex<Connection>);
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetRecord {
    pub id: String,
    pub name: String,
    pub category: String,
    pub style: String,
    pub description: String,
    pub tags: String,
    pub source: String,
    #[serde(default)]
    pub capabilities: Vec<String>,
    pub status: String,
    pub fingerprint: String,
    pub version: String,
    pub report: serde_json::Value,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportJob {
    pub id: String,
    pub status: String,
    pub error: String,
    pub request: serde_json::Value,
    pub report: serde_json::Value,
}
impl AssetLibraryDb {
    pub fn open(dir: &Path) -> Result<Self, String> {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
        let mut c = Connection::open(dir.join("assets3d.db")).map_err(|e| e.to_string())?;
        c.busy_timeout(std::time::Duration::from_secs(5))
            .map_err(|e| e.to_string())?;
        c.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")
            .map_err(|e| e.to_string())?;
        let version: i64 = c
            .query_row("PRAGMA user_version", [], |r| r.get(0))
            .map_err(|e| e.to_string())?;
        if version > 1 {
            return Err("资产库来自更新版本应用，请升级后打开".into());
        }
        let tx = c.transaction().map_err(|e| e.to_string())?;
        tx.execute_batch("CREATE TABLE IF NOT EXISTS assets(id TEXT PRIMARY KEY, data TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS asset_versions(id TEXT PRIMARY KEY, asset_id TEXT NOT NULL REFERENCES assets(id), fingerprint TEXT NOT NULL, report TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS asset_files(version_id TEXT NOT NULL REFERENCES asset_versions(id), path TEXT NOT NULL, role TEXT NOT NULL, PRIMARY KEY(version_id,path));
            CREATE TABLE IF NOT EXISTS import_jobs(id TEXT PRIMARY KEY, data TEXT NOT NULL);
            PRAGMA user_version=1;") .map_err(|e| e.to_string())?;
        tx.commit().map_err(|e| e.to_string())?;
        Ok(Self(Mutex::new(c)))
    }
    pub fn assets(&self) -> Result<Vec<AssetRecord>, String> {
        self.read_all("assets")
    }
    pub fn jobs(&self) -> Result<Vec<ImportJob>, String> {
        self.read_all("import_jobs")
    }
    fn read_all<T: serde::de::DeserializeOwned>(&self, table: &str) -> Result<Vec<T>, String> {
        let c = self.0.lock().map_err(|e| e.to_string())?;
        let mut q = c
            .prepare(&format!("SELECT data FROM {table} ORDER BY rowid DESC"))
            .map_err(|e| e.to_string())?;
        let data = q
            .query_map([], |r| r.get::<_, String>(0))
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        data.iter()
            .map(|v| serde_json::from_str(v).map_err(|e| e.to_string()))
            .collect()
    }
    pub fn save_job(&self, job: &ImportJob) -> Result<(), String> {
        self.0.lock().map_err(|e|e.to_string())?.execute("INSERT INTO import_jobs VALUES(?1,?2) ON CONFLICT(id) DO UPDATE SET data=excluded.data",params![job.id,serde_json::to_string(job).map_err(|e|e.to_string())?]).map_err(|e|e.to_string())?;
        Ok(())
    }
    pub fn job(&self, id: &str) -> Result<ImportJob, String> {
        self.jobs()?
            .into_iter()
            .find(|j| j.id == id)
            .ok_or("导入任务不存在".into())
    }
    pub fn save_asset(&self, asset: &AssetRecord) -> Result<(), String> {
        let n = self
            .0
            .lock()
            .map_err(|e| e.to_string())?
            .execute(
                "UPDATE assets SET data=?2 WHERE id=?1",
                params![
                    asset.id,
                    serde_json::to_string(asset).map_err(|e| e.to_string())?
                ],
            )
            .map_err(|e| e.to_string())?;
        if n != 1 {
            return Err("资产不存在".into());
        }
        Ok(())
    }
    pub fn publish(&self, asset: &AssetRecord, job: &ImportJob) -> Result<(), String> {
        let mut c = self.0.lock().map_err(|e| e.to_string())?;
        let tx = c.transaction().map_err(|e| e.to_string())?;
        tx.execute(
            "INSERT INTO assets VALUES(?1,?2) ON CONFLICT(id) DO UPDATE SET data=excluded.data",
            params![
                asset.id,
                serde_json::to_string(asset).map_err(|e| e.to_string())?
            ],
        )
        .map_err(|e| e.to_string())?;
        tx.execute(
            "INSERT INTO asset_versions VALUES(?1,?2,?3,?4) ON CONFLICT(id) DO NOTHING",
            params![
                asset.version,
                asset.id,
                asset.fingerprint,
                asset.report.to_string()
            ],
        )
        .map_err(|e| e.to_string())?;
        for (role, path) in [
            ("source", asset.report["sourcePath"].as_str()),
            ("prepared", asset.report["preparedPath"].as_str()),
            ("preview", asset.report["previewPath"].as_str()),
            ("thumbnail", asset.report["thumbnailPath"].as_str()),
        ] {
            if let Some(path) = path {
                tx.execute(
                    "INSERT OR IGNORE INTO asset_files VALUES(?1,?2,?3)",
                    params![asset.version, path, role],
                )
                .map_err(|e| e.to_string())?;
            }
        }
        tx.execute(
            "UPDATE import_jobs SET data=?2 WHERE id=?1",
            params![
                job.id,
                serde_json::to_string(job).map_err(|e| e.to_string())?
            ],
        )
        .map_err(|e| e.to_string())?;
        tx.commit().map_err(|e| e.to_string())
    }
    pub fn version_exists(&self, id: &str) -> Result<bool, String> {
        self.0
            .lock()
            .map_err(|e| e.to_string())?
            .query_row("SELECT 1 FROM asset_versions WHERE id=?1", [id], |r| {
                r.get::<_, i32>(0)
            })
            .optional()
            .map(|v| v.is_some())
            .map_err(|e| e.to_string())
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    #[test]
    fn publish_is_atomic_and_reopen_is_idempotent() {
        let dir = tempfile::tempdir().unwrap();
        let db = AssetLibraryDb::open(dir.path()).unwrap();
        let job = ImportJob {
            id: "j".into(),
            status: "awaiting_confirmation".into(),
            error: String::new(),
            request: json!({}),
            report: json!({}),
        };
        db.save_job(&job).unwrap();
        let asset = AssetRecord {
            id: "a".into(),
            version: "v".into(),
            name: "人物".into(),
            category: "character".into(),
            style: "realistic".into(),
            description: String::new(),
            tags: String::new(),
            source: String::new(),
            capabilities: vec![],
            status: "ready".into(),
            fingerprint: "hash".into(),
            report: json!({"preparedPath":"a/v/model.blend"}),
        };
        db.0.lock().unwrap().execute_batch("CREATE TRIGGER fail_publish BEFORE INSERT ON asset_files BEGIN SELECT RAISE(ABORT,'test'); END;").unwrap();
        assert!(db.publish(&asset, &job).is_err());
        assert!(db.assets().unwrap().is_empty());
        assert!(!db.version_exists("v").unwrap());
        db.0.lock()
            .unwrap()
            .execute_batch("DROP TRIGGER fail_publish")
            .unwrap();
        db.publish(&asset, &job).unwrap();
        db.publish(&asset, &job).unwrap();
        drop(db);
        let db = AssetLibraryDb::open(dir.path()).unwrap();
        assert_eq!(db.assets().unwrap().len(), 1);
        assert_eq!(db.assets().unwrap()[0].name, "人物");
        assert_eq!(db.jobs().unwrap().len(), 1);
        assert!(!dir.path().join("config.db").exists());
    }
}
