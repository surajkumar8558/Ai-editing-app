import { z } from 'zod';

/**
 * A "graphics plan": what to show and when, decided from what the person says.
 * The planner (rules or a local LLM) writes it; the MotionGraphics composition renders it.
 * Times are seconds from the start of the video. It's plain JSON, so it can be edited by hand.
 */
const base = {
  start: z.number().min(0),
  end: z.number().min(0),
};

export const graphicSchema = z.discriminatedUnion('type', [
  /** Big topic title, usually at the start or when the subject changes. */
  z.object({ ...base, type: z.literal('title'), text: z.string(), subtitle: z.string().optional() }),
  /** One to three important words popping in as they are said. */
  z.object({
    ...base,
    type: z.literal('keyword'),
    text: z.string(),
    emoji: z.string().optional(),
    position: z.enum(['top', 'center']).default('top'),
  }),
  /** A number counting up: "40 percent", "$3 million", "10 years". */
  z.object({
    ...base,
    type: z.literal('stat'),
    value: z.number(),
    prefix: z.string().default(''),
    suffix: z.string().default(''),
    label: z.string(),
  }),
  /** Items appearing one by one: steps, tips, reasons. */
  z.object({
    ...base,
    type: z.literal('list'),
    title: z.string().optional(),
    items: z.array(z.object({ text: z.string(), at: z.number() })).min(1).max(6),
  }),
  /** Emoji burst for emotional moments. */
  z.object({ ...base, type: z.literal('emoji'), emoji: z.string() }),
]);
export type Graphic = z.infer<typeof graphicSchema>;

/** One spoken word with its timing (from Whisper). */
export const wordSchema = z.object({ text: z.string(), start: z.number(), end: z.number() });
export type Word = z.infer<typeof wordSchema>;

export const themeSchema = z.object({
  primary: z.string(),
  accent: z.string(),
  text: z.string(),
  font: z.string(),
});
export type Theme = z.infer<typeof themeSchema>;

export const defaultTheme: Theme = { primary: '#FFD400', accent: '#3B5BDB', text: '#FFFFFF', font: 'Anton' };

export const planSchema = z.object({
  graphics: z.array(graphicSchema),
});
export type Plan = z.infer<typeof planSchema>;

/** Keep only valid graphics, clamp them to the video, sort, and drop overlaps. */
export function cleanPlan(raw: unknown, durationSec: number): Graphic[] {
  const items = Array.isArray((raw as { graphics?: unknown })?.graphics) ? (raw as { graphics: unknown[] }).graphics : [];
  const valid: Graphic[] = [];
  for (const item of items) {
    const r = graphicSchema.safeParse(item);
    if (!r.success) continue;
    const g = r.data;
    const start = Math.max(0, Math.min(g.start, durationSec));
    const end = Math.max(start + 0.5, Math.min(g.end, durationSec));
    if (end - start < 0.5) continue;
    valid.push({ ...g, start, end });
  }
  valid.sort((a, b) => a.start - b.start);
  // One graphic at a time keeps the frame readable.
  const out: Graphic[] = [];
  for (const g of valid) {
    const prev = out[out.length - 1];
    if (prev && g.start < prev.end) {
      if (g.start - prev.start < 0.8) continue; // nearly simultaneous: keep the first
      prev.end = g.start; // otherwise cut the previous one short
    }
    out.push(g);
  }
  return out;
}
