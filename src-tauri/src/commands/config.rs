/// Centralized config management.
///
/// Config is stored at `$DOCUMENT_DIR/editor-tarui/config.json`.
/// Falls back to relative paths for development.
///
/// Two config layers:
/// 1. Flat keys: stepfun_api_key, deepseek_api_key, tripo_api_key (backward compat)
/// 2. Platforms array: user-defined platforms with type/image/video/text + local/online

use std::path::PathBuf;
use std::collections::HashMap;
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
    pub params: HashMap<String, String>,
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
        Some(PathBuf::from(home).join("Documents").join("editor-tarui").join("config.json"))
    }
    #[cfg(target_os = "linux")]
    {
        let home = std::env::var("HOME").ok()?;
        Some(PathBuf::from(home).join(".local").join("share").join("editor-tarui").join("config.json"))
    }
    #[cfg(target_os = "windows")]
    {
        let appdata = std::env::var("APPDATA").ok()?;
        Some(PathBuf::from(appdata).join("editor-tarui").join("config.json"))
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

fn read_config() -> Result<Value, String> {
    let path = find_config();
    match &path {
        Some(p) if p.exists() => {
            let content = std::fs::read_to_string(p)
                .map_err(|e| format!("Failed to read config: {}", e))?;
            if content.trim().is_empty() {
                return Ok(serde_json::json!({}));
            }
            serde_json::from_str(&content)
                .map_err(|e| format!("Failed to parse config: {}", e))
        }
        _ => Ok(serde_json::json!({})),
    }
}

fn write_config(data: &Value) -> Result<(), String> {
    let path = canonical_config_path().ok_or_else(|| "Cannot determine config path".to_string())?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create config dir: {}", e))?;
    }
    let content = serde_json::to_string_pretty(data)
        .map_err(|e| format!("Failed to serialize config: {}", e))?;
    std::fs::write(&path, &content)
        .map_err(|e| format!("Failed to write config: {}", e))?;
    Ok(())
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
pub fn resolve_platform(platform_id: &str, function_key: &str) -> Result<(String, String, String, Option<String>), String> {
    let platforms: Vec<Platform> = get_platforms_internal()?;
    let platform = platforms
        .iter()
        .find(|p| p.id == platform_id)
        .ok_or_else(|| format!("Platform not found: {}", platform_id))?;

    let ep = platform
        .endpoints
        .iter()
        .find(|e| e.key == function_key)
        .ok_or_else(|| format!("Platform '{}' has no endpoint for '{}'", platform.name, function_key))?;

    Ok((
        platform.base_endpoint.clone(),
        ep.path.clone(),
        ep.model.clone(),
        platform.api_key.clone(),
    ))
}

fn get_platforms_internal() -> Result<Vec<Platform>, String> {
    let config = read_config()?;
    let platforms = config
        .get("platforms")
        .and_then(|v| serde_json::from_value(v.clone()).ok())
        .unwrap_or_default();
    Ok(platforms)
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
    let mut config = read_config()?;
    config[&key] = Value::String(value);
    write_config(&config)?;
    Ok(())
}

#[tauri::command]
pub fn get_platforms() -> Result<Vec<Platform>, String> {
    let config = read_config()?;
    let platforms = config
        .get("platforms")
        .and_then(|v| serde_json::from_value(v.clone()).ok())
        .unwrap_or_default();
    Ok(platforms)
}

#[tauri::command]
pub fn save_platforms(platforms: Vec<Platform>) -> Result<(), String> {
    let mut config = read_config()?;
    config["platforms"] = serde_json::to_value(&platforms)
        .map_err(|e| format!("serialize platforms: {}", e))?;
    write_config(&config)?;
    Ok(())
}
