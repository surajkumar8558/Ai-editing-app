"""Speech to text with word timestamps, fully local (faster-whisper, MIT licence).

    python transcribe.py talk.mp4 --out transcript.json [--model small] [--language en]

Writes {"language": "en", "duration": 31.2, "words": [{"text": "Today", "start": 0.42, "end": 0.71}, ...]}
which packages/compositions/motion-graphics.ts turns into captions and a motion graphics plan.

Model sizes: tiny / base / small / medium / large-v3 (bigger = more accurate, slower).
"small" is a good default on a laptop CPU; use "large-v3" with an NVIDIA GPU.
The model is downloaded once from Hugging Face on first use, then works offline.
"""
from __future__ import annotations

import argparse
import json
import sys
import time

from faster_whisper import WhisperModel


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("input", help="video or audio file")
    ap.add_argument("--out", default="transcript.json")
    ap.add_argument("--model", default="small")
    ap.add_argument("--language", default=None, help="e.g. en, hi; omit to auto-detect")
    ap.add_argument("--device", default="auto", help="auto, cpu or cuda")
    args = ap.parse_args()

    compute_type = "int8" if args.device == "cpu" else "default"
    model = WhisperModel(args.model, device=args.device, compute_type=compute_type)
    t0 = time.time()
    segments, info = model.transcribe(
        args.input,
        language=args.language,
        word_timestamps=True,
        vad_filter=True,  # skip silence; avoids made-up words in pauses
    )
    words = []
    for seg in segments:
        for w in seg.words or []:
            text = w.word.strip()
            if text:
                words.append({"text": text, "start": round(w.start, 3), "end": round(w.end, 3)})
        print(f"\r{seg.end:.0f}/{info.duration:.0f} s", end="", file=sys.stderr)
    print(file=sys.stderr)

    with open(args.out, "w", encoding="utf-8") as f:
        json.dump({"language": info.language, "duration": round(info.duration, 3), "words": words}, f, ensure_ascii=False)
    print(json.dumps({"words": len(words), "language": info.language, "seconds": round(time.time() - t0, 1), "out": args.out}))


if __name__ == "__main__":
    main()
