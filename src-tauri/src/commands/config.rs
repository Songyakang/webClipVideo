use rusqlite::{Connection, OptionalExtension};
use std::collections::{HashMap, HashSet};
/// Application configuration lives in sqlite/config.db, imported once from legacy config.json.
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, OnceLock};

static CONFIG_DB: OnceLock<Arc<Mutex<Connection>>> = OnceLock::new();

pub fn initialize_database(database: &crate::db::Database) -> Result<(), String> {
    CONFIG_DB
        .set(database.config.clone())
        .map_err(|_| "配置数据库已初始化".to_string())
}

use serde::{Deserialize, Serialize};
use serde_json::Value;

// ---------------------------------------------------------------------------
// Platform types
// ---------------------------------------------------------------------------

/// Standard function keys mapped to UI labels.
pub const FUNCTION_KEYS: &[(&str, &str)] = &[
    ("generate-image", "生成图片"),
    ("edit-image", "编辑图片"),
    ("chat", "对话"),
    ("reverse-prompt", "反推提示词"),
];

/// Per-function API endpoint configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EndpointConfig {
    /// Standard function key: "generate-image" | "edit-image" | "chat" | "reverse-prompt"
    pub key: String,
    /// Display name for this function
    pub name: String,
    /// API path relative to baseEndpoint, e.g. "/images/generations"
    pub path: String,
    /// Model name for this function
    pub model: String,
    /// Extra query/body params (optional)
    #[serde(default, skip_serializing_if = "HashMap::is_empty")]
    pub params: HashMap<String, Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Platform {
    pub id: String,
    pub name: String,
    /// "image" | "video" | "text"
    pub platform_type: String,
    /// "local" | "online"
    pub location: String,
    /// API key (for online platforms)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub api_key: Option<String>,
    /// None preserves legacy behavior: a non-empty key implies Bearer auth.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub auth_type: Option<String>,
    /// Base URL, e.g. "https://api.stepfun.com/v1"
    pub base_endpoint: String,
    /// Per-function endpoint configs
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub endpoints: Vec<EndpointConfig>,
}

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

fn canonical_config_path() -> Option<PathBuf> {
    #[cfg(target_os = "macos")]
    {
        let home = std::env::var("HOME").ok()?;
        Some(
            PathBuf::from(home)
                .join("Documents")
                .join("editor-tarui")
                .join("config.json"),
        )
    }
    #[cfg(target_os = "linux")]
    {
        let home = std::env::var("HOME").ok()?;
        Some(
            PathBuf::from(home)
                .join(".local")
                .join("share")
                .join("editor-tarui")
                .join("config.json"),
        )
    }
    #[cfg(target_os = "windows")]
    {
        let appdata = std::env::var("APPDATA").ok()?;
        Some(
            PathBuf::from(appdata)
                .join("editor-tarui")
                .join("config.json"),
        )
    }
    #[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
    {
        None
    }
}

fn fallback_paths() -> Vec<PathBuf> {
    vec![
        PathBuf::from("config.json"),
        PathBuf::from("../config.json"),
        PathBuf::from("../../config.json"),
    ]
}

fn find_config() -> Option<PathBuf> {
    if let Some(p) = canonical_config_path() {
        if p.exists() {
            return Some(p);
        }
    }
    for p in &fallback_paths() {
        if p.exists() {
            return Some(p.clone());
        }
    }
    canonical_config_path()
}

const LEGACY_IMPORT: &str = "legacy_config_json_v1";

/// Import every legacy key in one transaction. Existing SQLite values always win,
/// including empty strings/arrays. A completed import never reads the old file again.
fn import_legacy(conn: &mut Connection, path: Option<&Path>) -> Result<(), String> {
    let tx = conn
        .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)
        .map_err(|e| format!("配置迁移事务失败：{}", e))?;
    let imported: bool = tx
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM app_settings_migrations WHERE name = ?1)",
            [LEGACY_IMPORT],
            |r| r.get(0),
        )
        .map_err(|e| format!("读取迁移状态失败：{}", e))?;
    if imported {
        return Ok(());
    }
    if let Some(path) = path.filter(|p| p.exists()) {
        let content =
            std::fs::read_to_string(path).map_err(|e| format!("读取旧配置失败：{}", e))?;
        let value: Value = if content.trim().is_empty() {
            serde_json::json!({})
        } else {
            serde_json::from_str(&content).map_err(|e| format!("旧配置 JSON 格式错误：{}", e))?
        };
        let object = value
            .as_object()
            .ok_or_else(|| "旧配置必须是 JSON 对象".to_string())?;
        for (key, value) in object {
            tx.execute(
                "INSERT OR IGNORE INTO app_settings (key, value) VALUES (?1, ?2)",
                rusqlite::params![key, value.to_string()],
            )
            .map_err(|e| format!("迁移配置失败：{}", e))?;
        }
    }
    tx.execute(
        "INSERT INTO app_settings_migrations (name) VALUES (?1)",
        [LEGACY_IMPORT],
    )
    .map_err(|e| format!("记录迁移状态失败：{}", e))?;
    tx.commit().map_err(|e| format!("提交配置迁移失败：{}", e))
}

