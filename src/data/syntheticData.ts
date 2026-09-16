import { SeededRandom, DEFAULT_SEED } from './rng';
import type {
  DamageStateDef,
  DamageStateId,
  DatasetBundle,
  EnvironmentalConditions,
  Inspection,
  Point3D,
  SensorConfig,
  SignalRecord,
  StructureConfig,
} from './types';

export const DAMAGE_STATES: DamageStateDef[] = [
  {
    id: 'healthy',
    label: 'Healthy',
    description: 'No significant simulated anomaly.',
    severityIndex: 0,
    color: '#1f8a5f',
  },
  {
    id: 'early',
    label: 'Early Damage',
    description: 'Subtle simulated response change.',
    severityIndex: 1,
    color: '#c9971e',
  },
  {
    id: 'moderate',
    label: 'Moderate Damage',
    description: 'Clear simulated response change.',
    severityIndex: 2,
    color: '#d1651f',
  },
  {
    id: 'severe',
    label: 'Severe Damage',
    description: 'Strong simulated response change.',
    severityIndex: 3,
    color: '#b5292f',
  },
];

export const DAMAGE_STATE_ORDER: DamageStateId[] = ['healthy', 'early', 'moderate', 'severe'];

export function damageStateById(id: DamageStateId): DamageStateDef {
  return DAMAGE_STATES.find((d) => d.id === id)!;
}

/** Visual family used by the Digital Twin renderer — lets one generic
 * pipeline (signal -> features -> diagnosis -> indicator -> prognosis)
 * demonstrate applicability across structurally different infrastructure,
 * not just one specimen geometry. */
export type StructureKind = 'beam' | 'deck' | 'pipe' | 'custom';

export interface StructureProfile {
  id: string;
  shortLabel: string;
  kind: StructureKind;
  structure: StructureConfig;
  sensors: SensorConfig[];
  /** Span fraction (0-1) where the synthetic damage narrative is centered. */
  damageLocationFraction: number;
  /** Gaussian falloff width for spatial coupling to the damage location. */
  couplingSigma: number;
  baseVelocityMs: number;
  damageNarrative: string;
}

// ---------------------------------------------------------------------------
// Asset 1: RC-BEAM-01 — laboratory reinforced-concrete beam (flexural crack)
// ---------------------------------------------------------------------------
const RC_BEAM_PROFILE: StructureProfile = {
  id: 'RC-BEAM-01',
  shortLabel: 'RC Beam',
  kind: 'beam',
  damageLocationFraction: 0.5,
  couplingSigma: 0.14,
  baseVelocityMs: 3840,
  damageNarrative: 'Simulated flexural crack initiating and propagating at midspan under repeated demonstration loading.',
  structure: {
    structureId: 'RC-BEAM-01',
    structureType: 'Laboratory Test Specimen',
    componentType: 'Reinforced Concrete Beam',
    material: 'Reinforced Concrete (C30/37 nominal)',
    lengthMm: 3200,
    widthMm: 200,
    heightMm: 300,
    spanMm: 3000,
    ageYears: 2,
    loadingCondition: 'Simply supported, quasi-static demonstration loading',
  },
  sensors: [
    { sensorId: 'S01', label: 'S01 — Near Left Support', positionFraction: 0.08, direction: 'longitudinal', excitationLocation: 'Left-end pitch-catch transducer pair', excitationFrequencyKHz: 100, samplingFrequencyMHz: 2.56, acquisitionDurationUs: 200, propagationDistanceMm: 180 },
    { sensorId: 'S02', label: 'S02 — Quarter Span (Left)', positionFraction: 0.28, direction: 'longitudinal', excitationLocation: 'Left-of-midspan pitch-catch pair', excitationFrequencyKHz: 100, samplingFrequencyMHz: 2.56, acquisitionDurationUs: 200, propagationDistanceMm: 210 },
    { sensorId: 'S03', label: 'S03 — Inner Left of Midspan', positionFraction: 0.42, direction: 'transverse', excitationLocation: 'Adjacent-to-midspan pitch-catch pair', excitationFrequencyKHz: 100, samplingFrequencyMHz: 2.56, acquisitionDurationUs: 200, propagationDistanceMm: 195 },
    { sensorId: 'S04', label: 'S04 — Midspan', positionFraction: 0.5, direction: 'transverse', excitationLocation: 'Midspan pitch-catch pair (across flexural crack zone)', excitationFrequencyKHz: 100, samplingFrequencyMHz: 2.56, acquisitionDurationUs: 200, propagationDistanceMm: 200 },
    { sensorId: 'S05', label: 'S05 — Inner Right of Midspan', positionFraction: 0.58, direction: 'transverse', excitationLocation: 'Adjacent-to-midspan pitch-catch pair', excitationFrequencyKHz: 100, samplingFrequencyMHz: 2.56, acquisitionDurationUs: 200, propagationDistanceMm: 195 },
    { sensorId: 'S06', label: 'S06 — Quarter Span (Right)', positionFraction: 0.78, direction: 'longitudinal', excitationLocation: 'Right-of-midspan pitch-catch pair', excitationFrequencyKHz: 100, samplingFrequencyMHz: 2.56, acquisitionDurationUs: 200, propagationDistanceMm: 215 },
  ],
};

