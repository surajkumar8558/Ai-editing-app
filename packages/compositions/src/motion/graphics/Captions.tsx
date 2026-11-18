import { createTikTokStyleCaptions, type Caption } from '@remotion/captions';
import { useMemo } from 'react';
import { AbsoluteFill, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import type { Theme, Word } from '../plan';
import { useUnit } from './anim';

/** Word-by-word captions: a few words per page, the word being spoken is highlighted. */
export const Captions: React.FC<{ words: Word[]; theme: Theme }> = ({ words, theme }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { u, portrait } = useUnit();
  const pages = useMemo(() => {
    const captions: Caption[] = words.map((w, i) => ({
      text: (i === 0 ? '' : ' ') + w.text.trim(),
      startMs: w.start * 1000,
      endMs: w.end * 1000,
      timestampMs: null,
      confidence: null,
      // New caption page after each sentence, so pages never straddle two sentences.
      pageBreakAfter: /[.!?]["')\]]*$/.test(w.text.trim()),
    }));
    return createTikTokStyleCaptions({ captions, combineTokensWithinMilliseconds: 1100 }).pages;
  }, [words]);

  const nowMs = (frame / fps) * 1000;
  const page = pages.find((p) => nowMs >= p.startMs && nowMs < p.startMs + p.durationMs);
  if (!page) return null;
  const pop = spring({ frame: frame - Math.round((page.startMs / 1000) * fps), fps, config: { damping: 15, stiffness: 180 } });

  return (
    <AbsoluteFill style={{ justifyContent: 'flex-end', alignItems: 'center', paddingBottom: portrait ? '24%' : '7%' }}>
      <div
        style={{
          maxWidth: '86%',
          textAlign: 'center',
          fontFamily: theme.font,
          fontSize: (portrait ? 7.5 : 6) * u,
          lineHeight: 1.15,
          textTransform: 'uppercase',
          transform: `scale(${0.85 + 0.15 * pop})`,
          WebkitTextStroke: `${0.5 * u}px #000`,
          paintOrder: 'stroke fill',
        }}
      >
        {page.tokens.map((t, i) => {
          const active = nowMs >= t.fromMs && nowMs < t.toMs;
          return (
            <span key={i} style={{ color: active ? theme.primary : theme.text, whiteSpace: 'pre' }}>
              {t.text}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
