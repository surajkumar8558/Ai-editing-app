import { Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';

/** Shared enter/exit animation for a graphic that lives for `durationInFrames`. */
export function useEnterExit(durationInFrames: number, exitFrames = 8) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 13, mass: 0.7, stiffness: 140 } });
  const exit = interpolate(frame, [durationInFrames - exitFrames, durationInFrames], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.in(Easing.cubic),
  });
  return { frame, fps, enter, exit };
}

/** 1 unit = 1% of the shorter side, so graphics scale for 9:16 and 16:9 alike. */
export function useUnit() {
  const { width, height } = useVideoConfig();
  return { u: Math.min(width, height) / 100, width, height, portrait: height > width };
}

export const readableShadow = '0 0.06em 0.25em rgba(0,0,0,0.45)';
