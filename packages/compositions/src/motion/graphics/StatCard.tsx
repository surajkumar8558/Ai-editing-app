import { AbsoluteFill, Easing, interpolate } from 'remotion';
import type { Theme } from '../plan';
import { readableShadow, useEnterExit, useUnit } from './anim';

function format(n: number, target: number): string {
  const decimals = Number.isInteger(target) ? 0 : Math.min(2, (String(target).split('.')[1] ?? '').length);
  return n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export const StatCard: React.FC<{
  value: number;
  prefix: string;
  suffix: string;
  label: string;
  theme: Theme;
  durationInFrames: number;
}> = ({ value, prefix, suffix, label, theme, durationInFrames }) => {
  const { frame, fps, enter, exit } = useEnterExit(durationInFrames);
  const { u, portrait } = useUnit();
  const count = interpolate(frame, [0.1 * fps, 1.0 * fps], [0, value], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });
  const ring = interpolate(frame, [0.1 * fps, 1.0 * fps], [0, suffix === '%' ? Math.min(1, value / 100) : 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });
  const r = 46;
  const circ = 2 * Math.PI * r;
  const size = (portrait ? 22 : 18) * u;
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'flex-start', paddingTop: portrait ? '20%' : '8%' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 3 * u,
          padding: `${2.4 * u}px ${4 * u}px`,
          borderRadius: 3 * u,
          background: 'rgba(10,12,20,0.72)',
          backdropFilter: 'blur(1vmin)',
          transform: `translateY(${(1 - enter) * 12 * u}px) scale(${1 - exit * 0.15})`,
          opacity: Math.min(1, enter * 1.5) * (1 - exit),
        }}
      >
        <svg width={size} height={size} viewBox="0 0 100 100" style={{ flexShrink: 0 }}>
          <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="8" />
          <circle
            cx="50"
            cy="50"
            r={r}
            fill="none"
            stroke={theme.primary}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={circ * (1 - ring)}
            transform="rotate(-90 50 50)"
          />
        </svg>
        <div>
          <div style={{ fontFamily: theme.font, fontSize: (portrait ? 14 : 11) * u, lineHeight: 1, color: theme.primary, textShadow: readableShadow }}>
            {prefix}
            {format(count, value)}
            {suffix}
          </div>
          <div
            style={{
              fontFamily: 'Inter, Helvetica, Arial, sans-serif',
              fontWeight: 800,
              fontSize: 4 * u,
              color: theme.text,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              marginTop: 0.6 * u,
            }}
          >
            {label}
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
