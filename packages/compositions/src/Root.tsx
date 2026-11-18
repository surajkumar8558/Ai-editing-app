import { Composition } from 'remotion';
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

export const RemotionRoot: React.FC = () => (
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
);
