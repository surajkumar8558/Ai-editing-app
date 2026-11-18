import * as ImagePicker from 'expo-image-picker';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { estimateSeconds, runBenchmark, type BenchResult } from './src/benchmark';
import { extractFrames, type Frame } from './src/frames';
import { formatBytes, MODELS, type ModelSpec } from './src/models';
import { Preview } from './src/Preview';
import { loadSegmenter } from './src/runners';
import { deleteModel, diskSpace, downloadedSize, downloadModel, modelFile } from './src/storage';

const SAMPLE_FRAMES = 30;

export default function App() {
  const [sizes, setSizes] = useState<Record<string, number | null>>({});
  const [disk, setDisk] = useState(diskSpace());
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [useGpu, setUseGpu] = useState(true);
  const [frames, setFrames] = useState<Frame[] | null>(null);
  const [results, setResults] = useState<Record<string, BenchResult>>({});
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [overlayText, setOverlayText] = useState('DREAM');

  const refreshStorage = useCallback(() => {
    setSizes(Object.fromEntries(MODELS.map((m) => [m.id, downloadedSize(m)])));
    setDisk(diskSpace());
  }, []);
  useEffect(refreshStorage, [refreshStorage]);

  const guard = async (label: string, fn: () => Promise<void>) => {
    setError(null);
    setBusy(label);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
      refreshStorage();
    }
  };

  const download = (m: ModelSpec) =>
    guard(`Downloading ${m.name}…`, async () => {
      await downloadModel(m, (f) => setBusy(`Downloading ${m.name}… ${Math.round(f * 100)}%`));
    });

  const pickVideo = () =>
    guard('Reading video…', async () => {
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'videos' });
      if (res.canceled) return;
      const asset = res.assets[0];
      const durationMs = asset.duration ?? 10_000;
      const f = await extractFrames(asset.uri, durationMs, SAMPLE_FRAMES, (d) =>
        setBusy(`Extracting frames… ${d}/${SAMPLE_FRAMES}`),
      );
      setFrames(f);
      setResults({});
      setPreviewId(null);
    });

  const bench = (m: ModelSpec) =>
    guard(`Loading ${m.name}…`, async () => {
      if (!frames) throw new Error('Pick a video first');
      const t0 = performance.now();
      const seg = await loadSegmenter(m, modelFile(m).uri, useGpu ? 'gpu' : 'cpu');
      const loadMs = performance.now() - t0;
      try {
        const r = await runBenchmark(m, seg, loadMs, frames, (d) =>
          setBusy(`${m.name}: frame ${d}/${frames.length}`),
        );
        setResults((prev) => ({ ...prev, [m.id]: r }));
        setPreviewId(m.id);
      } finally {
        await seg.dispose();
      }
    });

  const totalModels = Object.values(sizes).reduce<number>((a, b) => a + (b ?? 0), 0);
  const preview = previewId ? results[previewId] : null;

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>On-device AI benchmark</Text>
        <Text style={styles.subtitle}>Background removal speed and storage on this phone</Text>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Storage</Text>
          <Text>Free space: {formatBytes(disk.free)} of {formatBytes(disk.total)}</Text>
          <Text>Downloaded models: {formatBytes(totalModels)}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>1. Video</Text>
          <Btn label={frames ? 'Pick another video' : 'Pick a video'} onPress={pickVideo} disabled={!!busy} />
          {frames && (
            <Text style={styles.muted}>
              {frames.length} frames sampled ({frames[0].image.width()}×{frames[0].image.height()})
            </Text>
          )}
          <View style={styles.row}>
            <Text>Use GPU / Neural Engine</Text>
            <Switch value={useGpu} onValueChange={setUseGpu} />
          </View>
        </View>

        <Text style={styles.section}>2. Models</Text>
        {MODELS.map((m) => {
          const size = sizes[m.id];
          const r = results[m.id];
          return (
            <View key={m.id} style={styles.card}>
              <Text style={styles.cardTitle}>{m.name}</Text>
              <Text style={styles.muted}>
                {m.runtime.toUpperCase()} · {m.inputSize}px · {m.license} · {m.notes}
              </Text>
              <Text>
                {size != null ? `Downloaded: ${formatBytes(size)}` : `Download size: ~${formatBytes(m.approxBytes)}`}
              </Text>
              <View style={styles.row}>
                {size == null ? (
                  <Btn label="Download" onPress={() => download(m)} disabled={!!busy} />
                ) : (
                  <>
                    <Btn label="Run benchmark" onPress={() => bench(m)} disabled={!!busy || !frames} />
                    <Btn
                      label="Delete"
                      kind="secondary"
                      onPress={() => {
                        deleteModel(m);
                        refreshStorage();
                      }}
                      disabled={!!busy}
                    />
                  </>
                )}
              </View>
              {r && <ResultView r={r} onPreview={() => setPreviewId(m.id)} />}
            </View>
          );
        })}

        {busy && (
          <View style={styles.busy}>
            <ActivityIndicator />
            <Text>{busy}</Text>
          </View>
        )}
        {error && <Text style={styles.error}>{error}</Text>}

        {preview && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>3. Text-behind-person preview</Text>
            <TextInput
              value={overlayText}
              onChangeText={setOverlayText}
              style={styles.input}
              autoCapitalize="characters"
            />
            <Preview frame={preview.lastFrame} mask={preview.lastMask} text={overlayText} />
            <Text style={styles.muted}>Mask from {MODELS.find((m) => m.id === preview.modelId)?.name}</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function ResultView({ r, onPreview }: { r: BenchResult; onPreview: () => void }) {
  const perFrame = r.inferMs + r.prepMs;
  const fmt = (s: number) => (s < 90 ? `${s.toFixed(0)} s` : `${(s / 60).toFixed(1)} min`);
  return (
    <View style={styles.result}>
      <Text style={styles.bold}>
        {perFrame.toFixed(1)} ms/frame · {(1000 / perFrame).toFixed(1)} FPS
      </Text>
      <Text style={styles.muted}>
        Model {r.inferMs.toFixed(1)} ms + prep {r.prepMs.toFixed(1)} ms · backend {r.backend} · load{' '}
        {r.loadMs.toFixed(0)} ms
      </Text>
      <Text>30 s clip @ 30 fps: ~{fmt(estimateSeconds(r, 30, 30))}</Text>
      <Text>30 s clip @ 15 fps (masks interpolated): ~{fmt(estimateSeconds(r, 30, 15))}</Text>
      <Text style={styles.link} onPress={onPreview}>
        Show preview
      </Text>
    </View>
  );
}

function Btn({
  label,
  onPress,
  disabled,
  kind = 'primary',
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  kind?: 'primary' | 'secondary';
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[styles.btn, kind === 'secondary' && styles.btnSecondary, disabled && styles.btnDisabled]}
    >
      <Text style={[styles.btnText, kind === 'secondary' && styles.btnTextSecondary]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F4F5F7' },
  container: { padding: 16, gap: 12, paddingBottom: 48 },
  title: { fontSize: 24, fontWeight: '700' },
  subtitle: { color: '#555' },
  section: { fontSize: 16, fontWeight: '600', marginTop: 4 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 14, gap: 6 },
  cardTitle: { fontSize: 16, fontWeight: '600' },
  muted: { color: '#666', fontSize: 12 },
  bold: { fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 4 },
  btn: { backgroundColor: '#3B5BDB', paddingVertical: 10, paddingHorizontal: 14, borderRadius: 8 },
  btnSecondary: { backgroundColor: '#E9ECEF' },
  btnDisabled: { opacity: 0.5 },
  btnText: { color: '#fff', fontWeight: '600', textAlign: 'center' },
  btnTextSecondary: { color: '#333' },
  result: { marginTop: 8, padding: 10, backgroundColor: '#F1F3F5', borderRadius: 8, gap: 2 },
  link: { color: '#3B5BDB', marginTop: 4, fontWeight: '600' },
  busy: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  error: { color: '#C92A2A' },
  input: { borderWidth: 1, borderColor: '#DDD', borderRadius: 8, padding: 8, fontSize: 16 },
});
