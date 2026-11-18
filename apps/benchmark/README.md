# On-device AI benchmark

A small Expo app that measures, on a real phone:

- how fast background-removal models run (ms per frame, FPS, estimated time for a 30 s clip)
- how much storage each model takes, and how much free space the phone has
- the "text behind person" result, rendered with the model's mask

| Model | Runtime | Input | Size |
|---|---|---|---|
| MediaPipe Selfie Segmenter | TFLite (Core ML / Android GPU delegate) | 256 px | ~0.25 MB |
| MODNet int8 | ONNX Runtime (Core ML / NNAPI) | 512 px | ~7 MB |
| MODNet fp32 | ONNX Runtime | 512 px | ~26 MB |

Models are downloaded inside the app on first use (not bundled), the same way the real editor should ship them.
URLs are in `src/models.ts`.

## How it works

1. Pick a video. The app samples 30 evenly spaced frames (`expo-video-thumbnails`) and decodes them with Skia.
2. Pick a model and run it. Each frame is resized to the model's input size and inferred, after one untimed warm-up run.
   The model time and the prep time (resize + tensor conversion) are reported separately.
3. The preview draws: frame → text → frame masked by the person mask (Skia `srcIn` blend).

## Running it

This app uses native modules (TFLite, ONNX Runtime, Skia), so it **does not run in Expo Go**. You need a development build.

### Android, no computer setup needed (EAS cloud build)

```bash
cd apps/benchmark
npm install
npx eas-cli@latest login
npx eas-cli@latest build -p android --profile development
```

Install the APK from the link EAS gives you, then start the JS server:

```bash
npx expo start --dev-client
```

Then scan the QR code with the installed app.

### Local builds

```bash
npx expo run:android   # needs Android Studio / SDK
npx expo run:ios       # needs a Mac with Xcode
```

## Reading the results

- Check **ms/frame** for both CPU and GPU (use the toggle). Some models fall back to CPU when a delegate can't run every operation; the result shows the backend that was actually used.
- Phones slow down when they get hot. Run each model 2–3 times and use the steady number.
- "@ 15 fps (masks interpolated)" is the planned trick: compute masks for every other frame and blend the ones in between.

## Notes

- The ONNX execution provider on Android is NNAPI, which is deprecated on Android 15+ but still works. If it's slow, compare with CPU.
- Hugging Face model URLs may need replacing if the files move.