// ---------------------------------------------------------------------------
// Asset 2: BRIDGE-DECK-02 — steel–concrete composite bridge deck panel
// (damage narrative: deck-to-girder shear-connector deterioration)
// ---------------------------------------------------------------------------
const BRIDGE_DECK_PROFILE: StructureProfile = {
  id: 'BRIDGE-DECK-02',
  shortLabel: 'Bridge Deck',
  kind: 'deck',
  damageLocationFraction: 0.62,
  couplingSigma: 0.16,
  baseVelocityMs: 4120,
  damageNarrative: 'Simulated deterioration near a deck-to-girder shear connection under repeated demonstration traffic loading.',
  structure: {
    structureId: 'BRIDGE-DECK-02',
    structureType: 'In-Service Infrastructure Component',
    componentType: 'Steel–Concrete Composite Bridge Deck Panel',
    material: 'Composite deck (concrete slab on steel girders)',
    lengthMm: 8000,
    widthMm: 3500,
    heightMm: 220,
    spanMm: 7500,
    ageYears: 18,
    loadingCondition: 'Simply supported girder span, live-load (traffic) demonstration loading',
  },
  sensors: [
    { sensorId: 'D01', label: 'D01 — Abutment (Near)', positionFraction: 0.06, direction: 'longitudinal', excitationLocation: 'Near-abutment pitch-catch pair', excitationFrequencyKHz: 90, samplingFrequencyMHz: 2.56, acquisitionDurationUs: 220, propagationDistanceMm: 220 },
    { sensorId: 'D02', label: 'D02 — Quarter Span', positionFraction: 0.3, direction: 'transverse', excitationLocation: 'Quarter-span pitch-catch pair', excitationFrequencyKHz: 90, samplingFrequencyMHz: 2.56, acquisitionDurationUs: 220, propagationDistanceMm: 240 },
    { sensorId: 'D03', label: 'D03 — Shear-Connector Zone (Near)', positionFraction: 0.5, direction: 'transverse', excitationLocation: 'Adjacent shear-connector pitch-catch pair', excitationFrequencyKHz: 90, samplingFrequencyMHz: 2.56, acquisitionDurationUs: 220, propagationDistanceMm: 225 },
    { sensorId: 'D04', label: 'D04 — Shear-Connector Zone', positionFraction: 0.62, direction: 'transverse', excitationLocation: 'Shear-connector pitch-catch pair', excitationFrequencyKHz: 90, samplingFrequencyMHz: 2.56, acquisitionDurationUs: 220, propagationDistanceMm: 225 },
    { sensorId: 'D05', label: 'D05 — Three-Quarter Span', positionFraction: 0.78, direction: 'transverse', excitationLocation: 'Three-quarter-span pitch-catch pair', excitationFrequencyKHz: 90, samplingFrequencyMHz: 2.56, acquisitionDurationUs: 220, propagationDistanceMm: 240 },
    { sensorId: 'D06', label: 'D06 — Abutment (Far)', positionFraction: 0.94, direction: 'longitudinal', excitationLocation: 'Far-abutment pitch-catch pair', excitationFrequencyKHz: 90, samplingFrequencyMHz: 2.56, acquisitionDurationUs: 220, propagationDistanceMm: 220 },
  ],
};

