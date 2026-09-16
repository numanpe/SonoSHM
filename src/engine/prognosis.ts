export interface LinearFit {
  slope: number;
  intercept: number;
  residualStd: number;
  n: number;
  predict: (x: number) => number;
  predictInterval: (x: number, zScore?: number) => { lower: number; upper: number; mean: number };
  rSquared: number;
}

/** Ordinary least-squares linear regression with a residual-based
 * (approximate, Gaussian-assumption) prediction interval. This is a
 * genuinely computed interval from the available demonstration data — not a
 * fabricated confidence band — but it is a simple approximation and does not
 * account for autocorrelation, small-sample t-distribution corrections, or
 * model-form uncertainty. */
export function fitLinearTrend(xs: number[], ys: number[]): LinearFit {
  const n = xs.length;
  const xMean = xs.reduce((a, b) => a + b, 0) / n;
  const yMean = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0,
    den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - xMean) * (ys[i] - yMean);
    den += (xs[i] - xMean) ** 2;
  }
  const slope = den !== 0 ? num / den : 0;
  const intercept = yMean - slope * xMean;
  const predict = (x: number) => slope * x + intercept;

  let ssRes = 0;
  let ssTot = 0;
  for (let i = 0; i < n; i++) {
    ssRes += (ys[i] - predict(xs[i])) ** 2;
    ssTot += (ys[i] - yMean) ** 2;
  }
  const residualStd = Math.sqrt(ssRes / Math.max(1, n - 2));
  const rSquared = ssTot !== 0 ? 1 - ssRes / ssTot : 0;

  const predictInterval = (x: number, zScore = 1.96) => {
    const mean = predict(x);
    // widen slightly for extrapolation distance from the data centroid
    const extrapolationFactor = 1 + Math.min(1.5, Math.abs(x - xMean) / (Math.max(1, n) * 2));
    const margin = zScore * residualStd * extrapolationFactor;
    return { lower: mean - margin, upper: mean + margin, mean };
  };

  return { slope, intercept, residualStd, n, predict, predictInterval, rSquared };
}

export interface QuadraticFit {
  a: number;
  b: number;
  c: number;
  predict: (x: number) => number;
}

/** Simple quadratic (degree-2 polynomial) least-squares fit via normal
 * equations — offered as an alternative demonstration trend model. */
export function fitQuadraticTrend(xs: number[], ys: number[]): QuadraticFit {
  const n = xs.length;
  let Sx = 0,
    Sx2 = 0,
    Sx3 = 0,
    Sx4 = 0,
    Sy = 0,
    Sxy = 0,
    Sx2y = 0;
  for (let i = 0; i < n; i++) {
    const x = xs[i];
    const y = ys[i];
    Sx += x;
    Sx2 += x * x;
    Sx3 += x * x * x;
    Sx4 += x * x * x * x;
    Sy += y;
    Sxy += x * y;
    Sx2y += x * x * y;
  }
  // Solve the 3x3 normal-equations system [Sx4 Sx3 Sx2; Sx3 Sx2 Sx; Sx2 Sx n] * [a b c]^T = [Sx2y Sxy Sy]^T
  const A = [
    [Sx4, Sx3, Sx2],
    [Sx3, Sx2, Sx],
    [Sx2, Sx, n],
  ];
  const B = [Sx2y, Sxy, Sy];
  const [a, b, c] = solve3x3(A, B);
  return { a, b, c, predict: (x: number) => a * x * x + b * x + c };
}

function solve3x3(A: number[][], B: number[]): number[] {
  // Cramer's rule
  const det = (m: number[][]) =>
    m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
    m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
    m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  const d = det(A);
  if (Math.abs(d) < 1e-12) return [0, 0, B[2] / (A[2][2] || 1)];
  const replace = (col: number) =>
    A.map((row, i) => row.map((v, j) => (j === col ? B[i] : v)));
  return [det(replace(0)) / d, det(replace(1)) / d, det(replace(2)) / d];
}
