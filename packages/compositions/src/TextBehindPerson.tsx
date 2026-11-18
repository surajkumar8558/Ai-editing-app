import { loadFont } from '@remotion/fonts';
import { AbsoluteFill, interpolate, OffthreadVideo, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { z } from 'zod';

// Font file ships in public/fonts (OFL licence), so renders never depend on a font CDN.
const fontFamily = 'Anton';
loadFont({ family: fontFamily, url: staticFile('fonts/Anton-Regular.woff2') });

export const textBehindPersonSchema = z.object({
  /** Original video, a file in public/ (or an https URL). */
  videoSrc: z.string(),
  /** Same video with only the person visible (VP9 WebM with alpha), from services/ml-worker. */
  personSrc: z.string(),
  text: z.string(),
  color: z.string(),
  /** Font size as % of video height. */
  fontSizePct: z.number(),
  /** Vertical position of the text centre as % of video height. */
  yPct: z.number(),
  width: z.number(),
  height: z.number(),
  fps: z.number(),
  durationInFrames: z.number(),
});
export type TextBehindPersonProps = z.infer<typeof textBehindPersonSchema>;

const src = (s: string) => (/^https?:\/\//.test(s) ? s : staticFile(s));

/**
 * Three layers, bottom to top:
 *   1. the original video
 *   2. the text (animated in)
 *   3. the person cut-out, which covers the text wherever the person stands
 */
export const TextBehindPerson: React.FC<TextBehindPersonProps> = ({
  videoSrc,
  personSrc,
  text,
  color,
  fontSizePct,
  yPct,
}) => {
  const frame = useCurrentFrame();
  const { fps, height } = useVideoConfig();
  const pop = spring({ frame, fps, config: { damping: 14, mass: 0.8 } });
  const rise = interpolate(pop, [0, 1], [height * 0.05, 0]);

  return (
    <AbsoluteFill style={{ backgroundColor: 'black' }}>
      <OffthreadVideo src={src(videoSrc)} />
      <AbsoluteFill style={{ justifyContent: 'flex-start', alignItems: 'center' }}>
        <div
          style={{
            position: 'absolute',
            top: `${yPct}%`,
            transform: `translateY(calc(-50% + ${rise}px)) scale(${0.8 + 0.2 * pop})`,
            opacity: pop,
            fontFamily,
            fontSize: (height * fontSizePct) / 100,
            lineHeight: 1,
            color,
            letterSpacing: '0.02em',
            whiteSpace: 'nowrap',
            textShadow: '0 4px 24px rgba(0,0,0,0.25)',
          }}
        >
          {text}
        </div>
      </AbsoluteFill>
      <OffthreadVideo src={src(personSrc)} transparent muted />
    </AbsoluteFill>
  );
};
