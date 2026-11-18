import type { Graphic, Word } from './plan';

/**
 * Rule-based planner: turns a transcript into motion graphics with no AI model.
 * Fast and predictable; the LLM planner (planner-llm.ts) gives more creative plans and
 * falls back to this one.
 *
 * Per sentence, the first rule that matches wins:
 *   numbers ("40 percent", "$3 million")  -> stat counter
 *   enumerations ("first… second…", "A, B and C") -> list
 *   "let's talk about X" / first sentence -> title
 *   strong feeling words                 -> emoji burst
 *   otherwise                            -> keyword pop of the most important word(s)
 */

interface Sentence {
  words: Word[];
  text: string;
  start: number;
  end: number;
}

const STOPWORDS = new Set(
  `a an the and or but if then so to of in on at by for with from up down out over under again further
  is are was were be been being am do does did doing have has had having i me my we our you your he him his
  she her it its they them their this that these those what which who whom when where why how all any both
  each few more most other some such no nor not only own same than too very can will just should now also
  really actually basically like know think going get got make made thing things way lot lots one ones
  gonna wanna kind sort pretty much well yeah okay ok right let lets let's here there today about into
  because would could might must shall may want need say said see look use used every something anything
  everything someone people time times day days year years good great new first second third next last`
    .split(/\s+/)
    .filter(Boolean),
);

const EMOJI: Record<string, string> = {
  money: '💰', cash: '💰', dollars: '💵', profit: '💰', revenue: '💰', income: '💰', rich: '🤑', price: '🏷️',
  idea: '💡', ideas: '💡', creative: '💡', think: '🤔', question: '❓', secret: '🤫', tip: '💡', tips: '💡',
  growth: '📈', grow: '📈', growing: '📈', increase: '📈', up: '📈', decline: '📉', drop: '📉', down: '📉',
  time: '⏰', minutes: '⏱️', hours: '⏰', fast: '⚡', faster: '⚡', quick: '⚡', speed: '🚀', launch: '🚀',
  love: '❤️', heart: '❤️', happy: '😊', sad: '😢', angry: '😠', fear: '😨', scary: '😱', crazy: '🤯', amazing: '🤩',
  fire: '🔥', hot: '🔥', win: '🏆', winning: '🏆', success: '🏆', goal: '🎯', goals: '🎯', target: '🎯', focus: '🎯',
  work: '💼', job: '💼', business: '💼', team: '🤝', together: '🤝', friends: '👫', family: '👨‍👩‍👧',
  health: '💪', strong: '💪', gym: '🏋️', sleep: '😴', food: '🍔', coffee: '☕', water: '💧',
  phone: '📱', app: '📱', computer: '💻', code: '💻', ai: '🤖', robot: '🤖', data: '📊', video: '🎬', camera: '📷',
  book: '📚', learn: '📚', learning: '📚', study: '📚', school: '🎓', teach: '👩‍🏫',
  world: '🌍', travel: '✈️', home: '🏠', city: '🏙️', music: '🎵', game: '🎮', games: '🎮',
  warning: '⚠️', mistake: '❌', mistakes: '❌', wrong: '❌', correct: '✅', done: '✅', easy: '👌', hard: '😤',
};
const EMOTION = new Set(['love', 'amazing', 'crazy', 'scary', 'happy', 'sad', 'fire', 'win', 'insane', 'incredible', 'wow']);

const NUMBER_WORDS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, fifteen: 15, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60,
  seventy: 70, eighty: 80, ninety: 90, hundred: 100, thousand: 1000, million: 1_000_000, billion: 1_000_000_000,
};
const SCALE: Record<string, [number, string]> = {
  hundred: [100, ''], thousand: [1, 'K'], k: [1, 'K'], million: [1, 'M'], millions: [1, 'M'], billion: [1, 'B'], billions: [1, 'B'],
};
const ORDINALS = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'firstly', 'secondly', 'thirdly', 'finally', 'lastly'];

