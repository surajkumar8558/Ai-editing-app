import { AbsoluteFill, interpolate, OffthreadVideo, Sequence, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { z } from 'zod';
import '../fonts';
import { BulletList } from './graphics/BulletList';
import { Captions } from './graphics/Captions';
import { EmojiBurst } from './graphics/EmojiBurst';
import { KeywordPop } from './graphics/KeywordPop';
import { StatCard } from './graphics/StatCard';
import { TitleCard } from './graphics/TitleCard';
import { graphicSchema, themeSchema, wordSchema, type Graphic, type Theme } from './plan';

export const motionGraphicsSchema = z.object({
  /** Talking video (file in public/ or https URL). Empty: animated gradient background, for previews. */
  videoSrc: z.string(),
  /** Optional person cut-out (VP9 WebM with alpha) to put titles/keywords BEHIND the speaker. */
  personSrc: z.string(),
  words: z.array(wordSchema),
  graphics: z.array(graphicSchema),
  theme: themeSchema,
  showCaptions: z.boolean(),
  width: z.number(),
  height: z.number(),
  fps: z.number(),
  durationInFrames: z.number(),
});
export type MotionGraphicsProps = z.infer<typeof motionGraphicsSchema>;

const src = (s: string) => (/^https?:\/\//.test(s) ? s : staticFile(s));

const GradientBackground: React.FC = () => {
  const frame = useCurrentFrame();
  const angle = interpolate(frame, [0, 600], [120, 240]);
  return <AbsoluteFill style={{ background: `linear-gradient(${angle}deg, #1b1f3b, #3b2a5a 50%, #0f3d4a)` }} />;
};

const GraphicView: React.FC<{ g: Graphic; theme: Theme; durationInFrames: number; index: number }> = ({ g, theme, durationInFrames, index }) => {
  switch (g.type) {
    case 'title':
      return <TitleCard text={g.text} subtitle={g.subtitle} theme={theme} durationInFrames={durationInFrames} />;
    case 'keyword':
      return <KeywordPop text={g.text} emoji={g.emoji} position={g.position} theme={theme} durationInFrames={durationInFrames} />;
    case 'stat':
      return <StatCard value={g.value} prefix={g.prefix} suffix={g.suffix} label={g.label} theme={theme} durationInFrames={durationInFrames} />;
    case 'list':
      return (
        <BulletList
          title={g.title}
          items={g.items.map((it) => ({ ...it, at: it.at - g.start }))}
          theme={theme}
          durationInFrames={durationInFrames}
        />
      );
    case 'emoji':
      return <EmojiBurst emoji={g.emoji} seed={`g${index}`} durationInFrames={durationInFrames} />;
  }
};

/** Titles and keywords may sit behind the speaker; data cards, lists and captions always stay on top. */
const canGoBehind = (g: Graphic) => g.type === 'title' || g.type === 'keyword';

export const MotionGraphicsVideo: React.FC<MotionGraphicsProps> = ({ videoSrc, personSrc, words, graphics, theme, showCaptions }) => {
  const { fps } = useVideoConfig();
  const behind = Boolean(personSrc);
  const layer = (filter: (g: Graphic) => boolean) =>
    graphics.map((g, i) => {
      if (!filter(g)) return null;
      const from = Math.round(g.start * fps);
      const durationInFrames = Math.max(1, Math.round((g.end - g.start) * fps));
      return (
        <Sequence key={i} from={from} durationInFrames={durationInFrames} name={`${g.type} ${'text' in g ? g.text : ''}`}>
          <GraphicView g={g} theme={theme} durationInFrames={durationInFrames} index={i} />
        </Sequence>
      );
    });

  return (
    <AbsoluteFill style={{ backgroundColor: 'black' }}>
      {videoSrc ? <OffthreadVideo src={src(videoSrc)} /> : <GradientBackground />}
      {behind && layer(canGoBehind)}
      {behind && <OffthreadVideo src={src(personSrc)} transparent muted />}
      {layer((g) => !behind || !canGoBehind(g))}
      {showCaptions && <Captions words={words} theme={theme} />}
    </AbsoluteFill>
  );
};