fn with_config_db<T>(
    operation: impl FnOnce(&Connection) -> Result<T, String>,
) -> Result<T, String> {
    let db = CONFIG_DB
        .get()
        .ok_or_else(|| "配置数据库尚未初始化".to_string())?;
    let mut conn = db.lock().map_err(|_| "配置数据库锁不可用".to_string())?;
    // Check before even resolving legacy paths after the initial import.
    let imported: bool = conn
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM app_settings_migrations WHERE name = ?1)",
            [LEGACY_IMPORT],
            |r| r.get(0),
        )
        .map_err(|e| format!("读取迁移状态失败：{}", e))?;
    if !imported {
        import_legacy(&mut conn, find_config().as_deref())?;
    }
    operation(&conn)
}

fn read_config_from(conn: &Connection) -> Result<Value, String> {
    let mut statement = conn
        .prepare("SELECT key, value FROM app_settings")
        .map_err(|e| format!("读取配置失败：{}", e))?;
    let rows = statement
        .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))
        .map_err(|e| format!("读取配置失败：{}", e))?;
    let mut result = serde_json::Map::new();
    for row in rows {
        let (key, value) = row.map_err(|e| format!("读取配置失败：{}", e))?;
        result.insert(
            key,
            serde_json::from_str(&value).map_err(|_| "数据库配置格式错误".to_string())?,
        );
    }
    Ok(Value::Object(result))
}

fn read_config() -> Result<Value, String> {
    with_config_db(read_config_from)
}

fn write_setting(conn: &Connection, key: &str, value: &Value) -> Result<(), String> {
    conn.execute("INSERT INTO app_settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        rusqlite::params![key, value.to_string()]).map_err(|e| format!("保存配置失败：{}", e))?;
    Ok(())
}

#[tauri::command]
pub fn get_config_key(key: String) -> Result<Option<Value>, String> {
    with_config_db(|conn| {
        let value: Option<String> = conn
            .query_row(
                "SELECT value FROM app_settings WHERE key = ?1",
                [key],
                |r| r.get(0),
            )
            .optional()
            .map_err(|e| format!("读取配置失败：{}", e))?;
        value
            .map(|v| serde_json::from_str(&v).map_err(|_| "数据库配置格式错误".to_string()))
            .transpose()
    })
}

// ---------------------------------------------------------------------------
// Public helpers (used by other command modules)
// ---------------------------------------------------------------------------

pub fn get_api_key(service: &str) -> Result<String, String> {
    let config = read_config()?;
    let field = match service {
        "stepfun" => "stepfun_api_key",
        "deepseek" => "deepseek_api_key",
        "tripo" => "tripo_api_key",
        other => return Err(format!("Unknown service: {}", other)),
    };
    config
        .get(field)
        .and_then(|v| v.as_str())
        .filter(|k| !k.is_empty())
        .map(|k| k.to_string())
        .ok_or_else(|| format!("Config missing {}", field))
}

// ---------------------------------------------------------------------------
// Platform resolution
// ---------------------------------------------------------------------------

/// Resolve a platform's endpoint config for a given function key.
/// Returns (base_endpoint, path, model, api_key).
pub fn resolve_platform(
    platform_id: &str,
    function_key: &str,
) -> Result<(String, String, String, Option<String>), String> {
    let platforms: Vec<Platform> = get_platforms_internal()?;
    let platform = platforms
        .iter()
        .find(|p| p.id == platform_id)
        .ok_or_else(|| format!("Platform not found: {}", platform_id))?;

    let ep = platform
        .endpoints
        .iter()
        .find(|e| e.key == function_key)
        .ok_or_else(|| {
            format!(
                "Platform '{}' has no endpoint for '{}'",
                platform.name, function_key
            )
        })?;

    Ok((
        platform
            .base_endpoint
            .trim()
            .trim_end_matches('/')
            .to_string(),
        format!("/{}", ep.path.trim().trim_start_matches('/')),
        ep.model.clone(),
        platform_auth(platform)?,
    ))
}

fn get_platforms_internal() -> Result<Vec<Platform>, String> {
    let config = read_config()?;
    match config.get("platforms") {
        None => Ok(Vec::new()),
        Some(value) => serde_json::from_value(value.clone())
            .map_err(|e| format!("平台配置格式错误，请修复配置后重试：{}", e)),
    }
}

// ---------------------------------------------------------------------------
// Tauri commands
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn get_all_config() -> Result<Value, String> {
    read_config()
}

#[tauri::command]
pub fn set_config_key(key: String, value: String) -> Result<(), String> {
    with_config_db(|conn| write_setting(conn, &key, &Value::String(value)))
}

#[tauri::command]
pub fn get_platforms() -> Result<Vec<Platform>, String> {
    get_platforms_internal()
}

#[tauri::command]
pub fn save_platforms(mut platforms: Vec<Platform>) -> Result<(), String> {
    let mut ids = HashSet::new();
    for platform in &mut platforms {
        validate_platform(platform)?;
        if platform.id.is_empty() || !ids.insert(platform.id.clone()) {
            return Err("平台 ID 不能为空或重复".into());
        }
    }
    let value =
        serde_json::to_value(&platforms).map_err(|e| format!("serialize platforms: {}", e))?;
    with_config_db(|conn| write_setting(conn, "platforms", &value))
}

/// Join paths without discarding an existing base path such as /v1.
pub fn endpoint_url(base: &str, path: &str) -> Result<String, String> {
    let url = reqwest::Url::parse(base.trim())
        .map_err(|_| "请输入有效的 HTTP(S) 服务地址".to_string())?;
    if !matches!(url.scheme(), "http" | "https")
        || url.host_str().is_none()
        || url.query().is_some()
        || url.fragment().is_some()
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return Err("服务地址须为 HTTP(S)，不能包含认证信息、查询参数或片段".into());
    }
    let path = path.trim().trim_start_matches('/');
    if path.is_empty() || path.contains("://") || path.contains('?') || path.contains('#') {
        return Err("接口路径不能为空，且必须是相对路径".into());
    }
    Ok(format!("{}/{}", base.trim().trim_end_matches('/'), path))
}

