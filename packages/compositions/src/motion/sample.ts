import type { Word } from './plan';

/** Give a script plausible word timings (for previews and tests without a real transcript). */
export function timedWords(script: string, wordsPerSecond = 2.7, startAt = 0.4): Word[] {
  const out: Word[] = [];
  let t = startAt;
  for (const text of script.split(/\s+/).filter(Boolean)) {
    const dur = Math.max(0.18, Math.min(0.6, (0.12 + text.length * 0.035) * (2.7 / wordsPerSecond)));
    out.push({ text, start: +t.toFixed(2), end: +(t + dur).toFixed(2) });
    t += dur + 0.05;
    if (/[.!?]$/.test(text)) t += 0.35; // breath between sentences
    else if (/,$/.test(text)) t += 0.12;
  }
  return out;
}

export const SAMPLE_SCRIPT =
  'Today I want to talk about building a morning routine that actually works. ' +
  'Most people check their phone the moment they wake up, and that kills their focus. ' +
  'Studies show 80 percent of people grab their phone within fifteen minutes of waking. ' +
  'So here is what I do instead. First, drink a glass of water. Second, move your body for ten minutes. ' +
  'Third, write down your top three goals. ' +
  'Do this for 30 days and you will feel the difference. Honestly, it changed my life and I love it.';
