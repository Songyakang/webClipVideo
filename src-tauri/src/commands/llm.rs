use base64::Engine;
use serde::Serialize;

fn get_api_key(service: &str) -> Result<String, String> {
    crate::commands::config::get_api_key(service)
}

fn build_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(60))
        .connect_timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| format!("client build failed: {}", e))
}

#[derive(Serialize)]
pub struct OptimizePromptResult {
    pub optimized_prompt: String,
}

const SYSTEM_PROMPT: &str = r#"You are an expert at writing prompts for AI image generation models (like Stable Diffusion, DALL-E, Midjourney).

Your task: rewrite the user's input into a single, high-quality English image generation prompt.

Rules:
- Extract the core visual scene, subjects, actions, mood from the input
- Add appropriate visual style keywords (e.g. cinematic lighting, photorealistic, oil painting, concept art, anime style — choose what fits best)
- Add quality keywords (e.g. highly detailed, 8K, sharp focus, professional)
- Output ONLY the final prompt, nothing else — no quotes, no explanations, no markdown
- Keep the prompt under 480 characters
- Always output in English, regardless of the input language
- Focus on visual descriptions: lighting, composition, colors, textures, atmosphere"#;

#[tauri::command]
pub async fn optimize_prompt(
    provider: String,
    text: String,
    custom_endpoint: Option<String>,
    custom_model: Option<String>,
    platform_id: Option<String>,
) -> Result<OptimizePromptResult, String> {
    let client = build_client()?;

    let (api_key, endpoint, model) = if let Some(ref pid) = platform_id {
        let (base, path, m, key) =
            crate::commands::config::resolve_platform(pid, "chat")?;
        let key = key.ok_or_else(|| format!("Platform '{}' has no API key", pid))?;
        (key, format!("{}{}", base, path), m)
    } else {
        match provider.as_str() {
            "deepseek" => {
                let key = get_api_key("deepseek")?;
                let ep = custom_endpoint.unwrap_or_else(|| "https://api.deepseek.com/v1/chat/completions".to_string());
                let m = custom_model.unwrap_or_else(|| "deepseek-chat".to_string());
                (key, ep, m)
            }
            "stepfun" => {
                let key = get_api_key("stepfun")?;
                let ep = custom_endpoint.unwrap_or_else(|| "https://api.stepfun.com/v1/chat/completions".to_string());
                let m = custom_model.unwrap_or_else(|| "step-2x-large".to_string());
                (key, ep, m)
            }
            _ => return Err(format!("unsupported provider: {}. use 'deepseek' or 'stepfun'", provider)),
        }
    };

    let body = serde_json::json!({
        "model": model,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": text}
        ],
        "temperature": 0.7,
        "max_tokens": 300,
        "stream": false
    });

    let resp = client
        .post(&endpoint)
        .header("Authorization", format!("Bearer {}", &api_key))
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("LLM request failed: {}", e))?;

    let status = resp.status();
    let resp_text = resp.text().await.unwrap_or_default();

    if !status.is_success() {
        return Err(format!("LLM API error HTTP {}: {}", status, resp_text));
    }

    let result: serde_json::Value =
        serde_json::from_str(&resp_text).map_err(|e| format!("parse response: {}", e))?;

    let content = result
        .get("choices")
        .and_then(|c| c.as_array())
        .and_then(|arr| arr.first())
        .and_then(|c| c.get("message"))
        .and_then(|m| m.get("content"))
        .and_then(|c| c.as_str())
        .ok_or_else(|| "unexpected response format, expected choices[0].message.content".to_string())?;

    Ok(OptimizePromptResult {
        optimized_prompt: content.trim().to_string(),
    })
}

#[tauri::command]
pub async fn reverse_prompt(
    provider: String,
    image_path: String,
    text: String,
    custom_endpoint: Option<String>,
    custom_model: Option<String>,
    platform_id: Option<String>,
) -> Result<OptimizePromptResult, String> {
    let client = build_client()?;

    let image_bytes = tokio::fs::read(&image_path)
        .await
        .map_err(|e| format!("Failed to read image: {}", e))?;

    let ext = std::path::Path::new(&image_path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("png");
    let mime = match ext.to_lowercase().as_str() {
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        "gif" => "image/gif",
        _ => "image/png",
    };
    let b64 = base64::engine::general_purpose::STANDARD.encode(&image_bytes);
    let data_url = format!("data:{};base64,{}", mime, b64);

    let (api_key, endpoint, model) = if let Some(ref pid) = platform_id {
        let (base, path, m, key) =
            crate::commands::config::resolve_platform(pid, "reverse-prompt")?;
        let key = key.ok_or_else(|| format!("Platform '{}' has no API key", pid))?;
        (key, format!("{}{}", base, path), m)
    } else {
        match provider.as_str() {
            "stepfun" => {
                let key = get_api_key("stepfun")?;
                let ep = custom_endpoint
                    .unwrap_or_else(|| "https://api.stepfun.com/v1/chat/completions".to_string());
                let m = custom_model.unwrap_or_else(|| "step-3.7-flash".to_string());
                (key, ep, m)
            }
            _ => {
                return Err(format!(
                    "unsupported provider: {}. reverse prompt requires a vision-capable model, use 'stepfun'",
                    provider
                ))
            }
        }
    };

    let body = serde_json::json!({
        "model": model,
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": text},
                    {"type": "image_url", "image_url": {"url": data_url}}
                ]
            }
        ],
        "temperature": 0.3,
        "max_tokens": 800,
        "stream": false
    });

    let resp = client
        .post(&endpoint)
        .header("Authorization", format!("Bearer {}", &api_key))
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("LLM request failed: {}", e))?;

    let status = resp.status();
    let resp_text = resp.text().await.unwrap_or_default();

    if !status.is_success() {
        return Err(format!("LLM API error HTTP {}: {}", status, resp_text));
    }

    let result: serde_json::Value =
        serde_json::from_str(&resp_text).map_err(|e| format!("parse response: {}", e))?;

    let content = result
        .get("choices")
        .and_then(|c| c.as_array())
        .and_then(|arr| arr.first())
        .and_then(|c| c.get("message"))
        .and_then(|m| m.get("content"))
        .and_then(|c| c.as_str())
        .ok_or_else(|| {
            "unexpected response format, expected choices[0].message.content".to_string()
        })?;

    Ok(OptimizePromptResult {
        optimized_prompt: content.trim().to_string(),
    })
}