// ---------------------------------------------------------------------------
// Asset 3: PIPE-SEG-03 — steel pipeline segment (girth-weld region)
// ---------------------------------------------------------------------------
const PIPELINE_PROFILE: StructureProfile = {
  id: 'PIPE-SEG-03',
  shortLabel: 'Pipeline',
  kind: 'pipe',
  damageLocationFraction: 0.45,
  couplingSigma: 0.1,
  baseVelocityMs: 5900,
  damageNarrative: 'Simulated wall-thickness loss / weld degradation at a girth weld under repeated demonstration pressure cycling.',
  structure: {
    structureId: 'PIPE-SEG-03',
    structureType: 'In-Service Infrastructure Component',
    componentType: 'Steel Pipeline Segment (Girth-Weld Region)',
    material: 'Carbon steel (API 5L X52 nominal)',
    lengthMm: 4000,
    widthMm: 508,
    heightMm: 508,
    spanMm: 4000,
    ageYears: 27,
    loadingCondition: 'Internal pressure cycling, demonstration loading',
  },
  sensors: [
    { sensorId: 'P01', label: 'P01 — Upstream', positionFraction: 0.1, direction: 'longitudinal', excitationLocation: 'Upstream guided-wave transducer ring', excitationFrequencyKHz: 120, samplingFrequencyMHz: 2.56, acquisitionDurationUs: 180, propagationDistanceMm: 170 },
    { sensorId: 'P02', label: 'P02 — Upstream of Weld', positionFraction: 0.3, direction: 'longitudinal', excitationLocation: 'Upstream-of-weld transducer ring', excitationFrequencyKHz: 120, samplingFrequencyMHz: 2.56, acquisitionDurationUs: 180, propagationDistanceMm: 185 },
    { sensorId: 'P03', label: 'P03 — Girth Weld (Near)', positionFraction: 0.4, direction: 'transverse', excitationLocation: 'Near-weld transducer ring', excitationFrequencyKHz: 120, samplingFrequencyMHz: 2.56, acquisitionDurationUs: 180, propagationDistanceMm: 175 },
    { sensorId: 'P04', label: 'P04 — Girth Weld', positionFraction: 0.45, direction: 'transverse', excitationLocation: 'Girth-weld transducer ring', excitationFrequencyKHz: 120, samplingFrequencyMHz: 2.56, acquisitionDurationUs: 180, propagationDistanceMm: 175 },
    { sensorId: 'P05', label: 'P05 — Downstream of Weld', positionFraction: 0.62, direction: 'longitudinal', excitationLocation: 'Downstream-of-weld transducer ring', excitationFrequencyKHz: 120, samplingFrequencyMHz: 2.56, acquisitionDurationUs: 180, propagationDistanceMm: 185 },
    { sensorId: 'P06', label: 'P06 — Downstream', positionFraction: 0.9, direction: 'longitudinal', excitationLocation: 'Downstream guided-wave transducer ring', excitationFrequencyKHz: 120, samplingFrequencyMHz: 2.56, acquisitionDurationUs: 180, propagationDistanceMm: 170 },
  ],
};

export const STRUCTURE_PROFILES: Record<string, StructureProfile> = {
  [RC_BEAM_PROFILE.id]: RC_BEAM_PROFILE,
  [BRIDGE_DECK_PROFILE.id]: BRIDGE_DECK_PROFILE,
  [PIPELINE_PROFILE.id]: PIPELINE_PROFILE,
};

