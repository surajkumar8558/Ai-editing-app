import { Composition } from 'remotion';
import { MotionGraphicsVideo, motionGraphicsSchema, type MotionGraphicsProps } from './motion/MotionGraphicsVideo';
import { defaultTheme } from './motion/plan';
import { planWithRules } from './motion/planner-rules';
import { SAMPLE_SCRIPT, timedWords } from './motion/sample';
import { TextBehindPerson, textBehindPersonSchema, type TextBehindPersonProps } from './TextBehindPerson';

const defaults: TextBehindPersonProps = {
  videoSrc: 'sample/people.mp4',
  personSrc: 'sample/person.webm',
  text: 'DREAM',
  color: '#FFD400',
  fontSizePct: 22,
  yPct: 42,
  width: 1080,
  height: 1920,
  fps: 30,
  durationInFrames: 150,
};

const sampleWords = timedWords(SAMPLE_SCRIPT);
const sampleDuration = sampleWords[sampleWords.length - 1].end + 1;
const motionDefaults: MotionGraphicsProps = {
  videoSrc: '',
  personSrc: '',
  words: sampleWords,
  graphics: planWithRules(sampleWords, sampleDuration),
  theme: defaultTheme,
  showCaptions: true,
  width: 1080,
  height: 1920,
  fps: 30,
  durationInFrames: Math.ceil(sampleDuration * 30),
};

const fromProps = ({ props }: { props: { width: number; height: number; fps: number; durationInFrames: number } }) => ({
  width: props.width,
  height: props.height,
  fps: props.fps,
  durationInFrames: props.durationInFrames,
});

export const RemotionRoot: React.FC = () => (
  <>
  <Composition
    id="MotionGraphics"
    component={MotionGraphicsVideo}
    schema={motionGraphicsSchema}
    defaultProps={motionDefaults}
    calculateMetadata={fromProps}
    width={motionDefaults.width}
    height={motionDefaults.height}
    fps={motionDefaults.fps}
    durationInFrames={motionDefaults.durationInFrames}
  />
  <Composition
    id="TextBehindPerson"
    component={TextBehindPerson}
    schema={textBehindPersonSchema}
    defaultProps={defaults}
    // Size, fps and length come from the input video (the render script reads them with ffprobe).
    calculateMetadata={({ props }) => ({
      width: props.width,
      height: props.height,
      fps: props.fps,
      durationInFrames: props.durationInFrames,
    })}
    width={defaults.width}
    height={defaults.height}
    fps={defaults.fps}
    durationInFrames={defaults.durationInFrames}
  />
  </>
);
