import { Directory, File, Paths } from 'expo-file-system';
import type { ModelSpec } from './models';

const modelsDir = new Directory(Paths.document, 'models');

function fileName(model: ModelSpec): string {
  const ext = model.runtime === 'tflite' ? 'tflite' : 'onnx';
  return `${model.id}.${ext}`;
}

export function modelFile(model: ModelSpec): File {
  return new File(modelsDir, fileName(model));
}

export function downloadedSize(model: ModelSpec): number | null {
  const f = modelFile(model);
  return f.exists ? f.size ?? 0 : null;
}

export async function downloadModel(
  model: ModelSpec,
  onProgress: (fraction: number) => void,
): Promise<File> {
  if (!modelsDir.exists) modelsDir.create({ intermediates: true });
  const target = modelFile(model);
  if (target.exists) return target;
  // Download to a temp name first so a cancelled download never looks complete.
  const partial = new File(modelsDir, `${fileName(model)}.part`);
  if (partial.exists) partial.delete();
  await File.downloadFileAsync(model.url, partial, {
    idempotent: true,
    onProgress: ({ bytesWritten, totalBytes }) => {
      if (totalBytes > 0) onProgress(bytesWritten / totalBytes);
    },
  });
  partial.move(target);
  return target;
}

export function deleteModel(model: ModelSpec): void {
  const f = modelFile(model);
  if (f.exists) f.delete();
}

export function diskSpace(): { free: number; total: number } {
  return { free: Paths.availableDiskSpace, total: Paths.totalDiskSpace };
}
