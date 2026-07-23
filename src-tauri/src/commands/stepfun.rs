use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};
use serde::Serialize;
use tauri::AppHandle;
use tauri::Manager;

const STEPFUN_BASE: &str = "https://api.stepfun.com/v1";

fn get_api_key() -> Result<String, String> {
    let candidates = vec![
        PathBuf::from("config.json"),
        PathBuf::from("../config.json"),
        PathBuf::from("../../config.json"),
    ];
    for path in &candidates {
        if let Ok(content) = std::fs::read_to_string(path) {
            if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&content) {
                if let Some(key) = parsed.get("stepfun_api_key").and_then(|v| v.as_str()) {
                    if !key.is_empty() {
                        return Ok(key.to_string());
                    }
                }
            }
        }
    }
    Err("config.json not found or missing stepfun_api_key field".to_string())
}

fn build_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .connect_timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| format!("client build failed: {}", e))
}

#[derive(Serialize)]
pub struct GenerateImageResult {
    pub image_path: String,
    pub seed: Option<i64>,
    pub finish_reason: String,
}

async fn ensure_node_dir(app: &AppHandle, project_id: &str, node_id: &str) -> Result<PathBuf, String> {
    let doc_dir = app
        .path()
        .document_dir()
        .map_err(|e| format!("document dir error: {}", e))?;
    let node_dir = doc_dir
        .join("editor-tarui")
        .join("assets")
        .join(project_id)
        .join(node_id);
    tokio::fs::create_dir_all(&node_dir)
        .await
        .map_err(|e| format!("mkdir error: {}", e))?;
    Ok(node_dir)
}

async fn download_image(url: &str, dest: &PathBuf) -> Result<(), String> {
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
pub async fn generate_image(
    app: AppHandle,
    prompt: String,
    model: String,
    project_id: String,
    node_id: String,
    size: Option<String>,
    steps: Option<i32>,
    cfg_scale: Option<f64>,
    negative_prompt: Option<String>,
    reference_image_path: Option<String>,
) -> Result<GenerateImageResult, String> {
    let api_key = get_api_key()?;
    let client = build_client()?;

    let size = size.unwrap_or_else(|| "1024x1024".to_string());

    let mut body = serde_json::json!({
        "model": model,
        "prompt": prompt,
        "size": size,
        "response_format": "url",
    });

    if let Some(s) = steps {
        body["steps"] = serde_json::json!(s);
    }
    if let Some(c) = cfg_scale {
        body["cfg_scale"] = serde_json::json!(c);
    }
    if let Some(np) = &negative_prompt {
        if !np.is_empty() {
            body["negative_prompt"] = serde_json::json!(np);
        }
    }

    // If reference image provided, use image2image endpoint with step-2x-large
    let (endpoint, final_body) = if let Some(ref_path) = &reference_image_path {
        if let Ok(bytes) = tokio::fs::read(ref_path).await {
            use base64::Engine;
            let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
            let ext = std::path::Path::new(ref_path)
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or("png");
            let source_url = format!("data:image/{};base64,{}", ext, b64);
            let mut img2img_body = serde_json::json!({
                "model": "step-2x-large",
                "prompt": prompt,
                "source_url": source_url,
                "source_weight": 0.5,
                "size": size,
                "response_format": "url",
            });
            if let Some(s) = steps { img2img_body["steps"] = serde_json::json!(s); }
            if let Some(c) = cfg_scale { img2img_body["cfg_scale"] = serde_json::json!(c); }
            ("/images/image2image", img2img_body)
        } else {
            ("/images/generations", body)
        }
    } else {
        ("/images/generations", body)
    };

    let resp = client
        .post(format!("{}{}", STEPFUN_BASE, endpoint))
        .header("Authorization", format!("Bearer {}", &api_key))
        .header("Content-Type", "application/json")
        .json(&final_body)
        .send()
        .await
        .map_err(|e| format!("generate request failed: {}", e))?;

    let status = resp.status();
    let resp_text = resp.text().await.unwrap_or_default();

    if !status.is_success() {
        return Err(format!("API error HTTP {}: {}", status, resp_text));
    }

    let result: serde_json::Value = serde_json::from_str(&resp_text)
        .map_err(|e| format!("parse response: {}", e))?;

    let data = result
        .get("data")
        .and_then(|d| d.as_array())
        .and_then(|arr| arr.first())
        .ok_or_else(|| "no data in response".to_string())?;

    let finish_reason = data
        .get("finish_reason")
        .and_then(|v| v.as_str())
        .unwrap_or("unknown")
        .to_string();

    if finish_reason == "content_filtered" {
        return Err("图片生成被内容审核拦截".to_string());
    }

    let seed = data.get("seed").and_then(|v| v.as_i64());

    let node_dir = ensure_node_dir(&app, &project_id, &node_id).await?;
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let filename = format!("generated_{}.png", ts);
    let image_path = node_dir.join(&filename);

    let url = data
        .get("url")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "no image url in response".to_string())?;

    download_image(url, &image_path).await?;

    Ok(GenerateImageResult {
        image_path: format!("{}/{}/{}", project_id, node_id, filename),
        seed,
        finish_reason,
    })
}

