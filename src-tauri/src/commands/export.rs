use std::process::Command;
use std::path::PathBuf;
use serde::Deserialize;

#[tauri::command]
pub async fn export_with_subtitles(
    video_path: String,
    ass_content: String,
    output_path: String,
) -> Result<String, String> {
    // Write ASS content to a temp file
    let tmp_dir = std::env::temp_dir();
    let ass_path: PathBuf = tmp_dir.join("editor_tarui_subtitle.ass");

    std::fs::write(&ass_path, &ass_content)
        .map_err(|e| format!("Failed to write ASS file: {}", e))?;

    let out = if output_path.is_empty() {
        let video = PathBuf::from(&video_path);
        let stem = video.file_stem().unwrap_or_default().to_string_lossy();
        let ext = video.extension().unwrap_or_default().to_string_lossy();
        let parent = video.parent().unwrap_or(&tmp_dir);
        parent
            .join(format!("{}_subtitled.{}", stem, ext))
            .to_string_lossy()
            .to_string()
    } else {
        output_path
    };

    // Run ffmpeg to burn subtitles
    let status = Command::new("ffmpeg")
        .args([
            "-y",
            "-i", &video_path,
            "-vf", &format!("ass={}", ass_path.to_string_lossy()),
            "-c:v", "libx264",
            "-crf", "18",
            "-preset", "medium",
            "-c:a", "copy",
            "-movflags", "+faststart",
            &out,
        ])
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .map_err(|e| format!("Failed to run ffmpeg: {}", e))?;

    // Clean up temp ASS file
    let _ = std::fs::remove_file(&ass_path);

    if !status.success() {
        return Err("FFmpeg encoding failed".into());
    }

    Ok(out)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioReplacement {
    pub start_time: f64,
    pub end_time: f64,
    pub wav_path: String,
}

#[tauri::command]
pub async fn burn_with_synthetic_audio(
    video_path: String,
    ass_content: String,
    replacements: Vec<AudioReplacement>,
) -> Result<String, String> {
    let tmp_dir = std::env::temp_dir();
    let ass_path = tmp_dir.join("editor_tarui_subtitle.ass");

    std::fs::write(&ass_path, &ass_content)
        .map_err(|e| format!("Failed to write ASS file: {}", e))?;

    let video = PathBuf::from(&video_path);
    let stem = video.file_stem().unwrap_or_default().to_string_lossy();
    let ext = video.extension().unwrap_or_default().to_string_lossy();
    let parent = video.parent().unwrap_or(&tmp_dir);
    let out = parent
        .join(format!("{}_subtitled.{}", stem, ext))
        .to_string_lossy()
        .to_string();

    if replacements.is_empty() {
        // No synthetic audio: just burn subtitles (same as export_with_subtitles)
        let status = Command::new("ffmpeg")
            .args([
                "-y",
                "-i", &video_path,
                "-vf", &format!("ass={}", ass_path.to_string_lossy()),
                "-c:v", "libx264",
                "-crf", "18",
                "-preset", "medium",
                "-c:a", "copy",
                "-movflags", "+faststart",
                &out,
            ])
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status()
            .map_err(|e| format!("Failed to run ffmpeg: {}", e))?;

        let _ = std::fs::remove_file(&ass_path);

        if !status.success() {
            return Err("FFmpeg encoding failed".into());
        }
        return Ok(out);
    }

    // Build ffmpeg filter_complex to replace audio segments with synthetic WAVs
    // Algorithm:
    // 1. Sort replacements by start_time
    // 2. Build segments: [0, rep1.start] -> original, [rep1.start, rep1.end] -> synthetic, ...
    // 3. Concatenate all segments

    let mut sorted_reps: Vec<&AudioReplacement> = replacements.iter().collect();
    sorted_reps.sort_by(|a, b| a.start_time.partial_cmp(&b.start_time).unwrap());

    let mut filter_parts: Vec<String> = Vec::new();
    let mut input_labels: Vec<String> = Vec::new();
    let mut label_idx = 0usize;
    let mut wav_idx = 1usize; // input 0 is the video, WAVs start at 1

    let mut cursor = 0.0f64;

    for rep in &sorted_reps {
        if rep.start_time > cursor + 0.01 {
            // Original audio segment before replacement (skip if < 10ms gap)
            filter_parts.push(format!(
                "[0:a]atrim={:.3}:{:.3},asetpts=PTS-STARTPTS[a{}]",
                cursor, rep.start_time, label_idx
            ));
            input_labels.push(format!("[a{}]", label_idx));
            label_idx += 1;
        }
        // Synthetic audio segment (aresample to match any sample rate)
        let synth_dur = rep.end_time - rep.start_time;
        if synth_dur > 0.01 {
            filter_parts.push(format!(
                "[{}:a]atrim=0:{:.3},asetpts=PTS-STARTPTS,aresample=async=1[a{}]",
                wav_idx, synth_dur, label_idx
            ));
            input_labels.push(format!("[a{}]", label_idx));
            label_idx += 1;
        }
        wav_idx += 1;
        cursor = rep.end_time;
    }

    // Remaining original audio after last replacement
    filter_parts.push(format!(
        "[0:a]atrim=start={:.3},asetpts=PTS-STARTPTS[a{}]",
        cursor, label_idx
    ));
    input_labels.push(format!("[a{}]", label_idx));
    label_idx += 1;

    let concat_inputs = input_labels.join("");
    let filter_complex = format!(
        "{};{}concat=n={}:v=0:a=1[outa]",
        filter_parts.join(";"),
        concat_inputs,
        label_idx
    );

    // Build ffmpeg command with multiple inputs
    let mut cmd = Command::new("ffmpeg");
    cmd.args(["-y", "-i", &video_path]);

    // Add synthetic WAV files as additional inputs
    for rep in &sorted_reps {
        cmd.args(["-i", &rep.wav_path]);
    }

    cmd.args([
        "-filter_complex", &filter_complex,
        "-vf", &format!("ass={}", ass_path.to_string_lossy()),
        "-c:v", "libx264",
        "-crf", "18",
        "-preset", "medium",
        "-map", "0:v:0",
        "-map", "[outa]",
        "-c:a", "aac",
        "-b:a", "192k",
        "-movflags", "+faststart",
        &out,
    ]);

    let status = cmd
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .map_err(|e| format!("Failed to run ffmpeg: {}", e))?;

    let _ = std::fs::remove_file(&ass_path);

    if !status.success() {
        return Err("FFmpeg encoding failed".into());
    }

    Ok(out)
}
