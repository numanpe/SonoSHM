import { useMemo, useState } from 'react';
import { ArrowRight, Waves, Radio } from 'lucide-react';
import { useApp } from '../state/store';
import { SectionHeader, Card, StatCard, ResearchLimitations, InfoNote, Pill } from '../components/common/Panels';
import { ProvenanceBadge, DamageStatePill } from '../components/common/Badge';
import { DigitalTwin3D, type TwinSensorDatum } from '../components/twin/DigitalTwin3D';
import { DigitalTwinFallback } from '../components/twin/DigitalTwinFallback';
import { TwinErrorBoundary } from '../components/twin/TwinErrorBoundary';
import { ImportedModelViewer, type ViewerSensor } from '../components/import/ImportedModelViewer';

const TABS = ['3D Digital Twin', 'Future Extensions'] as const;

function webglAvailable(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return !!(canvas.getContext('webgl') || canvas.getContext('experimental-webgl'));
  } catch {
    return false;
  }
}

export default function DigitalTwin() {
  const [tab, setTab] = useState<(typeof TABS)[number]>('3D Digital Twin');
  return (
    <div>
      <SectionHeader
        title="Structural Digital Twin"
        subtitle="A data-connected visualization of the structure, sensors, and current anomaly indicators — driven by the same underlying experiment data as the rest of the application. Switch the demonstration asset in the top bar to see the same generic pipeline applied to a different infrastructure type."
        right={<ProvenanceBadge kind="SIMULATED" />}
      />
      <div className="flex gap-1 mb-4 border-b border-slate-200">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`px-3 py-2 text-[13px] font-medium border-b-2 -mb-px transition-colors ${tab === t ? 'border-[#1d5b8f] text-[#1d5b8f]' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
            {t}
          </button>
        ))}
      </div>
      {tab === '3D Digital Twin' && <TwinMainTab />}
      {tab === 'Future Extensions' && <FutureExtensionsTab />}
    </div>
  );
}

function TwinMainTab() {
  const {
    dataset,
    anomalyResults,
    featuresAgg,
    selectedSensorId,
    setSelectedSensorId,
    selectedInspectionId,
    setSelectedInspectionId,
    diagnose,
    structureProfile,
    customModelGroup,
    liveActive,
    liveHasData,
    latestLiveValues,
    liveProvenance,
    liveMode,
  } = useApp();

  const hasWebgl = useMemo(() => webglAvailable(), []);
  const [use3D, setUse3D] = useState(hasWebgl);
  const [playToken, setPlayToken] = useState(0);
  const [hoveredSensorId, setHoveredSensorId] = useState<string | null>(null);
  const [useLive, setUseLive] = useState(false);
  const liveViewOn = useLive && liveHasData;

  const sensorData: TwinSensorDatum[] = dataset.sensors.map((sensor) => {
    const anomaly = anomalyResults.find((a) => a.sensorId === sensor.sensorId && a.inspectionId === selectedInspectionId);
    const featRec = featuresAgg.find((f) => f.sensorId === sensor.sensorId && f.inspectionId === selectedInspectionId);
    const liveValue = latestLiveValues[sensor.sensorId];
    const indicator = liveViewOn && liveValue !== undefined ? liveValue : (anomaly?.anomalyIndicator ?? 0);
    return {
      sensor,
      indicator,
      isSelected: sensor.sensorId === selectedSensorId,
      tofUs: featRec?.tofUs ?? 50,
    };
  });

  // Real imported IFC geometry is only available for the active 'custom'
  // asset, and only when it came from an IFC upload (not manual/point-cloud
  // placement, which has no mesh) — otherwise fall back to the generic
  // schematic twin like the three built-in demonstration assets.
  const useRealGeometry = structureProfile.kind === 'custom' && !!customModelGroup;
  const importedViewerSensors: ViewerSensor[] = useMemo(
    () =>
      dataset.sensors
        .filter((s) => !!s.position3D)
        .map((s) => {
          const datum = sensorData.find((d) => d.sensor.sensorId === s.sensorId);
          return {
            id: s.sensorId,
            label: s.label,
            position: s.position3D!,
            indicator: datum?.indicator ?? 0,
            isSelected: s.sensorId === selectedSensorId,
          };
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dataset.sensors, sensorData, selectedSensorId]
  );

  const hoveredRec = hoveredSensorId
    ? { rec: featuresAgg.find((f) => f.sensorId === hoveredSensorId && f.inspectionId === selectedInspectionId), anomaly: anomalyResults.find((a) => a.sensorId === hoveredSensorId && a.inspectionId === selectedInspectionId) }
    : null;

  const rec = featuresAgg.find((f) => f.sensorId === selectedSensorId && f.inspectionId === selectedInspectionId);
  const anomaly = anomalyResults.find((a) => a.sensorId === selectedSensorId && a.inspectionId === selectedInspectionId);
  const diagnosis = diagnose(selectedSensorId, selectedInspectionId);
  const sensor = dataset.sensors.find((s) => s.sensorId === selectedSensorId)!;
  const selectedLiveValue = latestLiveValues[selectedSensorId];
  const displayIndicator = liveViewOn && selectedLiveValue !== undefined ? selectedLiveValue : anomaly?.anomalyIndicator;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <label className="text-[11px] uppercase tracking-wide text-slate-500 font-medium mr-2">Inspection</label>
          <select value={selectedInspectionId} onChange={(e) => setSelectedInspectionId(e.target.value)} className="border border-slate-300 rounded-md px-2 py-1.5 text-[13px] font-mono-lab">
            {dataset.inspections.map((i) => (<option key={i.inspectionId} value={i.inspectionId}>{i.inspectionId}</option>))}
          </select>
        </div>
        <button
          onClick={() => setUseLive((v) => !v)}
          disabled={!liveHasData}
          title={
            !liveHasData
              ? 'Start or resume a feed on the Live Monitoring page first (Simulated Replay or a real connector) to enable this view.'
              : liveViewOn
              ? 'Showing the live feed from Live Monitoring instead of the selected inspection. Click to go back to inspection view.'
              : 'Show current marker colors from the live feed running on Live Monitoring instead of the selected inspection.'
          }
          className={`flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded border disabled:opacity-40 disabled:cursor-not-allowed ${
            liveViewOn ? 'border-[#1d5b8f]/40 bg-[#e6eef5] text-[#1d5b8f]' : 'border-slate-300 text-slate-600 hover:bg-slate-50'
          }`}
        >
          <Radio size={12} className={liveActive && liveHasData ? 'text-emerald-600' : ''} /> {liveViewOn ? 'Live' : 'Live view'}
        </button>
        {liveViewOn && (
          <span className={`text-[11px] rounded px-2 py-1 border ${liveMode === 'simulated' ? 'text-amber-700 bg-amber-50 border-amber-200' : 'text-emerald-700 bg-emerald-50 border-emerald-200'}`}>
            [{liveProvenance === 'DEMONSTRATION' ? 'SIMULATED REPLAY' : 'MEASURED'}] {liveActive ? '— feed running' : '— feed paused/disconnected, showing last value'}
          </span>
        )}
        {!hasWebgl && !useRealGeometry && (
          <span className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
            3D rendering unavailable — using lightweight structural visualization.
          </span>
        )}
        {hasWebgl && !useRealGeometry && (
          <button onClick={() => setUse3D((v) => !v)} className="text-[11px] px-2.5 py-1 rounded border border-slate-300 text-slate-600 hover:bg-slate-50">
            Switch to {use3D ? '2D' : '3D'} view
          </button>
        )}
        {useRealGeometry && (
          <span className="text-[11px] text-[#1d5b8f] bg-[#e6eef5] border border-[#1d5b8f]/30 rounded px-2 py-1">
            Rendering real imported IFC geometry
          </span>
        )}
        {use3D && hasWebgl && !useRealGeometry && (
          <button
            onClick={() => setPlayToken((v) => v + 1)}
            className="flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded border border-[#1d5b8f]/40 bg-[#e6eef5] text-[#1d5b8f] hover:bg-[#dbe7f2]"
            title="Animate a demonstration ultrasonic wave packet travelling from the excitation point to each sensor, timed by relative ToF"
          >
            <Waves size={13} /> Play Wave Propagation
          </button>
        )}
        {hoveredRec?.rec && (
          <span className="text-[11px] text-slate-500 font-mono-lab bg-slate-100 border border-slate-200 rounded px-2 py-1">
            {hoveredSensorId}: H2/H1 {hoveredRec.rec.H2H1.toFixed(3)} · Anomaly {hoveredRec.anomaly?.anomalyIndicator.toFixed(2)}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card title="Structural Component View" className="xl:col-span-2">
          {useRealGeometry ? (
            <TwinErrorBoundary
              fallback={
                <DigitalTwinFallback
                  sensorData={sensorData}
                  kind={structureProfile.kind}
                  spanMm={dataset.structure.spanMm}
                  damageLocationFraction={structureProfile.damageLocationFraction}
                  onSelectSensor={setSelectedSensorId}
                />
              }
            >
              <ImportedModelViewer
                modelGroup={customModelGroup}
                sensors={importedViewerSensors}
                damageMarker={null}
                onSelectSensor={setSelectedSensorId}
                onError={() => setUse3D(false)}
              />
            </TwinErrorBoundary>
          ) : use3D && hasWebgl ? (
            <TwinErrorBoundary
              fallback={
                <DigitalTwinFallback
                  sensorData={sensorData}
                  kind={structureProfile.kind}
                  spanMm={dataset.structure.spanMm}
                  damageLocationFraction={structureProfile.damageLocationFraction}
                  onSelectSensor={setSelectedSensorId}
                />
              }
            >
              <DigitalTwin3D
                sensorData={sensorData}
                kind={structureProfile.kind}
                spanMm={dataset.structure.spanMm}
                damageLocationFraction={structureProfile.damageLocationFraction}
                onSelectSensor={setSelectedSensorId}
                onHoverSensor={setHoveredSensorId}
                onError={() => setUse3D(false)}
                playToken={playToken}
              />
            </TwinErrorBoundary>
          ) : (
            <DigitalTwinFallback
              sensorData={sensorData}
              kind={structureProfile.kind}
              spanMm={dataset.structure.spanMm}
              damageLocationFraction={structureProfile.damageLocationFraction}
              onSelectSensor={setSelectedSensorId}
            />
          )}
          <p className="text-[11px] text-slate-400 mt-2">
            Click a sensor marker to inspect its data, or drag to orbit.{' '}
            {useRealGeometry
              ? 'This is the real imported IFC geometry, with sensors placed at their actual 3D positions.'
              : liveViewOn
              ? "Marker size and glow now track the live feed's current value for each sensor (from Live Monitoring) instead of the selected inspection; the damage graphic near the demonstration damage location grows with the same values."
              : 'Marker size and glow scale with the reference-free anomaly indicator at the selected inspection; the damage graphic near the demonstration damage location grows with the damage indicator of the nearest sensors — a schematic visual cue, not a measured defect.'}{' '}
            {structureProfile.damageNarrative}
          </p>
          <div className="flex items-center gap-3 mt-2 text-[11px]">
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-[#1f8a5f] inline-block" /> Normal</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-[#c9971e] inline-block" /> Potential anomaly</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-[#b5292f] inline-block" /> Requires inspection</span>
          </div>
        </Card>

        <Card title={`Sensor Detail — ${selectedSensorId}`}>
          {rec && anomaly && (
            <div className="space-y-2 text-[12px]">
              <div className="flex justify-between"><span className="text-slate-500">Location</span><span className="font-mono-lab">{sensor.label}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Inspection</span><span className="font-mono-lab">{selectedInspectionId}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">H2/H1</span><span className="font-mono-lab">{rec.H2H1.toFixed(4)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">β′</span><span className="font-mono-lab">{rec.betaPrime.toExponential(2)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">ToF</span><span className="font-mono-lab">{rec.tofUs.toFixed(1)} µs</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Δv/v₀</span><span className="font-mono-lab">{((rec.deltaVOverV0 ?? 0) * 100).toFixed(1)}%</span></div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">{liveViewOn ? 'Live Value' : 'Anomaly Indicator'}</span>
                <span className="font-mono-lab font-semibold">{(displayIndicator ?? anomaly.anomalyIndicator).toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Status</span>
                <Pill color={(displayIndicator ?? anomaly.anomalyIndicator) >= 0.55 ? 'red' : (displayIndicator ?? anomaly.anomalyIndicator) >= 0.3 ? 'amber' : 'green'}>
                  {liveViewOn ? ((displayIndicator ?? 0) >= 0.55 ? 'Requires inspection' : (displayIndicator ?? 0) >= 0.3 ? 'Potential anomaly' : 'Normal observation') : anomaly.status}
                </Pill>
              </div>
              {diagnosis && (
                <div className="flex justify-between items-center pt-2 border-t border-slate-100 mt-2">
                  <span className="text-slate-500">AI Diagnosis</span>
                  <DamageStatePill state={diagnosis.predictedState} />
                </div>
              )}
              <div className="pt-2 border-t border-slate-100 mt-2">
                <ProvenanceBadge kind={liveViewOn ? liveProvenance : 'SIMULATED'} />
              </div>
            </div>
          )}
        </Card>
      </div>

      <StatRow />

      <InfoNote>
        This digital twin reads directly from the same dataset, feature-extraction, anomaly-detection, and
        classification engines used elsewhere in the application — selecting a sensor here is equivalent to
        selecting it on the Nonlinear Features, AI Diagnosis, or Reference-Free Diagnostics pages.{' '}
        {liveHasData
          ? 'A feed is currently running on Live Monitoring — use the "Live view" toggle above to drive marker colors from it instead of a selected inspection.'
          : 'Start a feed on the Live Monitoring page (Simulated Replay or a real connector) to enable this page\'s "Live view" toggle.'}
      </InfoNote>
      <ResearchLimitations
        items={[
          'Sensor and structural geometry are simplified schematic representations per built-in demonstration asset (beam, deck, or pipeline); an imported IFC structure (see Import Structure) instead renders its real geometry, but sensor data for it is still [SIMULATED].',
          'Marker color, size, and the crack/patch graphic encode the demonstration anomaly/damage indicators only; none are a validated visualization of real physical damage location, geometry, or severity.',
          'The wave-propagation animation is a timing-scaled illustration of arrival order, not a physically simulated wave field.',
          'The 3D view falls back automatically to a 2D/SVG representation if WebGL is unavailable, blocked, or the render pipeline throws an error.',
          'Live view (when enabled) colors markers directly from Live Monitoring\'s raw feed values (jittered demonstration numbers in Simulated Replay mode, or whatever a connected real feed sends) using the same fixed 0.3/0.55 thresholds — it is not an independently recomputed anomaly score, and does not (yet) drive AI Diagnosis or Prognosis.',
        ]}
      />
    </div>
  );
}

function StatRow() {
  const { dataset, anomalyResults, selectedInspectionId, damageIndicatorMap } = useApp();
  const rows = dataset.sensors.map((s) => ({
    sensor: s.sensorId,
    indicator: (anomalyResults.find((a) => a.sensorId === s.sensorId && a.inspectionId === selectedInspectionId)?.anomalyIndicator ?? 0),
    damage: damageIndicatorMap.get(`${s.sensorId}__${selectedInspectionId}`) ?? 0,
  }));
  const worst = [...rows].sort((a, b) => b.indicator - a.indicator)[0];
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <StatCard label="Sensors Monitored" value={dataset.sensors.length} />
      <StatCard label="Highest Anomaly" value={worst.indicator.toFixed(2)} hint={worst.sensor} accent={worst.indicator >= 0.55 ? 'bad' : worst.indicator >= 0.3 ? 'warn' : 'good'} />
      <StatCard label="Current Inspection" value={selectedInspectionId} />
      <StatCard label="[SIMULATED] Localization" value="Demonstration" />
    </div>
  );
}

function FutureExtensionsTab() {
  return (
    <div className="space-y-4">
      <Card title="Future Multimodal SHM" right={<span className="text-[11px] px-2 py-0.5 rounded bg-slate-100 border border-slate-300 text-slate-600">Future Research Direction</span>}>
        <div className="flex flex-wrap items-center gap-2 text-[12px]">
          {['Ultrasonic Signals', 'Strain', 'Load', 'Environmental Conditions', 'Camera / UAV Inspection'].map((s, i, arr) => (
            <span key={s} className="flex items-center gap-2">
              <span className="px-3 py-2 rounded border border-slate-300 bg-slate-50">{s}</span>
              {i < arr.length - 1 && <span className="text-slate-300">+</span>}
            </span>
          ))}
          <ArrowRight size={14} className="text-slate-300" />
          <span className="px-3 py-2 rounded border border-[#1d5b8f]/40 bg-[#e6eef5] text-[#1d5b8f]">Multimodal AI</span>
          <ArrowRight size={14} className="text-slate-300" />
          <span className="px-3 py-2 rounded border border-[#1d5b8f]/40 bg-[#e6eef5] text-[#1d5b8f]">Structural Digital Twin</span>
        </div>
        <p className="text-[12px] text-slate-500 mt-2">Illustrates how this platform could later integrate additional sensing modalities and computer-vision expertise. Not implemented.</p>
      </Card>

      <Card title="Computer Vision Extension (Conceptual)" right={<span className="text-[11px] px-2 py-0.5 rounded bg-slate-100 border border-slate-300 text-slate-600">CONCEPTUAL</span>}>
        <div className="flex flex-wrap items-center gap-2 text-[12px]">
          <span className="px-3 py-2 rounded border border-slate-300 bg-slate-50">UAV / RGB / Thermal Images</span>
          <span className="text-slate-300">+</span>
          <span className="px-3 py-2 rounded border border-slate-300 bg-slate-50">Ultrasonic Evidence</span>
          <ArrowRight size={14} className="text-slate-300" />
          <span className="px-3 py-2 rounded border border-[#1d5b8f]/40 bg-[#e6eef5] text-[#1d5b8f]">Multimodal Structural Diagnosis</span>
        </div>
        <p className="text-[12px] text-slate-500 mt-2">No image-based computer vision is implemented in this prototype — this module is a placeholder for future integration only.</p>
      </Card>

      <Card title="Physics-Informed AI (Conceptual)" right={<span className="text-[11px] px-2 py-0.5 rounded bg-slate-100 border border-slate-300 text-slate-600">Future Research Direction</span>}>
        <div className="flex flex-wrap items-center gap-2 text-[12px]">
          {['Ultrasonic Physics', 'Experimental Data', 'Nonlinear Features'].map((s, i, arr) => (
            <span key={s} className="flex items-center gap-2">
              <span className="px-3 py-2 rounded border border-slate-300 bg-slate-50">{s}</span>
              {i < arr.length - 1 && <span className="text-slate-300">+</span>}
            </span>
          ))}
          <ArrowRight size={14} className="text-slate-300" />
          <span className="px-3 py-2 rounded border border-slate-300 bg-slate-50">Machine Learning</span>
          <ArrowRight size={14} className="text-slate-300" />
          <span className="px-3 py-2 rounded border border-[#1d5b8f]/40 bg-[#e6eef5] text-[#1d5b8f]">Physics-Aware Damage Diagnosis</span>
        </div>
      </Card>

      <Card title="BIM / Digital Twin Extension (Conceptual)" right={<span className="text-[11px] px-2 py-0.5 rounded bg-slate-100 border border-slate-300 text-slate-600">Future Research Direction</span>}>
        <div className="flex flex-wrap items-center gap-2 text-[12px]">
          {['Structural / BIM Model', 'Sensor Mapping', 'Ultrasonic Data', 'Damage State', 'Digital Twin'].map((s, i, arr) => (
            <span key={s} className="flex items-center gap-2">
              <span className="px-3 py-2 rounded border border-slate-300 bg-slate-50">{s}</span>
              {i < arr.length - 1 && <ArrowRight size={14} className="text-slate-300" />}
            </span>
          ))}
        </div>
        <p className="text-[12px] text-slate-500 mt-2">Potential future formats: IFC, Revit, point clouds, mesh models. Not implemented in this prototype.</p>
      </Card>

      <Card title="Future Closed-Loop SHM" right={<span className="text-[11px] px-2 py-0.5 rounded bg-slate-100 border border-slate-300 text-slate-600">Future Research Direction</span>}>
        <div className="flex flex-wrap items-center gap-2 text-[12px]">
          {['Observe', 'Analyse', 'Diagnose', 'Track', 'Recommend', 'Inspect Again'].map((s, i, arr) => (
            <span key={s} className="flex items-center gap-2">
              <span className="px-3 py-2 rounded border border-slate-300 bg-slate-50">{s}</span>
              {i < arr.length - 1 && <ArrowRight size={14} className="text-slate-300" />}
            </span>
          ))}
        </div>
        <p className="text-[12px] text-slate-500 mt-2">This prototype does not implement or claim autonomous structural monitoring.</p>
      </Card>
    </div>
  );
}
