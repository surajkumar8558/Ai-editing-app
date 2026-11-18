// Render a text-behind-person video with Remotion.
//
//   node render.mjs --video in.mp4 --person person.webm --text "DREAM" --out out.mp4
//
// --person comes from services/ml-worker/person_matte.py. Inputs are copied into a
// per-job folder in public/ so the headless browser can load them.
import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

const { values: a } = parseArgs({
  options: {
    video: { type: 'string' },
    person: { type: 'string' },
    text: { type: 'string', default: 'DREAM' },
    color: { type: 'string', default: '#FFD400' },
    'font-size': { type: 'string', default: '22' },
    y: { type: 'string', default: '42' },
    out: { type: 'string', default: 'out/text-behind-person.mp4' },
  },
});
if (!a.video || !a.person) {
  console.error('Usage: node render.mjs --video in.mp4 --person person.webm [--text DREAM] [--out out.mp4]');
  process.exit(1);
}

const probe = JSON.parse(
  execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries',
    'stream=width,height,r_frame_rate:format=duration', '-of', 'json', a.video]).toString(),
);
const s = probe.streams[0];
const [num, den] = s.r_frame_rate.split('/').map(Number);
const fps = num / den;

const root = path.dirname(new URL(import.meta.url).pathname);
const job = `job-${Date.now()}`;
const jobDir = path.join(root, 'public', job);
mkdirSync(jobDir, { recursive: true });
copyFileSync(a.video, path.join(jobDir, 'video' + path.extname(a.video)));
copyFileSync(a.person, path.join(jobDir, 'person.webm'));

try {
  const inputProps = {
    videoSrc: `${job}/video${path.extname(a.video)}`,
    personSrc: `${job}/person.webm`,
    text: a.text,
    color: a.color,
    fontSizePct: Number(a['font-size']),
    yPct: Number(a.y),
    width: s.width,
    height: s.height,
    fps,
    durationInFrames: Math.max(1, Math.floor(Number(probe.format.duration) * fps)),
  };
  // Optional: use an already-installed Chrome instead of Remotion's auto-downloaded one.
  const browserExecutable = process.env.REMOTION_BROWSER_EXECUTABLE || null;
  const serveUrl = await bundle({ entryPoint: path.join(root, 'src/index.ts') });
  const composition = await selectComposition({ serveUrl, id: 'TextBehindPerson', inputProps, browserExecutable });
  const t0 = Date.now();
  await renderMedia({
    composition,
    serveUrl,
    codec: 'h264',
    outputLocation: a.out,
    inputProps,
    browserExecutable,
    onProgress: ({ progress }) => process.stdout.write(`\rRendering ${(progress * 100).toFixed(0)}%`),
  });
  console.log(`\nDone in ${((Date.now() - t0) / 1000).toFixed(1)} s → ${a.out}`);
} finally {
  rmSync(jobDir, { recursive: true, force: true });
}
