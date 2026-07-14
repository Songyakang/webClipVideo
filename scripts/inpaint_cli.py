#!/usr/bin/env python3
"""
Subtitle removal CLI using OpenCV TELEA inpainting.

Usage:
    python3 inpaint_cli.py process <video> --frames-dir <dir> --x <px> --y <px> --w <px> --h <px>
    python3 inpaint_cli.py preview <image> <output> --x <px> --y <px> --w <px> --h <px>
"""

import sys
import json
import argparse
import os
import cv2
import numpy as np

MASK_DILATE_PX = 15
INPAINT_RADIUS = 10
SUBTITLE_EDGE_THRESHOLD = 0.005
SMOOTH_ALPHA = 0.35


def build_mask(frame_shape, x, y, w, h):
    mask = np.zeros(frame_shape[:2], dtype=np.uint8)
    mask[y : y + h, x : x + w] = 255
    kernel = np.ones((MASK_DILATE_PX, MASK_DILATE_PX), np.uint8)
    mask = cv2.dilate(mask, kernel, iterations=1)
    return mask


def has_subtitle(region):
    """Detect subtitle text in region using Canny edge density."""
    gray = cv2.cvtColor(region, cv2.COLOR_BGR2GRAY)
    edges = cv2.Canny(gray, 50, 150)
    density = np.count_nonzero(edges) / edges.size
    return density > SUBTITLE_EDGE_THRESHOLD


def cmd_process(args):
    cap = cv2.VideoCapture(args.video)
    if not cap.isOpened():
        print(json.dumps({"error": f"Cannot open video: {args.video}"}), flush=True)
        sys.exit(1)

    fps = cap.get(cv2.CAP_PROP_FPS)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

    if total_frames <= 0:
        total_frames = 999999

    os.makedirs(args.frames_dir, exist_ok=True)

    mask = build_mask((height, width), args.x, args.y, args.w, args.h)

    frame_idx = 0
    skipped = 0
    zfill = len(str(total_frames))
    prev_region = None  # for EMA temporal smoothing

    while True:
        ret, frame = cap.read()
        if not ret:
            break
        frame_idx += 1

        region = frame[args.y : args.y + args.h, args.x : args.x + args.w]

        if not has_subtitle(region):
            skipped += 1
            prev_region = None  # reset smoothing across gaps
            out_path = os.path.join(args.frames_dir, f"frame_{frame_idx:0{zfill}d}.png")
            cv2.imwrite(out_path, frame)
            if frame_idx % 10 == 0:
                print(json.dumps({
                    "frame": frame_idx, "total": total_frames,
                    "percent": round(frame_idx / max(total_frames, 1) * 100, 1),
                    "skipped": skipped,
                }), flush=True)
            continue

        frame = cv2.inpaint(frame, mask, INPAINT_RADIUS, cv2.INPAINT_TELEA)

        # EMA temporal smoothing: blend current inpainted region with previous
        if prev_region is not None:
            curr_region = frame[args.y : args.y + args.h, args.x : args.x + args.w]
            blended = cv2.addWeighted(curr_region, 1 - SMOOTH_ALPHA, prev_region, SMOOTH_ALPHA, 0)
            frame[args.y : args.y + args.h, args.x : args.x + args.w] = blended

        prev_region = frame[args.y : args.y + args.h, args.x : args.x + args.w].copy()

        out_path = os.path.join(args.frames_dir, f"frame_{frame_idx:0{zfill}d}.png")
        cv2.imwrite(out_path, frame)

        if frame_idx % 10 == 0:
            print(json.dumps({
                "frame": frame_idx, "total": total_frames,
                "percent": round(frame_idx / max(total_frames, 1) * 100, 1),
                "skipped": skipped,
            }), flush=True)

    cap.release()

    cap.release()

    print(json.dumps({
        "status": "done",
        "frames_dir": args.frames_dir,
        "frame_count": frame_idx,
        "skipped": skipped,
        "fps": fps,
        "width": width,
        "height": height,
    }), flush=True)


def cmd_preview(args):
    img = cv2.imread(args.image)
    if img is None:
        print(json.dumps({"error": f"Cannot read image: {args.image}"}), flush=True)
        sys.exit(1)

    mask = build_mask(img.shape, args.x, args.y, args.w, args.h)
    result = cv2.inpaint(img, mask, INPAINT_RADIUS, cv2.INPAINT_TELEA)
    cv2.imwrite(args.output, result)
    print(args.output)


def parse_args():
    parser = argparse.ArgumentParser(description="Subtitle removal via inpainting")
    sub = parser.add_subparsers(dest="command", required=True)

    p = sub.add_parser("process")
    p.add_argument("video")
    p.add_argument("--frames-dir", type=str, required=True)
    p.add_argument("--x", type=int, required=True)
    p.add_argument("--y", type=int, required=True)
    p.add_argument("--w", type=int, required=True)
    p.add_argument("--h", type=int, required=True)

    v = sub.add_parser("preview")
    v.add_argument("image")
    v.add_argument("output")
    v.add_argument("--x", type=int, required=True)
    v.add_argument("--y", type=int, required=True)
    v.add_argument("--w", type=int, required=True)
    v.add_argument("--h", type=int, required=True)

    return parser.parse_args()


if __name__ == "__main__":
    args = parse_args()
    if args.command == "process":
        cmd_process(args)
    elif args.command == "preview":
        cmd_preview(args)
