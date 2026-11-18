import { AbsoluteFill, interpolate } from 'remotion';
import type { Theme } from '../plan';
import { readableShadow, useEnterExit, useUnit } from './anim';

export const TitleCard: React.FC<{ text: string; subtitle?: string; theme: Theme; durationInFrames: number }> = ({
  text,
  subtitle,
  theme,
  durationInFrames,
}) => {
  const { frame, fps, enter, exit } = useEnterExit(durationInFrames, 10);
  const { u, portrait } = useUnit();
  const bar = interpolate(frame, [0, 0.35 * fps], [0, 1], { extrapolateRight: 'clamp' });
  const sub = interpolate(frame, [0.35 * fps, 0.6 * fps], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'flex-start', paddingTop: portrait ? '22%' : '12%' }}>
      <div style={{ transform: `translateY(${-exit * 8 * u}px)`, opacity: 1 - exit, textAlign: 'center', maxWidth: '88%' }}>
        <div style={{ overflow: 'hidden', padding: `0 ${u}px` }}>
          <div
            style={{
              fontFamily: theme.font,
              fontSize: (portrait ? 13 : 11) * u,
              lineHeight: 1.02,
              color: theme.text,
              textTransform: 'uppercase',
              textShadow: readableShadow,
              transform: `translateY(${(1 - enter) * 110}%)`,
            }}
          >
            {text}
          </div>
        </div>
        <div
          style={{
            height: 1.4 * u,
            margin: `${1.6 * u}px auto 0`,
            width: `${bar * 60}%`,
            background: theme.primary,
            borderRadius: u,
          }}
        />
        {subtitle && (
          <div
            style={{
              marginTop: 2 * u,
              fontFamily: 'Inter, Helvetica, Arial, sans-serif',
              fontWeight: 700,
              fontSize: 4.2 * u,
              color: theme.text,
              opacity: sub,
              textShadow: readableShadow,
            }}
          >
            {subtitle}
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
};
