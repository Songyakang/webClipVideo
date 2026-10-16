use super::text_scene::{parse_scene, TextScene};
use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde::Serialize;
use serde_json::{json, Value};
use std::{
    io::{Read, Write},
    net::{SocketAddr, TcpStream},
    path::{Path, PathBuf},
    sync::atomic::{AtomicBool, AtomicU64, Ordering},
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Manager};
use tauri_plugin_opener::OpenerExt;

const ADDRESS: &str = "127.0.0.1:9876";
const SCRIPT: &str = include_str!("../blender/build_scene.py");
static BUILDING: AtomicBool = AtomicBool::new(false);
static SEQUENCE: AtomicU64 = AtomicU64::new(0);
struct BuildGuard;
impl BuildGuard {
    fn acquire() -> Result<Self, String> {
        BUILDING
            .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
            .map_err(|_| "Blender 正在处理另一个生成任务，请等待完成后重试".to_string())?;
        Ok(Self)
    }
}
impl Drop for BuildGuard {
    fn drop(&mut self) {
        BUILDING.store(false, Ordering::SeqCst);
    }
}

/// The MCP add-on's local JSON socket. No dependency on Codex or a Python runtime in the app.
fn exchange(address: SocketAddr, command: Value, timeout: Duration) -> Result<Value, String> {
    let mut stream = TcpStream::connect_timeout(&address, Duration::from_secs(2))
        .map_err(|_| "无法连接本地 Blender。请打开 Blender，并在 Blender MCP 插件中启动服务（127.0.0.1:9876）".to_string())?;
    stream
        .set_write_timeout(Some(Duration::from_secs(5)))
        .map_err(|e| e.to_string())?;
    stream
        .write_all(&serde_json::to_vec(&command).map_err(|e| e.to_string())?)
        .map_err(|_| "发送 Blender 任务失败，请检查插件连接".to_string())?;
    let deadline = Instant::now() + timeout;
    let mut bytes = Vec::new();
    loop {
        let remaining = deadline
            .checked_duration_since(Instant::now())
            .ok_or("Blender 响应超时；任务可能仍在执行，请在 Blender 中检查后重试")?;
        stream
            .set_read_timeout(Some(remaining))
            .map_err(|e| e.to_string())?;
        let mut buffer = [0u8; 8192];
        let size = stream.read(&mut buffer).map_err(|_| {
            "Blender 响应超时或连接中断；任务可能仍在执行，请在 Blender 中检查后重试".to_string()
        })?;
        if size == 0 {
            return Err("Blender 在返回结果前断开连接".into());
        }
        bytes.extend_from_slice(&buffer[..size]);
        if bytes.len() > 8 * 1024 * 1024 {
            return Err("Blender 返回的数据过大".into());
        }
        match serde_json::from_slice::<Value>(&bytes) {
            Ok(response) => {
                if response["status"] != "success" {
                    return Err(format!(
                        "Blender 执行失败：{}",
                        response["message"].as_str().unwrap_or("未知错误")
                    ));
                }
                return Ok(response["result"].clone());
            }
            Err(error) if error.is_eof() => continue,
            Err(_) => return Err("Blender 插件返回了无效的数据".into()),
        }
    }
}
fn command(kind: &str, params: Value, seconds: u64) -> Result<Value, String> {
    exchange(
        ADDRESS.parse().unwrap(),
        json!({"type":kind,"params":params}),
        Duration::from_secs(seconds),
    )
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BlenderStatus {
    available: bool,
    version: Option<String>,
    message: String,
}
#[tauri::command]
pub async fn get_blender_status() -> Result<BlenderStatus, String> {
    tauri::async_runtime::spawn_blocking(|| match command("get_addon_info", json!({}), 4) {
        Ok(info)
            if info["capabilities"]
                .as_array()
                .is_some_and(|caps| caps.iter().any(|c| c == "execute_code")) =>
        {
            BlenderStatus {
                available: true,
                version: info["blender_version"].as_str().map(str::to_string),
                message: "Blender 已连接".into(),
            }
        }
        Ok(_) => BlenderStatus {
            available: false,
            version: None,
            message: "Blender MCP 插件不支持代码执行，请更新插件".into(),
        },
        Err(message) => BlenderStatus {
            available: false,
            version: None,
            message,
        },
    })
    .await
    .map_err(|e| e.to_string())
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BlenderResult {
    pub job_id: String,
    pub model_path: String,
    pub blend_path: String,
    pub prefix: String,
}

fn build_script(scene: &TextScene, job_id: &str, directory: &Path) -> Result<String, String> {
    let payload = json!({"scene":scene,"jobId":job_id,
        "glbPath":directory.join("scene.glb").to_str().ok_or("输出路径编码无效")?,
        "blendPath":directory.join("scene.blend").to_str().ok_or("输出路径编码无效")?});
    let encoded = STANDARD.encode(serde_json::to_vec(&payload).map_err(|e| e.to_string())?);
    Ok(format!("{SCRIPT}\nimport base64\n_editor_payload = json.loads(base64.b64decode('{encoded}'))\nprint('EDITOR_BLENDER_RESULT:' + json.dumps(build_editor_scene(_editor_payload)))\n"))
}
fn validate_outputs(directory: &Path) -> Result<(), String> {
    for (name, magic) in [
        ("scene.glb", &b"glTF"[..]),
        ("scene.blend", &b"BLENDER"[..]),
    ] {
        let path = directory.join(name);
        let mut file =
            std::fs::File::open(&path).map_err(|_| format!("Blender 未输出 {name}，请重试"))?;
        let mut header = [0; 7];
        file.read_exact(&mut header)
            .map_err(|_| format!("Blender 输出的 {name} 不完整"))?;
        // Compressed .blend uses zstd (Blender 3+) or gzip; Blender owns that encoding.
        let compressed = name.ends_with(".blend")
            && (header.starts_with(&[0x28, 0xb5, 0x2f, 0xfd]) || header.starts_with(&[0x1f, 0x8b]));
        if !header.starts_with(magic) && !compressed {
            return Err(format!("Blender 输出的 {name} 格式无效"));
        }
        if file.metadata().map_err(|e| e.to_string())?.len() < 20 {
            return Err(format!("Blender 输出的 {name} 不完整"));
        }
    }
    Ok(())
}
fn run_build(scene: TextScene, root: PathBuf) -> Result<BlenderResult, String> {
    let _guard = BuildGuard::acquire()?;
    // Validate IPC input again: callers cannot supply Python or arbitrary asset paths.
    let scene = parse_scene(&serde_json::to_string(&scene).map_err(|e| e.to_string())?)?;
    command("get_addon_info", json!({}), 4)?;
    let job_id = format!(
        "{:x}-{:x}",
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|e| e.to_string())?
            .as_nanos(),
        SEQUENCE.fetch_add(1, Ordering::Relaxed)
    );
    // 直接让 Blender 写入画布素材目录，生成结果可立即被前端资产协议读取。
    let directory = root.join(&job_id);
    let build_result = (|| -> Result<BlenderResult, String> {
        std::fs::create_dir_all(&root).map_err(|e| format!("无法创建 Blender 输出目录：{e}"))?;
        std::fs::create_dir(&directory).map_err(|e| format!("无法创建 Blender 任务目录：{e}"))?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&directory, std::fs::Permissions::from_mode(0o777))
                .map_err(|e| format!("无法设置 Blender 输出目录权限：{e}"))?;
        }
        let code = build_script(&scene, &job_id, &directory)?;
        let result = command("execute_code", json!({"code":code}), 120)?;
        let output = result["result"].as_str().unwrap_or("");
        let line = output
            .lines()
            .find_map(|line| line.strip_prefix("EDITOR_BLENDER_RESULT:"))
            .ok_or("Blender 未确认导出完成，请检查插件日志")?;
        let completed: Value = serde_json::from_str(line).map_err(|_| "Blender 导出结果无效")?;
        if completed["jobId"] != job_id {
            return Err("Blender 返回了不匹配的任务结果".into());
        }
        validate_outputs(&directory)?;
        Ok(BlenderResult {
            model_path: format!("blender/{job_id}/scene.glb"),
            blend_path: format!("blender/{job_id}/scene.blend"),
            prefix: format!("ET_{job_id}_"),
            job_id,
        })
    })();
    build_result
}
#[tauri::command]
pub async fn build_blender_scene(
    app: AppHandle,
    scene: TextScene,
) -> Result<BlenderResult, String> {
    let root = app
        .path()
        .document_dir()
        .map_err(|e| e.to_string())?
        .join("editor-tarui/assets/blender");
    tauri::async_runtime::spawn_blocking(move || run_build(scene, root))
        .await
        .map_err(|e| e.to_string())?
}
fn valid_job_id(id: &str) -> bool {
    !id.is_empty() && id.len() <= 64 && id.bytes().all(|b| b.is_ascii_hexdigit() || b == b'-')
}
#[tauri::command]
pub fn reveal_blender_output(app: AppHandle, job_id: String) -> Result<(), String> {
    if !valid_job_id(&job_id) {
        return Err("无效的 Blender 任务编号".into());
    }
    let path = app
        .path()
        .document_dir()
        .map_err(|e| e.to_string())?
        .join("editor-tarui/assets/blender")
        .join(job_id)
        .join("scene.blend");
    if !path.is_file() {
        return Err("Blender 输出文件不存在".into());
    }
    app.opener()
        .reveal_item_in_dir(path)
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_output_path_traversal_and_missing_files() {
        for id in ["../secret", "", "/tmp", "a/b", "a.b"] {
            assert!(!valid_job_id(id));
        }
        assert!(valid_job_id("1ac-0"));
        let dir = tempfile::tempdir().unwrap();
        assert!(validate_outputs(dir.path()).is_err());
    }
    #[test]
    fn build_guard_releases_on_error() {
        let guard = BuildGuard::acquire().unwrap();
        assert!(BuildGuard::acquire().is_err());
        drop(guard);
        assert!(BuildGuard::acquire().is_ok());
    }
}
