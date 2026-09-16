// A small feedforward autoencoder for reference-free anomaly detection,
// trained only on signals the synthetic generator labels 'healthy' (pooled
// across all sensors of the active structure, not just one sensor's single
// baseline inspection) — offered alongside, not in place of, the existing
// per-sensor baseline z-score method on the Reference-Free Diagnostics page.
//
// This is a genuine (if deliberately small, dependency-free, and hand-
// differentiated) neural network: 6 standardized nonlinear-ultrasonic
// features -> 4 -> 2 (bottleneck) -> 4 -> 6, tanh hidden activations, linear
// output, trained by full-batch gradient descent with momentum and L2 weight
// decay on a seeded random initialization for reproducibility. The anomaly
// indicator is the reconstruction error, normalized against the
// reconstruction-error distribution the trained network itself produces on
// its own healthy training pool (mean + k * std, matching the σ-style
// normalization already used by the baseline z-score method elsewhere in
// this app).
import { SeededRandom } from '../data/rng';
import type { FeatureRecord } from '../data/types';
import { FULL_FEATURE_SET, fitStandardizer, applyStandardizer, vectorOf, type Standardizer } from './ml';

const LAYER_SIZES = [FULL_FEATURE_SET.length, 4, 2, 4, FULL_FEATURE_SET.length] as const;

interface DenseLayer {
  W: number[][]; // [outDim][inDim]
  b: number[]; // [outDim]
}

export interface AutoencoderModel {
  layers: DenseLayer[];
  standardizer: Standardizer;
  featureKeys: typeof FULL_FEATURE_SET;
  healthyErrorMean: number;
  healthyErrorStd: number;
  nTrainingExamples: number;
  finalLoss: number;
}

function tanh(x: number): number {
  return Math.tanh(x);
}
function dtanh(y: number): number {
  // derivative of tanh, expressed in terms of the tanh output y (as stored from the forward pass)
  return 1 - y * y;
}

function initLayer(rng: SeededRandom, outDim: number, inDim: number): DenseLayer {
  // Small random init scaled by fan-in (a simple, transparent stand-in for
  // Xavier/Glorot init — adequate at this network's tiny scale).
  const scale = Math.sqrt(1 / inDim);
  const W = Array.from({ length: outDim }, () => Array.from({ length: inDim }, () => (rng.next() * 2 - 1) * scale));
  const b = new Array(outDim).fill(0);
  return { W, b };
}

function forward(layers: DenseLayer[], x: number[]): { activations: number[][]; preActivations: number[][] } {
  const activations: number[][] = [x];
  const preActivations: number[][] = [x];
  for (let l = 0; l < layers.length; l++) {
    const { W, b } = layers[l];
    const prev = activations[activations.length - 1];
    const z = W.map((row, i) => row.reduce((s, w, j) => s + w * prev[j], b[i]));
    const isOutputLayer = l === layers.length - 1;
    const a = isOutputLayer ? z.slice() : z.map(tanh);
    preActivations.push(z);
    activations.push(a);
  }
  return { activations, preActivations };
}

/** Trains the autoencoder on `healthyRecords` (already filtered to the
 * generator's 'healthy' label) and returns the fitted model, including the
 * healthy-set reconstruction-error distribution used to calibrate the
 * anomaly indicator. Deterministic given `seed`. */
