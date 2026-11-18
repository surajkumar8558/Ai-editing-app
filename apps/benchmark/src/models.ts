export type Runtime = 'tflite' | 'onnx';

export interface ModelSpec {
  id: string;
  name: string;
  runtime: Runtime;
  /** Square input resolution the model is fed. */
  inputSize: number;
  url: string;
  /** Approximate download size, shown before the model is downloaded. */
  approxBytes: number;
  license: string;
  notes: string;
}

/**
 * Background-removal models that can be benchmarked on the phone.
 * URLs are downloaded on demand (not bundled), the same way the real app should ship models.
 * Swap a URL here if a host moves a file.
 */
export const MODELS: ModelSpec[] = [
  {
    id: 'mediapipe-selfie',
    name: 'MediaPipe Selfie Segmenter',
    runtime: 'tflite',
    inputSize: 256,
    url: 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite',
    approxBytes: 250_000,
    license: 'Apache-2.0',
    notes: 'Real-time preview quality. Rough hair edges.',
  },
  {
    id: 'modnet-int8',
    name: 'MODNet (int8)',
    runtime: 'onnx',
    inputSize: 512,
    url: 'https://huggingface.co/Xenova/modnet/resolve/main/onnx/model_quantized.onnx',
    approxBytes: 7_000_000,
    license: 'Apache-2.0',
    notes: 'Portrait matting, quantized for size and CPU speed.',
  },
  {
    id: 'modnet-fp32',
    name: 'MODNet (fp32)',
    runtime: 'onnx',
    inputSize: 512,
    url: 'https://huggingface.co/Xenova/modnet/resolve/main/onnx/model.onnx',
    approxBytes: 26_000_000,
    license: 'Apache-2.0',
    notes: 'Full precision. Best edges, slowest.',
  },
];

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}
