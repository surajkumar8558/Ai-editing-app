# Auto motion graphics

Listens to what the person in a video says, plans motion graphics that match, and renders them
with Remotion, all on your own computer with open-source models.

```
talk.mp4 ─▶ 1. transcribe.py (faster-whisper) ─▶ words with timestamps
          ─▶ 2. planner: local LLM (Ollama) or rules ─▶ plan.json (what to show, when)
          ─▶ 3. Remotion "MotionGraphics" composition ─▶ talk-with-graphics.mp4
```

## Graphics it can plan

| Type | When the planner uses it | Looks like |
|---|---|---|
| `title` | Opening line, "let's talk about…", topic changes | Big uppercase title sliding up, yellow underline |
| `keyword` | The key idea of a sentence | Word in a yellow highlight box popping in, matching emoji |
| `stat` | Any number that matters ("80 percent", "$3 million", "2x") | Number counting up inside a progress ring, label below |
| `list` | "First… second… third…", "A, B and C" | Numbered items appearing as each is said |
| `emoji` | Strong emotion ("I love it", "crazy") | Emoji floating up |
| captions | Always (turn off with `--no-captions`) | Word-by-word captions, the spoken word highlighted |

With `--person person.webm` (from `services/ml-worker/person_matte.py`), titles and keywords go
**behind the speaker**; stats, lists and captions stay on top.

## Setup (once)

```bash
# Speech to text (Python 3.10+)
pip install -r services/ml-worker/requirements.txt

# Remotion
cd packages/compositions && npm install

# Optional, for smarter plans: a local LLM with Ollama (https://ollama.com)
ollama pull qwen3:8b        # Apache-2.0; qwen3:4b for 8 GB RAM machines, qwen3:14b for better plans
```

## Use

```bash
cd packages/compositions

# Everything in one go: transcribe, plan (LLM if Ollama is running, else rules), render
npx tsx motion-graphics.ts --video ~/talk.mp4 --out out/talk.mp4

# Check the plan before rendering, then edit out/talk.plan.json by hand and render that
npx tsx motion-graphics.ts --video ~/talk.mp4 --out out/talk.mp4 --plan-only
npx tsx motion-graphics.ts --video ~/talk.mp4 --transcript out/talk.transcript.json --plan out/talk.plan.json

# Text behind the speaker
python ../../services/ml-worker/person_matte.py ~/talk.mp4 --out-dir out/matte --model selfie
npx tsx motion-graphics.ts --video ~/talk.mp4 --person out/matte/person.webm

# Demo without a video (gradient background, estimated timings)
npx tsx motion-graphics.ts --script "Today I want to talk about saving money. 70 percent of people..."

# Visual editing of the template and sample plan
npm run studio            # pick "MotionGraphics"
```

Useful options: `--planner rules|llm|auto`, `--llm-model qwen3:4b`, `--llm-url http://localhost:8080/v1`
(llama.cpp server / LM Studio / vLLM), `--whisper-model base|small|large-v3`, `--language hi`,
`--color "#00E5FF"`, `--no-captions`.

## How the planners work

- **LLM planner** (`src/motion/planner-llm.ts`): sends the transcript, one line per sentence with word
  times, plus design rules ("only numbers that are in the transcript", "one graphic at a time",
  "every 3-6 s") to the local model, asking for JSON that matches a schema.
- **Rule planner** (`src/motion/planner-rules.ts`): no model needed. Per sentence: numbers → stat,
  "first/second/third" → list, topic phrases → title, emotion words → emoji, otherwise the most important
  word (frequent, long, not a filler word) → keyword with an emoji from a built-in dictionary.
- Both outputs go through `cleanPlan` (`src/motion/plan.ts`), which validates every item, clamps times
  to the video, and removes overlaps, so a weak LLM reply can't break the render.

## What was tested here, and what wasn't

- Rule planner and full Remotion render: tested on a sample script (1080×1920, 34 s, rendered in ~46 s
  on 4 CPU cores).
- LLM planner: tested against a stand-in server that answers like Ollama (schema sent, fenced JSON
  parsed, invalid and overlapping items dropped). **Not yet tested with a real model**, because this cloud
  container can't download model weights; run it with Ollama on your machine.
- `transcribe.py`: the faster-whisper API was checked, but it was **not run on real speech** here for
  the same reason (Whisper weights download from Hugging Face on first use).
