use crate::sqlite::assets3d::{AssetLibraryDb, AssetRecord, ImportJob};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        Arc, Mutex,
    },
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Manager};
use tauri_plugin_opener::OpenerExt;
static SEQUENCE: AtomicU64 = AtomicU64::new(0);
const WORKER: &str = include_str!("../blender/import_asset.py");
#[derive(Default)]
pub struct AssetImportRuntime {
    queue: Mutex<()>,
    publication: Mutex<()>,
    cancellations: Mutex<HashMap<String, Arc<AtomicBool>>>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportRequest {
    pub path: String,
    #[serde(default)]
    pub collection: String,
    #[serde(default = "unit_scale")]
    pub scale: f64,
    #[serde(default)]
    pub rotation: f64,
    #[serde(default = "yes")]
    pub ground: bool,
    #[serde(default)]
    pub replacements: HashMap<String, String>,
    #[serde(default)]
    pub operation: String,
}
fn unit_scale() -> f64 {
    1.0
}
fn yes() -> bool {
    true
}
fn root(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .document_dir()
        .map_err(|e| e.to_string())?
        .join("editor-tarui/assets/3d-library"))
}
fn valid_id(id: &str) -> bool {
    !id.is_empty() && id.len() < 80 && id.bytes().all(|c| c.is_ascii_hexdigit() || c == b'-')
}
fn executable() -> PathBuf {
    #[cfg(target_os = "macos")]
    {
        PathBuf::from("/Applications/Blender.app/Contents/MacOS/Blender")
    }
    #[cfg(target_os = "windows")]
    {
        PathBuf::from("blender.exe")
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        PathBuf::from("blender")
    }
}
fn validate(request: &ImportRequest) -> Result<(), String> {
    let p = Path::new(&request.path);
    if !p.is_absolute()
        || !p.is_file()
        || !matches!(
            p.extension()
                .and_then(|v| v.to_str())
                .map(str::to_lowercase)
                .as_deref(),
            Some("glb" | "blend")
        )
    {
        return Err("请选择存在的 .blend 或 .glb 文件".into());
    }
    if !request.scale.is_finite()
        || !(0.0001..=10000.).contains(&request.scale)
        || !request.rotation.is_finite()
        || request.rotation.abs() > 360.
    {
        return Err("尺寸倍率或朝向无效".into());
    }
    if !matches!(request.operation.as_str(), "inspect" | "prepare") {
        return Err("无效导入操作".into());
    }
    Ok(())
}
fn save(db: &AssetLibraryDb, job: &mut ImportJob, status: &str, error: &str) -> Result<(), String> {
    job.status = status.into();
    job.error = error.into();
    db.save_job(job)
}
#[tauri::command]
pub fn assets3d_list(app: AppHandle) -> Result<Value, String> {
    let db = app.state::<AssetLibraryDb>();
    let base = app
        .path()
        .document_dir()
        .map_err(|e| e.to_string())?
        .join("editor-tarui/assets");
    let mut assets = db.assets()?;
    for asset in &mut assets {
        if asset.status == "ready"
            && !asset.report["preparedPath"]
                .as_str()
                .is_some_and(|p| base.join(p).is_file())
        {
            asset.status = "missing".into();
        }
    }
    Ok(json!({"assets":assets,"jobs":db.jobs()?,"directory":root(&app)?}))
}
#[tauri::command]
pub fn assets3d_start(
    app: AppHandle,
    request: ImportRequest,
    job_id: Option<String>,
) -> Result<String, String> {
    validate(&request)?;
    let runtime = app.state::<AssetImportRuntime>();
    let db = app.state::<AssetLibraryDb>();
    let id = job_id.unwrap_or_else(|| {
        format!(
            "{:x}-{:x}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_nanos(),
            SEQUENCE.fetch_add(1, Ordering::Relaxed)
        )
    });
    if !valid_id(&id) {
        return Err("无效任务编号".into());
    }
    let mut active = runtime.cancellations.lock().map_err(|e| e.to_string())?;
    if active.contains_key(&id) {
        return Err("任务仍在运行，请等待停止后重试".into());
    }
    if db.job(&id).is_ok_and(|j| j.status == "publishing") {
        return Err("请先恢复发布，不能重新整理该任务".into());
    }
    if db.version_exists(&id)? {
        return Err("已发布版本不可重新写入".into());
    }
    let cancel = Arc::new(AtomicBool::new(false));
    let job = ImportJob {
        id: id.clone(),
        status: "queued".into(),
        error: String::new(),
        request: serde_json::to_value(request).map_err(|e| e.to_string())?,
        report: json!({}),
    };
    db.save_job(&job)?;
    active.insert(id.clone(), cancel.clone());
    drop(active);
    std::thread::spawn(move || {
        let runtime = app.state::<AssetImportRuntime>();
        let db = app.state::<AssetLibraryDb>();
        let mut job = job;
        // Only our isolated workers share this queue; interactive MCP scenes are never opened here.
        let result = (|| {
            let _slot = runtime.queue.lock().map_err(|e| e.to_string())?;
            if cancel.load(Ordering::SeqCst) {
                return Err("已取消导入".into());
            }
            run_worker(&app, &db, &mut job, &cancel)
        })();
        if let Err(error) = result {
            let _ = save(
                &db,
                &mut job,
                if cancel.load(Ordering::SeqCst) {
                    "cancelled"
                } else {
                    "failed"
                },
                &error,
            );
        }
        if let Ok(mut map) = runtime.cancellations.lock() {
            map.remove(&job.id);
        };
    });
    Ok(id)
}
fn run_worker(
    app: &AppHandle,
    db: &AssetLibraryDb,
    job: &mut ImportJob,
    cancel: &AtomicBool,
) -> Result<(), String> {
    let dir = root(app)?.join(".imports").join(&job.id);
    std::fs::create_dir_all(&dir).map_err(|e| format!("无法创建导入目录：{e}"))?;
    // Reattempts get their own work folder; failed files never overwrite a published version.
    let attempt = format!(
        "{:x}",
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
    );
    let output = dir.join(attempt);
    std::fs::create_dir(&output).map_err(|e| e.to_string())?;
    let request = output.join("request.json");
    let result = output.join("result.json");
    let script = output.join("worker.py");
    std::fs::write(&request, job.request.to_string()).map_err(|e| e.to_string())?;
    std::fs::write(&script, WORKER).map_err(|e| e.to_string())?;
    let log = std::fs::File::create(output.join("blender.log")).map_err(|e| e.to_string())?;
    save(db, job, "processing", "")?;
    let mut child=Command::new(executable()).args(["--background","--factory-startup","--disable-autoexec","--python"]).arg(&script).arg("--").arg(&request).arg(&result).arg(output.join("payload")).stdout(Stdio::from(log.try_clone().map_err(|e|e.to_string())?)).stderr(Stdio::from(log)).spawn().map_err(|e|format!("无法启动 Blender 后台进程，请安装 Blender（macOS 默认 /Applications/Blender.app，其他系统需加入 PATH）：{e}"))?;
    let started = std::time::Instant::now();
    loop {
        if cancel.load(Ordering::SeqCst) || started.elapsed() > Duration::from_secs(1800) {
            let _ = child.kill();
            let _ = child.wait();
            return Err(if cancel.load(Ordering::SeqCst) {
                "已取消导入"
            } else {
                "Blender 处理超时，后台进程已终止，可重试"
            }
            .into());
        }
        if child.try_wait().map_err(|e| e.to_string())?.is_some() {
            break;
        }
        std::thread::sleep(Duration::from_millis(150));
    }
    if cancel.load(Ordering::SeqCst) {
        return Err("已取消导入".into());
    }
    let bytes = std::fs::read(&result).map_err(|_| {
        format!(
            "Blender 未返回结果，日志：{}",
            output.join("blender.log").display()
        )
    })?;
    let value: Value = serde_json::from_slice(&bytes).map_err(|e| e.to_string())?;
    if value["ok"] != true {
        return Err(value["error"].as_str().unwrap_or("Blender 解析失败").into());
    }
    job.report = value["report"].clone();
    job.report["workDirectory"] = json!(output
        .strip_prefix(root(app)?)
        .map_err(|e| e.to_string())?
        .to_string_lossy());
    let status = if job.report["missing"]
        .as_array()
        .is_some_and(|m| !m.is_empty())
    {
        "needs_input"
    } else if job.request["operation"] == "inspect" {
        "inspected"
    } else {
        "awaiting_confirmation"
    };
    let relative = format!(
        "3d-library/{}",
        output
            .strip_prefix(root(app)?)
            .map_err(|e| e.to_string())?
            .to_string_lossy()
    );
    for (key, path) in [
        (
            "sourcePath",
            format!(
                "payload/source/original.{}",
                Path::new(job.request["path"].as_str().unwrap_or(""))
                    .extension()
                    .and_then(|s| s.to_str())
                    .unwrap_or("blend")
                    .to_lowercase()
            ),
        ),
        ("preparedPath", "payload/prepared/model.blend".into()),
        ("previewPath", "payload/preview/model.glb".into()),
        ("thumbnailPath", "payload/preview/thumbnail.png".into()),
    ] {
        if output.join(&path).is_file() {
            job.report[key] = json!(format!("{relative}/{path}"));
        }
    }
    save(db, job, status, "")
}
#[tauri::command]
pub fn assets3d_cancel(app: AppHandle, job_id: String) -> Result<(), String> {
    if let Some(flag) = app
        .state::<AssetImportRuntime>()
        .cancellations
        .lock()
        .map_err(|e| e.to_string())?
        .get(&job_id)
    {
        flag.store(true, Ordering::SeqCst);
    }
    Ok(())
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetDetails {
    pub name: String,
    pub category: String,
    pub style: String,
    pub description: String,
    pub tags: String,
    pub source: String,
    #[serde(default)]
    pub capabilities: Vec<String>,
}
fn validate_details(d: &AssetDetails) -> Result<(), String> {
    if d.name.trim().is_empty()
        || d.name.chars().count() > 120
        || d.description.len() > 12000
        || d.tags.len() > 2000
        || d.source.len() > 4000
        || d.style.len() > 100
    {
        return Err("名称必填，且字段长度不能超出限制".into());
    }
    if ![
        "character",
        "building",
        "furniture",
        "plant",
        "vehicle",
        "prop",
        "other",
    ]
    .contains(&d.category.as_str())
    {
        return Err("无效分类".into());
    }
    if d.capabilities.iter().any(|v| {
        ![
            "stand",
            "walk",
            "sit",
            "interior",
            "entrance",
            "door_open",
            "recolor",
        ]
        .contains(&v.as_str())
    }) {
        return Err("无效能力标签".into());
    }
    Ok(())
}
#[tauri::command]
pub fn assets3d_publish(
    app: AppHandle,
    job_id: String,
    details: AssetDetails,
    asset_id: Option<String>,
) -> Result<String, String> {
    validate_details(&details)?;
    let runtime = app.state::<AssetImportRuntime>();
    let _publication = runtime.publication.lock().map_err(|e| e.to_string())?;
    publish_asset(
        &app.state::<AssetLibraryDb>(),
        &root(&app)?,
        job_id,
        details,
        asset_id,
    )
}
fn publish_asset(
    db: &AssetLibraryDb,
    directory: &Path,
    job_id: String,
    details: AssetDetails,
    asset_id: Option<String>,
) -> Result<String, String> {
    let mut job = db.job(&job_id)?;
    if !matches!(
        job.status.as_str(),
        "awaiting_confirmation" | "publishing" | "completed"
    ) {
        return Err("请先完成模型整理".into());
    }
    if job.status == "completed" {
        return job.report["assetId"]
            .as_str()
            .map(str::to_string)
            .ok_or("已完成任务缺少资产编号".into());
    }
    let assets = db.assets()?;
    let fingerprint = job.report["fingerprint"]
        .as_str()
        .ok_or("缺少依赖指纹")?
        .to_string();
    if asset_id.is_none() && job.status != "publishing" {
        if let Some(existing) = assets.iter().find(|a| a.fingerprint == fingerprint) {
            job.report["assetId"] = json!(existing.id);
            save(&db, &mut job, "completed", "复用已有资产")?;
            return Ok(existing.id.clone());
        }
    }
    let id = if job.status == "publishing" {
        job.report["assetId"]
            .as_str()
            .ok_or("恢复任务缺少资产编号")?
            .to_string()
    } else {
        asset_id.clone().unwrap_or_else(|| job_id.clone())
    };
    if !valid_id(&id) || !valid_id(&job_id) {
        return Err("无效资产编号".into());
    }
    if asset_id.is_some() && !assets.iter().any(|a| a.id == id) {
        return Err("目标资产不存在".into());
    }
    let work = job.report["workDirectory"]
        .as_str()
        .ok_or("缺少任务目录")?
        .to_string();
    if !Path::new(&work)
        .components()
        .all(|c| matches!(c, std::path::Component::Normal(_)))
    {
        return Err("无效任务路径".into());
    }
    let staging = directory.join(&work).join("payload");
    let destination = directory.join(&id).join(&job_id);
    job.report["assetId"] = json!(id);
    save(&db, &mut job, "publishing", "")?;
    if !destination.exists() {
        std::fs::create_dir_all(destination.parent().unwrap()).map_err(|e| e.to_string())?;
        std::fs::rename(&staging, &destination)
            .map_err(|e| format!("资产目录发布失败，可重试：{e}"))?;
    }
    if !destination.join("prepared/model.blend").is_file() {
        return Err("制作版本缺失，请修复文件后重试".into());
    }
    for key in ["sourcePath", "preparedPath", "previewPath", "thumbnailPath"] {
        if let Some(path) = job.report[key].as_str() {
            if let Some((_, suffix)) = path.split_once("/payload/") {
                job.report[key] = json!(format!("3d-library/{id}/{job_id}/{suffix}"));
            }
        }
    }
    let asset = AssetRecord {
        id: id.clone(),
        name: details.name.trim().into(),
        category: details.category,
        style: details.style,
        description: details.description,
        tags: details.tags,
        source: details.source,
        capabilities: details.capabilities,
        status: "ready".into(),
        fingerprint,
        version: job_id,
        report: job.report.clone(),
    };
    job.status = "completed".into();
    db.publish(&asset, &job)?;
    Ok(id)
}
#[tauri::command]
pub fn assets3d_update(
    app: AppHandle,
    asset_id: String,
    details: AssetDetails,
    disabled: bool,
) -> Result<(), String> {
    validate_details(&details)?;
    let runtime = app.state::<AssetImportRuntime>();
    let _publication = runtime.publication.lock().map_err(|e| e.to_string())?;
    let db = app.state::<AssetLibraryDb>();
    let mut a = db
        .assets()?
        .into_iter()
        .find(|a| a.id == asset_id)
        .ok_or("资产不存在")?;
    a.name = details.name;
    a.category = details.category;
    a.style = details.style;
    a.description = details.description;
    a.tags = details.tags;
    a.source = details.source;
    a.capabilities = details.capabilities;
    a.status = if disabled { "disabled" } else { "ready" }.into();
    db.save_asset(&a)
}
#[tauri::command]
pub fn assets3d_reveal(app: AppHandle) -> Result<(), String> {
    let p = root(&app)?;
    std::fs::create_dir_all(&p).map_err(|e| e.to_string())?;
    app.opener()
        .open_path(p.to_string_lossy(), None::<&str>)
        .map_err(|e| e.to_string())
}
#[tauri::command]
pub fn assets3d_scan(app: AppHandle) -> Result<Vec<String>, String> {
    // Only top-level user files and inbox are scanned. Managed versions are never re-imported.
    let root = root(&app)?;
    let mut paths = vec![];
    for directory in [root.clone(), root.join("inbox")] {
        if !directory.exists() {
            continue;
        }
        for entry in std::fs::read_dir(directory).map_err(|e| e.to_string())? {
            let path = entry.map_err(|e| e.to_string())?.path();
            if path.is_file()
                && matches!(
                    path.extension()
                        .and_then(|s| s.to_str())
                        .map(str::to_lowercase)
                        .as_deref(),
                    Some("glb" | "blend")
                )
            {
                paths.push(path.to_string_lossy().into_owned())
            }
        }
    }
    Ok(paths)
}
pub fn initialize(app: &AppHandle) -> Result<(), String> {
    let base = crate::db::db_path()?
        .parent()
        .ok_or("数据目录不存在")?
        .join("sqlite");
    let db = AssetLibraryDb::open(&base)?;
    for mut job in db.jobs()? {
        if matches!(job.status.as_str(), "processing" | "queued") {
            save(
                &db,
                &mut job,
                "interrupted",
                "上次任务中断；重试前请确认旧 Blender 后台进程已停止",
            )?;
        }
    }
    app.manage(db);
    app.manage(AssetImportRuntime::default());
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn details() -> AssetDetails {
        AssetDetails {
            name: "长椅".into(),
            category: "furniture".into(),
            style: "写实".into(),
            description: String::new(),
            tags: "木制".into(),
            source: String::new(),
            capabilities: vec![],
        }
    }
    fn setup_job(db: &AssetLibraryDb, root: &Path, id: &str) {
        let payload = root.join(format!(".imports/{id}/attempt/payload"));
        std::fs::create_dir_all(payload.join("prepared")).unwrap();
        std::fs::write(
            payload.join("prepared/model.blend"),
            b"BLENDER-test-fixture",
        )
        .unwrap();
        db.save_job(&ImportJob{id:id.into(),status:"awaiting_confirmation".into(),error:String::new(),request:json!({}),report:json!({"fingerprint":"hash","workDirectory":format!(".imports/{id}/attempt"),"preparedPath":format!("3d-library/.imports/{id}/attempt/payload/prepared/model.blend")})}).unwrap();
    }
    #[test]
    fn recovers_after_directory_publish_and_sqlite_failure() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().join("library");
        let db = AssetLibraryDb::open(&temp.path().join("sqlite")).unwrap();
        setup_job(&db, &root, "abc");
        db.0.lock().unwrap().execute_batch("CREATE TRIGGER failure BEFORE INSERT ON assets BEGIN SELECT RAISE(ABORT,'test'); END;").unwrap();
        assert!(publish_asset(&db, &root, "abc".into(), details(), None).is_err());
        assert!(root.join("abc/abc/prepared/model.blend").is_file());
        assert_eq!(db.job("abc").unwrap().status, "publishing");
        assert!(db.assets().unwrap().is_empty());
        db.0.lock()
            .unwrap()
            .execute_batch("DROP TRIGGER failure")
            .unwrap();
        drop(db);
        let db = AssetLibraryDb::open(&temp.path().join("sqlite")).unwrap();
        assert_eq!(
            publish_asset(&db, &root, "abc".into(), details(), None).unwrap(),
            "abc"
        );
        assert_eq!(
            db.assets().unwrap()[0].report["preparedPath"],
            "3d-library/abc/abc/prepared/model.blend"
        );
        assert_eq!(
            publish_asset(&db, &root, "abc".into(), details(), None).unwrap(),
            "abc"
        );
        assert_eq!(db.assets().unwrap().len(), 1);
    }
    #[test]
    fn duplicate_reuses_asset_and_version_update_preserves_old_files() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().join("library");
        let db = AssetLibraryDb::open(&temp.path().join("sqlite")).unwrap();
        setup_job(&db, &root, "aaa");
        publish_asset(&db, &root, "aaa".into(), details(), None).unwrap();
        setup_job(&db, &root, "bbb");
        assert_eq!(
            publish_asset(&db, &root, "bbb".into(), details(), None).unwrap(),
            "aaa"
        );
        assert_eq!(db.assets().unwrap().len(), 1);
        setup_job(&db, &root, "ccc");
        publish_asset(&db, &root, "ccc".into(), details(), Some("aaa".into())).unwrap();
        assert!(root.join("aaa/aaa/prepared/model.blend").is_file());
        assert!(root.join("aaa/ccc/prepared/model.blend").is_file());
        assert!(db.version_exists("aaa").unwrap());
        assert!(db.version_exists("ccc").unwrap());
    }
    #[test]
    fn validates_input_and_capability_limits() {
        assert!(!valid_id("../file"));
        assert!(!valid_id(""));
        assert!(valid_id("123-ab"));
        let mut d = details();
        d.name = " ".into();
        assert!(validate_details(&d).is_err());
        d = details();
        d.capabilities = vec!["unverified-magic".into()];
        assert!(validate_details(&d).is_err());
    }
}
