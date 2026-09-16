import React, { createContext, useContext, useMemo, useState, useCallback, useEffect, useRef } from 'react';
import type * as THREE from 'three';
import { DEFAULT_SEED } from '../data/rng';
import {
  generateDataset,
  DAMAGE_STATE_ORDER,
  STRUCTURE_PROFILES,
  STRUCTURE_PROFILE_LIST,
  DEFAULT_STRUCTURE_ID,
  type StructureProfile,
  type StructureKind,
} from '../data/syntheticData';
import type { DamageStateId, DatasetBundle, FeatureRecord, SignalRecord } from '../data/types';
import { aggregateBySensorInspection, extractAllFeatures } from '../engine/features';
import { computeAnomalyIndicators, computeDatasetRanges, computeDamageIndicator } from '../engine/indicators';
import { evaluateModel, trainTestSplit, MODEL_PRESETS, permutationImportance, knnPredict, type KnnModel, type FeatureKey } from '../engine/ml';
import { fitLinearTrend } from '../engine/prognosis';
import type { ClassifierMetrics, FeatureImportanceEntry, AnomalyResult, DiagnosisResult } from '../data/types';

export interface ModelEvaluationBundle {
  presetId: string;
  label: string;
  featureKeys: FeatureKey[];
  metrics: ClassifierMetrics;
  featureImportance: FeatureImportanceEntry[];
  model: KnnModel;
}

export type LiveConnectionStatus = 'idle' | 'connecting' | 'connected' | 'error' | 'closed';
export type LiveProtocol = 'websocket' | 'rest';
export interface LiveSample {
  t: number;
  [sensorId: string]: number;
}
const MAX_LIVE_POINTS = 40;

export interface AssetPortfolioSummary {
  profileId: string;
  shortLabel: string;
  kind: StructureKind;
  componentType: string;
  latestInspectionId: string;
  latestIndicator: number;
  worstSensorId: string;
  trendSlope: number;
}

interface AppStateValue {
  seed: number;
  structureId: string;
  setStructureId: (id: string) => void;
  structureProfile: StructureProfile;
  structureProfileList: StructureProfile[];
  customProfile: StructureProfile | null;
  /** Real imported IFC geometry (three.js Group) for the current custom
   * asset, when it came from an IFC upload rather than manual/point-cloud
   * placement. Null when there is no real geometry to render — the Digital
   * Twin then falls back to the generic procedural 'custom' schematic. */
  customModelGroup: THREE.Group | null;
  /** Registers (or replaces) a user-imported structure — from IFC import or
   * manual/point-cloud sensor placement — and switches to it. There is at
   * most one custom asset at a time in this demonstration. Pass the parsed
   * IFC model group when available so the Digital Twin can render the real
   * geometry instead of the generic schematic fallback. */
  importCustomProfile: (profile: StructureProfile, modelGroup?: THREE.Group | null) => void;
  portfolio: AssetPortfolioSummary[];
  dataset: DatasetBundle;
  featuresAll: FeatureRecord[];
  featuresAgg: FeatureRecord[];
  baselineInspectionId: string;
  anomalyResults: AnomalyResult[];
  modelEvaluations: ModelEvaluationBundle[];
  primaryModel: ModelEvaluationBundle;
  diagnose: (sensorId: string, inspectionId: string) => DiagnosisResult | null;
  damageIndicatorMap: Map<string, number>; // key sensorId__inspectionId -> 0..1
  extraSignals: SignalRecord[];
  extraFeatures: FeatureRecord[];

  selectedSensorId: string;
  setSelectedSensorId: (id: string) => void;
  selectedInspectionId: string;
  setSelectedInspectionId: (id: string) => void;
  selectedDamageState: DamageStateId;
  setSelectedDamageState: (s: DamageStateId) => void;
  useHannWindow: boolean;
  setUseHannWindow: (v: boolean) => void;

  resetDataset: () => void;
  addImportedSignal: (s: SignalRecord) => void;
  addImportedFeatures: (f: FeatureRecord[]) => void;

  findRepresentativeSignal: (sensorId: string, state: DamageStateId) => { signal: SignalRecord; exact: boolean } | null;

