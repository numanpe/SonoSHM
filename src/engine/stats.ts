export function pearson(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n === 0) return 0;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0,
    dx = 0,
    dy = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    dx += (xs[i] - mx) ** 2;
    dy += (ys[i] - my) ** 2;
  }
  const denom = Math.sqrt(dx * dy);
  return denom !== 0 ? num / denom : 0;
}

export function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

export function stdDev(xs: number[]): number {
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
}

/** Simple effect-size proxy: (max group mean - min group mean) / pooled std
 * across all values. Larger = the feature separates the groups more
 * strongly in this dataset. */
export function groupSeparation(groups: number[][]): number {
  const means = groups.filter((g) => g.length > 0).map(mean);
  if (means.length < 2) return 0;
  const all = groups.flat();
  const pooledStd = stdDev(all) || 1e-9;
  return (Math.max(...means) - Math.min(...means)) / pooledStd;
}
