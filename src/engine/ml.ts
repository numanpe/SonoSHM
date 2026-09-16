import { SeededRandom } from '../data/rng';
import type { ClassifierMetrics, DamageStateId, FeatureImportanceEntry, FeatureRecord } from '../data/types';
import { DAMAGE_STATE_ORDER } from '../data/syntheticData';

export const ALL_FEATURE_KEYS = [
  'H2H1',
  'H3H1',
  'betaPrime',
  'attenuationIndicator',
  'rms',
  'energy',
  'tofUs',
  'deltaVOverV0',
] as const;
export type FeatureKey = (typeof ALL_FEATURE_KEYS)[number];

export const FEATURE_LABELS: Record<FeatureKey, string> = {
  H2H1: 'H2/H1 (2nd harmonic ratio)',
  H3H1: 'H3/H1 (3rd harmonic ratio)',
  betaPrime: "β′ (relative nonlinearity)",
  attenuationIndicator: 'Attenuation indicator',
  rms: 'RMS amplitude',
  energy: 'Signal energy',
  tofUs: 'Time-of-flight (µs)',
  deltaVOverV0: 'Δv/v₀ (velocity change)',
};

export function vectorOf(rec: FeatureRecord, keys: readonly FeatureKey[]): number[] {
  return keys.map((k) => {
    const v = (rec as unknown as Record<string, number | null>)[k];
    return typeof v === 'number' ? v : 0;
  });
}

export interface Standardizer {
  mean: number[];
  std: number[];
}

export function fitStandardizer(vectors: number[][]): Standardizer {
  const d = vectors[0]?.length ?? 0;
  const mean = new Array(d).fill(0);
  const std = new Array(d).fill(1);
  for (let j = 0; j < d; j++) {
    const col = vectors.map((v) => v[j]);
    const m = col.reduce((a, b) => a + b, 0) / col.length;
    const variance = col.reduce((a, b) => a + (b - m) ** 2, 0) / col.length;
    mean[j] = m;
    std[j] = Math.sqrt(variance) || 1;
  }
  return { mean, std };
}

export function applyStandardizer(v: number[], s: Standardizer): number[] {
  return v.map((val, j) => (val - s.mean[j]) / s.std[j]);
}

function euclidean(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += (a[i] - b[i]) ** 2;
  return Math.sqrt(sum);
}

/** Deterministic (seeded) shuffle + stratified-ish split by simple shuffle. */
export function trainTestSplit<T>(items: T[], seed: number, testFraction = 0.3): { train: T[]; test: T[] } {
  const rng = new SeededRandom(seed);
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  const nTest = Math.max(1, Math.round(arr.length * testFraction));
  return { test: arr.slice(0, nTest), train: arr.slice(nTest) };
}

export interface KnnModel {
  trainX: number[][];
  trainY: DamageStateId[];
  standardizer: Standardizer;
  k: number;
  featureKeys: FeatureKey[];
}

export function trainKnn(train: FeatureRecord[], featureKeys: FeatureKey[], k = 5): KnnModel {
  const rawX = train.map((r) => vectorOf(r, featureKeys));
  const standardizer = fitStandardizer(rawX);
  const trainX = rawX.map((v) => applyStandardizer(v, standardizer));
  const trainY = train.map((r) => r.generatedState);
  return { trainX, trainY, standardizer, k: Math.min(k, train.length), featureKeys };
}

export function knnPredict(model: KnnModel, rec: FeatureRecord): { label: DamageStateId; probabilities: Record<DamageStateId, number> } {
  const x = applyStandardizer(vectorOf(rec, model.featureKeys), model.standardizer);
  const distances = model.trainX.map((tx, i) => ({ d: euclidean(x, tx), y: model.trainY[i] }));
  distances.sort((a, b) => a.d - b.d);
  const neighbors = distances.slice(0, model.k);
  const counts: Record<string, number> = {};
  for (const n of neighbors) counts[n.y] = (counts[n.y] || 0) + 1;
  const probabilities = {} as Record<DamageStateId, number>;
  for (const s of DAMAGE_STATE_ORDER) probabilities[s] = (counts[s] || 0) / neighbors.length;
  const label = (Object.entries(probabilities).sort((a, b) => b[1] - a[1])[0][0]) as DamageStateId;
  return { label, probabilities };
}

function precisionRecallF1(confusion: number[][], labels: DamageStateId[]) {
  const perClass = {} as ClassifierMetrics['perClass'];
  let macroP = 0,
    macroR = 0,
    macroF1 = 0;
  labels.forEach((label, i) => {
    const tp = confusion[i][i];
    const fp = labels.reduce((s, _, j) => (j === i ? s : s + confusion[j][i]), 0);
    const fn = labels.reduce((s, _, j) => (j === i ? s : s + confusion[i][j]), 0);
    const support = confusion[i].reduce((a, b) => a + b, 0);
    const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
    const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
    const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
    perClass[label] = { precision, recall, f1, support };
    macroP += precision;
    macroR += recall;
    macroF1 += f1;
  });
  const n = labels.length;
  return { perClass, macroPrecision: macroP / n, macroRecall: macroR / n, macroF1: macroF1 / n };
}

