import { framePixels, maskToImage, type Frame } from './frames';
import type { ModelSpec } from './models';
import type { Segmenter } from './runners';
import type { SkImage } from '@shopify/react-native-skia';

export interface BenchResult {
  modelId: string;
  backend: string;
  frames: number;
  loadMs: number;
  /** Average model inference time per frame (excludes resize / pixel copy). */
  inferMs: number;
  /** Average resize + tensor prep + mask conversion time per frame. */
  prepMs: number;
  /** Mask from the last frame, for the preview. */
  lastMask: SkImage;
  lastFrame: SkImage;
}

export async function runBenchmark(
  model: ModelSpec,
  segmenter: Segmenter,
  loadMs: number,
  frames: Frame[],
  onProgress: (done: number) => void,
): Promise<BenchResult> {
  const n = model.inputSize;
  // Warm-up run: the first inference includes one-off graph compilation, so don't time it.
  await segmenter.run(framePixels(frames[0].image, n));

  let infer = 0;
  let prep = 0;
  let mask: Float32Array = new Float32Array(0);
  for (let i = 0; i < frames.length; i++) {
    const t0 = performance.now();
    const rgba = framePixels(frames[i].image, n);
    const t1 = performance.now();
    mask = await segmenter.run(rgba);
    const t2 = performance.now();
    prep += t1 - t0;
    infer += t2 - t1;
    onProgress(i + 1);
  }
  const t3 = performance.now();
  const lastMask = maskToImage(mask, n);
  prep += performance.now() - t3;

  return {
    modelId: model.id,
    backend: segmenter.backend,
    frames: frames.length,
    loadMs,
    inferMs: infer / frames.length,
    prepMs: prep / frames.length,
    lastMask,
    lastFrame: frames[frames.length - 1].image,
  };
}

/** Estimated seconds to mask a clip of `clipSec` at `fps`. */
export function estimateSeconds(r: BenchResult, clipSec: number, fps: number): number {
  return ((r.inferMs + r.prepMs) * clipSec * fps) / 1000;
}
