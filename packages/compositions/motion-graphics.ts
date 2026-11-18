// Auto motion graphics: listen to what the person says, plan graphics, render with Remotion.
//
//   npx tsx motion-graphics.ts --video talk.mp4
//
// Steps (each can be skipped by passing its output):
//   1. Transcribe   services/ml-worker/transcribe.py (faster-whisper)   --transcript transcript.json
//   2. Plan         local LLM via Ollama, or the rule planner            --plan plan.json
//   3. Render       Remotion "MotionGraphics" composition                --plan-only to stop before
//
// The plan is saved next to the output (out.plan.json): edit it by hand and re-render with --plan.
import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import type { MotionGraphicsProps } from './src/motion/MotionGraphicsVideo';
import { cleanPlan, defaultTheme, wordSchema, type Graphic, type Word } from './src/motion/plan';
import { planWithLlm } from './src/motion/planner-llm';
import { planWithRules } from './src/motion/planner-rules';
import { timedWords } from './src/motion/sample';

const { values: a } = parseArgs({
  options: {
    video: { type: 'string' },
    transcript: { type: 'string' },
    script: { type: 'string' }, // no video: render a demo from this text with estimated timings
    planner: { type: 'string', default: 'auto' }, // auto | llm | rules
    'llm-url': { type: 'string', default: process.env.LLM_URL ?? 'http://localhost:11434' },
    'llm-model': { type: 'string', default: process.env.LLM_MODEL ?? 'qwen3:8b' },
    'whisper-model': { type: 'string', default: 'small' },
    language: { type: 'string' },
    person: { type: 'string' }, // person cut-out (person_matte.py) to put titles behind the speaker
    plan: { type: 'string' },
    'plan-only': { type: 'boolean', default: false },
    'no-captions': { type: 'boolean', default: false },
    color: { type: 'string', default: defaultTheme.primary },
    vertical: { type: 'boolean', default: true }, // size for --script demos
    out: { type: 'string', default: 'out/motion-graphics.mp4' },
  },
});

const root = path.dirname(new URL(import.meta.url).pathname);
const repo = path.resolve(root, '../..');
const out = path.resolve(a.out!);
mkdirSync(path.dirname(out), { recursive: true });
const log = (...m: unknown[]) => console.log('›', ...m);

// ---------- 0. Video info ----------
let width = a.vertical ? 1080 : 1920;
let height = a.vertical ? 1920 : 1080;
let fps = 30;
let durationSec = 0;
if (a.video) {
  const p = JSON.parse(
    execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries',
      'stream=width,height,r_frame_rate:stream_side_data=rotation:format=duration', '-of', 'json', a.video]).toString(),
  );
  const s = p.streams[0];
  const rotation = Math.abs(Number(s.side_data_list?.[0]?.rotation ?? 0));
  [width, height] = rotation === 90 || rotation === 270 ? [s.height, s.width] : [s.width, s.height];
  const [num, den] = s.r_frame_rate.split('/').map(Number);
  fps = Math.min(60, Math.round(num / den)) || 30;
  durationSec = Number(p.format.duration);
}

// ---------- 1. Transcript ----------
let words: Word[];
if (a.transcript) {
  const t = JSON.parse(readFileSync(a.transcript, 'utf8'));
  words = wordSchema.array().parse(t.words ?? t);
  log(`Transcript: ${words.length} words from ${a.transcript}`);
} else if (a.script) {
  words = timedWords(a.script);
  log(`Demo script: ${words.length} words with estimated timings`);
} else if (a.video) {
  const tPath = out.replace(/\.mp4$/, '') + '.transcript.json';
  const python = process.env.PYTHON ?? 'python3';
  const args = [path.join(repo, 'services/ml-worker/transcribe.py'), a.video, '--out', tPath, '--model', a['whisper-model']!];
  if (a.language) args.push('--language', a.language);
  log(`Transcribing with faster-whisper (${a['whisper-model']})…`);
  execFileSync(python, args, { stdio: 'inherit' });
  words = wordSchema.array().parse(JSON.parse(readFileSync(tPath, 'utf8')).words);
} else {
  console.error('Give --video talk.mp4, or --script "text" for a demo without a video.');
  process.exit(1);
}
if (!words.length) {
  console.error('No speech found in the transcript.');
  process.exit(1);
}
if (!durationSec) durationSec = words[words.length - 1].end + 1;

