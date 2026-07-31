use serde::Deserialize;
use std::process::Command;
use tauri::AppHandle;
use tauri::Manager;

/// Filter configuration for a single clip
#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ClipFilterRust {
    pub brightness: Option<f64>,
    pub contrast: Option<f64>,
    pub saturation: Option<f64>,
    pub hue: Option<f64>,
    pub blur: Option<f64>,
    pub sharpen: Option<f64>,
    pub temperature: Option<f64>,
    pub vignette: Option<f64>,
}

impl ClipFilterRust {
    /// Check if any filter parameter is set
    pub fn is_empty(&self) -> bool {
        self.brightness.is_none()
            && self.contrast.is_none()
            && self.saturation.is_none()
            && self.hue.is_none()
            && self.blur.is_none()
            && self.sharpen.is_none()
            && self.temperature.is_none()
            && self.vignette.is_none()
    }

    /// Build a comma-separated ffmpeg filter string for -vf
    pub fn to_ffmpeg_filter(&self) -> Option<String> {
        if self.is_empty() {
            return None;
        }
        let mut parts: Vec<String> = Vec::new();

        // Build eq filter (combines brightness, contrast, saturation)
        let mut eq_parts: Vec<String> = Vec::new();
        if let Some(v) = self.brightness {
            if v != 0.0 {
                eq_parts.push(format!("brightness={}", v));
            }
        }
        if let Some(v) = self.contrast {
            if v != 0.0 {
                // Map -1..1 to ffmpeg eq contrast 0..2, where 1.0 is normal
                let c = 1.0 + v;
                eq_parts.push(format!("contrast={}", c));
            }
        }
        if let Some(v) = self.saturation {
            if v != 0.0 {
                // Map -1..1 to ffmpeg eq saturation 0..3, where 1.0 is normal
                let s = 1.0 + v;
                eq_parts.push(format!("saturation={}", s));
            }
        }
        if !eq_parts.is_empty() {
            parts.push(format!("eq={}", eq_parts.join(":")));
        }

        // Hue rotation
        if let Some(v) = self.hue {
            if v != 0.0 {
                parts.push(format!("hue=h={}", v));
            }
        }

        // Gaussian blur
        if let Some(v) = self.blur {
            if v > 0.0 {
                parts.push(format!("gblur=sigma={}", v));
            }
        }

        // Unsharp mask
        if let Some(v) = self.sharpen {
            if v > 0.0 {
                // unsharp=luma_msize_x=5:luma_msize_y=5:luma_amount=X
                parts.push(format!("unsharp=5:5:{}", v));
            }
        }

        // Color balance for temperature (approximate)
        if let Some(v) = self.temperature {
            if v != 0.0 {
                let rh = (v * 0.3).max(0.0);
                let bh = (-v * 0.3).max(0.0);
                parts.push(format!("colorbalance=rh={}:bh={}", rh, bh));
            }
        }

        // Vignette
        if let Some(v) = self.vignette {
            if v > 0.0 {
                // vignette filter with angle proportional to intensity
                let angle = std::f64::consts::PI * v.min(1.0) * 0.5;
                parts.push(format!("vignette=PI*{}", angle));
            }
        }

        if parts.is_empty() {
            None
        } else {
            Some(parts.join(","))
        }
    }
}

/// A single clip in the export request
#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ExportClip {
    pub asset_path: String,
    pub source_start: f64,
    pub source_end: f64,
    pub start_time: f64,
    #[allow(dead_code)]
    pub duration: f64,
    #[allow(dead_code)]
    pub clip_type: String,
    #[serde(default)]
    pub filter: Option<ClipFilterRust>,
}

/// Export configuration from frontend
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RenderTimelineRequest {
    pub clips: Vec<ExportClip>,
    pub output_width: u32,
    pub output_height: u32,
    pub fps: u32,
}