export const STRUCTURE_PROFILE_LIST: StructureProfile[] = [RC_BEAM_PROFILE, BRIDGE_DECK_PROFILE, PIPELINE_PROFILE];
export const DEFAULT_STRUCTURE_ID = RC_BEAM_PROFILE.id;

// ---------------------------------------------------------------------------
// Custom imported assets: built at runtime from an IFC model or a manually
// placed sensor layout (e.g. from a point-cloud viewer), rather than being
// one of the three hand-authored demonstration profiles above. The rest of
// the pipeline (signal generation, features, ML, indicators, prognosis) is
// generic and needs no changes to work with these — they only need a valid
// StructureProfile with real-world sensor positions collapsed onto the
// existing 1D span-fraction model used everywhere else in the app.
// ---------------------------------------------------------------------------

export interface CustomSensorInput {
  sensorId: string;
  label: string;
  position3D: Point3D;
  direction?: 'longitudinal' | 'transverse' | 'shear';
}

export interface BuildCustomProfileParams {
  id: string;
  shortLabel: string;
  componentType: string;
  material: string;
  sourceKind: 'ifc' | 'pointcloud';
  sensors: CustomSensorInput[];
  damageMarker3D: Point3D;
  damageNarrative?: string;
  baseVelocityMs?: number;
  ageYears?: number;
}

function dist3D(a: Point3D, b: Point3D): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2);
}

/** Picks the coordinate axis with the greatest spread across all supplied
 * points as the "span" direction for projecting 3D placements onto the 1D
 * fraction model — a simple, transparent proxy (not a validated principal-
 * axis / alignment computation) that works for typical elongated members. */
function dominantAxis(points: Point3D[]): 'x' | 'y' | 'z' {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const zs = points.map((p) => p.z);
  const spread = (arr: number[]) => Math.max(...arr) - Math.min(...arr);
  const sx = spread(xs);
  const sy = spread(ys);
  const sz = spread(zs);
  if (sx >= sy && sx >= sz) return 'x';
  if (sy >= sx && sy >= sz) return 'y';
  return 'z';
}

/** Builds a full StructureProfile (usable anywhere a built-in profile is)
 * from a user-placed sensor layout on an imported structure. Real-world
 * positions are projected onto the dominant axis and normalized to the same
 * 0..1 span-fraction convention the built-in profiles use, so no other part
 * of the computational pipeline needs to know this asset was imported. */
