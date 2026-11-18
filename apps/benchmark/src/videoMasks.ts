import type { SkImage } from '@shopify/react-native-skia';
import { framePixels, grabFrame, maskToAlphaImage } from './frames';
import type { ModelSpec } from './models';
import type { Segmenter } from './runners';

export interface MaskTrack {
  fps: number;
  /** masks[i] is the person mask at time i / fps seconds. */
  masks: SkImage[];
  /** Wall-clock seconds the whole pass took (decode + inference). */
  tookSec: number;
}

/**
 * Run the segmenter over the whole video at `fps` (the player picks the nearest mask per frame).
 * 10 fps is a good trade-off: masks change slowly, and it is 3x less work than 30 fps.
 */
export async function buildMaskTrack(
  model: ModelSpec,
  segmenter: Segmenter,
  videoUri: string,
  durationMs: number,
  fps: number,
  onProgress: (done: number, total: number) => void,
): Promise<MaskTrack> {
  const total = Math.max(1, Math.floor((durationMs / 1000) * fps));
  const masks: SkImage[] = [];
  const t0 = performance.now();
  for (let i = 0; i < total; i++) {
    const frame = await grabFrame(videoUri, Math.round((i * 1000) / fps));
    const mask = await segmenter.run(framePixels(frame, model.inputSize));
    frame.dispose();
    masks.push(maskToAlphaImage(mask, model.inputSize));
    onProgress(i + 1, total);
  }
  return { fps, masks, tookSec: (performance.now() - t0) / 1000 };
}
