# On-device storage plan

These are estimated sizes for running the AI features locally on the phone.
Sizes are for mobile-ready formats (TFLite, ONNX, GGUF/ggml, Core ML).
Only MediaPipe's size is measured (249,537 bytes). The others are approximate and depend on the exact export.

## Model sizes

| Feature | Model | Format / precision | Download size | RAM while running |
|---|---|---|---|---|
| Live person mask | MediaPipe Selfie Segmenter | TFLite fp16 | **0.25 MB** | ~20 MB |
| Final person mask | MODNet | ONNX int8 / fp16 / fp32 | **~7 / 13 / 26 MB** | ~100–200 MB |
| Stable video mask | EdgeTAM | Core ML / ONNX fp16 | ~30–60 MB | ~300–500 MB |
| Captions | Whisper base | ggml q5 / fp16 | **~57 / 142 MB** | ~200–400 MB |
| Captions (better) | Whisper small | ggml q5 / fp16 | ~180 / 466 MB | ~0.5–1 GB |
| Captions (alt.) | Moonshine base | ONNX int8 | ~60 MB | ~200 MB |
| Silence cut | Silero VAD | ONNX | **~2 MB** | ~10 MB |
| AI voiceover | Kokoro-82M (+ voices) | ONNX int8 / fp32 | ~90 / 310 MB | ~300–600 MB |
| Prompt editing | Qwen3-0.6B | GGUF Q4 | ~0.4–0.5 GB | ~0.8 GB |
| Prompt editing (better) | Qwen3-1.7B | GGUF Q4 | ~1.1 GB | ~1.8–2 GB |

## Runtime libraries (part of the app download)

| Library | Approx. added app size (per device architecture) |
|---|---|
| Expo / React Native base app | 25–40 MB |
| ONNX Runtime Mobile | 10–20 MB |
| TFLite + GPU delegate | 5–10 MB |
| Skia (compositing) | 6–8 MB |
| whisper.cpp / llama.cpp | 2–5 MB each |

## Bundles

| Bundle | What's in it | Models on disk | Total incl. app |
|---|---|---|---|
| **Lite** (ships with the app) | MediaPipe + Silero VAD | ~2–3 MB | **~60–80 MB** |
| **Standard** (downloaded on first use) | + MODNet int8 + Whisper base q5 | ~70 MB | ~130–150 MB |
| **Pro** | + EdgeTAM + Kokoro int8 + Whisper small q5 | ~350–400 MB | ~420–480 MB |
| **Everything** | + Qwen3-1.7B Q4 | ~1.5–1.6 GB | ~1.6–1.8 GB |

## Working space per project (temporary)

| Item | 30 s 1080p clip |
|---|---|
| Source video (H.264) | 30–60 MB |
| Mask cache (grayscale, encoded as video) | 5–15 MB |
| Mask cache as PNG frames (avoid this) | 90–200 MB |
| Exported video | 30–60 MB |
| **Typical total** | **~100–150 MB** (clear it after export) |

## Recommendations

- Ship only the Lite bundle in the app. Download the others the first time a feature is used, and show the size before downloading.
- Let users delete models in Settings. The benchmark app already does this.
- Use int8/q5 quantized models on phones: about 3–4× smaller with a small quality loss.
- Don't use the LLM below 6 GB RAM. Budget phones should fall back to a server, or to the feature being off.
- Never store raw decoded frames: a 30 s 1080p clip is ~5.6 GB uncompressed. Stream frames through the models instead.
