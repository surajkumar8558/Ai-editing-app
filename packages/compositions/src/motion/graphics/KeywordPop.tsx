import { AbsoluteFill, interpolate } from 'remotion';
import type { Theme } from '../plan';
import { useEnterExit, useUnit } from './anim';

export const KeywordPop: React.FC<{
  text: string;
  emoji?: string;
  position: 'top' | 'center';
  theme: Theme;
  durationInFrames: number;
}> = ({ text, emoji, position, theme, durationInFrames }) => {
  const { frame, fps, enter, exit } = useEnterExit(durationInFrames);
  const { u, portrait } = useUnit();
  const box = interpolate(frame, [0, 0.22 * fps], [0, 1], { extrapolateRight: 'clamp' });
  const emojiIn = interpolate(frame, [0.15 * fps, 0.45 * fps], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const wobble = Math.sin(frame / 6) * 4 * emojiIn;
  const scale = (0.6 + 0.4 * enter) * (1 - exit * 0.4);
  return (
    <AbsoluteFill
      style={{
        alignItems: 'center',
        justifyContent: position === 'top' ? 'flex-start' : 'center',
        paddingTop: position === 'top' ? (portrait ? '24%' : '9%') : 0,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 2 * u, transform: `scale(${scale}) rotate(-3deg)`, opacity: 1 - exit }}>
        <div style={{ position: 'relative', padding: `${0.8 * u}px ${2.4 * u}px` }}>
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: theme.primary,
              borderRadius: 1.2 * u,
              transform: `scaleX(${box})`,
              transformOrigin: 'left center',
              boxShadow: '0 1.2vmin 3vmin rgba(0,0,0,0.3)',
            }}
          />
          <div
            style={{
              position: 'relative',
              fontFamily: theme.font,
              fontSize: (portrait ? 11 : 9) * u,
              lineHeight: 1.05,
              color: '#111',
              whiteSpace: 'nowrap',
            }}
          >
            {text}
          </div>
        </div>
        {emoji && (
          <div
            style={{
              fontSize: (portrait ? 11 : 9) * u,
              transform: `scale(${emojiIn}) rotate(${wobble}deg)`,
              filter: 'drop-shadow(0 0.6vmin 1.2vmin rgba(0,0,0,0.35))',
            }}
          >
            {emoji}
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
};
