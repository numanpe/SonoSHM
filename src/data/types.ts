// Core data model for SonoSHM.
// Designed so that [MEASURED] data imported from a real laboratory campaign
// (via CSV) can populate exactly these same structures in place of the
// [SIMULATED] synthetic generator — see engine/csv.ts.

export type DataProvenance =
  | 'SIMULATED'
  | 'MEASURED'
  | 'MODEL_OUTPUT'
  | 'CONCEPTUAL'
  | 'DEMONSTRATION'
  | 'HYPOTHESIS'
  | 'REQUIRES_VALIDATION';

export type DamageStateId = 'healthy' | 'early' | 'moderate' | 'severe';

export interface DamageStateDef {
  id: DamageStateId;
  label: string;
  description: string;
  severityIndex: 0 | 1 | 2 | 3;
  color: string;
}

export interface StructureConfig {
  structureId: string;
  structureType: string;
  componentType: string;
  material: string;
  lengthMm: number;
  widthMm: number;
  heightMm: number;
  spanMm: number;
  ageYears: number;
  loadingCondition: string;
}

export type MeasurementDirection = 'longitudinal' | 'transverse' | 'shear';

/** A point in the real-world 3D coordinate system of an imported structure
 * (IFC model or point cloud), in meters. Used by user-defined custom assets
 * in place of / alongside the 1D positionFraction used by the built-in
 * demonstration profiles. */
export interface Point3D {
  x: number;
  y: number;
  z: number;
}

export interface SensorConfig {
  sensorId: string;
  label: string;
  /** Position along the beam span, 0 = left support, 1 = right support.
   * For custom imported assets this is a synthesized ordering value
   * (0..1, by distance along the structure's dominant axis) derived from
   * position3D, kept so the rest of the pipeline (which is written against
   * a 1D span fraction) needs no changes. */
  positionFraction: number;
  /** Real-world 3D placement, present only for sensors placed on an
   * imported IFC model or point cloud rather than a built-in profile. */
  position3D?: Point3D;
  direction: MeasurementDirection;
  excitationLocation: string;
  excitationFrequencyKHz: number;
  samplingFrequencyMHz: number;
  acquisitionDurationUs: number;
  /** Assumed excitation-to-sensor propagation distance, for ToF -> velocity */
  propagationDistanceMm: number;
}

export interface EnvironmentalConditions {
  temperatureC: number;
  humidityPct: number;
  loadingKN: number | null;
}

export interface Inspection {
  inspectionId: string;
  index: number;
  label: string;
  isoDate: string;
  /** Ground-truth generation label used ONLY for synthetic data + evaluating
   * the demonstration classifier. Not available for real [MEASURED] data
   * unless the researcher supplies it. */
  nominalGlobalState: DamageStateId;
  environment: EnvironmentalConditions;
}

export interface SignalRecord {
  signalId: string;
  sensorId: string;
  inspectionId: string;
  repeatIndex: number;
  samplingFrequencyMHz: number;
  durationUs: number;
  samples: number[];
  /** Ground-truth generation class (synthetic only) */
  generatedState: DamageStateId;
  provenance: DataProvenance;
}

export interface FeatureRecord {
  signalId: string;
  sensorId: string;
  inspectionId: string;
  repeatIndex: number;
  fundamentalFreqKHz: number;
  A1: number;
  A2: number;
  A3: number;
  H2H1: number;
  H3H1: number;
  betaPrime: number;
  rms: number;
  peak: number;
  energy: number;
  attenuationIndicator: number;
  frequencyShiftKHz: number;
  tofUs: number;
  velocityMs: number;
  deltaVOverV0: number | null;
  generatedState: DamageStateId;
  provenance: DataProvenance;
}

export interface ProcessedSignal {
  signalId: string;
  raw: number[];
  detrended: number[];
  windowed: number[];
  timeAxisUs: number[];
  fftFreqKHz: number[];
  fftAmplitude: number[];
  fftAmplitudeRaw: number[]; // FFT of the un-windowed (only detrended) signal, for comparison
}

export interface DatasetBundle {
  seed: number;
  generatedAt: string;
  structure: StructureConfig;
  sensors: SensorConfig[];
  damageStates: DamageStateDef[];
  inspections: Inspection[];
  signals: SignalRecord[];
  features: FeatureRecord[];
}

export interface ClassifierMetrics {
  accuracy: number;
  macroPrecision: number;
  macroRecall: number;
  macroF1: number;
  perClass: Record<
    DamageStateId,
    { precision: number; recall: number; f1: number; support: number }
  >;
  confusionMatrix: number[][]; // rows = actual, cols = predicted, order = DAMAGE_STATE_ORDER
  labelsOrder: DamageStateId[];
  nTrain: number;
  nTest: number;
}

export interface FeatureImportanceEntry {
  feature: string;
  importance: number; // 0-1 normalized
}

export interface AnomalyResult {
  sensorId: string;
  inspectionId: string;
  anomalyIndicator: number; // 0-1 normalized demonstration indicator
  zScoreMagnitude: number;
  status: 'Normal observation' | 'Potential anomaly' | 'Requires inspection' | 'Insufficient evidence';
}

export interface DiagnosisResult {
  sensorId: string;
  inspectionId: string;
  predictedState: DamageStateId;
  probabilities: Record<DamageStateId, number>;
  modelId: string;
}
