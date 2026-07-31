/// Pure-Rust video frame inpainting for subtitle removal.
///
/// Replaces `scripts/inpaint_cli.py` — no Python or OpenCV required.
/// Uses `image` + `imageproc` crates for all operations.

use image::{DynamicImage, GrayImage, RgbImage};
use imageproc::edges::canny;
use imageproc::morphology::dilate;
use imageproc::distance_transform::Norm;
use std::collections::BinaryHeap;
use std::cmp::Ordering;

// ── Algorithm parameters (matching the Python version) ──

const MASK_DILATE_PX: u8 = 15;
const INPAINT_RADIUS: i32 = 10;
const SUBTITLE_EDGE_THRESHOLD: f32 = 0.005;
const SMOOTH_ALPHA: f32 = 0.35;

// ── Mask construction ──

/// Build a binary mask for the subtitle region with dilation.
/// Returns (mask, x, y, w, h) where the region coords may be expanded by dilation.
pub fn build_mask(
    frame_width: u32,
    frame_height: u32,
    x: u32,
    y: u32,
    w: u32,
    h: u32,
) -> GrayImage {
    let mut mask = GrayImage::new(frame_width, frame_height);

    // Fill the subtitle region with white
    for py in y..(y + h).min(frame_height) {
        for px in x..(x + w).min(frame_width) {
            mask.put_pixel(px, py, image::Luma([255u8]));
        }
    }

    // Dilate mask: LInf norm with radius k gives a (2k+1)×(2k+1) square structuring element.
    // k=7 gives a 15×15 kernel matching cv2.dilate with a 15×15 ones kernel.
    dilate(&mask, Norm::LInf, MASK_DILATE_PX / 2)
}

// ── Subtitle detection ──

/// Detect whether a frame region contains subtitle text using Canny edge density.
/// Mirrors `has_subtitle()` in `inpaint_cli.py`.
pub fn has_subtitle(region: &DynamicImage) -> bool {
    let gray = region.to_luma8();
    let edges = canny(&gray, 50.0, 150.0);

    let total: f32 = (edges.width() * edges.height()) as f32;
    if total == 0.0 {
        return false;
    }

    let nonzero: f32 = edges.pixels().filter(|p| p.0[0] > 0).count() as f32;
    let density = nonzero / total;
    density > SUBTITLE_EDGE_THRESHOLD
}

// ── TELEA-style inpainting ──

/// A pixel coordinate with its distance from the mask boundary.
/// Used in the Fast Marching priority queue.
#[derive(Copy, Clone, Eq, PartialEq)]
struct MarchingPixel {
    dist_sq: i32, // squared distance from boundary (negative for ordering)
    x: u32,
    y: u32,
}

impl Ord for MarchingPixel {
    fn cmp(&self, other: &Self) -> Ordering {
        // BinaryHeap is max-heap; we want smallest dist first, so reverse
        other.dist_sq.cmp(&self.dist_sq)
    }
}