  // --- Live-data feed (runs at the provider level, not tied to whichever
  // page happens to be mounted, so a feed started on Live Monitoring keeps
  // ticking — and can drive the Digital Twin's "Live" view — even while the
  // user is looking at a different page). See Live Monitoring's own
  // limitations for what this is and isn't.
  liveMode: 'simulated' | 'connector';
  setLiveMode: (m: 'simulated' | 'connector') => void;
  liveSimulating: boolean;
  setLiveSimulating: (v: boolean | ((prev: boolean) => boolean)) => void;
  liveSamples: LiveSample[];
  liveChartKeys: string[];
  latestLiveValues: Record<string, number>;
  liveHasData: boolean;
  liveActive: boolean;
  liveProvenance: 'DEMONSTRATION' | 'MEASURED';
  liveProtocol: LiveProtocol;
  setLiveProtocol: (p: LiveProtocol) => void;
  liveUrl: string;
  setLiveUrl: (u: string) => void;
  livePollMs: number;
  setLivePollMs: (n: number) => void;
  liveStatus: LiveConnectionStatus;
  liveStatusMessage: string;
  liveMessageCount: number;
  connectLive: () => void;
  disconnectLive: () => void;
}

const AppStateContext = createContext<AppStateValue | null>(null);

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const [seed, setSeed] = useState(DEFAULT_SEED);
  const [datasetVersion, setDatasetVersion] = useState(0);
  const [structureId, setStructureId] = useState(DEFAULT_STRUCTURE_ID);
  const [customProfile, setCustomProfile] = useState<StructureProfile | null>(null);
  const [customModelGroup, setCustomModelGroup] = useState<THREE.Group | null>(null);
  const [extraSignals, setExtraSignals] = useState<SignalRecord[]>([]);
  const [extraFeatures, setExtraFeatures] = useState<FeatureRecord[]>([]);

  const allProfiles = useMemo(
    () => (customProfile ? [...STRUCTURE_PROFILE_LIST, customProfile] : STRUCTURE_PROFILE_LIST),
    [customProfile]
  );
  const profileById = useCallback(
    (id: string): StructureProfile | undefined =>
      STRUCTURE_PROFILES[id] ?? (customProfile && customProfile.id === id ? customProfile : undefined),
    [customProfile]
  );

  const structureProfile = profileById(structureId) ?? allProfiles[0];
  const dataset = useMemo(
    () => generateDataset(structureId, seed, customProfile && customProfile.id === structureId ? customProfile : undefined),
    [structureId, seed, datasetVersion, customProfile]
  );

  /** Cross-asset "system-level" rollup: runs the same signal -> feature ->
   * indicator pipeline independently across every demonstration asset
   * (diverse infrastructure types), so system-level prognostics is shown
   * across assets, not only across sensor groups within one specimen. */
  const portfolio = useMemo<AssetPortfolioSummary[]>(() => {
    return allProfiles.map((profile) => {
      const ds = generateDataset(profile.id, seed, profile.kind === 'custom' ? profile : undefined);
      const feats = extractAllFeatures(ds);
      const agg = aggregateBySensorInspection(feats);
      const ranges = computeDatasetRanges(agg);
      const inspectionsSorted = [...ds.inspections].sort((a, b) => a.index - b.index);
      const latest = inspectionsSorted[inspectionsSorted.length - 1];

      let worstSensorId = profile.sensors[0]?.sensorId ?? '';
      let worstIndicator = -1;
      for (const sensor of profile.sensors) {
        const rec = agg.find((f) => f.sensorId === sensor.sensorId && f.inspectionId === latest.inspectionId);
        if (rec) {
          const ind = computeDamageIndicator(rec, ranges);
          if (ind > worstIndicator) {
            worstIndicator = ind;
            worstSensorId = sensor.sensorId;
          }
        }
      }
      const series = inspectionsSorted.map((insp) => {
        const rec = agg.find((f) => f.sensorId === worstSensorId && f.inspectionId === insp.inspectionId);
        return rec ? computeDamageIndicator(rec, ranges) : 0;
      });
      const trend = fitLinearTrend(inspectionsSorted.map((i) => i.index), series);

      return {
        profileId: profile.id,
        shortLabel: profile.shortLabel,
        kind: profile.kind,
        componentType: profile.structure.componentType,
        latestInspectionId: latest.inspectionId,
        latestIndicator: Math.max(0, worstIndicator),
        worstSensorId,
        trendSlope: trend.slope,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed, datasetVersion, allProfiles]);

  const featuresAll = useMemo(() => extractAllFeatures(dataset), [dataset]);
  const featuresAgg = useMemo(() => aggregateBySensorInspection(featuresAll), [featuresAll]);

  const baselineInspectionId = useMemo(
    () => [...dataset.inspections].sort((a, b) => a.index - b.index)[0]?.inspectionId ?? '',
    [dataset]
  );

  const anomalyResults = useMemo(
    () => computeAnomalyIndicators(featuresAgg, baselineInspectionId),
    [featuresAgg, baselineInspectionId]
  );

  const damageIndicatorMap = useMemo(() => {
    const ranges = computeDatasetRanges(featuresAgg);
    const map = new Map<string, number>();
    for (const f of featuresAgg) {
      map.set(`${f.sensorId}__${f.inspectionId}`, computeDamageIndicator(f, ranges));
    }
    return map;
  }, [featuresAgg]);

  // --- Live-data feed state, lifted to provider level (see AppStateValue
  // for why: it must keep running independent of which page is mounted). ---
  const [liveMode, setLiveMode] = useState<'simulated' | 'connector'>('simulated');
  const [liveSimulating, setLiveSimulating] = useState(true);
  const [liveSamples, setLiveSamples] = useState<LiveSample[]>([]);
  const liveTickRef = useRef(0);

  const [liveProtocol, setLiveProtocol] = useState<LiveProtocol>('websocket');
  const [liveUrl, setLiveUrl] = useState('');
  const [livePollMs, setLivePollMs] = useState(2000);
  const [liveStatus, setLiveStatus] = useState<LiveConnectionStatus>('idle');
  const [liveStatusMessage, setLiveStatusMessage] = useState('Not connected.');
  const [liveMessageCount, setLiveMessageCount] = useState(0);
  const liveWsRef = useRef<WebSocket | null>(null);
  const livePollRef = useRef<number | null>(null);

  const latestInspectionId = useMemo(
    () => [...dataset.inspections].sort((a, b) => b.index - a.index)[0]?.inspectionId ?? '',
    [dataset]
  );

  // Simulated replay: perturbs the already-computed demonstration damage
  // indicators with small jitter every tick, so the feed looks and behaves
  // like a live signal while remaining honestly a replay of existing
  // synthetic numbers, not a new physically simulated signal.
  useEffect(() => {
    if (liveMode !== 'simulated' || !liveSimulating) return;
    const interval = window.setInterval(() => {
      liveTickRef.current += 1;
      const row: LiveSample = { t: liveTickRef.current };
      for (const s of dataset.sensors) {
        const base = damageIndicatorMap.get(`${s.sensorId}__${latestInspectionId}`) ?? 0;
        const jitter = (Math.random() - 0.5) * 0.045;
        row[s.sensorId] = Math.max(0, Math.min(1.3, base + jitter));
      }
      setLiveSamples((prev) => [...prev.slice(-(MAX_LIVE_POINTS - 1)), row]);
    }, 1100);
    return () => window.clearInterval(interval);
  }, [liveMode, liveSimulating, dataset, damageIndicatorMap, latestInspectionId]);

  // reset the rolling feed when switching assets or modes
  useEffect(() => {
    setLiveSamples([]);
    liveTickRef.current = 0;
  }, [dataset.structure.structureId, liveMode]);

  const ingestLiveMessage = useCallback((raw: unknown) => {
    const items = Array.isArray(raw) ? raw : [raw];
    liveTickRef.current += 1;
    const row: LiveSample = { t: liveTickRef.current };
    let any = false;
    for (const item of items) {
      if (item && typeof item === 'object' && 'sensorId' in item && 'value' in item) {
        const rec = item as { sensorId: string; value: number };
        if (typeof rec.value === 'number') {
          row[rec.sensorId] = rec.value;
          any = true;
        }
      }
    }
    if (any) {
      setLiveMessageCount((c) => c + 1);
      setLiveSamples((prev) => [...prev.slice(-(MAX_LIVE_POINTS - 1)), row]);
    }
  }, []);

  const connectLive = useCallback(() => {
    if (!liveUrl.trim()) {
      setLiveStatus('error');
      setLiveStatusMessage('Enter an endpoint URL first.');
      return;
    }
    setLiveStatus('connecting');
    setLiveStatusMessage('Connecting…');
    setLiveMessageCount(0);
    setLiveSamples([]);
    liveTickRef.current = 0;

    if (liveProtocol === 'websocket') {
      try {
        const ws = new WebSocket(liveUrl.trim());
        liveWsRef.current = ws;
        ws.onopen = () => { setLiveStatus('connected'); setLiveStatusMessage('Connected — waiting for messages.'); };
        ws.onmessage = (ev) => {
          try { ingestLiveMessage(JSON.parse(ev.data)); } catch { /* ignore malformed message */ }
        };
        ws.onerror = () => { setLiveStatus('error'); setLiveStatusMessage('WebSocket error — check the URL, and that the server allows this origin.'); };
        ws.onclose = () => { setLiveStatus((s) => (s === 'error' ? s : 'closed')); setLiveStatusMessage((m) => (m.includes('error') ? m : 'Connection closed.')); };
      } catch (e) {
        setLiveStatus('error');
        setLiveStatusMessage(e instanceof Error ? e.message : 'Failed to open WebSocket.');
      }
    } else {
      const poll = async () => {
        try {
          const res = await fetch(liveUrl.trim(), { cache: 'no-store' });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const json = await res.json();
          ingestLiveMessage(json);
          setLiveStatus('connected');
          setLiveStatusMessage(`Connected — polling every ${livePollMs} ms.`);
        } catch (e) {
          setLiveStatus('error');
          setLiveStatusMessage(e instanceof Error ? e.message : 'Polling failed.');
        }
      };
      poll();
      livePollRef.current = window.setInterval(poll, Math.max(500, livePollMs));
    }
  }, [liveUrl, liveProtocol, livePollMs, ingestLiveMessage]);

  const disconnectLive = useCallback(() => {
    liveWsRef.current?.close();
    liveWsRef.current = null;
    if (livePollRef.current) window.clearInterval(livePollRef.current);
    livePollRef.current = null;
    setLiveStatus('idle');
    setLiveStatusMessage('Not connected.');
  }, []);

  useEffect(() => () => {
    liveWsRef.current?.close();
    if (livePollRef.current) window.clearInterval(livePollRef.current);
  }, []);

  const liveChartKeys = liveMode === 'simulated'
    ? dataset.sensors.map((s) => s.sensorId)
    : Array.from(new Set(liveSamples.flatMap((s) => Object.keys(s).filter((k) => k !== 't'))));

  const latestLiveValues = useMemo(() => {
    const last = liveSamples[liveSamples.length - 1];
    const out: Record<string, number> = {};
    if (!last) return out;
    for (const k of Object.keys(last)) if (k !== 't') out[k] = last[k];
    return out;
  }, [liveSamples]);

  const liveHasData = liveSamples.length > 0;
  const liveActive = liveMode === 'simulated' ? liveSimulating : liveStatus === 'connected';
  const liveProvenance: 'DEMONSTRATION' | 'MEASURED' = liveMode === 'simulated' ? 'DEMONSTRATION' : 'MEASURED';

  const modelEvaluations = useMemo<ModelEvaluationBundle[]>(() => {
    const { train, test } = trainTestSplit(featuresAll, seed + 99, 0.3);
    return MODEL_PRESETS.map((preset) => {
      const { metrics, model } = evaluateModel(train, test, preset.features, 5);
      const featureImportance = permutationImportance(model, test, preset.features, seed + 5);
      return { presetId: preset.id, label: preset.label, featureKeys: preset.features, metrics, featureImportance, model };
    });
  }, [featuresAll, seed]);

  const primaryModel = modelEvaluations[modelEvaluations.length - 1];

  const diagnose = useCallback(
    (sensorId: string, inspectionId: string): DiagnosisResult | null => {
      const rec = featuresAgg.find((f) => f.sensorId === sensorId && f.inspectionId === inspectionId);
      if (!rec || !primaryModel) return null;
      const { label, probabilities } = knnPredict(primaryModel.model, rec);
      return { sensorId, inspectionId, predictedState: label, probabilities, modelId: primaryModel.label };
    },
    [featuresAgg, primaryModel]
  );

  function defaultSensorFor(profile: StructureProfile): string {
    let best = profile.sensors[0]?.sensorId ?? '';
    let bestDist = Infinity;
    for (const s of profile.sensors) {
      const d = Math.abs(s.positionFraction - profile.damageLocationFraction);
      if (d < bestDist) {
        bestDist = d;
        best = s.sensorId;
      }
    }
    return best;
  }

  const [selectedSensorId, setSelectedSensorId] = useState(defaultSensorFor(structureProfile));
  const [selectedInspectionId, setSelectedInspectionId] = useState(
    dataset.inspections[dataset.inspections.length - 1]?.inspectionId ?? 'INS-005'
  );
  const [selectedDamageState, setSelectedDamageState] = useState<DamageStateId>('severe');
  const [useHannWindow, setUseHannWindow] = useState(true);

  // Sensor IDs differ between demonstration assets (S0x / D0x / P0x) — snap
  // the selection to a sensible default whenever the active structure changes.
  useEffect(() => {
    if (!dataset.sensors.some((s) => s.sensorId === selectedSensorId)) {
      setSelectedSensorId(defaultSensorFor(structureProfile));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [structureId, dataset]);

  const setStructureIdSafe = useCallback(
    (id: string) => {
      setStructureId(id);
      const profile = profileById(id);
      if (profile) setSelectedSensorId(defaultSensorFor(profile));
    },
    [profileById]
  );

  const importCustomProfile = useCallback(
    (profile: StructureProfile, modelGroup?: THREE.Group | null) => {
      setCustomProfile(profile);
      setCustomModelGroup(modelGroup ?? null);
      setStructureId(profile.id);
      setSelectedSensorId(defaultSensorFor(profile));
    },
    []
  );

  const resetDataset = useCallback(() => {
    setSeed(DEFAULT_SEED);
    setDatasetVersion((v) => v + 1);
    setExtraSignals([]);
    setExtraFeatures([]);
  }, []);

  const addImportedSignal = useCallback((s: SignalRecord) => setExtraSignals((prev) => [...prev, s]), []);
  const addImportedFeatures = useCallback((f: FeatureRecord[]) => setExtraFeatures((prev) => [...prev, ...f]), []);

  const findRepresentativeSignal = useCallback(
    (sensorId: string, state: DamageStateId) => {
      const sensorSignals = dataset.signals.filter((s) => s.sensorId === sensorId && s.repeatIndex === 1);
      let match = sensorSignals.find((s) => s.generatedState === state);
      if (match) return { signal: match, exact: true };
      // fall back to nearest severity available for this sensor
      const order = DAMAGE_STATE_ORDER;
      const targetIdx = order.indexOf(state);
      let best: SignalRecord | null = null;
      let bestDist = Infinity;
      for (const s of sensorSignals) {
        const d = Math.abs(order.indexOf(s.generatedState) - targetIdx);
        if (d < bestDist) {
          bestDist = d;
          best = s;
        }
      }
      return best ? { signal: best, exact: false } : null;
    },
    [dataset]
  );

  const value: AppStateValue = {
    seed,
    structureId,
    setStructureId: setStructureIdSafe,
    structureProfile,
    structureProfileList: allProfiles,
    customProfile,
    customModelGroup,
    importCustomProfile,
    portfolio,
    dataset,
    featuresAll,
    featuresAgg,
    baselineInspectionId,
    anomalyResults,
    modelEvaluations,
    primaryModel,
    diagnose,
    damageIndicatorMap,
    extraSignals,
    extraFeatures,
    selectedSensorId,
    setSelectedSensorId,
    selectedInspectionId,
    setSelectedInspectionId,
    selectedDamageState,
    setSelectedDamageState,
    useHannWindow,
    setUseHannWindow,
    resetDataset,
    addImportedSignal,
    addImportedFeatures,
    findRepresentativeSignal,
    liveMode,
    setLiveMode,
    liveSimulating,
    setLiveSimulating,
    liveSamples,
    liveChartKeys,
    latestLiveValues,
    liveHasData,
    liveActive,
    liveProvenance,
    liveProtocol,
    setLiveProtocol,
    liveUrl,
    setLiveUrl,
    livePollMs,
    setLivePollMs,
    liveStatus,
    liveStatusMessage,
    liveMessageCount,
    connectLive,
    disconnectLive,
  };

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useApp(): AppStateValue {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error('useApp must be used within AppStateProvider');
  return ctx;
}
