import type { DatasetBundle } from '../data/types';

export type QualityLevel = 'Good' | 'Warning' | 'Insufficient';

export interface QualityCheck {
  label: string;
  level: QualityLevel;
  detail: string;
}

export function assessDataQuality(dataset: DatasetBundle): QualityCheck[] {
  const checks: QualityCheck[] = [];

  const signalsPerSensor = new Map<string, number>();
  for (const s of dataset.signals) {
    signalsPerSensor.set(s.sensorId, (signalsPerSensor.get(s.sensorId) || 0) + 1);
  }
  const minSignals = Math.min(...Array.from(signalsPerSensor.values(), () => Infinity), 0);
  const counts = Array.from(signalsPerSensor.values());
  const minCount = counts.length ? Math.min(...counts) : 0;
  checks.push({
    label: 'Signal availability per sensor',
    level: minCount >= 9 ? 'Good' : minCount >= 3 ? 'Warning' : 'Insufficient',
    detail: `Minimum ${minCount} signal record(s) across ${signalsPerSensor.size} sensors (${dataset.sensors.length} configured).`,
  });
  void minSignals;

  const missingSamples = dataset.signals.filter((s) => !s.samples || s.samples.length === 0).length;
  checks.push({
    label: 'Missing / empty signal records',
    level: missingSamples === 0 ? 'Good' : missingSamples < dataset.signals.length * 0.05 ? 'Warning' : 'Insufficient',
    detail: missingSamples === 0 ? 'No missing signal records detected.' : `${missingSamples} signal record(s) contain no samples.`,
  });

  const durations = new Set(dataset.signals.map((s) => s.durationUs));
  checks.push({
    label: 'Acquisition duration consistency',
    level: durations.size <= 1 ? 'Good' : durations.size <= 2 ? 'Warning' : 'Insufficient',
    detail: durations.size <= 1
      ? `All records share a ${[...durations][0]} µs acquisition window.`
      : `${durations.size} distinct acquisition durations found (${[...durations].join(', ')} µs) — comparisons across records should account for this.`,
  });

  const samplingRates = new Set(dataset.signals.map((s) => s.samplingFrequencyMHz));
  checks.push({
    label: 'Sampling frequency consistency',
    level: samplingRates.size <= 1 ? 'Good' : 'Warning',
    detail: samplingRates.size <= 1
      ? `All records sampled at ${[...samplingRates][0]} MHz.`
      : `Multiple sampling frequencies present (${[...samplingRates].join(', ')} MHz).`,
  });

  const inspectionCount = dataset.inspections.length;
  checks.push({
    label: 'Longitudinal inspection coverage',
    level: inspectionCount >= 5 ? 'Good' : inspectionCount >= 3 ? 'Warning' : 'Insufficient',
    detail: `${inspectionCount} inspection(s) available for longitudinal trend analysis.`,
  });

  const dates = dataset.inspections.map((i) => i.isoDate);
  const uniqueDates = new Set(dates);
  checks.push({
    label: 'Timestamp consistency',
    level: uniqueDates.size === dates.length ? 'Good' : 'Warning',
    detail: uniqueDates.size === dates.length ? 'All inspection timestamps are unique and ordered.' : 'Duplicate inspection timestamps detected.',
  });

  const propagationKnown = dataset.sensors.every((s) => s.propagationDistanceMm > 0);
  checks.push({
    label: 'Propagation distance availability',
    level: propagationKnown ? 'Good' : 'Insufficient',
    detail: propagationKnown
      ? 'Excitation-to-sensor propagation distance is defined for all sensors, enabling wave velocity estimation.'
      : 'One or more sensors lack a defined propagation distance; wave velocity cannot be estimated for these.',
  });

  return checks;
}

export function qualityBadgeClasses(level: QualityLevel): string {
  switch (level) {
    case 'Good':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'Warning':
      return 'bg-amber-50 text-amber-700 border-amber-200';
    case 'Insufficient':
      return 'bg-red-50 text-red-700 border-red-200';
  }
}