export function buildCustomProfile(params: BuildCustomProfileParams): StructureProfile {
  const axis = dominantAxis([...params.sensors.map((s) => s.position3D), params.damageMarker3D]);
  const coord = (p: Point3D) => p[axis];
  const allCoords = [...params.sensors.map((s) => coord(s.position3D)), coord(params.damageMarker3D)];
  const lo = Math.min(...allCoords);
  const hi = Math.max(...allCoords);
  const span = hi - lo || 1;
  const fractionOf = (p: Point3D) => (coord(p) - lo) / span;

  // reference "excitation" point at the low end of the dominant axis, used
  // only to derive a realistic per-sensor propagation distance for ToF
  const refPoint: Point3D = { ...params.sensors[0].position3D, [axis]: lo } as Point3D;
  const baseVelocityMs = params.baseVelocityMs ?? 4000;

  const sensors: SensorConfig[] = params.sensors.map((s) => {
    // A minimum standoff distance is enforced (matching the ~150-250mm
    // range used by the built-in profiles): below roughly 100mm at typical
    // demonstration velocities, the simulated wave arrival lands so close to
    // t=0 that the envelope-threshold ToF estimator (tuned for a realistic
    // pitch-catch standoff, not a co-located sensor/excitation point) cannot
    // reliably resolve it from smoothing/edge artifacts, producing spurious
    // near-zero ToF and downstream NaN features — not a real physical limit.
    const propagationDistanceMm = Math.max(130, dist3D(refPoint, s.position3D) * 1000);
    // The acquisition window must comfortably contain the simulated wave's
    // expected arrival time (propagation distance / velocity) plus the
    // burst envelope width — imported structures can span many meters
    // (unlike the built-in lab-scale profiles), so a fixed short window
    // would silently clip the arrival and make ToF/velocity features
    // meaningless (near-zero ToF, NaN deltaV). Scaled here instead, capped
    // to keep per-signal sample counts reasonable in-browser.
    const expectedTofUs = (propagationDistanceMm / baseVelocityMs) * 1000;
    const acquisitionDurationUs = Math.min(4000, Math.max(200, Math.ceil((expectedTofUs + 60) * 1.5)));
    return {
      sensorId: s.sensorId,
      label: s.label,
      positionFraction: Math.min(1, Math.max(0, fractionOf(s.position3D))),
      position3D: s.position3D,
      direction: s.direction ?? 'transverse',
      excitationLocation: `Placed pitch-catch pair near ${s.label}`,
      excitationFrequencyKHz: 100,
      samplingFrequencyMHz: 2.56,
      acquisitionDurationUs,
      propagationDistanceMm,
    };
  });

  const bboxDims = (['x', 'y', 'z'] as const).map((a) => {
    const vals = [...params.sensors.map((s) => s.position3D[a]), params.damageMarker3D[a]];
    return Math.max(...vals) - Math.min(...vals);
  });

  const structure: StructureConfig = {
    structureId: params.id,
    structureType: params.sourceKind === 'ifc' ? 'Imported Structure (IFC Model)' : 'Imported Structure (Point Cloud / Manual Placement)',
    componentType: params.componentType || 'Imported Structural Component',
    material: params.material || 'Unspecified — imported geometry',
    lengthMm: Math.max(1, bboxDims[0] * 1000),
    widthMm: Math.max(1, bboxDims[2] * 1000),
    heightMm: Math.max(1, bboxDims[1] * 1000),
    spanMm: Math.max(1, span * 1000),
    ageYears: params.ageYears ?? 0,
    loadingCondition: 'Not specified — imported structure, demonstration loading assumed',
  };

  return {
    id: params.id,
    shortLabel: params.shortLabel,
    kind: 'custom',
    damageLocationFraction: Math.min(1, Math.max(0, fractionOf(params.damageMarker3D))),
    couplingSigma: 0.15,
    baseVelocityMs,
    damageNarrative:
      params.damageNarrative ||
      'User-marked demonstration damage location on an imported structure; severity progression is simulated, not measured.',
    structure,
    sensors,
  };
}

const INSPECTION_GLOBAL_STATE: DamageStateId[] = ['healthy', 'early', 'moderate', 'moderate', 'severe'];
const REPEATS_PER_COMBINATION = 3;

function buildInspections(rng: SeededRandom): Inspection[] {
  const startDate = new Date('2025-11-03T09:00:00+10:00');
  const inspections: Inspection[] = [];
  for (let i = 0; i < INSPECTION_GLOBAL_STATE.length; i++) {
    const date = new Date(startDate.getTime());
    date.setUTCDate(date.getUTCDate() + i * 35);
    const env: EnvironmentalConditions = {
      temperatureC: Math.round((21 + rng.gaussian(0, 1.4)) * 10) / 10,
      humidityPct: Math.round(48 + rng.gaussian(0, 4)),
      loadingKN: i === 0 ? null : Math.round((12 + rng.gaussian(0, 1.2)) * 10) / 10,
    };
    inspections.push({
      inspectionId: `INS-${String(i + 1).padStart(3, '0')}`,
      index: i,
      label: `Inspection ${i + 1}`,
      isoDate: date.toISOString().slice(0, 10),
      nominalGlobalState: INSPECTION_GLOBAL_STATE[i],
      environment: env,
    });
  }
  return inspections;
}

const SEVERITY_OF: Record<DamageStateId, number> = { healthy: 0, early: 1, moderate: 2, severe: 3 };

