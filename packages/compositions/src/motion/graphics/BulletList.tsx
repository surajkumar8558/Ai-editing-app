import { AbsoluteFill, spring } from 'remotion';
import type { Theme } from '../plan';
import { useEnterExit, useUnit } from './anim';

export const BulletList: React.FC<{
  title?: string;
  /** `at` is seconds from the start of this graphic. */
  items: { text: string; at: number }[];
  theme: Theme;
  durationInFrames: number;
}> = ({ title, items, theme, durationInFrames }) => {
  const { frame, fps, enter, exit } = useEnterExit(durationInFrames);
  const { u, portrait } = useUnit();
  return (
    <AbsoluteFill style={{ alignItems: portrait ? 'center' : 'flex-start', justifyContent: 'flex-start', padding: portrait ? '22% 8% 0' : '7% 6% 0' }}>
      <div
        style={{
          padding: `${2.4 * u}px ${3.2 * u}px`,
          borderRadius: 3 * u,
          background: 'rgba(10,12,20,0.72)',
          minWidth: portrait ? '80%' : '38%',
          opacity: Math.min(1, enter * 1.5) * (1 - exit),
          transform: `translateX(${(1 - enter) * -10 * u}px)`,
        }}
      >
        {title && (
          <div style={{ fontFamily: theme.font, fontSize: 6 * u, color: theme.primary, marginBottom: 1.4 * u, textTransform: 'uppercase' }}>
            {title}
          </div>
        )}
        {items.map((it, i) => {
          const s = spring({ frame: frame - Math.round(it.at * fps), fps, config: { damping: 14 } });
          return (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 2 * u,
                margin: `${1.1 * u}px 0`,
                opacity: s,
                transform: `translateX(${(1 - s) * -8 * u}px)`,
              }}
            >
              <div
                style={{
                  width: 6 * u,
                  height: 6 * u,
                  borderRadius: '50%',
                  background: theme.primary,
                  color: '#111',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontFamily: theme.font,
                  fontSize: 3.6 * u,
                  flexShrink: 0,
                  transform: `scale(${s})`,
                }}
              >
                {i + 1}
              </div>
              <div style={{ fontFamily: 'Inter, Helvetica, Arial, sans-serif', fontWeight: 800, fontSize: 5 * u, color: theme.text }}>
                {it.text}
              </div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
