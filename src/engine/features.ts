import type { DatasetBundle, FeatureRecord, ProcessedSignal, SensorConfig, SignalRecord } from '../data/types';
import {
  applyWindow,
  computeFFT,
  detrend,
  estimateToF,
  hannWindow,
  peakAbs,
  peakNear,
  rms,
  signalEnergy,
} from './signalProcessing';

export function buildTimeAxisUs(samplingFrequencyMHz: number, n: number): number[] {
  const axis = new Array(n);
  for (let i = 0; i < n; i++) axis[i] = i / samplingFrequencyMHz;
  return axis;
}

/** Full processing pipeline for one signal: detrend -> Hann window -> FFT.
 * Also computes the FFT of the detrended-but-unwindowed signal so the UI can
 * show the effect of windowing side by side. */
export function processSignal(signal: SignalRecord, useWindow: boolean = true): ProcessedSignal {
  const detrended = detrend(signal.samples);
  const window = hannWindow(detrended.length);
  const windowed = useWindow ? applyWindow(detrended, window) : detrended;
  const timeAxisUs = buildTimeAxisUs(signal.samplingFrequencyMHz, detrended.length);

  const fftWindowed = computeFFT(windowed, signal.samplingFrequencyMHz);
  const fftRaw = computeFFT(detrended, signal.samplingFrequencyMHz);

  return {
    signalId: signal.signalId,
    raw: signal.samples,
    detrended,
    windowed,
    timeAxisUs,
    fftFreqKHz: fftWindowed.freqBinsKHz,
    fftAmplitude: fftWindowed.amplitude,
    fftAmplitudeRaw: fftRaw.amplitude,
  };
}

const HARMONIC_TOLERANCE_KHZ = 12; // accounts for ~5 kHz bin spacing + envelope-induced spectral spread

function sensorById(sensors: SensorConfig[], id: string): SensorConfig {
  return sensors.find((s) => s.sensorId === id)!;
}

/** Runs the full pipeline (processSignal + FFT harmonic search + ToF) over
 * every signal in the dataset, then normalizes attenuation and velocity
 * change against each sensor's first-inspection ([baseline]) values. */
export function extractAllFeatures(dataset: DatasetBundle): FeatureRecord[] {
  const inspectionsSorted = [...dataset.inspections].sort((a, b) => a.index - b.index);
  const baselineInspectionId = inspectionsSorted[0]?.inspectionId;

  interface Raw {
    rec: FeatureRecord;
  }
  const raws: Raw[] = [];

  for (const signal of dataset.signals) {
    const sensor = sensorById(dataset.sensors, signal.sensorId);
    const processed = processSignal(signal, true);
    const fft = { freqBinsKHz: processed.fftFreqKHz, amplitude: processed.fftAmplitude, real: [], imag: [] };

    const fundamental = peakNear(fft, sensor.excitationFrequencyKHz, HARMONIC_TOLERANCE_KHZ);
    const second = peakNear(fft, sensor.excitationFrequencyKHz * 2, HARMONIC_TOLERANCE_KHZ);
    const third = peakNear(fft, sensor.excitationFrequencyKHz * 3, HARMONIC_TOLERANCE_KHZ);

    const A1 = fundamental.amplitude || 1e-9;
    const A2 = second.amplitude;
    const A3 = third.amplitude;
    const H2H1 = A2 / A1;
    const H3H1 = A3 / A1;
    const betaPrime = A2 / (A1 * A1);

    const tof = estimateToF(processed.detrended, processed.timeAxisUs, 0.25);
    const velocityMs = (sensor.propagationDistanceMm / tof.tofUs) * 1000;

    const rec: FeatureRecord = {
      signalId: signal.signalId,
      sensorId: signal.sensorId,
      inspectionId: signal.inspectionId,
      repeatIndex: signal.repeatIndex,
      fundamentalFreqKHz: fundamental.freqKHz,
      A1,
      A2,
      A3,
      H2H1,
      H3H1,
      betaPrime,
      rms: rms(processed.detrended),
      peak: peakAbs(processed.detrended),
      energy: signalEnergy(processed.detrended),
      attenuationIndicator: 1, // filled in second pass
      frequencyShiftKHz: fundamental.freqKHz - sensor.excitationFrequencyKHz,
      tofUs: tof.tofUs,
      velocityMs,
      deltaVOverV0: null, // filled in second pass
      generatedState: signal.generatedState,
      provenance: signal.provenance,
    };
    raws.push({ rec });
  }

  // Baseline per sensor = mean over INS-001 repeats
  const baselineA1: Record<string, number> = {};
  const baselineEnergy: Record<string, number> = {};
  const baselineVelocity: Record<string, number> = {};
  for (const sensor of dataset.sensors) {
    const baseRecs = raws
      .map((r) => r.rec)
      .filter((r) => r.sensorId === sensor.sensorId && r.inspectionId === baselineInspectionId);
    if (baseRecs.length > 0) {
      baselineA1[sensor.sensorId] = avg(baseRecs.map((r) => r.A1));
      baselineEnergy[sensor.sensorId] = avg(baseRecs.map((r) => r.energy));
      baselineVelocity[sensor.sensorId] = avg(baseRecs.map((r) => r.velocityMs));
    }
  }

  for (const { rec } of raws) {
    const baseE = baselineEnergy[rec.sensorId] || rec.energy;
    rec.attenuationIndicator = baseE > 0 ? rec.energy / baseE : 1;
    const v0 = baselineVelocity[rec.sensorId];
    rec.deltaVOverV0 = v0 ? (rec.velocityMs - v0) / v0 : null;
  }

  return raws.map((r) => r.rec);
}

function avg(arr: number[]): number {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

/** Aggregate feature records by (sensor, inspection), averaging over
 * repeats — used for trend charts and diagnosis where one value per
 * sensor/inspection is wanted. */
export function aggregateBySensorInspection(features: FeatureRecord[]): FeatureRecord[] {
  const groups = new Map<string, FeatureRecord[]>();
  for (const f of features) {
    const key = `${f.sensorId}__${f.inspectionId}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(f);
  }
  const out: FeatureRecord[] = [];
  for (const [, group] of groups) {
    const first = group[0];
    out.push({
      ...first,
      signalId: `${first.sensorId}-${first.inspectionId}-AVG`,
      repeatIndex: 0,
      fundamentalFreqKHz: avg(group.map((g) => g.fundamentalFreqKHz)),
      A1: avg(group.map((g) => g.A1)),
      A2: avg(group.map((g) => g.A2)),
      A3: avg(group.map((g) => g.A3)),
      H2H1: avg(group.map((g) => g.H2H1)),
      H3H1: avg(group.map((g) => g.H3H1)),
      betaPrime: avg(group.map((g) => g.betaPrime)),
      rms: avg(group.map((g) => g.rms)),
      peak: avg(group.map((g) => g.peak)),
      energy: avg(group.map((g) => g.energy)),
      attenuationIndicator: avg(group.map((g) => g.attenuationIndicator)),
      frequencyShiftKHz: avg(group.map((g) => g.frequencyShiftKHz)),
      tofUs: avg(group.map((g) => g.tofUs)),
      velocityMs: avg(group.map((g) => g.velocityMs)),
      deltaVOverV0: avg(group.map((g) => g.deltaVOverV0 ?? 0)),
    });
  }
  return out;
}
