// A small gradient-boosted regression-tree classifier (multiclass, one
// shallow CART regression tree per class per boosting round — the same
// "MART" scheme behind libraries like XGBoost/LightGBM, hand-implemented
// here at a scale appropriate for this demonstration dataset) — offered as
// a second diagnosis model alongside the existing k-nearest-neighbours
// classifier, not a replacement for it.
//
// Unlike KNN, tree splits are scale-invariant, so no feature standardization
// is needed. Feature importance is provided via genuine Shapley-value
// attribution (engine/shapley.ts) rather than permutation importance, for
// direct comparison against the KNN model's permutation-based method.
import type { ClassifierMetrics, DamageStateId, FeatureRecord } from '../data/types';
import { DAMAGE_STATE_ORDER } from '../data/syntheticData';
import { vectorOf, type FeatureKey } from './ml';

interface TreeNode {
  isLeaf: boolean;
  value: number; // leaf prediction (used only when isLeaf)
  featureIndex?: number;
  threshold?: number;
  left?: TreeNode;
  right?: TreeNode;
}

function mean(arr: number[]): number {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

function sse(arr: number[]): number {
  if (arr.length === 0) return 0;
  const m = mean(arr);
  return arr.reduce((s, v) => s + (v - m) ** 2, 0);
}

/** Builds one CART regression tree by exhaustively searching, at each node,
 * every (feature, threshold) split candidate for the one minimizing total
 * child SSE — a standard, transparent greedy tree-growing algorithm. */
function buildTree(X: number[][], y: number[], depth: number, maxDepth: number, minLeaf: number): TreeNode {
  if (depth >= maxDepth || y.length < minLeaf * 2) return { isLeaf: true, value: mean(y) };

  const nFeatures = X[0]?.length ?? 0;
  let bestGain = -Infinity;
  let bestFeature = -1;
  let bestThreshold = 0;
  const parentSSE = sse(y);

  for (let f = 0; f < nFeatures; f++) {
    const values = Array.from(new Set(X.map((row) => row[f]))).sort((a, b) => a - b);
    for (let i = 0; i < values.length - 1; i++) {
      const threshold = (values[i] + values[i + 1]) / 2;
      const leftY: number[] = [];
      const rightY: number[] = [];
      for (let r = 0; r < X.length; r++) (X[r][f] <= threshold ? leftY : rightY).push(y[r]);
      if (leftY.length < minLeaf || rightY.length < minLeaf) continue;
      const gain = parentSSE - sse(leftY) - sse(rightY);
      if (gain > bestGain) {
        bestGain = gain;
        bestFeature = f;
        bestThreshold = threshold;
      }
    }
  }

  if (bestFeature === -1 || bestGain <= 1e-9) return { isLeaf: true, value: mean(y) };

  const leftX: number[][] = [], leftY: number[] = [], rightX: number[][] = [], rightY: number[] = [];
  for (let r = 0; r < X.length; r++) {
    if (X[r][bestFeature] <= bestThreshold) { leftX.push(X[r]); leftY.push(y[r]); }
    else { rightX.push(X[r]); rightY.push(y[r]); }
  }

  return {
    isLeaf: false,
    value: mean(y),
    featureIndex: bestFeature,
    threshold: bestThreshold,
    left: buildTree(leftX, leftY, depth + 1, maxDepth, minLeaf),
    right: buildTree(rightX, rightY, depth + 1, maxDepth, minLeaf),
  };
}

export function predictTree(node: TreeNode, x: number[]): number {
  let cur = node;
  while (!cur.isLeaf) {
    cur = x[cur.featureIndex!] <= cur.threshold! ? cur.left! : cur.right!;
  }
  return cur.value;
}

export interface GBTModel {
  trees: TreeNode[][]; // trees[round][classIndex]
  learningRate: number;
  featureKeys: FeatureKey[];
  labels: DamageStateId[];
  initLogOdds: number[]; // per-class log-prior offset
}

function softmax(scores: number[]): number[] {
  const max = Math.max(...scores);
  const exps = scores.map((s) => Math.exp(s - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map((e) => e / sum);
}

/** Trains a multiclass gradient-boosted tree ensemble by fitting one
 * shallow regression tree per class per round to that class's pseudo-
 * residual (one-hot target minus current softmax probability) — the
 * standard multiclass MART / gradient-boosting-for-classification scheme,
 * with a fixed learning rate and modest tree depth chosen for this
 * dataset's scale (tens to low hundreds of training records). */
export function trainGBT(
  train: FeatureRecord[],
  featureKeys: FeatureKey[],
  opts: { nRounds?: number; learningRate?: number; maxDepth?: number; minLeaf?: number } = {}
): GBTModel {
  const { nRounds = 40, learningRate = 0.25, maxDepth = 3, minLeaf = 3 } = opts;
  const labels = DAMAGE_STATE_ORDER;
  const K = labels.length;
  const X = train.map((r) => vectorOf(r, featureKeys));
  const yIdx = train.map((r) => labels.indexOf(r.generatedState));
  const n = X.length;

  const classCounts = labels.map((_, k) => yIdx.filter((y) => y === k).length + 1); // +1 Laplace smoothing
  const totalCount = classCounts.reduce((a, b) => a + b, 0);
  const initLogOdds = classCounts.map((c) => Math.log(c / totalCount));

  const F = Array.from({ length: n }, () => initLogOdds.slice());
  const trees: TreeNode[][] = [];

  for (let round = 0; round < nRounds; round++) {
    const P = F.map((f) => softmax(f));
    const roundTrees: TreeNode[] = [];
    for (let k = 0; k < K; k++) {
      const residual = yIdx.map((y, i) => (y === k ? 1 : 0) - P[i][k]);
      const tree = buildTree(X, residual, 0, maxDepth, minLeaf);
      roundTrees.push(tree);
      for (let i = 0; i < n; i++) F[i][k] += learningRate * predictTree(tree, X[i]);
    }
    trees.push(roundTrees);
  }

  return { trees, learningRate, featureKeys, labels: labels.slice(), initLogOdds };
}

export function gbtScores(model: GBTModel, x: number[]): number[] {
  const F = model.initLogOdds.slice();
  for (const roundTrees of model.trees) {
    for (let k = 0; k < roundTrees.length; k++) F[k] += model.learningRate * predictTree(roundTrees[k], x);
  }
  return F;
}

export function gbtPredict(model: GBTModel, rec: FeatureRecord): { label: DamageStateId; probabilities: Record<DamageStateId, number> } {
  const x = vectorOf(rec, model.featureKeys);
  const F = gbtScores(model, x);
  const P = softmax(F);
  const probabilities = {} as Record<DamageStateId, number>;
  model.labels.forEach((l, i) => (probabilities[l] = P[i]));
  const label = model.labels[P.indexOf(Math.max(...P))];
  return { label, probabilities };
}

function precisionRecallF1(confusion: number[][], labels: DamageStateId[]) {
  const perClass = {} as ClassifierMetrics['perClass'];
  let macroP = 0, macroR = 0, macroF1 = 0;
  labels.forEach((label, i) => {
    const tp = confusion[i][i];
    const fp = labels.reduce((s, _, j) => (j === i ? s : s + confusion[j][i]), 0);
    const fn = labels.reduce((s, _, j) => (j === i ? s : s + confusion[i][j]), 0);
    const support = confusion[i].reduce((a, b) => a + b, 0);
    const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
    const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
    const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
    perClass[label] = { precision, recall, f1, support };
    macroP += precision; macroR += recall; macroF1 += f1;
  });
  const n = labels.length;
  return { perClass, macroPrecision: macroP / n, macroRecall: macroR / n, macroF1: macroF1 / n };
}

export function evaluateGBT(
  train: FeatureRecord[],
  test: FeatureRecord[],
  featureKeys: FeatureKey[],
  opts?: { nRounds?: number; learningRate?: number; maxDepth?: number; minLeaf?: number }
): { metrics: ClassifierMetrics; model: GBTModel } {
  const model = trainGBT(train, featureKeys, opts);
  const labels = DAMAGE_STATE_ORDER;
  const confusion = labels.map(() => labels.map(() => 0));
  let correct = 0;
  for (const rec of test) {
    const { label } = gbtPredict(model, rec);
    const ai = labels.indexOf(rec.generatedState);
    const pi = labels.indexOf(label);
    confusion[ai][pi]++;
    if (label === rec.generatedState) correct++;
  }
  const { perClass, macroPrecision, macroRecall, macroF1 } = precisionRecallF1(confusion, labels);
  const metrics: ClassifierMetrics = {
    accuracy: test.length ? correct / test.length : 0,
    macroPrecision, macroRecall, macroF1,
    perClass, confusionMatrix: confusion, labelsOrder: labels,
    nTrain: train.length, nTest: test.length,
  };
  return { metrics, model };
}
