/// Subtitle removal commands — pure Rust implementation.
///
/// Replaces the old `python3 inpaint_cli.py` subprocess calls with
/// direct Rust image processing via the `crate::inpaint` module.

use std::path::PathBuf;
use std::process::{Command, Stdio};
use serde::Serialize;
use tauri::Emitter;
use tauri::Manager;

use crate::inpaint;

#[derive(Clone, Serialize)]
pub struct InpaintProgress {
    pub frame: i32,
    pub total: i32,
    pub percent: f64,
}

/// Extract all video frames as PNG images into a directory using ffmpeg.
fn extract_frames(video_path: &str, frames_dir: &str) -> Result<f64, String> {
    // Get video info via ffprobe
    let fps = get_video_fps(video_path)?;

    let status = Command::new("ffmpeg")
        .args([
            "-y",
            "-i", video_path,
            "-f", "image2",
            "-q:v", "2",
            &format!("{}/frame_%06d.png", frames_dir),
        ])
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .status()
        .map_err(|e| format!("Failed to run ffmpeg frame extraction: {}", e))?;

    if !status.success() {
        return Err("FFmpeg frame extraction failed".into());
    }

    Ok(fps)
}

/// Get video FPS via ffprobe.
fn get_video_fps(video_path: &str) -> Result<f64, String> {
    let output = Command::new("ffprobe")
        .args([
            "-v", "quiet",
            "-select_streams", "v:0",
            "-show_entries", "stream=r_frame_rate",
            "-of", "csv=p=0",
            video_path,
        ])
        .output()
        .map_err(|e| format!("Failed to run ffprobe: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let fps_str = stdout.trim();

    // ffprobe outputs frame rate as "24000/1001" or "30/1"
    if let Some((num, den)) = fps_str.split_once('/') {
        let n: f64 = num.trim().parse().unwrap_or(30.0);
        let d: f64 = den.trim().parse().unwrap_or(1.0);
        if d > 0.0 {
            return Ok(n / d);
        }
    }

    // Try parsing as plain float
    fps_str.parse().map_err(|_| format!("Cannot parse FPS: {}", fps_str))
}

#[tauri::command]
pub async fn remove_hard_subtitles(
    app: tauri::AppHandle,
    video_path: String,
    output_path: String,
    project_id: String,
    x: u32,
    y: u32,
    width: u32,
    height: u32,
    strip_soft_subtitles: bool,
) -> Result<String, String> {
    // Resolve relative paths against the assets directory
    let video_path = if PathBuf::from(&video_path).is_absolute() {
        video_path
    } else {
        let doc_dir = app
            .path()
            .document_dir()
            .map_err(|e| format!("Cannot resolve document dir: {}", e))?;
        doc_dir
            .join("editor-tarui/assets")
            .join(&video_path)
            .to_string_lossy()
            .to_string()
    };

    let video = PathBuf::from(&video_path);
    let parent = video.parent().unwrap_or_else(|| std::path::Path::new("/tmp"));
    let stem = video.file_stem().unwrap_or_default().to_string_lossy();
    let ext = video.extension().unwrap_or_default().to_string_lossy();

    let out = if output_path.is_empty() {
        parent
            .join(format!("{}_clean.{}", stem, ext))
            .to_string_lossy()
            .to_string()
    } else {
        output_path
    };

    let frames_dir = std::env::temp_dir()
        .join("inpaint_frames")
        .join(&project_id)
        .join(stem.as_ref());
    let _ = std::fs::create_dir_all(&frames_dir);

    // ── Step 1: Extract all video frames to PNG ──
    let fps = extract_frames(&video_path, frames_dir.to_str().unwrap_or("/tmp/inpaint_frames"))?;

    // ── Step 2: Process each frame with pure-Rust inpainting ──
    let app_handle = app.clone();
    let frames_dir_clone = frames_dir.clone();
    let (frame_count, _skipped) = tokio::task::spawn_blocking(move || {
        process_all_frames(&frames_dir_clone, x, y, width, height, app_handle)
    })
    .await
    .map_err(|e| format!("Frame processing panicked: {}", e))?;

    if frame_count == 0 {
        let _ = std::fs::remove_dir_all(&frames_dir);
        return Err("No frames processed".into());
    }

    // ── Step 3: FFmpeg encode PNG sequence + original audio ──
    let frame_pattern = frames_dir.join("frame_%06d.png");

    let ffmpeg_status = Command::new("ffmpeg")
        .args([
            "-y",
            "-framerate", &fps.to_string(),
            "-i", frame_pattern.to_str().unwrap_or(""),
            "-i", &video_path,
            "-map", "0:v:0",
            "-map", "1:a:0",
            "-c:v", "libx264",
            "-crf", "18",
            "-preset", "medium",
            "-c:a", "copy",
            "-movflags", "+faststart",
            &out,
        ])
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .status()
        .map_err(|e| {
            let _ = std::fs::remove_dir_all(&frames_dir);
            format!("Failed to run ffmpeg: {}", e)
        })?;

    // Clean up frames dir
    let _ = std::fs::remove_dir_all(&frames_dir);

    if !ffmpeg_status.success() {
        return Err("FFmpeg encoding failed".into());
    }

    // Optionally strip soft subtitles
    let final_out = if strip_soft_subtitles {
        let stripped = parent
            .join(format!("{}_clean_nosub.{}", stem, ext))
            .to_string_lossy()
            .to_string();
        strip_soft_subtitles_inner(&out, &stripped)?;
        let _ = std::fs::remove_file(&out);
        stripped
    } else {
        out
    };

    Ok(final_out)
}

/// Process all PNG frames in a directory, applying inpainting to each.
/// Returns (frame_count, skipped_count).
fn process_all_frames(
    frames_dir: &PathBuf,
    x: u32,
    y: u32,
    width: u32,
    height: u32,
    app: tauri::AppHandle,
) -> (usize, usize) {
    use std::fs;

    // Collect all frame PNGs sorted by name
    let mut entries: Vec<PathBuf> = Vec::new();
    if let Ok(dir) = fs::read_dir(frames_dir) {
        for entry in dir.flatten() {
            let path = entry.path();
            if path.extension().map_or(false, |e| e == "png") {
                entries.push(path);
            }
        }
    }
    entries.sort();

    let total = entries.len();
    let mut frame_idx: usize = 0;
    let mut skipped: usize = 0;
    let mut prev_region: Option<image::RgbImage> = None;

    for path in &entries {
        frame_idx += 1;

        // Read frame
        let frame = match image::open(path) {
            Ok(img) => img,
            Err(_) => continue,
        };

        // Process frame: detect subtitle + inpaint if needed
        let (processed, was_inpainted) =
            inpaint::process_frame(&frame, x, y, width, height);

        if !was_inpainted {
            skipped += 1;
            prev_region = None; // reset smoothing across gaps
            // Frame unchanged, no need to re-save
        } else {
            // Apply temporal smoothing with previous inpainted frame
            let mut rgb = processed.to_rgb8();
            if let Some(ref prev) = prev_region {
                inpaint::smooth_region(&mut rgb, prev, x, y, width, height);
            }

            // Save previous region for next frame
            let (fw, fh) = (rgb.width(), rgb.height());
            let max_w = width.min(fw - x);
            let max_h = height.min(fh - y);
            if max_w > 0 && max_h > 0 {
                prev_region = Some(image::imageops::crop_imm(&mut rgb, x, y, max_w, max_h).to_image());
            }

            // Write processed frame back
            if let Err(e) = rgb.save(path) {
                eprintln!("Failed to save frame {}: {}", path.display(), e);
            }
        }

        // Emit progress every 10 frames
        if frame_idx % 10 == 0 || frame_idx == total {
            let payload = InpaintProgress {
                frame: frame_idx as i32,
                total: total as i32,
                percent: if total > 0 {
                    (frame_idx as f64 / total as f64 * 100.0 * 100.0).round() / 100.0
                } else {
                    0.0
                },
            };
            let _ = app.emit("inpaint-progress", payload);
        }
    }

    (frame_idx, skipped)
}

fn strip_soft_subtitles_inner(input: &str, output: &str) -> Result<(), String> {
    let status = Command::new("ffmpeg")
        .args(["-y", "-i", input, "-sn", "-c", "copy", output])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map_err(|e| format!("Failed to run ffmpeg: {}", e))?;

    if !status.success() {
        return Err("FFmpeg soft subtitle stripping failed".into());
    }
    Ok(())
}

#[tauri::command]
pub async fn strip_soft_subtitles(video_path: String) -> Result<String, String> {
    let video = PathBuf::from(&video_path);
    let stem = video.file_stem().unwrap_or_default().to_string_lossy();
    let ext = video.extension().unwrap_or_default().to_string_lossy();
    let parent = video.parent().unwrap_or_else(|| std::path::Path::new("/tmp"));
    let out = parent
        .join(format!("{}_nosub.{}", stem, ext))
        .to_string_lossy()
        .to_string();

    strip_soft_subtitles_inner(&video_path, &out)?;
    Ok(out)
}

#[tauri::command]
pub async fn preview_inpaint_frame(
    video_path: String,
    time_sec: f64,
    x: u32,
    y: u32,
    width: u32,
    height: u32,
) -> Result<String, String> {
    let tmp_dir = std::env::temp_dir();
    let frame_path = tmp_dir.join("inpaint_preview_original.png");
    let result_path = tmp_dir.join("inpaint_preview_clean.png");

    // Step 1: Extract single frame with ffmpeg
    let status = Command::new("ffmpeg")
        .args([
            "-y",
            "-ss", &time_sec.to_string(),
            "-i", &video_path,
            "-vframes", "1",
            frame_path.to_str().unwrap_or("/tmp/inpaint_frame.png"),
        ])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map_err(|e| format!("Failed to extract frame: {}", e))?;

    if !status.success() {
        return Err("Failed to extract frame from video".into());
    }

    // Step 2: Inpaint with pure Rust (replaces python3 inpaint_cli.py preview)
    inpaint::inpaint_single_image(
        frame_path.to_str().unwrap_or(""),
        result_path.to_str().unwrap_or(""),
        x, y, width, height,
    )?;

    Ok(result_path.to_string_lossy().to_string())
}