/** Spatial coupling factor: how strongly a sensor at a given position is
 * affected by damage centered at the profile's damage location. Gaussian
 * falloff with distance — a simple, transparent, non-physical proxy for
 * localized damage sensitivity, not a validated damage model. */
function couplingFactor(positionFraction: number, damageLocationFraction: number, sigma: number): number {
  const d = positionFraction - damageLocationFraction;
  return Math.exp(-(d * d) / (2 * sigma * sigma));
}

export interface SensorInspectionTarget {
  sensorId: string;
  inspectionId: string;
  localSeverityFraction: number; // 0..1
  generatedState: DamageStateId;
  h2h1Target: number;
  h3h1Target: number;
  attenuationFactor: number; // multiplies A1 baseline (1 = none, <1 = attenuated)
  tofUs: number;
  velocityMs: number;
}

const H2H1_BY_SEVERITY = [0.02, 0.05, 0.09, 0.145]; // healthy..severe means
const H3H1_BY_SEVERITY = [0.006, 0.016, 0.032, 0.052];
const ATTENUATION_BY_SEVERITY = [0.0, 0.05, 0.12, 0.22]; // fractional amplitude loss
const VELOCITY_DROP_BY_SEVERITY = [0, 0.013, 0.028, 0.045]; // fractional velocity reduction

function computeSensorInspectionTargets(rng: SeededRandom, profile: StructureProfile): SensorInspectionTarget[] {
  const inspections = buildInspections(rng);
  const targets: SensorInspectionTarget[] = [];
  for (const sensor of profile.sensors) {
    const coupling = couplingFactor(sensor.positionFraction, profile.damageLocationFraction, profile.couplingSigma);
    for (const insp of inspections) {
      const globalSeverity = SEVERITY_OF[insp.nominalGlobalState] / 3; // 0..1
      const localSeverityFraction = Math.min(1, Math.max(0, globalSeverity * coupling + rng.gaussian(0, 0.02)));

      // interpolate targets across the 4 discrete severity anchors using localSeverityFraction (0..3 continuous)
      const contIdx = localSeverityFraction * 3;
      const lo = Math.floor(contIdx);
      const hi = Math.min(3, lo + 1);
      const frac = contIdx - lo;
      const interp = (arr: number[]) => arr[lo] + (arr[hi] - arr[lo]) * frac;

      const h2h1Target = Math.max(0.005, interp(H2H1_BY_SEVERITY) * rng.gaussian(1, 0.12));
      const h3h1Target = Math.max(0.001, interp(H3H1_BY_SEVERITY) * rng.gaussian(1, 0.15));
      const attenuationFactor = 1 - Math.min(0.35, interp(ATTENUATION_BY_SEVERITY) * rng.gaussian(1, 0.2));
      const velocityDrop = interp(VELOCITY_DROP_BY_SEVERITY) * rng.gaussian(1, 0.15);
      const velocityMs = profile.baseVelocityMs * (1 - velocityDrop) + rng.gaussian(0, profile.baseVelocityMs * 0.003);
      const tofUs = (sensor.propagationDistanceMm / velocityMs) * 1000;

      let generatedState: DamageStateId = 'healthy';
      if (localSeverityFraction >= 0.72) generatedState = 'severe';
      else if (localSeverityFraction >= 0.42) generatedState = 'moderate';
      else if (localSeverityFraction >= 0.16) generatedState = 'early';

      targets.push({
        sensorId: sensor.sensorId,
        inspectionId: insp.inspectionId,
        localSeverityFraction,
        generatedState,
        h2h1Target,
        h3h1Target,
        attenuationFactor,
        tofUs,
        velocityMs,
      });
    }
  }
  return targets;
}

