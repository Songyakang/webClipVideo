/// Integration tests — filter → ffmpeg filter string end-to-end.
use editor_tarui_lib::commands::timeline::ClipFilterRust;

// ─── Full filter chain generation ────────────────────────────────────

#[test]
fn full_cinematic_filter_chain() {
    let f = ClipFilterRust {
        brightness: Some(0.05),
        contrast: Some(0.15),
        saturation: Some(-0.15),
        temperature: Some(0.1),
        vignette: Some(0.3),
        hue: None,
        blur: None,
        sharpen: None,
    };
    let result = f.to_ffmpeg_filter().unwrap();
    // Should be something like: eq=brightness=0.05:contrast=1.15:saturation=0.85,colorbalance=rh=0.03:bh=0,vignette=PI*0.471...
    assert!(result.contains("eq="));
    assert!(result.contains("brightness=0.05"));
    assert!(result.contains("contrast=1.15"));
    assert!(result.contains("saturation=0.85"));
    assert!(result.contains("colorbalance"));
    assert!(result.contains("vignette=PI*"));
}

#[test]
fn vintage_preset_chain() {
    let f = ClipFilterRust {
        brightness: Some(0.05),
        contrast: Some(-0.1),
        saturation: Some(-0.4),
        temperature: Some(0.3),
        vignette: Some(0.4),
        hue: None,
        blur: None,
        sharpen: None,
    };
    let result = f.to_ffmpeg_filter().unwrap();
    // contrast -0.1 → 0.9, saturation -0.4 → 0.6
    assert!(result.contains("contrast=0.9"));
    assert!(result.contains("saturation=0.6"));
    // temperature 0.3 → rh=0.09
    assert!(result.contains("colorbalance"));
    assert!(result.contains("vignette"));
}

#[test]
fn bw_preset_chain() {
    let f = ClipFilterRust {
        saturation: Some(-1.0),
        contrast: Some(0.2),
        brightness: None,
        hue: None,
        blur: None,
        sharpen: None,
        temperature: None,
        vignette: None,
    };
    let result = f.to_ffmpeg_filter().unwrap();
    // saturation -1.0 → 0.0
    assert!(result.contains("saturation=0"));
    assert!(result.contains("contrast=1.2"));
    // No vignette, no colorbalance
    assert!(!result.contains("vignette"));
    assert!(!result.contains("colorbalance"));
}

// ─── Partial filters ─────────────────────────────────────────────────

#[test]
fn only_sharpen_and_blur() {
    let f = ClipFilterRust {
        sharpen: Some(0.8),
        blur: Some(3.0),
        brightness: None,
        contrast: None,
        saturation: None,
        hue: None,
        temperature: None,
        vignette: None,
    };
    let result = f.to_ffmpeg_filter().unwrap();
    assert!(result.contains("gblur=sigma=3"));
    assert!(result.contains("unsharp=5:5:0.8"));
    assert!(!result.contains("eq=")); // No eq since no brightness/contrast/saturation
}

#[test]
fn only_hue_rotation() {
    let f = ClipFilterRust {
        hue: Some(45.0),
        brightness: None,
        contrast: None,
        saturation: None,
        blur: None,
        sharpen: None,
        temperature: None,
        vignette: None,
    };
    let result = f.to_ffmpeg_filter().unwrap();
    assert_eq!(result, "hue=h=45");
}

// ─── Combines eq params into single eq filter ────────────────────────

#[test]
fn three_eq_params_are_joined() {
    let f = ClipFilterRust {
        brightness: Some(0.1),
        contrast: Some(0.1),
        saturation: Some(0.1),
        hue: None,
        blur: None,
        sharpen: None,
        temperature: None,
        vignette: None,
    };
    let result = f.to_ffmpeg_filter().unwrap();
    // Should be a single "eq=..." filter with 3 parts joined by colons
    assert!(result.starts_with("eq="));
    assert_eq!(result.matches("eq=").count(), 1, "only one eq= filter");
    assert_eq!(result.matches("brightness=").count(), 1);
    assert_eq!(result.matches("contrast=").count(), 1);
    assert_eq!(result.matches("saturation=").count(), 1);
}

// ─── Filter commas join different filter types ───────────────────────

#[test]
fn different_filter_types_are_comma_separated() {
    let f = ClipFilterRust {
        contrast: Some(0.2),
        hue: Some(90.0),
        blur: Some(3.0),
        vignette: Some(0.5),
        brightness: None,
        saturation: None,
        sharpen: None,
        temperature: None,
    };
    let result = f.to_ffmpeg_filter().unwrap();
    let parts: Vec<&str> = result.split(',').collect();
    // eq=...,hue=h=90,gblur=sigma=3,vignette=PI*...
    assert_eq!(parts.len(), 4, "4 filter types → 4 comma-separated parts");
}

// ─── Empty edge cases ────────────────────────────────────────────────

#[test]
fn all_none_is_empty() {
    let f = ClipFilterRust {
        brightness: None,
        contrast: None,
        saturation: None,
        hue: None,
        blur: None,
        sharpen: None,
        temperature: None,
        vignette: None,
    };
    assert!(f.to_ffmpeg_filter().is_none());
}

#[test]
fn zero_values_produce_no_filter() {
    let f = ClipFilterRust {
        brightness: Some(0.0),
        contrast: Some(0.0),
        saturation: Some(0.0),
        hue: Some(0.0),
        blur: Some(0.0),
        sharpen: Some(0.0),
        temperature: Some(0.0),
        vignette: Some(0.0),
    };
    assert!(f.to_ffmpeg_filter().is_none());
}

// ─── Temperature edge cases ──────────────────────────────────────────

#[test]
fn extreme_warm_temperature() {
    let f = ClipFilterRust {
        temperature: Some(1.0),
        ..Default::default()
    };
    let result = f.to_ffmpeg_filter().unwrap();
    assert!(result.contains("rh=0.3")); // 1.0 * 0.3
    assert!(result.contains("bh=0")); // warm → no blue
}

#[test]
fn extreme_cool_temperature() {
    let f = ClipFilterRust {
        temperature: Some(-1.0),
        ..Default::default()
    };
    let result = f.to_ffmpeg_filter().unwrap();
    assert!(result.contains("rh=0")); // cool → no red
    assert!(result.contains("bh=0.3")); // -(-1.0) * 0.3 = 0.3
}