impl PartialOrd for MarchingPixel {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

/// Apply TELEA-style inpainting to the masked region of an image.
///
/// Algorithm:
/// 1. Build a distance map from the mask boundary (inside the mask)
/// 2. Process pixels from boundary inward using a priority queue
/// 3. Each pixel gets a weighted average of known neighbors within INPAINT_RADIUS
/// 4. Weight = 1 / (distance² + ε), weighted toward boundary-facing neighbors
pub fn inpaint_telea(img: &RgbImage, mask: &GrayImage) -> RgbImage {
    let (w, h) = (img.width() as i32, img.height() as i32);
    let radius = INPAINT_RADIUS;

    let mut result = img.clone();

    // Build distance map: -1 = outside mask, >= 0 = distance from boundary
    // We use a simple approach: compute approximate distance from boundary
    let mut dist_map = vec![-1i32; (w * h) as usize];
    let mut heap = BinaryHeap::new();

    let idx = |x: i32, y: i32| (y * w + x) as usize;

    // Phase 1: Find boundary pixels (masked pixels adjacent to non-masked pixels)
    // Boundary pixels get dist=0 and are queued first
    for y in 0..h {
        for x in 0..w {
            if mask.get_pixel(x as u32, y as u32).0[0] == 0 {
                continue; // not masked
            }
            // Check if this masked pixel has a non-masked neighbor
            let mut is_boundary = false;
            for dy in -1..=1 {
                for dx in -1..=1 {
                    if dx == 0 && dy == 0 {
                        continue;
                    }
                    let nx = x + dx;
                    let ny = y + dy;
                    if nx >= 0 && nx < w && ny >= 0 && ny < h {
                        if mask.get_pixel(nx as u32, ny as u32).0[0] == 0 {
                            is_boundary = true;
                            break;
                        }
                    } else {
                        is_boundary = true; // image edge is a boundary
                        break;
                    }
                }
                if is_boundary {
                    break;
                }
            }
            if is_boundary {
                dist_map[idx(x, y)] = 0;
                heap.push(MarchingPixel {
                    dist_sq: 0,
                    x: x as u32,
                    y: y as u32,
                });
            }
        }
    }

    // Phase 2: Fast Marching — propagate distances inward
    let mut visited = vec![false; (w * h) as usize];
    let mut boundary_set: Vec<(u32, u32)> = Vec::new();

    // First, inpaint all boundary pixels
    while let Some(MarchingPixel { x, y, .. }) = heap.pop() {
        let i = idx(x as i32, y as i32);
        if visited[i] {
            continue;
        }
        visited[i] = true;
        boundary_set.push((x, y));

        // Inpaint this pixel using known neighbors
        inpaint_pixel(&mut result, &dist_map, mask, x, y, radius, w, h);

        // Mark as known
        dist_map[i] = -2; // -2 = inpainted, now considered "known"

        // Add unvisited masked neighbors to the queue
        for dy in -1..=1 {
            for dx in -1..=1 {
                if dx == 0 && dy == 0 {
                    continue;
                }
                let nx = x as i32 + dx;
                let ny = y as i32 + dy;
                if nx >= 0 && nx < w && ny >= 0 && ny < h {
                    let ni = idx(nx, ny);
                    if !visited[ni] && mask.get_pixel(nx as u32, ny as u32).0[0] > 0 {
                        let new_dist = (dx * dx + dy * dy) as i32;
                        if dist_map[ni] == -1 || new_dist < dist_map[ni] {
                            dist_map[ni] = new_dist;
                        }
                        heap.push(MarchingPixel {
                            dist_sq: dist_map[ni],
                            x: nx as u32,
                            y: ny as u32,
                        });
                    }
                }
            }
        }
    }

    // Phase 3: Process remaining masked pixels (those not reached by boundary marching)
    for y in 0..h {
        for x in 0..w {
            if mask.get_pixel(x as u32, y as u32).0[0] > 0 && dist_map[idx(x, y)] == -1 {
                inpaint_pixel(&mut result, &dist_map, mask, x as u32, y as u32, radius, w, h);
            }
        }
    }

    result
}

/// Inpaint a single pixel using weighted average of known neighbors within radius.
fn inpaint_pixel(
    img: &mut RgbImage,
    dist_map: &[i32],
    mask: &GrayImage,
    px: u32,
    py: u32,
    radius: i32,
    w: i32,
    h: i32,
) {
    let idx = |x: i32, y: i32| (y * w + x) as usize;

    let mut sum_r = 0.0f32;
    let mut sum_g = 0.0f32;
    let mut sum_b = 0.0f32;
    let mut weight_sum = 0.0f32;

    for dy in -radius..=radius {
        for dx in -radius..=radius {
            let nx = px as i32 + dx;
            let ny = py as i32 + dy;
            if nx < 0 || nx >= w || ny < 0 || ny >= h {
                continue;
            }
            if nx == px as i32 && ny == py as i32 {
                continue;
            }

            let ni = idx(nx, ny);
            // Use pixel if it's outside the mask or already inpainted
            let is_known = mask.get_pixel(nx as u32, ny as u32).0[0] == 0
                || dist_map[ni] == -2; // -2 = inpainted (now known)

            if !is_known {
                continue;
            }

            let dist_sq = (dx * dx + dy * dy) as f32;
            if dist_sq < 1.0 {
                continue;
            }

            // Weight: inverse distance squared (simplified TELEA)
            let weight = 1.0 / dist_sq;

            let pixel = img.get_pixel(nx as u32, ny as u32);
            sum_r += pixel[0] as f32 * weight;
            sum_g += pixel[1] as f32 * weight;
            sum_b += pixel[2] as f32 * weight;
            weight_sum += weight;
        }
    }

    if weight_sum > 0.0 {
        let r = (sum_r / weight_sum).clamp(0.0, 255.0) as u8;
        let g = (sum_g / weight_sum).clamp(0.0, 255.0) as u8;
        let b = (sum_b / weight_sum).clamp(0.0, 255.0) as u8;
        img.put_pixel(px, py, image::Rgb([r, g, b]));
    }
}

// ── High-level frame processing ──

/// Process a single frame for subtitle removal.
///
/// Returns (processed_frame, was_inpainted).
/// If the frame's subtitle region has no detectable text, returns the original.
/// If text is detected, returns the inpainted frame.
pub fn process_frame(
    frame: &DynamicImage,
    x: u32,
    y: u32,
    w: u32,
    h: u32,
) -> (DynamicImage, bool) {
    let (fw, fh) = (frame.width(), frame.height());

    // Extract the subtitle region
    let region = frame.crop_imm(x, y, w.min(fw - x), h.min(fh - y));

    if !has_subtitle(&region) {
        return (frame.clone(), false);
    }

    // Build mask and inpaint
    let mask = build_mask(fw, fh, x, y, w, h);
    let rgb = frame.to_rgb8();
    let result = inpaint_telea(&rgb, &mask);

    (DynamicImage::ImageRgb8(result), true)
}

/// Apply temporal smoothing between current and previous inpainted region.
/// Blends the ROI of two frames using EMA (Exponential Moving Average).
pub fn smooth_region(
    current: &mut RgbImage,
    previous: &RgbImage,
    x: u32,
    y: u32,
    w: u32,
    h: u32,
) {
    let max_h = h.min(current.height() - y).min(previous.height() - y);
    let max_w = w.min(current.width() - x).min(previous.width() - x);

    for py in y..y + max_h {
        for px in x..x + max_w {
            let cp = current.get_pixel(px, py);
            let pp = previous.get_pixel(px, py);

            let r = (cp[0] as f32 * (1.0 - SMOOTH_ALPHA) + pp[0] as f32 * SMOOTH_ALPHA) as u8;
            let g = (cp[1] as f32 * (1.0 - SMOOTH_ALPHA) + pp[1] as f32 * SMOOTH_ALPHA) as u8;
            let b = (cp[2] as f32 * (1.0 - SMOOTH_ALPHA) + pp[2] as f32 * SMOOTH_ALPHA) as u8;
            current.put_pixel(px, py, image::Rgb([r, g, b]));
        }
    }
}

// ── Single-image inpainting (preview) ──

/// Inpaint a single image file and write the result.
/// Used for the preview feature.
pub fn inpaint_single_image(
    image_path: &str,
    output_path: &str,
    x: u32,
    y: u32,
    w: u32,
    h: u32,
) -> Result<(), String> {
    let img = image::open(image_path)
        .map_err(|e| format!("Cannot read image {}: {}", image_path, e))?;

    let (fw, fh) = (img.width(), img.height());
    let mask = build_mask(fw, fh, x, y, w, h);
    let rgb = img.to_rgb8();
    let result = inpaint_telea(&rgb, &mask);

    result
        .save(output_path)
        .map_err(|e| format!("Cannot write output {}: {}", output_path, e))?;

    Ok(())
}

// ── Tests ──

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_build_mask() {
        let mask = build_mask(100, 100, 20, 30, 40, 10);
        assert_eq!(mask.width(), 100);
        assert_eq!(mask.height(), 100);
        // Center of mask should be white
        assert!(mask.get_pixel(40, 35).0[0] > 0);
        // Far outside should be black
        assert_eq!(mask.get_pixel(5, 5).0[0], 0);
    }

