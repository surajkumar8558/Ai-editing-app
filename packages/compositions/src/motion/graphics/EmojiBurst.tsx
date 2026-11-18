import { AbsoluteFill, interpolate, random } from 'remotion';
import { useEnterExit, useUnit } from './anim';

/** A handful of emojis floating up from the bottom, deterministic per seed (same every render). */
export const EmojiBurst: React.FC<{ emoji: string; seed: string; durationInFrames: number }> = ({ emoji, seed, durationInFrames }) => {
  const { frame } = useEnterExit(durationInFrames);
  const { u, width, height } = useUnit();
  return (
    <AbsoluteFill>
      {Array.from({ length: 8 }, (_, i) => {
        const delay = Math.floor(random(`${seed}-d${i}`) * 10);
        const t = Math.max(0, frame - delay) / Math.max(1, durationInFrames - delay);
        const x = width * (0.15 + 0.7 * random(`${seed}-x${i}`));
        const drift = (random(`${seed}-s${i}`) - 0.5) * 20 * u;
        const y = height * (0.9 - 0.75 * t);
        const size = (7 + 6 * random(`${seed}-z${i}`)) * u;
        const opacity = interpolate(t, [0, 0.1, 0.75, 1], [0, 1, 1, 0], { extrapolateRight: 'clamp' });
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: x + drift * t,
              top: y,
              fontSize: size,
              opacity,
              transform: `translate(-50%, -50%) rotate(${(random(`${seed}-r${i}`) - 0.5) * 60 * t}deg)`,
            }}
          >
            {emoji}
          </div>
        );
      })}
    </AbsoluteFill>
  );
};
