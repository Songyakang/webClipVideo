use std::path::PathBuf;
use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use tauri::Manager;

const TRIPO_API_URL: &str = "https://api.tripo3d.ai/v2/openapi";
const TRIPO_API_KEY: &str = "placeholder-api-key";

#[derive(Serialize)]
struct TripoGenerateRequest {
    #[serde(rename = "type")]
    request_type: String,
    file_url: String,
    model_version: String,
}

#[derive(Deserialize)]
struct TripoGenerateResponse {
    code: i32,
    msg: String,
    data: Option<TripoTaskData>,
}

#[derive(Deserialize)]
struct TripoTaskData {
    task_id: String,
}

#[derive(Deserialize)]
struct TripoTaskResponse {
    code: i32,
    data: Option<TripoTaskResult>,
}

#[derive(Deserialize)]
struct TripoTaskResult {
    status: String,
    model_url: Option<String>,
    thumbnail_url: Option<String>,
    vertex_count: Option<i64>,
    face_count: Option<i64>,
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

async fn download_file(url: &str, dest: &PathBuf) -> Result<(), String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .connect_timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| format!("client build failed: {}", e))?;
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

async fn poll_task(client: &reqwest::Client, task_id: &str) -> Result<TripoTaskResult, String> {
    let url = format!("{}/task/{}", TRIPO_API_URL, task_id);
    let mut attempts = 0u32;
    loop {
        attempts += 1;
        if attempts > 60 {
            return Err("poll timeout after 120s".to_string());
        }
        let resp = client
            .get(&url)
            .header("Authorization", format!("Bearer {}", TRIPO_API_KEY))
            .send()
            .await
            .map_err(|e| format!("poll failed: {}", e))?;
        let body: TripoTaskResponse = resp
            .json()
            .await
            .map_err(|e| format!("parse poll response: {}", e))?;
        if body.code != 0 {
            return Err(format!("task query error: code={}", body.code));
        }
        if let Some(data) = body.data {
            match data.status.as_str() {
                "success" => return Ok(data),
                "failed" | "cancelled" => {
                    return Err(format!("task status: {}", data.status));
                }
                _ => {
                    tokio::time::sleep(std::time::Duration::from_secs(2)).await;
                    continue;
                }
            }
        }
        tokio::time::sleep(std::time::Duration::from_secs(2)).await;
    }
}

#[tauri::command]
pub async fn generate_3d(
    app: AppHandle,
    image_path: String,
    project_id: String,
) -> Result<Generate3DResult, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .connect_timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| format!("client build failed: {}", e))?;

    // Step 1: submit task
    let file_bytes = tokio::fs::read(&image_path)
        .await
        .map_err(|e| format!("read image failed: {}", e))?;
    let part = reqwest::multipart::Part::bytes(file_bytes)
        .file_name("image.png")
        .mime_str("image/png")
        .map_err(|e| format!("build multipart: {}", e))?;
    let form = reqwest::multipart::Form::new().part("file", part);
    let submit_resp = client
        .post(format!("{}/task", TRIPO_API_URL))
        .header("Authorization", format!("Bearer {}", TRIPO_API_KEY))
        .multipart(form)
        .send()
        .await
        .map_err(|e| format!("submit failed: {}", e))?;
    let submit_body: TripoGenerateResponse = submit_resp
        .json()
        .await
        .map_err(|e| format!("parse submit response: {}", e))?;
    if submit_body.code != 0 || submit_body.data.is_none() {
        return Err(format!("submit error: {}", submit_body.msg));
    }
    let task_id = submit_body.data.unwrap().task_id;

    // Step 2: poll until done
    let result = poll_task(&client, &task_id).await?;

    // Step 3: download model + thumbnail
    let models_dir = ensure_models_dir(&app, &project_id).await?;
    let model_id = format!("model_{}", task_id);

    let model_url = result
        .model_url
        .ok_or_else(|| "no model url".to_string())?;
    let model_ext = model_url
        .rsplit('.')
        .next()
        .unwrap_or("glb");
    let model_filename = format!("{}.{}", model_id, model_ext);
    let model_path = models_dir.join(&model_filename);
    download_file(&model_url, &model_path).await?;

    let thumbnail_url = result.thumbnail_url.unwrap_or_default();
    let thumbnail_filename = format!("{}.png", model_id);
    let thumbnail_path = models_dir.join(&thumbnail_filename);
    if !thumbnail_url.is_empty() {
        download_file(&thumbnail_url, &thumbnail_path).await?;
    }

    let model_relative = format!("{}/models/{}", project_id, model_filename);
    let thumb_relative = format!("{}/models/{}", project_id, thumbnail_filename);

    Ok(Generate3DResult {
        model_id,
        model_path: model_relative,
        thumbnail_path: thumb_relative,
        vertex_count: result.vertex_count.unwrap_or(0),
        face_count: result.face_count.unwrap_or(0),
    })
}
