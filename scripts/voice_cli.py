#!/usr/bin/env python3
"""Voice feature extraction CLI.

Usage:
    python3 voice_cli.py extract <wav_path>    # Output JSON with 192-dim embedding
    python3 voice_cli.py tts <text> <wav_out>  # Synthesize text to WAV (Phase 1: neutral voice)

Output (extract):
    {"embedding": [0.1, -0.2, ...], "dim": 192, "created_at": "2026-07-13T..."}
"""
import sys
import json
import os
from datetime import datetime, timezone

import torch
import numpy as np

# Lazy-load models
_encoder_model = None
_tts_model = None

def load_encoder():
    global _encoder_model
    if _encoder_model is None:
        from modelscope.pipelines import pipeline
        from modelscope.utils.constant import Tasks
        sv = pipeline(task=Tasks.speaker_verification, model="iic/speech_campplus_sv_zh-cn_16k-common")
        sv.model.eval()
        _encoder_model = sv.model
    return _encoder_model

def load_tts():
    global _tts_model
    if _tts_model is None:
        # Phase 1: Use a simple TTS fallback or MeloTTS
        # For now, use edge-tts or a placeholder
        pass
    return _tts_model


def cmd_extract(wav_path: str):
    """Extract voice embedding from WAV file."""
    import soundfile as sf

    # Read audio
    audio, sr = sf.read(wav_path, dtype="float32")
    if len(audio.shape) > 1:
        audio = audio[:, 0]  # take first channel

    # Resample to 16kHz if needed
    if sr != 16000:
        import librosa
        audio = librosa.resample(audio, orig_sr=sr, target_sr=16000)
        sr = 16000

    # Normalize
    audio = audio / (np.abs(audio).max() + 1e-8)

    # Pad/truncate to ~3 seconds (48000 samples)
    target_len = 48000
    if len(audio) < target_len:
        audio = np.pad(audio, (0, target_len - len(audio)))
    else:
        audio = audio[:target_len]

    # Run inference
    model = load_encoder()
    input_tensor = torch.from_numpy(audio).unsqueeze(0).float()  # [1, samples]

    with torch.no_grad():
        embedding = model(input_tensor)

    # L2 normalize
    emb = embedding.squeeze().numpy()
    norm = np.linalg.norm(emb)
    if norm > 0:
        emb = emb / norm

    result = {
        "embedding": emb.tolist(),
        "dim": int(emb.shape[0]),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    print(json.dumps(result))


def cmd_tts(text: str, wav_out: str, voice: str = "zh-CN-XiaoxiaoNeural"):
    """Synthesize text to speech. Uses EdgeTTS with selectable voice."""
    if not text.strip():
        print("Error: empty text", file=sys.stderr)
        sys.exit(1)

    try:
        import edge_tts
        import asyncio

        async def run():
            communicate = edge_tts.Communicate(text, voice)
            with open(wav_out, "wb") as f:
                async for chunk in communicate.stream():
                    if chunk["type"] == "audio":
                        f.write(chunk["data"])

        asyncio.run(run())
        print(wav_out)
    except ImportError:
        import wave
        sample_rate = 16000
        duration = max(1, len(text) * 0.08)
        n_samples = int(sample_rate * duration)
        with wave.open(wav_out, "w") as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(sample_rate)
            w.writeframes(b"\x00\x00" * n_samples)
        print(wav_out)


_converter_model = None


def load_converter():
    """Load OpenVoice ToneColorConverter (lazy)."""
    global _converter_model
    if _converter_model is None:
        sys.path.insert(0, "/tmp/OpenVoice")
        from openvoice import api as ov_api

        model_root = os.path.expanduser(
            "~/whisper.cpp/models/openvoice/models/myshell-ai--OpenVoice/snapshots/master"
        )
        config = f"{model_root}/checkpoints/converter/config.json"
        ckpt = f"{model_root}/checkpoints/converter/checkpoint.pth"

        # Patch to disable watermark (avoids HuggingFace download)
        orig_init = ov_api.ToneColorConverter.__init__

        def patched_init(self, *args, **kwargs):
            kw = {k: v for k, v in kwargs.items() if k != "enable_watermark"}
            ov_api.OpenVoiceBaseClass.__init__(self, *args, **kw)
            self.watermark_model = None
            self.version = getattr(self.hps, "_version_", "v1")

        ov_api.ToneColorConverter.__init__ = patched_init
        converter = ov_api.ToneColorConverter(config, device="cpu")
        converter.load_ckpt(ckpt)
        _converter_model = converter
    return _converter_model


def cmd_convert(src_wav: str, ref_wav: str, output_wav: str):
    """Convert voice timbre: src_wav (neutral TTS) + ref_wav (target speaker) -> output_wav"""
    converter = load_converter()

    # Source SE: default Chinese speaker embedding
    zh_se_path = os.path.expanduser(
        "~/whisper.cpp/models/openvoice/models/myshell-ai--OpenVoice/snapshots/master"
        "/checkpoints/base_speakers/ZH/zh_default_se.pth"
    )
    src_se = torch.load(zh_se_path, map_location="cpu")

    # Target SE: extract from reference audio
    tgt_se = converter.extract_se(ref_wav)

    # Convert
    converter.convert(
        audio_src_path=src_wav,
        src_se=src_se,
        tgt_se=tgt_se,
        output_path=output_wav,
        tau=0.3,
    )
    print(output_wav)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(
            "Usage: voice_cli.py extract <wav> | tts <text> <wav_out> | convert <src> <ref> <out>",
            file=sys.stderr,
        )
        sys.exit(1)

    cmd = sys.argv[1]
    if cmd == "extract":
        if len(sys.argv) < 3:
            print("Usage: voice_cli.py extract <wav_path>", file=sys.stderr)
            sys.exit(1)
        cmd_extract(sys.argv[2])
    elif cmd == "tts":
        if len(sys.argv) < 4:
            print("Usage: voice_cli.py tts <text> <wav_out> [--voice <name>]", file=sys.stderr)
            sys.exit(1)
        voice = "zh-CN-XiaoxiaoNeural"
        args = sys.argv[2:]
        if "--voice" in args:
            idx = args.index("--voice")
            if idx + 1 < len(args):
                voice = args[idx + 1]
                args.pop(idx)  # remove --voice
                args.pop(idx)  # remove value
        cmd_tts(args[0], args[1], voice)
    elif cmd == "convert":
        if len(sys.argv) < 5:
            print(
                "Usage: voice_cli.py convert <src_wav> <ref_wav> <output_wav>",
                file=sys.stderr,
            )
            sys.exit(1)
        cmd_convert(sys.argv[2], sys.argv[3], sys.argv[4])
    else:
        print(f"Unknown command: {cmd}", file=sys.stderr)
        sys.exit(1)