// ---------- 2. Plan ----------
let graphics: Graphic[];
let plannedBy: string;
if (a.plan) {
  graphics = cleanPlan(JSON.parse(readFileSync(a.plan, 'utf8')), durationSec);
  plannedBy = `file ${a.plan}`;
} else {
  graphics = [];
  plannedBy = 'rules';
  if (a.planner === 'llm' || a.planner === 'auto') {
    try {
      log(`Planning with local LLM ${a['llm-model']} at ${a['llm-url']}…`);
      graphics = await planWithLlm(words, durationSec, { url: a['llm-url']!, model: a['llm-model']! });
      plannedBy = `LLM ${a['llm-model']}`;
    } catch (e) {
      if (a.planner === 'llm') throw e;
      log(`LLM planner unavailable (${(e as Error).message}); using the rule planner.`);
    }
  }
  if (!graphics.length) graphics = cleanPlan({ graphics: planWithRules(words, durationSec) }, durationSec);
}
const planPath = out.replace(/\.mp4$/, '') + '.plan.json';
writeFileSync(planPath, JSON.stringify({ plannedBy, graphics }, null, 2));
log(`Plan (${plannedBy}): ${graphics.length} graphics → ${planPath}`);
for (const g of graphics) {
  const what = g.type === 'stat' ? `${g.prefix}${g.value}${g.suffix} ${g.label}` : g.type === 'list' ? g.items.map((i) => i.text).join(' | ') : 'text' in g ? g.text : g.emoji;
  log(`  ${g.start.toFixed(1).padStart(5)}–${g.end.toFixed(1).padEnd(5)} ${g.type.padEnd(7)} ${what}`);
}
if (a['plan-only']) process.exit(0);

// ---------- 3. Render ----------
const job = `job-${Date.now()}`;
const jobDir = path.join(root, 'public', job);
mkdirSync(jobDir, { recursive: true });
try {
  let videoSrc = '';
  let personSrc = '';
  if (a.video) {
    videoSrc = `${job}/video${path.extname(a.video)}`;
    copyFileSync(a.video, path.join(root, 'public', videoSrc));
  }
  if (a.person && existsSync(a.person)) {
    personSrc = `${job}/person.webm`;
    copyFileSync(a.person, path.join(root, 'public', personSrc));
  }
  const inputProps: MotionGraphicsProps = {
    videoSrc,
    personSrc,
    words,
    graphics,
    theme: { ...defaultTheme, primary: a.color! },
    showCaptions: !a['no-captions'],
    width,
    height,
    fps,
    durationInFrames: Math.max(1, Math.floor(durationSec * fps)),
  };
  const browserExecutable = process.env.REMOTION_BROWSER_EXECUTABLE || null;
  log('Bundling…');
  const serveUrl = await bundle({ entryPoint: path.join(root, 'src/index.ts') });
  const composition = await selectComposition({ serveUrl, id: 'MotionGraphics', inputProps, browserExecutable });
  const t0 = Date.now();
  await renderMedia({
    composition,
    serveUrl,
    codec: 'h264',
    outputLocation: out,
    inputProps,
    browserExecutable,
    onProgress: ({ progress }) => process.stdout.write(`\r› Rendering ${(progress * 100).toFixed(0)}%`),
  });
  console.log(`\n› Done in ${((Date.now() - t0) / 1000).toFixed(1)} s → ${out}`);
} finally {
  rmSync(jobDir, { recursive: true, force: true });
}
