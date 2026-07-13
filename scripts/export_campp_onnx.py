"""Export CAM++ speaker encoder model to ONNX format.

Downloads the CAM++ model from ModelScope and exports it as campp.onnx.
Output: ~/whisper.cpp/models/campp.onnx (~28MB)
"""
import os
import torch
from modelscope.pipelines import pipeline
from modelscope.utils.constant import Tasks

MODEL_ID = "iic/speech_campplus_sv_zh-cn_16k-common"

def export_campp_onnx(output_path: str):
    print(f"Loading CAM++ model from ModelScope: {MODEL_ID}...")
    sv_pipeline = pipeline(
        task=Tasks.speaker_verification,
        model=MODEL_ID,
    )
    model = sv_pipeline.model
    model.eval()

    # CAM++ expects 16kHz mono audio, 3 seconds = 48000 samples as a 2D tensor [batch=1, samples]
    dummy_input = torch.randn(1, 48000)

    print("Exporting to ONNX...")
    torch.onnx.export(
        model,
        dummy_input,
        output_path,
        input_names=["audio"],
        output_names=["embedding"],
        dynamic_axes={
            "audio": {0: "batch", 1: "samples"},
            "embedding": {0: "batch"},
        },
        opset_version=17,
        dynamo=False,
    )
    print(f"Exported CAM++ ONNX to {output_path}")
    print(f"File size: {os.path.getsize(output_path) / 1024 / 1024:.1f} MB")

    # Verify with onnxruntime
    import onnxruntime as ort
    session = ort.InferenceSession(output_path)
    print(f"ONNX model validated. Inputs: {[i.name for i in session.get_inputs()]}")
    print(f"Outputs: {[o.name for o in session.get_outputs()]}")

if __name__ == "__main__":
    out = os.path.expanduser("~/whisper.cpp/models/campp.onnx")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    export_campp_onnx(out)
