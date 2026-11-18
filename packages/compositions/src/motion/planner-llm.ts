import { cleanPlan, type Graphic, type Word } from './plan';

/**
 * LLM planner: asks a local open-source model to design the graphics from the transcript.
 *
 * Works with:
 *   - Ollama (default):            http://localhost:11434            e.g. model "qwen3:8b"
 *   - OpenAI-compatible servers:   http://localhost:8080/v1          (llama.cpp server, LM Studio, vLLM)
 *
 * The model's JSON is validated and cleaned (cleanPlan); callers fall back to the rule planner on failure.
 */
export interface LlmOptions {
  url: string;
  model: string;
  timeoutMs?: number;
}

const SYSTEM = `You are a motion graphics designer for short talking-head videos (Reels, Shorts, TikTok).
Read the timed transcript and plan on-screen graphics that reinforce what the speaker says.

Graphic types (times are seconds; show a graphic while its words are spoken):
- "title": {text (2-5 words), subtitle?} for the topic at the start or when the topic changes.
- "keyword": {text (1-3 words, UPPERCASE), emoji?, position: "top"|"center"} for the key idea of a sentence.
- "stat": {value (number), prefix ("$" or ""), suffix ("%", "K", "M", "B", "x" or ""), label (2-4 words)} whenever a number matters.
- "list": {title?, items: [{text (1-4 words), at (time the item is said)}]} for steps, tips, reasons (2-6 items).
- "emoji": {emoji} for strong emotion; use sparingly.

Rules:
- Only use facts and numbers that are actually in the transcript. Never invent statistics.
- One graphic at a time: graphics must not overlap. Leave short breaks with nothing on screen.
- Roughly one graphic every 3-6 seconds. Each lasts 1.5-4 seconds (lists until the last item + 1 s).
- Start each graphic 0.1-0.3 s before its words are spoken.
- Keep text short and punchy. Match the language of the transcript.
Reply with JSON only: {"graphics": [...]} with "type", "start", "end" on every item.`;

/** JSON schema for structured output (Ollama `format`, OpenAI `response_format`). */
const PLAN_JSON_SCHEMA = {
  type: 'object',
  properties: {
    graphics: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['title', 'keyword', 'stat', 'list', 'emoji'] },
          start: { type: 'number' },
          end: { type: 'number' },
          text: { type: 'string' },
          subtitle: { type: 'string' },
          emoji: { type: 'string' },
          position: { type: 'string', enum: ['top', 'center'] },
          value: { type: 'number' },
          prefix: { type: 'string' },
          suffix: { type: 'string' },
          label: { type: 'string' },
          title: { type: 'string' },
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: { text: { type: 'string' }, at: { type: 'number' } },
              required: ['text', 'at'],
            },
          },
        },
        required: ['type', 'start', 'end'],
      },
    },
  },
  required: ['graphics'],
} as const;

/** Transcript as numbered sentences with timestamps: compact and easy for a model to follow. */
export function transcriptForPrompt(words: Word[]): string {
  const lines: string[] = [];
  let cur: Word[] = [];
  const flush = () => {
    if (!cur.length) return;
    const text = cur.map((w) => `${w.text.trim()}@${w.start.toFixed(1)}`).join(' ');
    lines.push(`[${cur[0].start.toFixed(1)}-${cur[cur.length - 1].end.toFixed(1)}] ${text}`);
    cur = [];
  };
  for (const w of words) {
    cur.push(w);
    if (/[.!?]$/.test(w.text.trim()) || cur.length >= 20) flush();
  }
  flush();
  return lines.join('\n');
}

export async function planWithLlm(words: Word[], durationSec: number, opts: LlmOptions): Promise<Graphic[]> {
  const user = `Video length: ${durationSec.toFixed(1)} s.
Transcript (each word is followed by @its start time in seconds):
${transcriptForPrompt(words)}`;
  const messages = [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: user },
  ];
  const openAiStyle = /\/v1\/?$/.test(opts.url);
  const endpoint = openAiStyle ? `${opts.url.replace(/\/$/, '')}/chat/completions` : `${opts.url.replace(/\/$/, '')}/api/chat`;
  const body = openAiStyle
    ? {
        model: opts.model,
        messages,
        temperature: 0.4,
        response_format: { type: 'json_schema', json_schema: { name: 'plan', schema: PLAN_JSON_SCHEMA } },
      }
    : { model: opts.model, messages, stream: false, think: false, format: PLAN_JSON_SCHEMA, options: { temperature: 0.4 } };

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(opts.timeoutMs ?? 180_000),
  });
  if (!res.ok) throw new Error(`LLM server returned ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = (await res.json()) as { message?: { content?: string }; choices?: { message?: { content?: string } }[] };
  const content = openAiStyle ? json.choices?.[0]?.message?.content : json.message?.content;
  if (!content) throw new Error('LLM returned no content');
  // Some models wrap JSON in ``` fences or add thinking text; take the outermost object.
  const start = content.indexOf('{');
  const end = content.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('LLM reply had no JSON object');
  const graphics = cleanPlan(JSON.parse(content.slice(start, end + 1)), durationSec);
  if (!graphics.length) throw new Error('LLM plan had no valid graphics');
  return graphics;
}
