use std::path::PathBuf;
use serde::Serialize;
use tauri::AppHandle;
use tauri::Manager;

const TRIPO_BASE: &str = "https://openapi.tripo3d.com/v3";

fn get_api_key() -> Result<String, String> {
    crate::commands::config::get_api_key("tripo")
}

#[derive(Serialize)]
pub struct Generate3DResult {
    pub model_id: String,
    pub model_path: String,
    pub thumbnail_path: String,
    pub vertex_count: i64,
    pub face_count: i64,
}

async fn ensure_models_dir(app: &AppHandle, project_id: &str) -> Result<PathBuf, String> {
    let doc_dir = app
        .path()
        .document_dir()
        .map_err(|e| format!("document dir error: {}", e))?;
    let models_dir = doc_dir
        .join("editor-tarui")
        .join(project_id)
        .join("models");
    tokio::fs::create_dir_all(&models_dir)
        .await
        .map_err(|e| format!("mkdir error: {}", e))?;
    Ok(models_dir)
}

fn build_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(60))
        .connect_timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| format!("client build failed: {}", e))
}

async fn download_file(url: &str, dest: &PathBuf) -> Result<(), String> {
    let client = build_client()?;
    let resp = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("download failed: {}", e))?;
    if !resp.status().is_success() {
        return Err(format!("download returned HTTP {}", resp.status()));
    }
    let bytes = resp
        .bytes()
        .await
        .map_err(|e| format!("read body failed: {}", e))?;
    tokio::fs::write(dest, &bytes)
        .await
        .map_err(|e| format!("write file failed: {}", e))?;
    Ok(())
}

#[tauri::command]
pub async fn generate_3d(
    app: AppHandle,
    image_path: String,
    project_id: String,
) -> Result<Generate3DResult, String> {
    let api_key = get_api_key()?;
    let client = build_client()?;

    // Step 1: upload image to get file_token
    let file_bytes = tokio::fs::read(&image_path)
        .await
        .map_err(|e| format!("read image failed: {}", e))?;
    let part = reqwest::multipart::Part::bytes(file_bytes)
        .file_name("image.png")
        .mime_str("image/png")
        .map_err(|e| format!("build multipart: {}", e))?;
    let form = reqwest::multipart::Form::new().part("file", part);
    let upload_resp = client
        .post(format!("{}/files", TRIPO_BASE))
        .header("Authorization", format!("Bearer {}", &api_key))
        .multipart(form)
        .send()
        .await
        .map_err(|e| format!("upload failed: {}", e))?;
    let upload_body: serde_json::Value = upload_resp
        .json()
        .await
        .map_err(|e| format!("parse upload response: {}", e))?;
    if upload_body.get("code").and_then(|v| v.as_i64()) != Some(0) {
        let msg = upload_body
            .get("message")
            .and_then(|v| v.as_str())
            .unwrap_or("unknown error");
        return Err(format!("upload error: {}", msg));
    }
    let file_token = upload_body
        .pointer("/data/file_token")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "no file_token in upload response".to_string())?
        .to_string();

    // Step 2: submit generation task
    let gen_body = serde_json::json!({
        "file": { "file_token": &file_token },
        "model": "v3.1-20260211",
    });
    let gen_resp = client
        .post(format!("{}/generation/image-to-model", TRIPO_BASE))
        .header("Authorization", format!("Bearer {}", &api_key))
        .header("Content-Type", "application/json")
        .json(&gen_body)
        .send()
        .await
        .map_err(|e| format!("generate request failed: {}", e))?;
    let gen_body: serde_json::Value = gen_resp
        .json()
        .await
        .map_err(|e| format!("parse generate response: {}", e))?;
    if gen_body.get("code").and_then(|v| v.as_i64()) != Some(0) {
        let msg = gen_body
            .get("message")
            .and_then(|v| v.as_str())
            .unwrap_or("unknown error");
        return Err(format!("generate error: {}", msg));
    }
    let task_id = gen_body
        .pointer("/data/task_id")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "no task_id in generate response".to_string())?
        .to_string();

    // Step 3: poll until done
    let mut attempts = 0u32;
    let task_url = format!("{}/generation/{}", TRIPO_BASE, &task_id);
    loop {
        attempts += 1;
        if attempts > 120 {
            return Err("poll timeout after 120s".to_string());
        }
        let poll_resp = client
            .get(&task_url)
            .header("Authorization", format!("Bearer {}", &api_key))
            .send()
            .await
            .map_err(|e| format!("poll failed: {}", e))?;
        let poll_body: serde_json::Value = poll_resp
            .json()
            .await
            .map_err(|e| format!("parse poll response: {}", e))?;
        if poll_body.get("code").and_then(|v| v.as_i64()) != Some(0) {
            let msg = poll_body
                .get("message")
                .and_then(|v| v.as_str())
                .unwrap_or("unknown error");
            return Err(format!("poll error: {}", msg));
        }
        let status = poll_body
            .pointer("/data/status")
            .and_then(|v| v.as_str())
            .unwrap_or("processing");
        match status {
            "success" | "completed" => {
                // Step 4: download model
                let models_dir = ensure_models_dir(&app, &project_id).await?;
                let model_id = format!("model_{}", &task_id);

                let output = poll_body
                    .get("data")
                    .and_then(|d| d.get("output"))
                    .ok_or_else(|| "no output in completed task".to_string())?;

                let model_url = output
                    .get("model")
                    .and_then(|v| v.as_str())
                    .or_else(|| output.get("glb").and_then(|v| v.as_str()))
                    .or_else(|| output.get("url").and_then(|v| v.as_str()))
                    .ok_or_else(|| "no model url in output".to_string())?;

                let model_ext = model_url
                    .rsplit('?')
                    .next()
                    .unwrap_or("")
                    .rsplit('.')
                    .next()
                    .unwrap_or("glb");
                let model_filename = format!("{}.{}", model_id, model_ext);
                let model_path = models_dir.join(&model_filename);
                download_file(model_url, &model_path).await?;

                let thumbnail_url = output
                    .get("thumbnail")
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                let thumb_filename = format!("{}.png", model_id);
                let thumb_path = models_dir.join(&thumb_filename);
                if !thumbnail_url.is_empty() {
                    download_file(thumbnail_url, &thumb_path).await?;
                }

                let vertex_count = output
                    .get("vertex_count")
                    .and_then(|v| v.as_i64())
                    .unwrap_or(0);
                let face_count = output
                    .get("face_count")
                    .and_then(|v| v.as_i64())
                    .unwrap_or(0);

                let model_relative = format!("{}/models/{}", project_id, model_filename);
                let thumb_relative = format!("{}/models/{}", project_id, thumb_filename);

                return Ok(Generate3DResult {
                    model_id,
                    model_path: model_relative,
                    thumbnail_path: thumb_relative,
                    vertex_count,
                    face_count,
                });
            }
            "failed" | "cancelled" | "error" => {
                return Err(format!("task status: {}", status));
            }
            _ => {
                tokio::time::sleep(std::time::Duration::from_secs(2)).await;
                continue;
            }
        }
    }
}