    #[test]
    fn test_has_subtitle_on_plain_region() {
        // A plain gray region should NOT be detected as subtitle
        let plain = DynamicImage::ImageRgb8(RgbImage::from_pixel(200, 40, image::Rgb([128, 128, 128])));
        assert!(!has_subtitle(&plain));
    }

    #[test]
    fn test_process_frame_no_subtitle() {
        let frame = DynamicImage::ImageRgb8(RgbImage::from_pixel(640, 480, image::Rgb([100, 100, 100])));
        let (_result, was_inpainted) = process_frame(&frame, 0, 440, 640, 40);
        assert!(!was_inpainted);
    }

    #[test]
    fn test_inpaint_telea_small_region() {
        // Create a simple image with a white rectangle on dark background
        let mut img = RgbImage::from_pixel(100, 100, image::Rgb([50, 50, 50]));
        // Add a white rectangle (simulating subtitle)
        for py in 45..55 {
            for px in 10..90 {
                img.put_pixel(px, py, image::Rgb([240, 240, 240]));
            }
        }
        // Create mask covering the white rectangle
        let mut mask = GrayImage::new(100, 100);
        for py in 40..60 {
            for px in 5..95 {
                mask.put_pixel(px, py, image::Luma([255u8]));
            }
        }

        let result = inpaint_telea(&img, &mask);

        // After inpainting, the masked region should no longer be bright white
        // Check a pixel that was in the white rectangle
        let center_pixel = result.get_pixel(50, 50);
        // Should be closer to background (50) than white (240)
        let brightness = center_pixel[0] as f32 + center_pixel[1] as f32 + center_pixel[2] as f32;
        assert!(brightness < 500.0, "Expected inpainted pixel to be darker than white, got brightness {}", brightness);
    }
}
