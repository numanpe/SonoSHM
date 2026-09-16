// Individuals & Moving-Range (I-MR) Shewhart control chart — classic
// statistical process control, applied here to a chosen nonlinear feature or
// the composite damage indicator, tracked per sensor across the inspection
// sequence. This is offered as a second, more statistically principled way
// to flag departures from baseline than the app's existing flat 0.3/0.55
// anomaly-indicator thresholds (which are not replaced — see Longitudinal
// Monitoring's own limitations for how the two relate).
//
// Phase I (baseline): the center line and natural-variation estimate
// (sigma) are derived from the moving range between repeat acquisitions at
// the designated baseline inspection — the same repeat-to-repeat data this
// app already has, rather than an assumed variability margin.
// Phase II (monitoring): every later inspection's value is checked against
// those fixed limits and against the Western Electric run rules, a standard
// set of pattern-based out-of-control signals used alongside the basic
// beyond-3-sigma rule.
export interface IMRPoint {
  x: string;
  value: number | null;
  sigmaZ: number | null; // (value - centerLine) / sigma
  violatedRules: number[]; // Western Electric rule numbers (1-4) triggered at this point
  outOfControl: boolean;
}

export interface IMRChartResult {
  centerLine: number;
  sigma: number;
  ucl: number;
  lcl: number;
  mrBar: number;
  uclMR: number;
  baselineN: number;
  points: IMRPoint[];
}

// Unbiasing constants for a moving range of width 2 (standard SPC tables).
const D2_N2 = 1.128;
const D4_N2 = 3.267;

export const WESTERN_ELECTRIC_RULES: Record<number, string> = {
  1: '1 point beyond 3σ from the center line',
  2: '2 of 3 consecutive points beyond 2σ on the same side',
  3: '4 of 5 consecutive points beyond 1σ on the same side',
  4: '8 consecutive points on the same side of the center line',
};

/**
 * Computes an I-MR chart. `baselineValues` should be repeat-level (not
 * pre-averaged) readings from the baseline/reference period, in acquisition
 * order — at least 2 are required to estimate a moving range. `seriesLabels`
 * / `seriesValues` are the (typically per-inspection, already-averaged)
 * points to plot and evaluate against the resulting limits; a `null` entry
 * is treated as missing (breaks run-rule streaks but is still plotted as a
 * gap).
 */
export function computeIMRChart(
  baselineValues: number[],
  seriesLabels: string[],
  seriesValues: (number | null)[]
): IMRChartResult | null {
  const clean = baselineValues.filter((v) => Number.isFinite(v));
  if (clean.length < 2) return null;

  const centerLine = clean.reduce((a, b) => a + b, 0) / clean.length;
  const mrs: number[] = [];
  for (let i = 1; i < clean.length; i++) mrs.push(Math.abs(clean[i] - clean[i - 1]));
  const mrBar = mrs.reduce((a, b) => a + b, 0) / mrs.length;
  const sigma = mrBar / D2_N2;
  const ucl = centerLine + 3 * sigma;
  const lcl = centerLine - 3 * sigma;
  const uclMR = D4_N2 * mrBar;

  const points: IMRPoint[] = [];
  const signs: (1 | -1 | 0 | null)[] = [];

  for (let i = 0; i < seriesValues.length; i++) {
    const v = seriesValues[i];
    if (v === null || v === undefined || !Number.isFinite(v)) {
      points.push({ x: seriesLabels[i], value: null, sigmaZ: null, violatedRules: [], outOfControl: false });
      signs.push(null);
      continue;
    }
    const z = sigma > 0 ? (v - centerLine) / sigma : 0;
    const sign: 1 | -1 | 0 = v > centerLine ? 1 : v < centerLine ? -1 : 0;
    signs.push(sign);

    const violated: number[] = [];
    if (Math.abs(z) >= 3) violated.push(1);

    if (i >= 2 && sign !== 0) {
      let count = 0;
      for (const j of [i - 2, i - 1, i]) {
        const w = seriesValues[j];
        if (w === null || w === undefined || !Number.isFinite(w)) continue;
        const wz = sigma > 0 ? (w - centerLine) / sigma : 0;
        if (Math.abs(wz) >= 2 && Math.sign(wz) === sign) count++;
      }
      if (count >= 2) violated.push(2);
    }

    if (i >= 4 && sign !== 0) {
      let count = 0;
      for (const j of [i - 4, i - 3, i - 2, i - 1, i]) {
        const w = seriesValues[j];
        if (w === null || w === undefined || !Number.isFinite(w)) continue;
        const wz = sigma > 0 ? (w - centerLine) / sigma : 0;
        if (Math.abs(wz) >= 1 && Math.sign(wz) === sign) count++;
      }
      if (count >= 4) violated.push(3);
    }

    if (i >= 7 && sign !== 0) {
      const window = signs.slice(i - 7, i + 1);
      if (window.every((s) => s === sign)) violated.push(4);
    }

    points.push({ x: seriesLabels[i], value: v, sigmaZ: z, violatedRules: violated, outOfControl: violated.length > 0 });
  }

  return { centerLine, sigma, ucl, lcl, mrBar, uclMR, baselineN: clean.length, points };
}