/// Render the timeline to a single video file using ffmpeg concat demuxer.
///
/// Algorithm:
/// 1. Sort clips by start_time
/// 2. For each clip, extract the trimmed segment using ffmpeg
/// 3. Write a concat file list
/// 4. Concatenate all segments into the final output
#[tauri::command]
pub async fn render_timeline(
    app: AppHandle,
    request: RenderTimelineRequest,
) -> Result<String, String> {
    let doc_dir = app
        .path()
        .document_dir()
        .map_err(|e| format!("document dir error: {}", e))?;
    let assets_root = doc_dir.join("editor-tarui").join("assets");
    let output_dir = doc_dir.join("editor-tarui").join("exports");

    std::fs::create_dir_all(&output_dir)
        .map_err(|e| format!("mkdir exports: {}", e))?;

    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let output_path = output_dir.join(format!("timeline_export_{}.mp4", ts));

    // Sort clips by start_time
    let mut sorted = request.clips.clone();
    sorted.sort_by(|a, b| {
        a.start_time
            .partial_cmp(&b.start_time)
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    if sorted.is_empty() {
        return Err("No clips to export".into());
    }

    let temp_dir = std::env::temp_dir().join(format!("timeline_export_{}", ts));
    std::fs::create_dir_all(&temp_dir)
        .map_err(|e| format!("mkdir temp: {}", e))?;

    let mut file_list = String::new();
    let w = request.output_width.to_string();
    let h = request.output_height.to_string();
    let fps_str = request.fps.to_string();

    // Step 1: Trim each clip
    for (i, clip) in sorted.iter().enumerate() {
        let src_path = assets_root.join(&clip.asset_path);
        if !src_path.exists() {
            return Err(format!("Asset not found: {}", clip.asset_path));
        }

        let trimmed = temp_dir.join(format!("segment_{:04}.mp4", i));

        let seg_dur = (clip.source_end - clip.source_start).max(0.1);

        // Build video filter graph: scale + pad + optional filter chain
        let base_vf = format!(
            "scale={}:{}:force_original_aspect_ratio=decrease,pad={}:{}:(ow-iw)/2:(oh-ih)/2",
            w, h, w, h
        );
        let vf = if let Some(ref f) = clip.filter {
            match f.to_ffmpeg_filter() {
                Some(filter_chain) => format!("{},{}", base_vf, filter_chain),
                None => base_vf,
            }
        } else {
            base_vf
        };

        let status = Command::new("ffmpeg")
            .args([
                "-y",
                "-ss", &clip.source_start.to_string(),
                "-i", src_path.to_str().unwrap_or(""),
                "-t", &seg_dur.to_string(),
                "-c:v", "libx264",
                "-crf", "18",
                "-preset", "fast",
                "-c:a", "aac",
                "-b:a", "192k",
                "-vf", &vf,
                "-r", &fps_str,
                "-pix_fmt", "yuv420p",
                "-movflags", "+faststart",
                trimmed.to_str().unwrap_or(""),
            ])
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::piped())
            .status()
            .map_err(|e| format!("ffmpeg trim segment {}: {}", i, e))?;

        if !status.success() {
            return Err(format!("ffmpeg trim failed for segment {}", i));
        }

        file_list.push_str(&format!("file '{}'\n", trimmed.to_string_lossy()));
        file_list.push_str(&format!("duration {}\n", seg_dur));
    }

    // Step 2: Write concat file list
    let list_path = temp_dir.join("concat_list.txt");
    std::fs::write(&list_path, &file_list)
        .map_err(|e| format!("write concat list: {}", e))?;

    // Step 3: Concatenate all segments
    let status = Command::new("ffmpeg")
        .args([
            "-y",
            "-f", "concat",
            "-safe", "0",
            "-i", list_path.to_str().unwrap_or(""),
            "-c", "copy",
            output_path.to_str().unwrap_or(""),
        ])
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::piped())
        .status()
        .map_err(|e| format!("ffmpeg concat: {}", e))?;

    // Clean up temp dir
    let _ = std::fs::remove_dir_all(&temp_dir);

    if !status.success() {
        return Err("ffmpeg concat failed".into());
    }

    Ok(output_path.to_string_lossy().to_string())
}