export function evaluateModel(
  train: FeatureRecord[],
  test: FeatureRecord[],
  featureKeys: FeatureKey[],
  k = 5
): { metrics: ClassifierMetrics; model: KnnModel; predictions: { actual: DamageStateId; predicted: DamageStateId }[] } {
  const model = trainKnn(train, featureKeys, k);
  const labels = DAMAGE_STATE_ORDER;
  const confusion = labels.map(() => labels.map(() => 0));
  const predictions: { actual: DamageStateId; predicted: DamageStateId }[] = [];
  let correct = 0;
  for (const rec of test) {
    const { label } = knnPredict(model, rec);
    const ai = labels.indexOf(rec.generatedState);
    const pi = labels.indexOf(label);
    confusion[ai][pi]++;
    predictions.push({ actual: rec.generatedState, predicted: label });
    if (label === rec.generatedState) correct++;
  }
  const { perClass, macroPrecision, macroRecall, macroF1 } = precisionRecallF1(confusion, labels);
  const metrics: ClassifierMetrics = {
    accuracy: test.length ? correct / test.length : 0,
    macroPrecision,
    macroRecall,
    macroF1,
    perClass,
    confusionMatrix: confusion,
    labelsOrder: labels,
    nTrain: train.length,
    nTest: test.length,
  };
  return { metrics, model, predictions };
}

/** Permutation importance: shuffle one feature column in the test set (using
 * a seeded shuffle) and measure the resulting drop in accuracy. A larger
 * drop indicates the demonstration model relies more on that feature. This
 * reflects model behaviour only, not a physical damage mechanism. */
export function permutationImportance(
  model: KnnModel,
  test: FeatureRecord[],
  featureKeys: FeatureKey[],
  seed = 7
): FeatureImportanceEntry[] {
  const baselineCorrect = test.filter((r) => knnPredict(model, r).label === r.generatedState).length;
  const baselineAcc = test.length ? baselineCorrect / test.length : 0;

  const entries: FeatureImportanceEntry[] = [];
  featureKeys.forEach((key, idx) => {
    const rng = new SeededRandom(seed + idx);
    const shuffledValues = test.map((r) => vectorOf(r, featureKeys)[idx]);
    for (let i = shuffledValues.length - 1; i > 0; i--) {
      const j = Math.floor(rng.next() * (i + 1));
      [shuffledValues[i], shuffledValues[j]] = [shuffledValues[j], shuffledValues[i]];
    }
    let correct = 0;
    test.forEach((r, i) => {
      const vec = vectorOf(r, featureKeys);
      vec[idx] = shuffledValues[i];
      const x = vec.map((val, j) => (val - model.standardizer.mean[j]) / model.standardizer.std[j]);
      const distances = model.trainX.map((tx, ti) => ({ d: euclidean(x, tx), y: model.trainY[ti] }));
      distances.sort((a, b) => a.d - b.d);
      const neighbors = distances.slice(0, model.k);
      const counts: Record<string, number> = {};
      for (const n of neighbors) counts[n.y] = (counts[n.y] || 0) + 1;
      const label = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
      if (label === r.generatedState) correct++;
    });
    const permutedAcc = test.length ? correct / test.length : 0;
    entries.push({ feature: FEATURE_LABELS[key], importance: Math.max(0, baselineAcc - permutedAcc) });
  });
  const maxImp = Math.max(...entries.map((e) => e.importance), 1e-9);
  return entries
    .map((e) => ({ ...e, importance: e.importance / maxImp }))
    .sort((a, b) => b.importance - a.importance);
}

/** The full nonlinear-plus-linear feature set used by "Model C" and shared
 * with the other diagnosis models (GBT) so importance/attribution across
 * methods is directly comparable. */
export const FULL_FEATURE_SET: FeatureKey[] = ['H2H1', 'H3H1', 'betaPrime', 'attenuationIndicator', 'tofUs', 'deltaVOverV0'];

export const MODEL_PRESETS: { id: string; label: string; features: FeatureKey[] }[] = [
  { id: 'A', label: 'Model A — H2/H1 only', features: ['H2H1'] },
  { id: 'B', label: 'Model B — H2/H1 + H3/H1', features: ['H2H1', 'H3H1'] },
  { id: 'C', label: 'Model C — Full feature set (KNN)', features: FULL_FEATURE_SET },
];
