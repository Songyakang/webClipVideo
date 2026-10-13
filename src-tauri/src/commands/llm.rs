use crate::commands::config::{self, Platform};
use base64::Engine;
use serde::Serialize;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};

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

#[derive(Clone, Debug)]
pub struct LlmConfig {
    pub endpoint: String,
    pub model: String,
    pub api_key: Option<String>,
    pub params: HashMap<String, Value>,
}

pub fn platform_config(mut platform: Platform, function: &str) -> Result<LlmConfig, String> {
    config::validate_platform(&mut platform)?;
    let ep = platform
        .endpoints
        .iter()
        .find(|e| e.key == function)
        .ok_or_else(|| format!("平台未配置 {} 接口", function))?;
    Ok(LlmConfig {
        endpoint: config::endpoint_url(&platform.base_endpoint, &ep.path)?,
        model: ep.model.clone(),
        api_key: config::platform_auth(&platform)?,
        params: ep.params.clone(),
    })
}

fn resolve(
    provider: &str,
    platform_id: Option<String>,
    function: &str,
    endpoint: Option<String>,
    model: Option<String>,
) -> Result<LlmConfig, String> {
    if let Some(id) = platform_id.filter(|s| !s.is_empty()) {
        return platform_config(config::get_platform(&id)?, function);
    }
    let (base, default_model) = match (provider, function) {
        ("deepseek", "chat") => (
            "https://api.deepseek.com/v1/chat/completions",
            "deepseek-chat",
        ),
        ("stepfun", "chat") => (
            "https://api.stepfun.com/v1/chat/completions",
            "step-2x-large",
        ),
        ("stepfun", "reverse-prompt") => (
            "https://api.stepfun.com/v1/chat/completions",
            "step-3.7-flash",
        ),
        _ => return Err("请选择支持此功能的平台".into()),
    };
    Ok(LlmConfig {
        endpoint: endpoint
            .filter(|s| !s.trim().is_empty())
            .unwrap_or_else(|| base.into()),
        model: model
            .filter(|s| !s.trim().is_empty())
            .unwrap_or_else(|| default_model.into()),
        api_key: Some(config::get_api_key(provider)?),
        params: HashMap::new(),
    })
}

pub fn request_body(config: &LlmConfig, messages: Value, vision: bool) -> Value {
    let mut body = json!({ "model": config.model, "messages": messages, "stream": false,
        "temperature": if vision { 0.3 } else { 0.7 }, "max_tokens": if vision { 800 } else { 300 } });
    let object = body.as_object_mut().unwrap();
    if config.params.contains_key("max_completion_tokens") {
        object.remove("max_tokens");
    }
    for (key, value) in &config.params {
        object.insert(key.clone(), value.clone());
    }
    body
}

pub fn parse_content(result: &Value) -> Result<String, String> {
    let choice = result
        .get("choices")
        .and_then(Value::as_array)
        .and_then(|v| v.first())
        .ok_or_else(|| "响应格式不兼容：需要 Chat Completions 格式".to_string())?;
    if choice["finish_reason"] == "length" {
        return Err("模型输出被截断，请增大输出长度后重试".into());
    }
    if choice["finish_reason"] == "content_filter" {
        return Err("服务拒绝生成此内容，请调整提示词".into());
    }
    let content = &choice["message"]["content"];
    let text = if let Some(text) = content.as_str() {
        text.to_string()
    } else if let Some(parts) = content.as_array() {
        parts
            .iter()
            .filter_map(|p| p.get("text").and_then(Value::as_str))
            .collect::<Vec<_>>()
            .join("\n")
    } else {
        String::new()
    };
    if text.trim().is_empty() {
        return Err("模型返回内容为空，原提示词已保留".into());
    }
    Ok(text.trim().to_string())
}

pub fn http_error(status: u16) -> String {
    match status {
        401 | 403 => "认证失败，请检查 API Key 和模型访问权限".into(),
        404 => "接口或模型不存在，请检查最终请求地址和模型名称".into(),
        429 => "请求受限或额度不足，请检查额度后稍后重试".into(),
        400 | 422 => "请求参数不兼容，请检查模型名称、额外参数和图片支持情况".into(),
        500..=599 => "模型服务暂时不可用，请稍后重试".into(),
        _ => format!("模型服务请求失败（HTTP {}）", status),
    }
}