const clean = (w: string) => w.toLowerCase().replace(/[^a-z0-9%$'-]/g, '');
const titleCase = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());

function splitSentences(words: Word[]): Sentence[] {
  const out: Sentence[] = [];
  let cur: Word[] = [];
  const flush = () => {
    if (!cur.length) return;
    out.push({ words: cur, text: cur.map((w) => w.text.trim()).join(' '), start: cur[0].start, end: cur[cur.length - 1].end });
    cur = [];
  };
  words.forEach((w, i) => {
    cur.push(w);
    const pause = i + 1 < words.length ? words[i + 1].start - w.end : 0;
    if (/[.!?]["')\]]*$/.test(w.text.trim()) || pause > 0.7 || cur.length >= 28) flush();
  });
  flush();
  return out;
}

/** Score words by importance across the whole transcript (frequency, length, capitals, emoji match). */
function wordScores(words: Word[]): Map<string, number> {
  const freq = new Map<string, number>();
  for (const w of words) {
    const c = clean(w.text);
    if (c.length < 3 || STOPWORDS.has(c) || /^\d/.test(c)) continue;
    freq.set(c, (freq.get(c) ?? 0) + 1);
  }
  const scores = new Map<string, number>();
  for (const [c, f] of freq) scores.set(c, Math.log2(1 + f) + Math.min(c.length, 10) / 4 + (EMOJI[c] ? 1.5 : 0));
  return scores;
}

function findStat(s: Sentence): Omit<Extract<Graphic, { type: 'stat' }>, 'start' | 'end' | 'type'> & { at: number } | null {
  const ws = s.words.map((w) => clean(w.text));
  for (let i = 0; i < ws.length; i++) {
    const raw = s.words[i].text.trim();
    let value: number | null = null;
    let prefix = '';
    let suffix = '';
    const digits = raw.match(/^(\$)?(\d[\d,]*(?:\.\d+)?)(%|k|m|x)?/i);
    if (digits) {
      prefix = digits[1] ?? '';
      value = Number(digits[2].replace(/,/g, ''));
      const unit = digits[3]?.toLowerCase();
      if (unit === '%') suffix = '%';
      else if (unit === 'k') suffix = 'K';
      else if (unit === 'm') suffix = 'M';
      else if (unit === 'x') suffix = 'x';
    } else if (NUMBER_WORDS[ws[i]] !== undefined && ws[i] !== 'one' && ws[i] !== 'hundred') {
      value = NUMBER_WORDS[ws[i]];
      if (value >= 1000) continue; // "a million people" without a count: not a clean stat
    }
    if (value === null || value === 0) continue;
    // Look ahead for units: "percent", "million", "dollars", "x".
    let j = i + 1;
    if (SCALE[ws[j]]) {
      const [mul, suf] = SCALE[ws[j]];
      value *= mul;
      suffix = suf || suffix;
      j++;
    }
    if (['percent', '%', 'percentage'].includes(ws[j])) {
      suffix = '%';
      j++;
    } else if (['dollars', 'bucks', 'usd'].includes(ws[j])) {
      prefix = '$';
      j++;
    } else if (['times'].includes(ws[j])) {
      suffix = 'x';
      j++;
    }
    // A bare small number with no unit ("two things") is usually not worth a stat card.
    if (!prefix && !suffix && value < 10 && !/\d/.test(raw)) continue;
    // Label: the next few words as spoken ("of people grab their phone" -> "People Grab Their Phone").
    const after = s.words.slice(j, j + 6).map((w) => clean(w.text)).filter(Boolean);
    while (after.length && ['of', 'the', 'a', 'an', 'in', 'for', 'to'].includes(after[0])) after.shift();
    const label = after.slice(0, 4).join(' ');
    return { value, prefix, suffix, label: titleCase(label || 'and counting'), at: s.words[i].start };
  }
  return null;
}

/** "drink a glass of water" -> "drink glass of water"; "move your body for ten minutes" -> "move body". */
function itemPhrase(words: string[]): string {
  const out: string[] = [];
  for (const c of words) {
    if (!c) continue;
    if (['a', 'an', 'the', 'your', 'my', 'our', 'their', 'is', 'to', 'just'].includes(c)) continue;
    if (out.length >= 2 && ['for', 'with', 'by', 'every', 'each', 'in', 'at', 'on', 'and', 'so', 'because'].includes(c)) break;
    out.push(c);
    if (out.length >= 5) break;
  }
  return out.join(' ');
}

function findList(s: Sentence, next: Sentence[]): { title?: string; items: { text: string; at: number }[]; end: number } | null {
  // "first … second … third …" across this and the following sentences.
  const all = [s, ...next.slice(0, 4)].flatMap((x) => x.words);
  const marks = all.map((w, i) => ({ i, c: clean(w.text) })).filter((m) => ORDINALS.includes(m.c));
  if (marks.length >= 2 && marks[0].i < s.words.length && ['first', 'firstly'].includes(marks[0].c)) {
    const items = marks.map((m, k) => {
      const until = k + 1 < marks.length ? marks[k + 1].i : Math.min(all.length, m.i + 8);
      const text = itemPhrase(all.slice(m.i + 1, until).map((w) => clean(w.text)));
      return { text: titleCase(text), at: all[m.i].start };
    }).filter((it) => it.text);
    if (items.length >= 2) {
      const lastMark = marks[marks.length - 1].i;
      return { items, end: all[Math.min(all.length - 1, lastMark + 6)].end + 1.2 };
    }
  }
  // "A, B and C" inside one sentence.
  const commaParts = s.text.split(/,|\band\b|\bor\b/).map((p) => p.trim()).filter(Boolean);
  const commas = (s.text.match(/,/g) ?? []).length;
  if (commaParts.length >= 3 && commas >= 2 && commaParts.every((p) => p.split(/\s+/).length <= 4)) {
    const items = commaParts.slice(-Math.min(5, commaParts.length)).map((p) => {
      const firstWord = p.split(/\s+/)[0];
      const w = s.words.find((x) => clean(x.text) === clean(firstWord)) ?? s.words[0];
      const text = p.split(/\s+/).map(clean).filter((c) => c && !STOPWORDS.has(c)).slice(0, 3).join(' ');
      return { text: titleCase(text), at: w.start };
    }).filter((it) => it.text);
    if (items.length >= 3) return { items, end: s.end + 1 };
  }
  return null;
}

function topicFrom(s: Sentence, scores: Map<string, number>): string | null {
  const m = s.text.match(/\b(?:talk(?:ing)? about|is about|learn about|guide to|how to|tips (?:for|on)|story of)\s+(.+)/i);
  if (m) {
    // "about building a morning routine that actually works" -> "Building A Morning Routine"
    const clause = m[1].split(/\b(?:that|which|who|so|because|but|when|if)\b|[,.!?;:]/i)[0];
    const words = clause.split(/\s+/).map(clean).filter(Boolean);
    while (words.length && ['a', 'an', 'the', 'my', 'your', 'our'].includes(words[0])) words.shift();
    if (words.length) return titleCase(words.slice(0, 4).join(' '));
  }
  const words = s.text.split(/\s+/).map(clean).filter((c) => c && !STOPWORDS.has(c));
  if (!words.length) return null;
  const picked = [...words].sort((a, b) => (scores.get(b) ?? 0) - (scores.get(a) ?? 0)).slice(0, 3);
  return titleCase(picked.join(' '));
}

export function planWithRules(words: Word[], durationSec: number): Graphic[] {
  const sentences = splitSentences(words);
  const scores = wordScores(words);
  const graphics: Graphic[] = [];
  let busyUntil = 0;
  const used = new Set<string>();

  sentences.forEach((s, idx) => {
    if (s.start < busyUntil) return;

    // 1. Title for the opening sentence or an explicit topic change.
    const isTopicChange = /\b(let'?s talk about|today|next up|moving on|now let'?s|the topic)\b/i.test(s.text);
    if (idx === 0 || isTopicChange) {
      const topic = topicFrom(s, scores);
      if (topic) {
        const end = Math.min(s.end + 0.4, s.start + 3.5);
        graphics.push({ type: 'title', text: topic, start: s.start, end });
        busyUntil = end + 0.3;
        return;
      }
    }

    // 2. Stats.
    const stat = findStat(s);
    if (stat) {
      const { at, ...rest } = stat;
      const end = Math.max(at + 2.2, s.end + 0.3);
      graphics.push({ type: 'stat', ...rest, start: Math.max(s.start, at - 0.2), end });
      busyUntil = end + 0.3;
      return;
    }

    // 3. Lists.
    const list = findList(s, sentences.slice(idx + 1));
    if (list) {
      graphics.push({ type: 'list', items: list.items, start: list.items[0].at - 0.2, end: list.end });
      busyUntil = list.end + 0.3;
      return;
    }

    // 4. Emotional moment.
    const emo = s.words.find((w) => EMOTION.has(clean(w.text)) && EMOJI[clean(w.text)]);
    if (emo && idx % 2 === 1) {
      graphics.push({ type: 'emoji', emoji: EMOJI[clean(emo.text)], start: emo.start, end: emo.start + 1.6 });
      busyUntil = emo.start + 1.9;
      return;
    }

    // 5. Keyword pop: the best-scoring word not shown yet (plus its neighbour if also strong).
    let best: { w: Word; c: string; score: number; i: number } | null = null;
    s.words.forEach((w, i) => {
      const c = clean(w.text);
      const score = (scores.get(c) ?? 0) - (used.has(c) ? 3 : 0);
      if (score > 2.2 && (!best || score > best.score)) best = { w, c, score, i };
    });
    if (best) {
      const b = best as { w: Word; c: string; score: number; i: number };
      const nextWord = s.words[b.i + 1];
      const nc = nextWord ? clean(nextWord.text) : '';
      const pair = nextWord && (scores.get(nc) ?? 0) > 2.2 && !STOPWORDS.has(nc);
      const text = pair ? `${b.c} ${nc}` : b.c;
      used.add(b.c);
      const end = Math.min(b.w.start + 1.8, durationSec);
      graphics.push({
        type: 'keyword',
        text: text.toUpperCase(),
        emoji: EMOJI[b.c] ?? (pair ? EMOJI[nc] : undefined),
        position: idx % 3 === 2 ? 'center' : 'top',
        start: Math.max(0, b.w.start - 0.1),
        end,
      });
      busyUntil = end + 0.4;
    }
  });
  return graphics;
}
