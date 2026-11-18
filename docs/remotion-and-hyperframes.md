# How Remotion and HyperFrames fit in

Remotion (React) and HyperFrames (HTML + GSAP) both turn web code into video by drawing it in a
headless Chrome, frame by frame, then encoding with FFmpeg. **Neither runs inside a phone app**:
they need desktop Chrome + FFmpeg. So in this project they are the **render server**, and the
phone does previewing and on-device AI.

```
 Phone app (Expo)                               Render server (Node + Python)
 ───────────────────────────                    ────────────────────────────────────────────
 pick video, type text, style ──── upload ────▶ 1. services/ml-worker/person_matte.py
 live preview (Skia, on-device masks)              video ─▶ person.webm (person only, transparent)
                                                2. packages/compositions/render.mjs   (Remotion)
                                                   or packages/hyperframes-text-behind (HyperFrames)
                                                   video + text + person.webm ─▶ final MP4
 download / share MP4 ◀─────────── result ───── 3. upload MP4 to storage, notify the phone
```

The **layers are the same everywhere**: original video → text → person cut-out on top.
The phone preview (`apps/benchmark/src/VideoPreview.tsx`) draws those layers with Skia; the server draws
them with Remotion or HyperFrames. A project is just JSON (`text`, `color`, `fontSizePct`, `yPct`, …) that
both sides read.

## Try it locally

```bash
# 1. Person cut-out (Python 3.10+)
cd services/ml-worker
pip install -r requirements.txt
python person_matte.py my-video.mp4 --out-dir out --model selfie    # selfie: one person near the camera
                                                                     # deeplab: wider shots, several people
# 2a. Render with Remotion
cd ../../packages/compositions
npm install
node render.mjs --video my-video.mp4 --person ../../services/ml-worker/out/person.webm \
  --text "DREAM BIG" --y 42 --font-size 22 --out out/result.mp4
npm run studio            # optional: visual editor at http://localhost:3000

# 2b. Or render with HyperFrames
cd ../hyperframes-text-behind
npm install
node render.mjs --video my-video.mp4 --person ../../services/ml-worker/out/person.webm --out out/result.mp4
```

If Chrome can't be downloaded on your server, point both renderers at an installed Chrome:
`REMOTION_BROWSER_EXECUTABLE=/path/to/chrome-headless-shell` for Remotion and
`HYPERFRAMES_BROWSER_PATH=/path/to/chrome` for HyperFrames.

## Which one to use

| | Remotion | HyperFrames |
|---|---|---|
| Templates written in | React components + props | Plain HTML/CSS + GSAP timeline |
| Best for | Your own template library, typed props, code reuse with a React Native app | Letting an AI agent (LLM) generate new templates; designers who know HTML/CSS |
| Visual editor | Remotion Studio (`npm run studio`) | HyperFrames preview (`npx hyperframes preview`) |
| Scaling renders | `renderMedia()` on your servers, or Remotion Lambda | CLI on your servers (or Docker mode) |
| Licence | **Free only for individuals and companies of up to 3 people**; bigger companies need a company licence | Open source |

Recommendation: **build the core templates in Remotion** (React, same language as the app, typed props).
Add HyperFrames when you build the "describe your video" AI feature, because an LLM writes good
HTML + GSAP and HyperFrames' linter catches its mistakes before rendering.
You don't need both on day one.

## What was verified

Both renderers were run end to end on a sample clip (OpenCV's `vtest.avi`, people walking):
`person_matte.py` (DeepLab, ~30 fps on 4 CPU cores) → Remotion render (8 s clip in ~5 s) and
HyperFrames render, both showing the text behind the walking people. That clip is a wide CCTV shot, so the
DeepLab masks are soft blobs; a phone video with a person close to the camera should look much cleaner
with the `selfie` model, and MODNet / SAM 2 give production-quality hair and edges (see the main plan).

## Gotchas found while setting this up

- **Fonts and scripts must be local files.** Render servers are often offline or behind a proxy;
  the Anton font (OFL) and GSAP are shipped with each package instead of loaded from a CDN.
- **Transparent person video** is VP9 WebM with alpha (`yuva420p`). Chrome plays it, which is why both
  renderers can layer it. (Safari/iOS WebViews can't, which matters only for a web preview on iPhone.)
- **HyperFrames refuses `data-has-audio="true"` on a video without sound**; `render.mjs` checks for an audio
  track and sets `muted` instead.
- **Remotion version pinning:** all `remotion` / `@remotion/*` packages must be the exact same version.
