"""Cut the person out of a video: writes a transparent person-only video for compositing.

    python person_matte.py input.mp4 --out-dir out/ [--model selfie|deeplab]

Outputs in --out-dir:
  person.webm  VP9 video with alpha: only the person is visible (layer it over text)
  mask.mp4     grayscale matte (white = person), handy for debugging or other editors

Models (downloaded on first use, Apache-2.0):
  selfie   MediaPipe Selfie Segmenter: fast, made for one person close to the camera
  deeplab  MediaPipe DeepLab v3 (person class): handles wider shots and several people

Swap in MODNet / SAM 2 later for production-quality hair and edges; only `Segmenter` changes.
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

import cv2
import numpy as np
from ai_edge_litert.interpreter import Interpreter

MODELS = {
    "selfie": "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite",
    "deeplab": "https://storage.googleapis.com/mediapipe-models/image_segmenter/deeplab_v3/float32/latest/deeplab_v3.tflite",
}
DEEPLAB_PERSON_CLASS = 15  # PASCAL VOC label index
CACHE = Path.home() / ".cache" / "ai-editor-models"


def model_path(name: str) -> Path:
    path = CACHE / f"{name}.tflite"
    if not path.exists():
        CACHE.mkdir(parents=True, exist_ok=True)
        print(f"Downloading {name} model…", file=sys.stderr)
        urllib.request.urlretrieve(MODELS[name], path)
    return path


class Segmenter:
    """Frame (H x W x 3 uint8 RGB) -> person probability (H x W float32 in 0..1)."""

    def __init__(self, name: str):
        self.name = name
        self.interp = Interpreter(model_path=str(model_path(name)), num_threads=4)
        self.interp.allocate_tensors()
        self.inp = self.interp.get_input_details()[0]
        self.out = self.interp.get_output_details()[0]
        _, self.h, self.w, _ = self.inp["shape"]

    def __call__(self, rgb: np.ndarray) -> np.ndarray:
        x = cv2.resize(rgb, (self.w, self.h), interpolation=cv2.INTER_AREA).astype(np.float32)
        x = x / 255.0 if self.name == "selfie" else x / 127.5 - 1.0
        self.interp.set_tensor(self.inp["index"], x[None])
        self.interp.invoke()
        y = self.interp.get_tensor(self.out["index"])[0]
        if self.name == "selfie":
            prob = y[..., 0]
        else:  # logits per class -> softmax probability of "person"
            e = np.exp(y - y.max(axis=-1, keepdims=True))
            prob = e[..., DEEPLAB_PERSON_CLASS] / e.sum(axis=-1)
        return cv2.resize(prob, (rgb.shape[1], rgb.shape[0]), interpolation=cv2.INTER_LINEAR)


def probe(path: str) -> dict:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
         "stream=width,height,r_frame_rate", "-of", "json", path],
        check=True, capture_output=True, text=True,
    ).stdout
    s = json.loads(out)["streams"][0]
    num, den = s["r_frame_rate"].split("/")
    return {"width": s["width"], "height": s["height"], "fps": float(num) / float(den)}


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("input")
    ap.add_argument("--out-dir", default="out")
    ap.add_argument("--model", choices=MODELS, default="selfie")
    ap.add_argument("--smooth", type=float, default=0.6,
                    help="0..1 temporal smoothing of the mask (higher = steadier, more lag)")
    args = ap.parse_args()

    info = probe(args.input)
    w, h, fps = info["width"], info["height"], info["fps"]
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    seg = Segmenter(args.model)

    # ffmpeg decodes to raw RGB (applies rotation), and encodes our RGBA / gray frames.
    decoder = subprocess.Popen(
        ["ffmpeg", "-v", "error", "-i", args.input, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
        stdout=subprocess.PIPE,
    )
    rate = f"{fps:.6f}"
    person_enc = subprocess.Popen(
        ["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgba", "-s", f"{w}x{h}",
         "-r", rate, "-i", "-", "-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", "-b:v", "0", "-crf", "32",
         "-row-mt", "1", "-deadline", "realtime", "-cpu-used", "8", "-auto-alt-ref", "0",
         str(out_dir / "person.webm")],
        stdin=subprocess.PIPE,
    )
    mask_enc = subprocess.Popen(
        ["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "gray", "-s", f"{w}x{h}",
         "-r", rate, "-i", "-", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20",
         str(out_dir / "mask.mp4")],
        stdin=subprocess.PIPE,
    )

    frame_bytes = w * h * 3
    prev = None
    n = 0
    t0 = time.time()
    while True:
        buf = decoder.stdout.read(frame_bytes)
        if len(buf) < frame_bytes:
            break
        rgb = np.frombuffer(buf, np.uint8).reshape(h, w, 3)
        prob = seg(rgb)
        # Temporal smoothing reduces flicker; a light blur feathers the edge.
        prob = prob if prev is None else args.smooth * prev + (1 - args.smooth) * prob
        prev = prob
        alpha = cv2.GaussianBlur((np.clip(prob, 0, 1) * 255).astype(np.uint8), (5, 5), 0)
        person_enc.stdin.write(np.dstack([rgb, alpha]).tobytes())
        mask_enc.stdin.write(alpha.tobytes())
        n += 1
        if n % 50 == 0:
            print(f"{n} frames, {n / (time.time() - t0):.1f} fps", file=sys.stderr)

    for p in (person_enc, mask_enc):
        p.stdin.close()
        p.wait()
    decoder.wait()
    took = time.time() - t0
    print(json.dumps({"frames": n, "seconds": round(took, 1), "fps": round(n / took, 1),
                      "width": w, "height": h, "video_fps": fps, "model": args.model,
                      "person": str(out_dir / "person.webm"), "mask": str(out_dir / "mask.mp4")}))


if __name__ == "__main__":
    main()
