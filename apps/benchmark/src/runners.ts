import type { InferenceSession } from 'onnxruntime-react-native';
import { Platform } from 'react-native';
import type { TfliteModel } from 'react-native-fast-tflite';
import type { ModelSpec } from './models';

// The ML runtimes are required lazily: if a native module fails to initialise,
// the app shows the error instead of crashing on launch.
type OrtModule = typeof import('onnxruntime-react-native');
type TfliteModule = typeof import('react-native-fast-tflite');
const ort = (): OrtModule => require('onnxruntime-react-native');
const tfl = (): TfliteModule => require('react-native-fast-tflite');

/** Try to initialise each runtime. Returns 'ok' or the error message per runtime. */
export function checkRuntimes(): Record<'tflite' | 'onnx', string> {
  const check = (fn: () => unknown) => {
    try {
      fn();
      return 'ok';
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
  };
  return {
    tflite: check(() => tfl().loadTensorflowModel),
    onnx: check(() => {
      const { InferenceSession } = ort();
      if (typeof InferenceSession?.create !== 'function') throw new Error('InferenceSession missing');
      if (typeof (globalThis as { OrtApi?: unknown }).OrtApi === 'undefined') throw new Error('OrtApi JSI not installed');
    }),
  };
}

export type Accel = 'gpu' | 'cpu';

/** One loaded model: takes RGBA pixels (inputSize²) and returns a 0..1 mask (inputSize²). */
export interface Segmenter {
  /** What actually got used, e.g. "core-ml" or "cpu (GPU failed)". */
  backend: string;
  run(rgba: Uint8Array): Promise<Float32Array>;
  dispose(): Promise<void>;
}

export async function loadSegmenter(model: ModelSpec, fileUri: string, accel: Accel): Promise<Segmenter> {
  return model.runtime === 'tflite'
    ? loadTflite(model, fileUri, accel)
    : loadOnnx(model, fileUri, accel);
}

// ---------- TFLite (MediaPipe): NHWC float32 in [0,1] ----------

async function loadTflite(model: ModelSpec, fileUri: string, accel: Accel): Promise<Segmenter> {
  const { loadTensorflowModel } = tfl();
  const gpuDelegate = Platform.OS === 'ios' ? 'core-ml' : 'android-gpu';
  let tflite: TfliteModel;
  let backend = 'cpu';
  if (accel === 'gpu') {
    try {
      tflite = await loadTensorflowModel({ url: fileUri }, [gpuDelegate]);
      backend = gpuDelegate;
    } catch {
      tflite = await loadTensorflowModel({ url: fileUri }, []);
      backend = 'cpu (GPU delegate failed)';
    }
  } else {
    tflite = await loadTensorflowModel({ url: fileUri }, []);
  }

  const n = model.inputSize;
  const input = new Float32Array(n * n * 3);
  return {
    backend,
    async run(rgba) {
      for (let i = 0, j = 0; i < n * n; i++, j += 4) {
        input[i * 3] = rgba[j] / 255;
        input[i * 3 + 1] = rgba[j + 1] / 255;
        input[i * 3 + 2] = rgba[j + 2] / 255;
      }
      const [out] = await tflite.run([input.buffer.slice(0) as ArrayBuffer]);
      return new Float32Array(out);
    },
    async dispose() {},
  };
}

// ---------- ONNX (MODNet): NCHW float32, normalized to [-1,1] ----------

async function loadOnnx(model: ModelSpec, fileUri: string, accel: Accel): Promise<Segmenter> {
  const { InferenceSession, Tensor } = ort();
  const gpuProvider = Platform.OS === 'ios' ? 'coreml' : 'nnapi';
  const providers = accel === 'gpu' ? [gpuProvider, 'cpu'] : ['cpu'];
  let session: InferenceSession;
  let backend = providers.join(' → ');
  try {
    session = await InferenceSession.create(fileUri, { executionProviders: providers });
  } catch {
    session = await InferenceSession.create(fileUri, { executionProviders: ['cpu'] });
    backend = 'cpu (accelerator failed)';
  }

  const n = model.inputSize;
  const plane = n * n;
  const inputName = session.inputNames[0];
  const outputName = session.outputNames[0];
  return {
    backend,
    async run(rgba) {
      const data = new Float32Array(3 * plane);
      for (let i = 0, j = 0; i < plane; i++, j += 4) {
        data[i] = rgba[j] / 127.5 - 1;
        data[plane + i] = rgba[j + 1] / 127.5 - 1;
        data[2 * plane + i] = rgba[j + 2] / 127.5 - 1;
      }
      const result = await session.run({ [inputName]: new Tensor('float32', data, [1, 3, n, n]) });
      return result[outputName].data as Float32Array;
    },
    async dispose() {
      await session.release();
    },
  };
}