#[tauri::command]
pub async fn edit_image(
    app: AppHandle,
    image_path: String,
    prompt: String,
    project_id: String,
    node_id: String,
    steps: Option<i32>,
    cfg_scale: Option<f64>,
    negative_prompt: Option<String>,
) -> Result<GenerateImageResult, String> {
    let api_key = get_api_key()?;
    let client = build_client()?;

    let file_bytes = tokio::fs::read(&image_path)
        .await
        .map_err(|e| format!("read image file failed: {}", e))?;

    let ext = std::path::Path::new(&image_path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("png");
    let mime = match ext {
        "jpg" | "jpeg" => "image/jpeg",
        "png" => "image/png",
        _ => "image/png",
    };

    let part = reqwest::multipart::Part::bytes(file_bytes)
        .file_name(format!("image.{}", ext))
        .mime_str(mime)
        .map_err(|e| format!("build multipart: {}", e))?;

    let mut form = reqwest::multipart::Form::new()
        .part("image", part)
        .text("model", "step-image-edit-2".to_string())
        .text("prompt", prompt.clone())
        .text("response_format", "url".to_string());

    if let Some(s) = steps {
        form = form.text("steps", s.to_string());
    }
    if let Some(c) = cfg_scale {
        form = form.text("cfg_scale", c.to_string());
    }
    if let Some(np) = &negative_prompt {
        if !np.is_empty() {
            form = form.text("negative_prompt", np.clone());
        }
    }

    let resp = client
        .post(format!("{}/images/edits", STEPFUN_BASE))
        .header("Authorization", format!("Bearer {}", &api_key))
        .multipart(form)
        .send()
        .await
        .map_err(|e| format!("edit request failed: {}", e))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("API error HTTP {}: {}", status, text));
    }

    let result: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("parse response: {}", e))?;

    let data = result
        .get("data")
        .and_then(|d| d.as_array())
        .and_then(|arr| arr.first())
        .ok_or_else(|| "no data in response".to_string())?;

    let finish_reason = data
        .get("finish_reason")
        .and_then(|v| v.as_str())
        .unwrap_or("unknown")
        .to_string();

    if finish_reason == "content_filtered" {
        return Err("图片生成被内容审核拦截".to_string());
    }

    let seed = data.get("seed").and_then(|v| v.as_i64());

    let node_dir = ensure_node_dir(&app, &project_id, &node_id).await?;
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let filename = format!("edited_{}.png", ts);
    let dest = node_dir.join(&filename);

    let url = data
        .get("url")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "no image url in response".to_string())?;

    download_image(url, &dest).await?;

    Ok(GenerateImageResult {
        image_path: format!("{}/{}/{}", project_id, node_id, filename),
        seed,
        finish_reason,
    })
}
