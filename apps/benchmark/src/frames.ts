import { AlphaType, ColorType, Skia, type SkImage } from '@shopify/react-native-skia';
import { File } from 'expo-file-system';
import * as VideoThumbnails from 'expo-video-thumbnails';

export interface Frame {
  /** Full-resolution decoded frame, used for the preview composite. */
  image: SkImage;
  timeMs: number;
}

/** Grab `count` evenly spaced frames from the video. */
export async function extractFrames(
  videoUri: string,
  durationMs: number,
  count: number,
  onProgress: (done: number) => void,
): Promise<Frame[]> {
  const frames: Frame[] = [];
  const step = durationMs / (count + 1);
  for (let i = 1; i <= count; i++) {
    const timeMs = Math.round(step * i);
    const thumb = await VideoThumbnails.getThumbnailAsync(videoUri, { time: timeMs, quality: 0.9 });
    const data = await Skia.Data.fromURI(thumb.uri);
    const image = Skia.Image.MakeImageFromEncoded(data);
    if (!image) throw new Error(`Could not decode frame at ${timeMs} ms`);
    frames.push({ image, timeMs });
    onProgress(i);
  }
  return frames;
}

/**
 * Resize a frame to size x size (stretched, like the models expect) and return RGBA bytes.
 * The mask is stretched back to the frame's aspect ratio when drawn, so the squash cancels out.
 */
export function framePixels(image: SkImage, size: number): Uint8Array {
  const surface = Skia.Surface.MakeOffscreen(size, size);
  if (!surface) throw new Error('Could not create offscreen surface');
  const canvas = surface.getCanvas();
  canvas.drawImageRect(
    image,
    Skia.XYWHRect(0, 0, image.width(), image.height()),
    Skia.XYWHRect(0, 0, size, size),
    Skia.Paint(),
  );
  surface.flush();
  const pixels = surface.makeImageSnapshot().readPixels(0, 0, {
    width: size,
    height: size,
    colorType: ColorType.RGBA_8888,
    alphaType: AlphaType.Unpremul,
  });
  if (!(pixels instanceof Uint8Array)) throw new Error('Could not read frame pixels');
  return pixels;
}

/** Turn a size x size mask (0..1 per pixel) into a white image whose alpha is the mask. */
export function maskToImage(mask: Float32Array, size: number): SkImage {
  const rgba = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const a = Math.max(0, Math.min(255, Math.round(mask[i] * 255)));
    rgba[i * 4] = 255;
    rgba[i * 4 + 1] = 255;
    rgba[i * 4 + 2] = 255;
    rgba[i * 4 + 3] = a;
  }
  const img = Skia.Image.MakeImage(
    { width: size, height: size, colorType: ColorType.RGBA_8888, alphaType: AlphaType.Unpremul },
    Skia.Data.fromBytes(rgba),
    size * 4,
  );
  if (!img) throw new Error('Could not build mask image');
  return img;
}

/** Decode one video frame at `timeMs`. The temporary thumbnail file is deleted right away. */
export async function grabFrame(videoUri: string, timeMs: number): Promise<SkImage> {
  const thumb = await VideoThumbnails.getThumbnailAsync(videoUri, { time: timeMs, quality: 0.8 });
  try {
    const data = await Skia.Data.fromURI(thumb.uri);
    const image = Skia.Image.MakeImageFromEncoded(data);
    if (!image) throw new Error(`Could not decode frame at ${timeMs} ms`);
    return image;
  } finally {
    try {
      new File(thumb.uri).delete();
    } catch {
      // Cache files are cleaned up by the OS eventually; not worth failing over.
    }
  }
}

/** Compact mask image: one byte per pixel (alpha only), 4x smaller than RGBA. */
export function maskToAlphaImage(mask: Float32Array, size: number): SkImage {
  const alpha = new Uint8Array(size * size);
  for (let i = 0; i < alpha.length; i++) {
    alpha[i] = Math.max(0, Math.min(255, Math.round(mask[i] * 255)));
  }
  const img = Skia.Image.MakeImage(
    { width: size, height: size, colorType: ColorType.Alpha_8, alphaType: AlphaType.Premul },
    Skia.Data.fromBytes(alpha),
    size,
  );
  if (!img) throw new Error('Could not build mask image');
  return img;
}
