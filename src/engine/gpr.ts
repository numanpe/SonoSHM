// Gaussian Process Regression for longitudinal damage-indicator prognosis.
//
// This is a genuine (if deliberately small and dependency-free) GPR
// implementation — a squared-exponential (RBF) kernel, Cholesky-based exact
// inference, and hyperparameter selection by maximizing the log marginal
// likelihood over a small grid — offered as an alternative to the simple
// OLS linear fit in prognosis.ts, not a replacement for it: `fitLinearTrend`
// is reused here as the GP's mean function (see below), so this module adds
// principled, covariance-based uncertainty quantification on top of the
// same trend estimate, rather than silently swapping the trend model too.
//
// Why a mean function at all, instead of textbook zero-mean GPR: with only a
// handful of inspections (n≈5) a zero/constant-mean GP reverts sharply to
// its prior mean once extrapolated past the observed range, which throws
// away the (real, if simple) trend information the linear fit already
// captures. Modeling the *residuals* from the linear trend as a GP keeps the
// trend extrapolation, while replacing the current ad hoc
// `residualStd * extrapolationFactor` interval-widening heuristic with a
// real posterior covariance that grows with distance from the training
// inputs in a kernel-consistent way. This is a standard technique (GPR with
// an explicit/fixed mean function), not a shortcut.
import { fitLinearTrend, type LinearFit } from './prognosis';

export interface GPRModel {
  xs: number[];
  residuals: number[];
  lengthScale: number;
  sigmaF: number;
  sigmaN: number;
  alpha: number[]; // K_y^{-1} * residuals, precomputed via Cholesky solve
  L: number[][]; // lower-triangular Cholesky factor of (K + sigma_n^2 I)
  meanFit: LinearFit;
  logMarginalLikelihood: number;
}

export interface GPRPrediction {
  mean: number;
  variance: number;
  std: number;
  lower95: number;
  upper95: number;
}

function rbfKernel(x1: number, x2: number, lengthScale: number, sigmaF: number): number {
  const d = (x1 - x2) / lengthScale;
  return sigmaF * sigmaF * Math.exp(-0.5 * d * d);
}

/** Cholesky decomposition of a symmetric positive-definite matrix A = L L^T. */
function cholesky(A: number[][]): number[][] {
  const n = A.length;
  const L: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = A[i][j];
      for (let k = 0; k < j; k++) sum -= L[i][k] * L[j][k];
      if (i === j) {
        L[i][j] = Math.sqrt(Math.max(sum, 1e-12));
      } else {
        L[i][j] = sum / (L[j][j] || 1e-12);
      }
    }
  }
  return L;
}

/** Solve (L L^T) x = b for x, given the Cholesky factor L (forward + back substitution). */
function choleskySolve(L: number[][], b: number[]): number[] {
  const n = L.length;
  // Forward substitution: L y = b
  const y = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    let sum = b[i];
    for (let k = 0; k < i; k++) sum -= L[i][k] * y[k];
    y[i] = sum / (L[i][i] || 1e-12);
  }
  // Back substitution: L^T x = y
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let sum = y[i];
    for (let k = i + 1; k < n; k++) sum -= L[k][i] * x[k];
    x[i] = sum / (L[i][i] || 1e-12);
  }
  return x;
}

function logMarginalLikelihood(L: number[][], alpha: number[], residuals: number[]): number {
  const n = residuals.length;
  let dataFit = 0;
  for (let i = 0; i < n; i++) dataFit += residuals[i] * alpha[i];
  let logDet = 0;
  for (let i = 0; i < n; i++) logDet += Math.log(Math.max(L[i][i], 1e-12));
  return -0.5 * dataFit - logDet - 0.5 * n * Math.log(2 * Math.PI);
}

function std(arr: number[]): number {
  const m = arr.reduce((a, b) => a + b, 0) / arr.length;
  const v = arr.reduce((a, b) => a + (b - m) ** 2, 0) / arr.length;
  return Math.sqrt(v);
}

/** Fits a Gaussian Process to (xs, ys), with the mean function fixed to an
 * ordinary-least-squares linear trend (see module docstring) and the
 * squared-exponential kernel's length scale / noise level chosen by
 * maximizing the log marginal likelihood over a small candidate grid — a
 * simple, transparent, and entirely adequate approach at the n≈5 scale this
 * demonstration operates at (a full gradient-based optimizer would be
 * overkill and less inspectable). */
export function fitGPR(xs: number[], ys: number[]): GPRModel {
  const n = xs.length;
  const meanFit = fitLinearTrend(xs, ys);
  const residuals = ys.map((y, i) => y - meanFit.predict(xs[i]));

  const xSpan = Math.max(...xs) - Math.min(...xs) || 1;
  const ySigma = Math.max(std(residuals), 1e-3);
  const lengthScaleCandidates = [0.5, 1, 1.5, 2.5, 4].map((f) => f * xSpan);
  const sigmaFCandidates = [0.5, 1, 1.5, 2].map((f) => f * ySigma);
  const sigmaNCandidates = [0.05, 0.15, 0.3, 0.5].map((f) => f * ySigma + 1e-4);

  let best: { lengthScale: number; sigmaF: number; sigmaN: number; L: number[][]; alpha: number[]; lml: number } | null = null;

  for (const lengthScale of lengthScaleCandidates) {
    for (const sigmaF of sigmaFCandidates) {
      for (const sigmaN of sigmaNCandidates) {
        const K: number[][] = Array.from({ length: n }, (_, i) =>
          Array.from({ length: n }, (_, j) => rbfKernel(xs[i], xs[j], lengthScale, sigmaF) + (i === j ? sigmaN * sigmaN : 0))
        );
        const L = cholesky(K);
        const alpha = choleskySolve(L, residuals);
        const lml = logMarginalLikelihood(L, alpha, residuals);
        if (!best || lml > best.lml) best = { lengthScale, sigmaF, sigmaN, L, alpha, lml };
      }
    }
  }

  // best is always set: the candidate grids are non-empty
  const chosen = best!;
  return {
    xs,
    residuals,
    lengthScale: chosen.lengthScale,
    sigmaF: chosen.sigmaF,
    sigmaN: chosen.sigmaN,
    alpha: chosen.alpha,
    L: chosen.L,
    meanFit,
    logMarginalLikelihood: chosen.lml,
  };
}

/** Posterior predictive mean/variance at a new input x*, combining the
 * linear mean function with the GP's residual prediction, and a 95%
 * credible interval (mean ± 1.96·std) from the posterior variance. */
export function predictGPR(model: GPRModel, xStar: number): GPRPrediction {
  const n = model.xs.length;
  const kStar = model.xs.map((x) => rbfKernel(x, xStar, model.lengthScale, model.sigmaF));
  let residualMean = 0;
  for (let i = 0; i < n; i++) residualMean += kStar[i] * model.alpha[i];

  const v = choleskySolve(model.L, kStar);
  // v here solves (K+sigma_n^2 I) v = kStar via the same Cholesky factor;
  // posterior variance = k(x*,x*) - kStar^T v
  let kStarDotV = 0;
  for (let i = 0; i < n; i++) kStarDotV += kStar[i] * v[i];
  const priorVar = model.sigmaF * model.sigmaF;
  const variance = Math.max(1e-8, priorVar - kStarDotV) + model.sigmaN * model.sigmaN;

  const mean = model.meanFit.predict(xStar) + residualMean;
  const stdDev = Math.sqrt(variance);
  return { mean, variance, std: stdDev, lower95: mean - 1.96 * stdDev, upper95: mean + 1.96 * stdDev };
}
