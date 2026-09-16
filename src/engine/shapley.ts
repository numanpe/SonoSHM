// Exact Shapley-value feature attribution for a black-box scalar function.
//
// With only a handful of input features (this app's diagnosis models use
// 6), the full 2^n coalition enumeration in the textbook Shapley-value
// definition is entirely tractable to compute exactly — no sampling or
// kernel approximation is needed, unlike in typical SHAP usage on
// high-dimensional inputs. This is genuinely the Shapley value (the unique
// attribution satisfying efficiency, symmetry, dummy, and additivity), not
// an approximation, and it obeys the efficiency property: the attributions
// sum exactly to f(x) - f_background(baseline).
export interface ShapleyEntry {
  feature: string;
  value: number; // signed contribution to the model output, in the same units as f's output
}

function popcount(mask: number): number {
  let c = 0;
  while (mask) {
    c += mask & 1;
    mask >>= 1;
  }
  return c;
}

function factorial(k: number): number {
  let r = 1;
  for (let i = 2; i <= k; i++) r *= i;
  return r;
}

/** Computes exact Shapley values for `f` evaluated at `x`, using `background`
 * samples to marginalize out "absent" features (the standard interventional
 * / expectation-based treatment of a missing feature in Shapley-value
 * attribution for ML models, as opposed to literally omitting an input the
 * model requires). */
export function computeShapleyValues(
  f: (x: number[]) => number,
  x: number[],
  background: number[][],
  featureLabels: string[]
): ShapleyEntry[] {
  const n = x.length;
  const nMasks = 1 << n;
  const nFact = factorial(n);
  const bg = background.length > 0 ? background : [x];

  // Precompute f(S) for every coalition S (bitmask), averaged over the
  // background sample set for the features outside S.
  const fVal = new Array(nMasks).fill(0);
  for (let mask = 0; mask < nMasks; mask++) {
    let sum = 0;
    for (const b of bg) {
      const xi = new Array(n);
      for (let i = 0; i < n; i++) xi[i] = mask & (1 << i) ? x[i] : b[i];
      sum += f(xi);
    }
    fVal[mask] = sum / bg.length;
  }

  const phi = new Array(n).fill(0);
  for (let mask = 0; mask < nMasks; mask++) {
    const size = popcount(mask);
    const weight = (factorial(size) * factorial(n - size - 1)) / nFact;
    for (let i = 0; i < n; i++) {
      if (mask & (1 << i)) continue; // Shapley's marginal-contribution sum only ranges over coalitions S not containing i
      const withI = mask | (1 << i);
      phi[i] += weight * (fVal[withI] - fVal[mask]);
    }
  }

  return featureLabels.map((label, i) => ({ feature: label, value: phi[i] }));
}
