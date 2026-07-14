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


def build_mask(frame_shape, x, y, w, h):
    mask = np.zeros(frame_shape[:2], dtype=np.uint8)
    mask[y : y + h, x : x + w] = 255
    kernel = np.ones((MASK_DILATE_PX, MASK_DILATE_PX), np.uint8)
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
        total_frames = 999999

    os.makedirs(args.frames_dir, exist_ok=True)

    mask = build_mask((height, width), args.x, args.y, args.w, args.h)

    frame_idx = 0
    zfill = len(str(total_frames))

    while True:
        ret, frame = cap.read()
        if not ret:
            break
        frame_idx += 1

        frame = cv2.inpaint(frame, mask, INPAINT_RADIUS, cv2.INPAINT_TELEA)

        out_path = os.path.join(args.frames_dir, f"frame_{frame_idx:0{zfill}d}.png")
        cv2.imwrite(out_path, frame)

        if frame_idx % 10 == 0:
            progress = {
                "frame": frame_idx,
                "total": total_frames,
                "percent": round(frame_idx / max(total_frames, 1) * 100, 1),
            }
            print(json.dumps(progress), flush=True)

    cap.release()

    print(json.dumps({
        "status": "done",
        "frames_dir": args.frames_dir,
        "frame_count": frame_idx,
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