static REQUESTS: OnceLock<Mutex<HashMap<String, tokio::sync::oneshot::Sender<()>>>> =
    OnceLock::new();
fn requests() -> &'static Mutex<HashMap<String, tokio::sync::oneshot::Sender<()>>> {
    REQUESTS.get_or_init(|| Mutex::new(HashMap::new()))
}
struct RequestGuard(Option<String>);
impl Drop for RequestGuard {
    fn drop(&mut self) {
        if let Some(id) = &self.0 {
            if let Ok(mut map) = requests().lock() {
                map.remove(id);
            }
        }
    }
}

#[tauri::command]
pub fn cancel_llm_request(request_id: String) -> Result<(), String> {
    if let Some(sender) = requests()
        .lock()
        .map_err(|_| "请求状态不可用")?
        .remove(&request_id)
    {
        let _ = sender.send(());
    }
    Ok(())
}

async fn send(
    config: LlmConfig,
    messages: Value,
    vision: bool,
    request_id: Option<String>,
) -> Result<String, String> {
    let (sender, receiver) = tokio::sync::oneshot::channel::<()>();
    if let Some(id) = &request_id {
        let mut map = requests().lock().map_err(|_| "请求状态不可用")?;
        if map.contains_key(id) {
            return Err("请求正在处理中".into());
        }
        map.insert(id.clone(), sender);
    }
    let _guard = RequestGuard(request_id.clone());
    let operation = async {
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(60))
            .connect_timeout(std::time::Duration::from_secs(10))
            .build()
            .map_err(|_| "无法初始化网络客户端")?;
        let mut request = client
            .post(&config.endpoint)
            .json(&request_body(&config, messages, vision));
        if let Some(key) = &config.api_key {
            request = request.bearer_auth(key);
        }
        let response = request.send().await.map_err(|e| {
            if e.is_timeout() {
                "模型请求超时，请检查服务状态后重试"
            } else if e.is_connect() {
                "无法连接模型服务，请检查地址及服务是否启动"
            } else {
                "模型网络请求失败，请检查服务配置"
            }
            .to_string()
        })?;
        if !response.status().is_success() {
            return Err(http_error(response.status().as_u16()));
        }
        let result: Value = response
            .json()
            .await
            .map_err(|_| "服务返回了无效 JSON，请检查接口协议".to_string())?;
        parse_content(&result)
    };
    if request_id.is_some() {
        tokio::select! { result = operation => result, _ = receiver => Err("请求已取消".into()) }
    } else {
        operation.await
    }
}

