// Render a text-behind-person video with HyperFrames.
//
//   node render.mjs --video in.mp4 --person person.webm --out out.mp4
//
// Edit the text/colour in template.html variables, or open the job folder in the
// HyperFrames preview (npx hyperframes preview) to tweak it visually.
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

const { values: a } = parseArgs({
  options: {
    video: { type: 'string' },
    person: { type: 'string' },
    out: { type: 'string', default: 'out/text-behind-person.mp4' },
    keep: { type: 'boolean', default: false },
  },
});
if (!a.video || !a.person) {
  console.error('Usage: node render.mjs --video in.mp4 --person person.webm [--out out.mp4] [--keep]');
  process.exit(1);
}

const probe = JSON.parse(
  execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries',
    'stream=width,height:format=duration', '-of', 'json', a.video]).toString(),
);
const { width, height } = probe.streams[0];
const duration = Number(probe.format.duration).toFixed(3);
const hasAudio = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'a', '-show_entries',
  'stream=index', '-of', 'csv=p=0', a.video]).toString().trim() !== '';

const root = path.dirname(new URL(import.meta.url).pathname);
const job = path.join(root, 'jobs', `job-${Date.now()}`);
mkdirSync(path.join(job, 'assets', 'fonts'), { recursive: true });
mkdirSync(path.join(job, 'assets', 'vendor'), { recursive: true });
// GSAP is served from the job folder: renders must not depend on a CDN.
copyFileSync(path.join(root, 'node_modules/gsap/dist/gsap.min.js'), path.join(job, 'assets/vendor/gsap.min.js'));
copyFileSync(a.video, path.join(job, 'assets', 'video.mp4'));
copyFileSync(a.person, path.join(job, 'assets', 'person.webm'));
copyFileSync(path.join(root, 'assets/fonts/Anton-Regular.woff2'), path.join(job, 'assets/fonts/Anton-Regular.woff2'));
writeFileSync(
  path.join(job, 'index.html'),
  readFileSync(path.join(root, 'template.html'), 'utf8')
    .replaceAll('{{WIDTH}}', String(width))
    .replaceAll('{{HEIGHT}}', String(height))
    .replaceAll('{{DURATION}}', duration)
    // Keep the original sound when there is any; a silent video must be marked muted.
    .replaceAll('{{BG_AUDIO}}', hasAudio ? 'data-has-audio="true"' : 'muted'),
);

const out = path.resolve(a.out);
mkdirSync(path.dirname(out), { recursive: true });
try {
  const bin = path.join(root, 'node_modules', '.bin', 'hyperframes');
  execFileSync(bin, ['lint', '.'], { cwd: job, stdio: 'inherit' });
  execFileSync(bin, ['render', '-o', out], { cwd: job, stdio: 'inherit' });
  console.log(`Done → ${out}`);
} finally {
  if (!a.keep) rmSync(job, { recursive: true, force: true });
}
