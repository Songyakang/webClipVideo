#!/usr/bin/env python3
"""
Subtitle removal CLI using OpenCV TELEA inpainting.

Usage:
    python3 inpaint_cli.py process <video> <output> --x <px> --y <px> --w <px> --h <px>
    python3 inpaint_cli.py preview <image> <output> --x <px> --y <px> --w <px> --h <px>
"""

import sys
import json
import argparse
import cv2
import numpy as np


def build_mask(frame_shape, x, y, w, h, dilate_px=5):
    """Create a binary mask covering the subtitle region, dilated to avoid edge artifacts."""
    mask = np.zeros(frame_shape[:2], dtype=np.uint8)
    mask[y : y + h, x : x + w] = 255
    if dilate_px > 0:
        kernel = np.ones((dilate_px, dilate_px), np.uint8)
        mask = cv2.dilate(mask, kernel, iterations=1)
    return mask


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
        # Fallback: estimate from duration
        total_frames = 999999

    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    out = cv2.VideoWriter(args.output, fourcc, fps, (width, height))
    if not out.isOpened():
        print(json.dumps({"error": "Cannot open output video writer"}), flush=True)
        sys.exit(1)

    mask = build_mask((height, width), args.x, args.y, args.w, args.h)

    frame_idx = 0
    prev_frame = None

    while True:
        ret, frame = cap.read()
        if not ret:
            break
        frame_idx += 1

        region = frame[args.y : args.y + args.h, args.x : args.x + args.w]

        if prev_frame is not None:
            diff = cv2.absdiff(region, prev_frame)
            if diff.mean() < 1.0:
                # Static region, reuse previous inpainted result
                out.write(frame)
                continue

        prev_frame = region.copy()

        frame = cv2.inpaint(frame, mask, 5, cv2.INPAINT_TELEA)
        out.write(frame)

        if frame_idx % 10 == 0:
            progress = {
                "frame": frame_idx,
                "total": total_frames,
                "percent": round(frame_idx / max(total_frames, 1) * 100, 1),
            }
            print(json.dumps(progress), flush=True)

    cap.release()
    out.release()

    print(json.dumps({"status": "done", "output": args.output}), flush=True)


def cmd_preview(args):
    img = cv2.imread(args.image)
    if img is None:
        print(json.dumps({"error": f"Cannot read image: {args.image}"}), flush=True)
        sys.exit(1)

    mask = build_mask(img.shape, args.x, args.y, args.w, args.h)
    result = cv2.inpaint(img, mask, 5, cv2.INPAINT_TELEA)
    cv2.imwrite(args.output, result)
    print(args.output)


def parse_args():
    parser = argparse.ArgumentParser(description="Subtitle removal via inpainting")
    sub = parser.add_subparsers(dest="command", required=True)

    p = sub.add_parser("process")
    p.add_argument("video")
    p.add_argument("output")
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