#[tauri::command]
pub async fn optimize_prompt(
    provider: String,
    text: String,
    custom_endpoint: Option<String>,
    custom_model: Option<String>,
    platform_id: Option<String>,
    request_id: Option<String>,
    output_language: Option<String>,
    style: Option<String>,
) -> Result<OptimizePromptResult, String> {
    if text.trim().is_empty() {
        return Err("请输入提示词".into());
    }
    let config = resolve(
        &provider,
        platform_id,
        "chat",
        custom_endpoint,
        custom_model,
    )?;
    let mut system = SYSTEM_PROMPT.to_string();
    if output_language.as_deref() == Some("zh") {
        system = system.replace(
            "Always output in English, regardless of the input language",
            "Always output in Chinese",
        );
        system = system.replace(
            "English image generation prompt",
            "Chinese image generation prompt",
        );
    }
    if let Some(style) = style.filter(|s| !s.trim().is_empty()) {
        system.push_str(&format!("\nPreferred visual style: {}", style));
    }
    let content = send(
        config,
        json!([
            {"role": "system", "content": system}, {"role": "user", "content": text.trim()}
        ]),
        false,
        request_id,
    )
    .await?;
    Ok(OptimizePromptResult {
        optimized_prompt: content,
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
    request_id: Option<String>,
) -> Result<OptimizePromptResult, String> {
    let config = resolve(
        &provider,
        platform_id,
        "reverse-prompt",
        custom_endpoint,
        custom_model,
    )?;
    let bytes = tokio::fs::read(&image_path)
        .await
        .map_err(|_| "无法读取参考图片")?;
    let format = image::guess_format(&bytes).map_err(|_| "参考文件不是受支持的图片")?;
    let mime = match format {
        image::ImageFormat::Jpeg => "image/jpeg",
        image::ImageFormat::Png => "image/png",
        image::ImageFormat::WebP => "image/webp",
        image::ImageFormat::Gif => "image/gif",
        _ => return Err("请使用 PNG、JPEG、WebP 或 GIF 图片".into()),
    };
    let url = format!(
        "data:{};base64,{}",
        mime,
        base64::engine::general_purpose::STANDARD.encode(bytes)
    );
    let content = send(
        config,
        json!([{ "role": "user", "content": [
        {"type": "text", "text": text}, {"type": "image_url", "image_url": {"url": url}}
    ] }]),
        true,
        request_id,
    )
    .await?;
    Ok(OptimizePromptResult {
        optimized_prompt: content,
    })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionResult {
    pub latency_ms: u128,
    pub model: String,
}

/// A minimal text inference verifies endpoint, credentials and model, not vision capability.
#[tauri::command]
pub async fn test_llm_connection(
    platform: Platform,
    function_key: String,
) -> Result<ConnectionResult, String> {
    if !matches!(function_key.as_str(), "chat" | "reverse-prompt") {
        return Err("连接测试仅支持对话和反推接口".into());
    }
    let config = platform_config(platform, &function_key)?;
    let model = config.model.clone();
    let start = std::time::Instant::now();
    send(
        config,
        json!([{ "role": "user", "content": "Reply with OK." }]),
        false,
        None,
    )
    .await?;
    Ok(ConnectionResult {
        latency_ms: start.elapsed().as_millis(),
        model,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    fn platform() -> Platform {
        serde_json::from_value(json!({ "id":"local", "name":"Local", "platformType":"text", "location":"local",
            "baseEndpoint":"http://localhost:1234/v1/", "endpoints":[{"key":"chat", "name":"Chat", "path":"chat/completions", "model":"test"}]
        })).unwrap()
    }
    #[test]
    fn local_without_key_and_normalized_path() {
        let cfg = platform_config(platform(), "chat").unwrap();
        assert_eq!(cfg.endpoint, "http://localhost:1234/v1/chat/completions");
        assert!(cfg.api_key.is_none());
    }
    #[test]
    fn explicit_auth_and_legacy_keys() {
        let mut p = platform();
        p.api_key = Some(" token ".into());
        assert_eq!(
            platform_config(p.clone(), "chat")
                .unwrap()
                .api_key
                .as_deref(),
            Some("token")
        );
        p.auth_type = Some("none".into());
        assert!(platform_config(p.clone(), "chat")
            .unwrap()
            .api_key
            .is_none());
        p.auth_type = Some("bearer".into());
        p.api_key = Some(" ".into());
        assert!(platform_config(p, "chat").is_err());
    }
    #[test]
    fn typed_params_override_defaults_and_exclusive_token_limit() {
        let mut p = platform();
        p.endpoints[0]
            .params
            .insert("temperature".into(), json!(0.2));
        p.endpoints[0]
            .params
            .insert("max_completion_tokens".into(), json!(500));
        p.endpoints[0]
            .params
            .insert("extra_body".into(), json!({"thinking":false}));
        let cfg = platform_config(p, "chat").unwrap();
        let body = request_body(&cfg, json!([]), false);
        assert_eq!(body["temperature"], 0.2);
        assert_eq!(body["max_completion_tokens"], 500);
        assert!(body.get("max_tokens").is_none());
        assert_eq!(body["extra_body"]["thinking"], false);
    }
    #[test]
    fn reject_invalid_platforms_and_reserved_params() {
        for key in ["model", "messages", "stream"] {
            let mut p = platform();
            p.endpoints[0].params.insert(key.into(), json!("bad"));
            assert!(platform_config(p, "chat").is_err());
        }
        let mut p = platform();
        p.endpoints.push(p.endpoints[0].clone());
        assert!(platform_config(p, "chat").is_err());
        let mut p = platform();
        p.endpoints[0].model = " ".into();
        assert!(platform_config(p, "chat").is_err());
        assert!(config::endpoint_url("file:///tmp", "/chat").is_err());
        assert!(config::endpoint_url("https://example.com?key=secret", "/chat").is_err());
    }
    #[test]
    fn parse_rejects_empty_truncated_and_incompatible_results() {
        for response in [
            json!({}),
            json!({"choices":[{"message":{"content":" "}}]}),
            json!({"choices":[{"finish_reason":"length", "message":{"content":"partial"}}]}),
        ] {
            assert!(parse_content(&response).is_err());
        }
        assert_eq!(
            parse_content(
                &json!({"choices":[{"message":{"content":[{"type":"text","text":"OK"}]}}]})
            )
            .unwrap(),
            "OK"
        );
    }
    #[test]
    fn public_errors_are_actionable_and_do_not_include_response_secrets() {
        assert!(http_error(401).contains("API Key"));
        assert!(http_error(429).contains("额度"));
        assert!(http_error(404).contains("模型"));
    }

    // Exercise the real HTTP transport against a local mock, without credentials or external services.
    fn mock_server(status: u16, body: &'static str) -> (String, std::thread::JoinHandle<String>) {
        use std::io::{Read, Write};
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let handle = std::thread::spawn(move || {
            let (mut socket, _) = listener.accept().unwrap();
            socket
                .set_read_timeout(Some(std::time::Duration::from_secs(5)))
                .unwrap();
            let mut bytes = Vec::new();
            let mut buf = [0u8; 4096];
            loop {
                let n = socket.read(&mut buf).unwrap();
                if n == 0 {
                    break;
                }
                bytes.extend_from_slice(&buf[..n]);
                let text = String::from_utf8_lossy(&bytes);
                if let Some(end) = text.find("\r\n\r\n") {
                    let length: usize = text[..end]
                        .lines()
                        .find_map(|l| {
                            l.to_lowercase()
                                .strip_prefix("content-length:")
                                .map(|v| v.trim().parse().unwrap())
                        })
                        .unwrap_or(0);
                    if bytes.len() >= end + 4 + length {
                        break;
                    }
                }
            }
            write!(socket, "HTTP/1.1 {} OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}", status, body.len(), body).unwrap();
            String::from_utf8(bytes).unwrap()
        });
        (format!("http://{}/v1/chat/completions", address), handle)
    }
    #[tokio::test]
    async fn actual_request_omits_auth_for_local_and_uses_configured_model() {
        let (endpoint, handle) = mock_server(200, r#"{"choices":[{"message":{"content":"OK"}}]}"#);
        let mut cfg = platform_config(platform(), "chat").unwrap();
        cfg.endpoint = endpoint;
        assert_eq!(
            send(
                cfg,
                json!([{"role":"user", "content":"hi"}]),
                false,
                Some("test-local".into())
            )
            .await
            .unwrap(),
            "OK"
        );
        let request = handle.join().unwrap();
        assert!(!request.to_lowercase().contains("authorization:"));
        assert!(request.contains("\"model\":\"test\""));
        assert!(!requests().lock().unwrap().contains_key("test-local"));
    }
    #[tokio::test]
    async fn actual_request_uses_bearer_and_classifies_http_errors() {
        let (endpoint, handle) = mock_server(401, "secret provider response");
        let mut cfg = platform_config(platform(), "chat").unwrap();
        cfg.endpoint = endpoint;
        cfg.api_key = Some("test-only".into());
        let error = send(cfg, json!([]), false, None).await.unwrap_err();
        assert!(error.contains("认证失败"));
        assert!(!error.contains("secret"));
        assert!(handle
            .join()
            .unwrap()
            .to_lowercase()
            .contains("authorization: bearer test-only"));
    }
    #[tokio::test]
    async fn cancellation_drops_pending_request_and_cleans_registry() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let mut cfg = platform_config(platform(), "chat").unwrap();
        cfg.endpoint = format!("http://{}/chat", listener.local_addr().unwrap());
        let request = send(cfg, json!([]), false, Some("test-cancel".into()));
        let cancel = async {
            let (_socket, _) = listener.accept().await.unwrap();
            cancel_llm_request("test-cancel".into()).unwrap();
        };
        let (result, _) = tokio::join!(request, cancel);
        assert_eq!(result.unwrap_err(), "请求已取消");
        assert!(!requests().lock().unwrap().contains_key("test-cancel"));
    }
}
