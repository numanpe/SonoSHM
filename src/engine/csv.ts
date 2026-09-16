import Papa from 'papaparse';
import type { DamageStateId, DatasetBundle, FeatureRecord, SignalRecord } from '../data/types';

export interface CsvValidationIssue {
  level: 'error' | 'warning';
  message: string;
}

export interface CsvImportResult<T> {
  rows: T[];
  issues: CsvValidationIssue[];
  columnsFound: string[];
}

function toNumber(v: unknown): number | null {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

const DAMAGE_STATE_ALIASES: Record<string, DamageStateId> = {
  healthy: 'healthy',
  early: 'early',
  'early damage': 'early',
  moderate: 'moderate',
  'moderate damage': 'moderate',
  severe: 'severe',
  'severe damage': 'severe',
};

/** Import a "Feature CSV": experiment_id, sensor_id, H2_H1, H3_H1,
 * beta_prime, attenuation, ToF, velocity, damage_state. Rows are marked
 * [MEASURED] since they represent externally supplied values. */
export function importFeatureCsv(text: string): CsvImportResult<FeatureRecord> {
  const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
  const issues: CsvValidationIssue[] = [];
  const columnsFound = parsed.meta.fields ?? [];

  const required = ['experiment_id', 'sensor_id', 'H2_H1', 'H3_H1', 'beta_prime', 'attenuation', 'ToF', 'velocity'];
  for (const col of required) {
    if (!columnsFound.includes(col)) {
      issues.push({ level: 'error', message: `Missing expected column "${col}".` });
    }
  }

  const seen = new Set<string>();
  const rows: FeatureRecord[] = [];
  parsed.data.forEach((row: Record<string, string>, idx: number) => {
    const experimentId = row.experiment_id?.trim();
    const sensorId = row.sensor_id?.trim();
    if (!experimentId || !sensorId) {
      issues.push({ level: 'warning', message: `Row ${idx + 2}: missing experiment_id or sensor_id — skipped.` });
      return;
    }
    const key = `${experimentId}__${sensorId}`;
    if (seen.has(key)) {
      issues.push({ level: 'warning', message: `Row ${idx + 2}: duplicate observation for ${key} — later row kept.` });
    }
    seen.add(key);

    const H2H1 = toNumber(row.H2_H1);
    const H3H1 = toNumber(row.H3_H1);
    const betaPrime = toNumber(row.beta_prime);
    const attenuationIndicator = toNumber(row.attenuation);
    const tofUs = toNumber(row.ToF);
    const velocityMs = toNumber(row.velocity);
    const stateRaw = (row.damage_state || '').trim().toLowerCase();
    const generatedState = DAMAGE_STATE_ALIASES[stateRaw] ?? null;

    const missing = [
      ['H2_H1', H2H1],
      ['H3_H1', H3H1],
      ['beta_prime', betaPrime],
      ['attenuation', attenuationIndicator],
      ['ToF', tofUs],
      ['velocity', velocityMs],
    ].filter(([, v]) => v === null);
    if (missing.length > 0) {
      issues.push({ level: 'warning', message: `Row ${idx + 2} (${key}): missing/non-numeric value for ${missing.map((m) => m[0]).join(', ')}.` });
    }
    if (!generatedState && stateRaw) {
      issues.push({ level: 'warning', message: `Row ${idx + 2}: unrecognized damage_state "${row.damage_state}".` });
    }

    rows.push({
      signalId: `IMPORTED-${key}`,
      sensorId,
      inspectionId: experimentId,
      repeatIndex: 0,
      fundamentalFreqKHz: 0,
      A1: 0,
      A2: 0,
      A3: 0,
      H2H1: H2H1 ?? 0,
      H3H1: H3H1 ?? 0,
      betaPrime: betaPrime ?? 0,
      rms: 0,
      peak: 0,
      energy: 0,
      attenuationIndicator: attenuationIndicator ?? 1,
      frequencyShiftKHz: 0,
      tofUs: tofUs ?? 0,
      velocityMs: velocityMs ?? 0,
      deltaVOverV0: null,
      generatedState: generatedState ?? 'healthy',
      provenance: 'MEASURED',
    });
  });

  if (rows.length === 0) {
    issues.push({ level: 'error', message: 'No valid data rows were found in the file.' });
  }

  return { rows, issues, columnsFound };
}

/** Import a "Signal CSV": timestamp, amplitude — a single raw waveform. The
 * caller assigns which sensor/inspection this belongs to. */
export function importSignalCsv(
  text: string,
  sensorId: string,
  inspectionId: string,
  samplingFrequencyMHz: number
): CsvImportResult<SignalRecord> {
  const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
  const issues: CsvValidationIssue[] = [];
  const columnsFound = parsed.meta.fields ?? [];

  if (!columnsFound.includes('timestamp') || !columnsFound.includes('amplitude')) {
    issues.push({ level: 'error', message: 'Expected columns "timestamp" and "amplitude" were not both found.' });
  }

  const samples: number[] = [];
  parsed.data.forEach((row: Record<string, string>, idx: number) => {
    const amp = toNumber(row.amplitude);
    if (amp === null) {
      issues.push({ level: 'warning', message: `Row ${idx + 2}: non-numeric amplitude — treated as 0.` });
      samples.push(0);
    } else {
      samples.push(amp);
    }
  });

  if (samples.length === 0) {
    issues.push({ level: 'error', message: 'No sample rows found.' });
  } else if (samples.length < 32) {
    issues.push({ level: 'warning', message: `Only ${samples.length} samples found — FFT frequency resolution will be coarse.` });
  }

  const record: SignalRecord = {
    signalId: `IMPORTED-${sensorId}-${inspectionId}-${Date.now()}`,
    sensorId,
    inspectionId,
    repeatIndex: 0,
    samplingFrequencyMHz,
    durationUs: samples.length / samplingFrequencyMHz,
    samples,
    generatedState: 'healthy',
    provenance: 'MEASURED',
  };

  return { rows: [record], issues, columnsFound };
}

export function exportFeaturesCsv(features: FeatureRecord[]): string {
  const header = 'experiment_id,sensor_id,H2_H1,H3_H1,beta_prime,attenuation,ToF,velocity,damage_state,provenance';
  const lines = features.map((f) =>
    [
      f.inspectionId,
      f.sensorId,
      f.H2H1.toFixed(6),
      f.H3H1.toFixed(6),
      f.betaPrime.toFixed(6),
      f.attenuationIndicator.toFixed(4),
      f.tofUs.toFixed(3),
      f.velocityMs.toFixed(1),
      f.generatedState,
      f.provenance,
    ].join(',')
  );
  return [header, ...lines].join('\n');
}

export function exportSignalCsv(signal: SignalRecord): string {
  const header = 'sample_index,timestamp_us,amplitude';
  const lines = signal.samples.map((a, i) => `${i},${(i / signal.samplingFrequencyMHz).toFixed(4)},${a.toFixed(6)}`);
  return [header, ...lines].join('\n');
}

export function exportInspectionCsv(dataset: DatasetBundle, indicatorBySensorInspection: Map<string, number>): string {
  const header = 'inspection_id,sensor_id,timestamp,damage_indicator';
  const lines: string[] = [];
  for (const insp of dataset.inspections) {
    for (const sensor of dataset.sensors) {
      const key = `${sensor.sensorId}__${insp.inspectionId}`;
      const indicator = indicatorBySensorInspection.get(key);
      if (indicator !== undefined) {
        lines.push(`${insp.inspectionId},${sensor.sensorId},${insp.isoDate},${indicator.toFixed(4)}`);
      }
    }
  }
  return [header, ...lines].join('\n');
}

declare global {
  interface Window {
    claude?: { use: (name: string) => Promise<unknown> };
  }
}

interface DownloadsCapability {
  save: (req: { filename: string; data: string | Blob }) => Promise<{ status: string }>;
}

/**
 * Save a generated file for the researcher. When this app is running inside
 * the claude.ai artifact viewer, frame code cannot trigger a browser
 * download directly — it must go through the `downloads` capability, which
 * shows the viewer a confirmation before saving. When running as a
 * standalone HTML file (e.g. opened locally in a browser), that capability
 * is absent and a conventional blob-link download is used instead.
 */
export async function downloadCsv(filename: string, content: string): Promise<void> {
  try {
    if (window.claude?.use) {
      const downloads = (await window.claude.use('downloads')) as DownloadsCapability | null;
      if (downloads) {
        await downloads.save({ filename, data: content });
        return;
      }
    }
  } catch {
    // fall through to conventional browser download below
  }

  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
