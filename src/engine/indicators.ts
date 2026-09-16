import type { AnomalyResult, FeatureRecord } from '../data/types';

const INDICATOR_FEATURES = ['H2H1', 'H3H1', 'betaPrime'] as const;

interface FeatureStats {
  mean: number;
  std: number;
}

/**
 * Reference-free-style anomaly detection: builds a per-sensor "healthy
 * reference region" from that sensor's own baseline (first) inspection, then
 * expresses every later observation as a standardized distance (z-score
 * magnitude, averaged across features assuming a diagonal covariance —
 * i.e. a simplified Mahalanobis-style distance) from that region. This
 * demonstrates the *concept* of deriving anomaly indication from
 * signal-derived features rather than a literal healthy-vs-current
 * comparison; it does not implement or validate a general reference-free
 * diagnostic method.
 */
export function computeAnomalyIndicators(
  featuresBySensorInspection: FeatureRecord[],
  baselineInspectionId: string
): AnomalyResult[] {
  const bySensor = new Map<string, FeatureRecord[]>();
  for (const f of featuresBySensorInspection) {
    if (!bySensor.has(f.sensorId)) bySensor.set(f.sensorId, []);
    bySensor.get(f.sensorId)!.push(f);
  }

  const results: AnomalyResult[] = [];
  for (const [sensorId, records] of bySensor) {
    const baseline = records.filter((r) => r.inspectionId === baselineInspectionId);
    if (baseline.length === 0) {
      for (const r of records) {
        results.push({
          sensorId,
          inspectionId: r.inspectionId,
          anomalyIndicator: 0,
          zScoreMagnitude: 0,
          status: 'Insufficient evidence',
        });
      }
      continue;
    }
    // With a single averaged baseline record we approximate a healthy
    // "region" using a fixed, modest assumed variability (10% of the
    // baseline magnitude) rather than fabricating a distribution from one
    // point. This is a transparent simplification of the demonstration.
    const stats: Record<string, FeatureStats> = {};
    for (const key of INDICATOR_FEATURES) {
      const baseVal = (baseline[0] as unknown as Record<string, number>)[key];
      stats[key] = { mean: baseVal, std: Math.max(Math.abs(baseVal) * 0.18, 1e-4) };
    }

    for (const r of records) {
      let sumSq = 0;
      for (const key of INDICATOR_FEATURES) {
        const val = (r as unknown as Record<string, number>)[key];
        const z = (val - stats[key].mean) / stats[key].std;
        sumSq += z * z;
      }
      const distance = Math.sqrt(sumSq / INDICATOR_FEATURES.length);
      const anomalyIndicator = Math.min(1, 1 - Math.exp(-distance / 2.2));
      let status: AnomalyResult['status'] = 'Normal observation';
      if (r.inspectionId === baselineInspectionId) {
        status = 'Normal observation';
      } else if (anomalyIndicator >= 0.55) {
        status = 'Requires inspection';
      } else if (anomalyIndicator >= 0.3) {
        status = 'Potential anomaly';
      }
      results.push({ sensorId, inspectionId: r.inspectionId, anomalyIndicator, zScoreMagnitude: distance, status });
    }
  }
  return results;
}

/**
 * Demonstration composite "damage indicator" (0-1) combining normalized
 * nonlinear-feature deviation, attenuation loss and velocity change. This is
 * an illustrative aggregation for the prototype UI — NOT a validated
 * structural damage index and must never be read as a percentage of
 * physical damage.
 */
export function computeDamageIndicator(rec: FeatureRecord, ranges: {
  h2h1Max: number;
  h3h1Max: number;
  attenLossMax: number;
  dvMax: number;
}): number {
  const h2 = Number.isFinite(rec.H2H1) ? Math.min(1, rec.H2H1 / ranges.h2h1Max) : 0;
  const h3 = Number.isFinite(rec.H3H1) ? Math.min(1, rec.H3H1 / ranges.h3h1Max) : 0;
  const atten = Number.isFinite(rec.attenuationIndicator) ? Math.min(1, Math.max(0, 1 - rec.attenuationIndicator) / ranges.attenLossMax) : 0;
  const dv = Number.isFinite(rec.deltaVOverV0) ? Math.min(1, Math.abs(rec.deltaVOverV0 as number) / ranges.dvMax) : 0;
  return Math.min(1, 0.35 * h2 + 0.25 * h3 + 0.2 * atten + 0.2 * dv);
}

/** Max over only the finite values in `arr` (falling back to `fallback` if
 * none are finite) — a single non-finite feature record (e.g. from a signal
 * whose wave arrival fell outside its acquisition window) must not silently
 * poison the shared normalization range for every other sensor via
 * Math.max(...NaN) = NaN. */
function finiteMax(arr: number[], fallback: number): number {
  let m = -Infinity;
  for (const v of arr) if (Number.isFinite(v) && v > m) m = v;
  return m === -Infinity ? fallback : Math.max(m, fallback);
}

export function computeDatasetRanges(features: FeatureRecord[]) {
  return {
    h2h1Max: finiteMax(features.map((f) => f.H2H1), 0.01) * 1.05,
    h3h1Max: finiteMax(features.map((f) => f.H3H1), 0.005) * 1.05,
    attenLossMax: finiteMax(features.map((f) => 1 - f.attenuationIndicator), 0.05) * 1.05,
    dvMax: finiteMax(features.map((f) => Math.abs(f.deltaVOverV0 ?? 0)), 0.01) * 1.05,
  };
}