pub fn validate_platform(platform: &mut Platform) -> Result<(), String> {
    platform.name = platform.name.trim().to_string();
    platform.base_endpoint = platform
        .base_endpoint
        .trim()
        .trim_end_matches('/')
        .to_string();
    if platform.name.is_empty() {
        return Err("请填写平台名称".into());
    }
    if !matches!(platform.location.as_str(), "local" | "online") {
        return Err("无效的平台位置".into());
    }
    if !matches!(platform.platform_type.as_str(), "text" | "image" | "video") {
        return Err("无效的平台类型".into());
    }
    platform.api_key = platform
        .api_key
        .as_ref()
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty());
    match platform.auth_type.as_deref() {
        Some("bearer") if platform.api_key.is_none() => {
            return Err("Bearer 认证需要填写 API Key".into())
        }
        Some("none") | Some("bearer") | None => {}
        _ => return Err("不支持的认证方式".into()),
    }
    if platform.endpoints.is_empty() {
        return Err("请至少配置一个接口".into());
    }
    let mut keys = HashSet::new();
    for ep in &mut platform.endpoints {
        if !FUNCTION_KEYS.iter().any(|(k, _)| *k == ep.key) {
            return Err("请选择有效的接口功能".into());
        }
        if !keys.insert(ep.key.clone()) {
            return Err(format!("接口功能 {} 重复", ep.key));
        }
        ep.model = ep.model.trim().to_string();
        ep.path = format!("/{}", ep.path.trim().trim_start_matches('/'));
        endpoint_url(&platform.base_endpoint, &ep.path)?;
        if ep.model.is_empty() {
            return Err(format!("请填写 {} 的模型名称", ep.key));
        }
        validate_params(&ep.params)?;
    }
    Ok(())
}

pub fn validate_params(params: &HashMap<String, Value>) -> Result<(), String> {
    for key in ["model", "messages", "stream"] {
        if params.contains_key(key) {
            return Err(format!("额外参数不能覆盖 {}", key));
        }
    }
    if let Some(value) = params.get("temperature") {
        if !value.as_f64().is_some_and(|v| (0.0..=2.0).contains(&v)) {
            return Err("temperature 必须是 0 到 2 之间的数字".into());
        }
    }
    for key in ["max_tokens", "max_completion_tokens"] {
        if let Some(value) = params.get(key) {
            if !value.as_u64().is_some_and(|v| v > 0) {
                return Err(format!("{} 必须是正整数", key));
            }
        }
    }
    if params.contains_key("max_tokens") && params.contains_key("max_completion_tokens") {
        return Err("max_tokens 与 max_completion_tokens 只能设置一个".into());
    }
    Ok(())
}