export function trainAutoencoder(healthyRecords: FeatureRecord[], seed: number): AutoencoderModel | null {
  if (healthyRecords.length < 6) return null; // too few healthy examples to fit anything meaningful

  const rawX = healthyRecords.map((r) => vectorOf(r, FULL_FEATURE_SET));
  const standardizer = fitStandardizer(rawX);
  const X = rawX.map((v) => applyStandardizer(v, standardizer));

  const rng = new SeededRandom(seed);
  const layers: DenseLayer[] = [];
  for (let l = 1; l < LAYER_SIZES.length; l++) layers.push(initLayer(rng, LAYER_SIZES[l], LAYER_SIZES[l - 1]));

  const learningRate = 0.05;
  const momentum = 0.9;
  const weightDecay = 1e-4;
  const epochs = 600;

  const velocityW = layers.map((l) => l.W.map((row) => row.map(() => 0)));
  const velocityB = layers.map((l) => l.b.map(() => 0));

  let finalLoss = 0;
  for (let epoch = 0; epoch < epochs; epoch++) {
    const gradW = layers.map((l) => l.W.map((row) => row.map(() => 0)));
    const gradB = layers.map((l) => l.b.map(() => 0));
    let epochLoss = 0;

    for (const x of X) {
      const { activations } = forward(layers, x);
      const output = activations[activations.length - 1];
      const error = output.map((o, i) => o - x[i]);
      epochLoss += error.reduce((s, e) => s + e * e, 0);

      // Backpropagation through the 4 dense layers (explicit, not a generic
      // autograd loop, so the math here is directly inspectable).
      let delta = error; // dL/dz for the linear output layer (dL/da = error, output is linear so dz=da)
      for (let l = layers.length - 1; l >= 0; l--) {
        const layerInput = activations[l];
        const { W } = layers[l];
        for (let i = 0; i < W.length; i++) {
          for (let j = 0; j < W[i].length; j++) gradW[l][i][j] += delta[i] * layerInput[j];
          gradB[l][i] += delta[i];
        }
        if (l > 0) {
          const prevActivation = activations[l];
          const nextDelta = new Array(layerInput.length).fill(0);
          for (let j = 0; j < layerInput.length; j++) {
            let s = 0;
            for (let i = 0; i < W.length; i++) s += W[i][j] * delta[i];
            // hidden layers use tanh: multiply by dtanh(activation at layer l)
            nextDelta[j] = s * dtanh(prevActivation[j]);
          }
          delta = nextDelta;
        }
      }
    }

    const n = X.length;
    for (let l = 0; l < layers.length; l++) {
      for (let i = 0; i < layers[l].W.length; i++) {
        for (let j = 0; j < layers[l].W[i].length; j++) {
          const g = gradW[l][i][j] / n + weightDecay * layers[l].W[i][j];
          velocityW[l][i][j] = momentum * velocityW[l][i][j] - learningRate * g;
          layers[l].W[i][j] += velocityW[l][i][j];
        }
        const gb = gradB[l][i] / n;
        velocityB[l][i] = momentum * velocityB[l][i] - learningRate * gb;
        layers[l].b[i] += velocityB[l][i];
      }
    }
    finalLoss = epochLoss / n;
  }

  const healthyErrors = X.map((x) => reconstructionError(layers, x));
  const mean = healthyErrors.reduce((a, b) => a + b, 0) / healthyErrors.length;
  const variance = healthyErrors.reduce((a, b) => a + (b - mean) ** 2, 0) / healthyErrors.length;

  return {
    layers,
    standardizer,
    featureKeys: FULL_FEATURE_SET,
    healthyErrorMean: mean,
    healthyErrorStd: Math.sqrt(variance) || 1e-6,
    nTrainingExamples: healthyRecords.length,
    finalLoss,
  };
}

function reconstructionError(layers: DenseLayer[], x: number[]): number {
  const { activations } = forward(layers, x);
  const output = activations[activations.length - 1];
  let sq = 0;
  for (let i = 0; i < x.length; i++) sq += (output[i] - x[i]) ** 2;
  return Math.sqrt(sq / x.length);
}

export interface AutoencoderResult {
  reconstructionError: number;
  anomalyIndicator: number; // 0-1, 1.0 = 3 standard deviations above the mean healthy reconstruction error
}

/** Scores a record's reconstruction error against the model's healthy-set
 * error distribution — mirrors the sigma-style normalization the existing
 * baseline z-score anomaly method already uses elsewhere in the app,
 * clamped to a 3-sigma-above-healthy-mean ceiling at indicator = 1. */
export function scoreAutoencoder(model: AutoencoderModel, rec: FeatureRecord): AutoencoderResult {
  const x = applyStandardizer(vectorOf(rec, model.featureKeys), model.standardizer);
  const err = reconstructionError(model.layers, x);
  const threshold = model.healthyErrorMean + 3 * model.healthyErrorStd;
  const anomalyIndicator = Math.min(1, Math.max(0, (err - model.healthyErrorMean) / (threshold - model.healthyErrorMean || 1e-6)));
  return { reconstructionError: err, anomalyIndicator };
}