function generateSignalSamples(
  rng: SeededRandom,
  sensor: SensorConfig,
  target: SensorInspectionTarget
): number[] {
  const fs = sensor.samplingFrequencyMHz; // samples per microsecond
  const n = Math.round(fs * sensor.acquisitionDurationUs);
  const f1 = sensor.excitationFrequencyKHz / 1000; // cycles per microsecond
  const freqJitter = rng.gaussian(1, 0.008);
  const omega1 = 2 * Math.PI * f1 * freqJitter;

  const A1base = 1.0 * target.attenuationFactor * rng.gaussian(1, 0.03);
  const A2 = A1base * target.h2h1Target;
  const A3 = A1base * target.h3h1Target;

  const arrival = target.tofUs;
  const burstSigma = 9 + rng.gaussian(0, 0.6); // microseconds, burst envelope width
  // damping increases slightly with severity, broadening/decaying the packet
  const dampingTau = 55 - target.localSeverityFraction * 14 + rng.gaussian(0, 2);

  const noiseStd = 0.018 * A1base + 0.004;
  const samples: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / fs; // microseconds
    const envelopeIn = Math.exp(-((t - arrival) * (t - arrival)) / (2 * burstSigma * burstSigma));
    const decay = t > arrival ? Math.exp(-(t - arrival) / dampingTau) : 1;
    const envelope = t < arrival ? envelopeIn : envelopeIn * 0.4 + 0.6 * decay * Math.exp(-((t - arrival) ** 2) / (2 * (burstSigma * 2.2) ** 2));
    const carrier =
      A1base * Math.sin(omega1 * t) +
      A2 * Math.sin(2 * omega1 * t + 0.3) +
      A3 * Math.sin(3 * omega1 * t + 0.6);
    const noise = rng.gaussian(0, noiseStd);
    samples[i] = envelope * carrier + noise;
  }
  return samples;
}

export function generateDataset(
  structureId: string = DEFAULT_STRUCTURE_ID,
  seed: number = DEFAULT_SEED,
  overrideProfile?: StructureProfile
): DatasetBundle {
  const profile = overrideProfile ?? STRUCTURE_PROFILES[structureId] ?? RC_BEAM_PROFILE;
  // Offset the seed per-asset so the three demonstration assets don't share
  // identical noise draws while remaining fully reproducible.
  const assetSeedOffset = profile.id.length * 131 + profile.sensors.length;
  const effectiveSeed = seed + assetSeedOffset;

  const inspections = buildInspections(new SeededRandom(effectiveSeed));
  const targets = computeSensorInspectionTargets(new SeededRandom(effectiveSeed), profile);
  const targetMap = new Map(targets.map((t) => [`${t.sensorId}__${t.inspectionId}`, t]));

  const signals: SignalRecord[] = [];
  const rngSignals = new SeededRandom(effectiveSeed + 1);
  for (const sensor of profile.sensors) {
    for (const insp of inspections) {
      const target = targetMap.get(`${sensor.sensorId}__${insp.inspectionId}`)!;
      for (let r = 0; r < REPEATS_PER_COMBINATION; r++) {
        const samples = generateSignalSamples(rngSignals, sensor, target);
        signals.push({
          signalId: `SIG-${insp.inspectionId.slice(4)}-${sensor.sensorId}-${r + 1}`,
          sensorId: sensor.sensorId,
          inspectionId: insp.inspectionId,
          repeatIndex: r + 1,
          samplingFrequencyMHz: sensor.samplingFrequencyMHz,
          durationUs: sensor.acquisitionDurationUs,
          samples,
          generatedState: target.generatedState,
          provenance: 'SIMULATED',
        });
      }
    }
  }

  return {
    seed,
    generatedAt: new Date().toISOString(),
    structure: profile.structure,
    sensors: profile.sensors,
    damageStates: DAMAGE_STATES,
    inspections,
    signals,
    features: [], // populated by engine/features.ts
  };
}

// Backwards-compatible named exports (default RC beam asset), kept for any
// code that still imports the single-asset constants directly.
export const STRUCTURE: StructureConfig = RC_BEAM_PROFILE.structure;
export const SENSORS: SensorConfig[] = RC_BEAM_PROFILE.sensors;