pub fn get_platform(id: &str) -> Result<Platform, String> {
    get_platforms_internal()?
        .into_iter()
        .find(|p| p.id == id)
        .ok_or_else(|| "所选平台已删除，请重新选择".to_string())
}

pub fn platform_auth(platform: &Platform) -> Result<Option<String>, String> {
    if platform.auth_type.as_deref() == Some("none") {
        return Ok(None);
    }
    let key = platform
        .api_key
        .as_ref()
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty());
    if platform.auth_type.as_deref() == Some("bearer") && key.is_none() {
        return Err("Bearer 认证需要填写 API Key".into());
    }
    Ok(key)
}

#[cfg(test)]
mod storage_tests {
    use super::*;
    fn database() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        crate::db::run_migrations(&conn).unwrap();
        conn
    }
    #[test]
    fn imports_all_values_once_and_sqlite_wins() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("config.json");
        std::fs::write(
            &path,
            r#"{"deepseek_api_key":"old-key","platforms":[{"id":"old"}],"extra":{"enabled":true}}"#,
        )
        .unwrap();
        let mut conn = database();
        write_setting(&conn, "deepseek_api_key", &Value::String("new-key".into())).unwrap();
        import_legacy(&mut conn, Some(&path)).unwrap();
        let config = read_config_from(&conn).unwrap();
        assert_eq!(config["deepseek_api_key"], "new-key");
        assert_eq!(config["platforms"][0]["id"], "old");
        assert_eq!(config["extra"]["enabled"], true);
        write_setting(&conn, "platforms", &serde_json::json!([])).unwrap();
        std::fs::write(&path, "broken after import").unwrap();
        import_legacy(&mut conn, Some(&path)).unwrap();
        assert_eq!(
            read_config_from(&conn).unwrap()["platforms"],
            serde_json::json!([])
        );
        assert!(path.exists());
    }
    #[test]
    fn invalid_legacy_does_not_mark_import_complete_and_can_retry() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("config.json");
        let mut conn = database();
        for content in ["{", "null", "[]"] {
            std::fs::write(&path, content).unwrap();
            assert!(import_legacy(&mut conn, Some(&path)).is_err());
            assert_eq!(
                conn.query_row("SELECT COUNT(*) FROM app_settings_migrations", [], |r| r
                    .get::<_, i64>(0))
                    .unwrap(),
                0
            );
            assert_eq!(read_config_from(&conn).unwrap(), serde_json::json!({}));
        }
        std::fs::write(&path, r#"{"platforms":[]}"#).unwrap();
        import_legacy(&mut conn, Some(&path)).unwrap();
        assert_eq!(
            read_config_from(&conn).unwrap()["platforms"],
            serde_json::json!([])
        );
    }
    #[test]
    fn failed_import_rolls_back_all_keys_and_marker() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("config.json");
        std::fs::write(&path, r#"{"a":"first","z":"reject"}"#).unwrap();
        let mut conn = database();
        conn.execute_batch("CREATE TRIGGER reject_setting BEFORE INSERT ON app_settings WHEN NEW.key = 'z' BEGIN SELECT RAISE(ABORT, 'test failure'); END;").unwrap();
        assert!(import_legacy(&mut conn, Some(&path)).is_err());
        assert_eq!(read_config_from(&conn).unwrap(), serde_json::json!({}));
        assert_eq!(
            conn.query_row("SELECT COUNT(*) FROM app_settings_migrations", [], |r| r
                .get::<_, i64>(0))
                .unwrap(),
            0
        );
    }
    #[test]
    fn new_install_and_reopen_preserve_independent_settings() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("data.db");
        {
            let db = crate::db::Database::open_at(&path).unwrap();
            let mut conn = db.conn.lock().unwrap();
            import_legacy(&mut conn, None).unwrap();
            write_setting(
                &conn,
                "platforms",
                &serde_json::json!([{"id":"local","params":{"temperature":0.3}}]),
            )
            .unwrap();
            write_setting(&conn, "llm-chat", &serde_json::json!("platform:local")).unwrap();
            write_setting(&conn, "deepseek_api_key", &serde_json::json!("key")).unwrap();
        }
        let db = crate::db::Database::open_at(&path).unwrap();
        let config = read_config_from(&db.conn.lock().unwrap()).unwrap();
        assert_eq!(config["platforms"][0]["params"]["temperature"], 0.3);
        assert_eq!(config["llm-chat"], "platform:local");
        assert_eq!(config["deepseek_api_key"], "key");
    }
}
