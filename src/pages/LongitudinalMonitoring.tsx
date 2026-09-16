import { useMemo, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip as RTooltip, CartesianGrid, ReferenceLine } from 'recharts';
import { AlertTriangle } from 'lucide-react';
import { useApp } from '../state/store';
import { SectionHeader, Card, ResearchLimitations, InfoNote } from '../components/common/Panels';
import { ProvenanceBadge } from '../components/common/Badge';
import { computeIMRChart, WESTERN_ELECTRIC_RULES, type IMRChartResult } from '../engine/controlChart';
import { computeDamageIndicator, computeDatasetRanges } from '../engine/indicators';
import type { FeatureRecord } from '../data/types';

const FEATURE_OPTIONS = [
  { key: 'H2H1', label: 'H2/H1' },
  { key: 'H3H1', label: 'H3/H1' },
  { key: 'betaPrime', label: 'β′' },
  { key: 'attenuationIndicator', label: 'Attenuation Indicator' },
  { key: 'energy', label: 'Signal Energy' },
  { key: 'tofUs', label: 'ToF (µs)' },
  { key: 'velocityMs', label: 'Wave Velocity (m/s)' },
  { key: 'deltaVOverV0', label: 'Δv/v₀' },
] as const;

const CONTROL_CHART_METRIC_OPTIONS = [
  { key: 'damageIndicator', label: 'Composite Damage Indicator' },
  ...FEATURE_OPTIONS,
] as const;

export default function LongitudinalMonitoring() {
  const {
    dataset, featuresAll, featuresAgg, anomalyResults, damageIndicatorMap,
    baselineInspectionId, selectedSensorId, setSelectedSensorId, selectedInspectionId, setSelectedInspectionId,
  } = useApp();
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>(['H2H1', 'attenuationIndicator', 'deltaVOverV0']);
  const [controlMetric, setControlMetric] = useState<string>('damageIndicator');

  const inspections = useMemo(() => [...dataset.inspections].sort((a, b) => a.index - b.index), [dataset]);

  const ranges = useMemo(() => computeDatasetRanges(featuresAgg), [featuresAgg]);
  const metricOf = (rec: FeatureRecord): number =>
    controlMetric === 'damageIndicator'
      ? computeDamageIndicator(rec, ranges)
      : ((rec as unknown as Record<string, number>)[controlMetric] as number);

  const controlChart: IMRChartResult | null = useMemo(() => {
    const baselineRaw = featuresAll
      .filter((f) => f.sensorId === selectedSensorId && f.inspectionId === baselineInspectionId)
      .sort((a, b) => a.repeatIndex - b.repeatIndex)
      .map(metricOf)
      .filter((v) => Number.isFinite(v));

    const seriesLabels = inspections.map((i) => i.inspectionId.replace('INS-', ''));
    const seriesValues = inspections.map((insp) => {
      const rec = featuresAgg.find((f) => f.sensorId === selectedSensorId && f.inspectionId === insp.inspectionId);
      return rec ? metricOf(rec) : null;
    });

    return computeIMRChart(baselineRaw, seriesLabels, seriesValues);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [featuresAll, featuresAgg, inspections, selectedSensorId, baselineInspectionId, controlMetric, ranges]);

  const series = useMemo(
    () =>
      inspections.map((insp) => {
        const rec = featuresAgg.find((f) => f.sensorId === selectedSensorId && f.inspectionId === insp.inspectionId);
        const anomaly = anomalyResults.find((a) => a.sensorId === selectedSensorId && a.inspectionId === insp.inspectionId);
        const indicator = damageIndicatorMap.get(`${selectedSensorId}__${insp.inspectionId}`);
        return { insp, rec, anomaly, indicator };
      }),
    [inspections, featuresAgg, anomalyResults, damageIndicatorMap, selectedSensorId]
  );

  const toggleFeature = (key: string) => {
    setSelectedFeatures((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  };

  return (
    <div>
      <SectionHeader
        title="Longitudinal Monitoring"
        subtitle="Track nonlinear features, wave-propagation metrics, and demonstration indicators across the inspection sequence for a selected sensor."
        right={<ProvenanceBadge kind="SIMULATED" />}
      />

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div>
          <label className="text-[11px] uppercase tracking-wide text-slate-500 font-medium mr-2">Sensor</label>
          <select value={selectedSensorId} onChange={(e) => setSelectedSensorId(e.target.value)} className="border border-slate-300 rounded-md px-2 py-1.5 text-[13px] font-mono-lab">
            {dataset.sensors.map((s) => (<option key={s.sensorId} value={s.sensorId}>{s.sensorId}</option>))}
          </select>
        </div>
      </div>

      <Card title="Inspection History" className="mb-4">
        <div className="flex flex-wrap items-center gap-2">
          {inspections.map((insp, i) => (
            <div key={insp.inspectionId} className="flex items-center gap-2">
              <button
                onClick={() => setSelectedInspectionId(insp.inspectionId)}
                className={`px-3 py-2 rounded-md border text-[12px] font-mono-lab transition-colors ${
                  selectedInspectionId === insp.inspectionId ? 'border-[#1d5b8f] bg-[#e6eef5] text-[#1d5b8f] font-semibold' : 'border-slate-300 text-slate-600 hover:bg-slate-50'
                }`}
              >
                {insp.inspectionId}
                <div className="text-[9px] text-slate-400 font-sans">{insp.isoDate}</div>
              </button>
              {i < inspections.length - 1 && <span className="text-slate-300">→</span>}
            </div>
          ))}
        </div>
        <p className="text-[11px] text-slate-400 mt-2">
          Selecting an inspection updates the waveform, FFT, nonlinear features, ToF/velocity, anomaly indicator, and
          digital twin throughout the application.
        </p>
      </Card>

      <Card title="Select Features to Track" className="mb-4">
        <div className="flex flex-wrap gap-2">
          {FEATURE_OPTIONS.map((f) => (
            <button
              key={f.key}
              onClick={() => toggleFeature(f.key)}
              className={`px-3 py-1.5 rounded-full text-[12px] font-medium border transition-colors ${
                selectedFeatures.includes(f.key) ? 'border-[#1d5b8f] bg-[#e6eef5] text-[#1d5b8f]' : 'border-slate-300 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        {FEATURE_OPTIONS.filter((f) => selectedFeatures.includes(f.key)).map((f) => {
          const chartData = series.map((s) => ({
            insp: s.insp.inspectionId.replace('INS-', ''),
            value: s.rec ? Number((s.rec as unknown as Record<string, number>)[f.key]?.toFixed?.(5) ?? (s.rec as unknown as Record<string, number>)[f.key]) : null,
          }));
          return (
            <Card key={f.key} title={f.label}>
              <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 4, right: 8, left: -10, bottom: 4 }}>
                    <CartesianGrid stroke="#eef1f5" />
                    <XAxis dataKey="insp" tick={{ fontSize: 10 }} stroke="#94a3b8" />
                    <YAxis tick={{ fontSize: 10 }} stroke="#94a3b8" />
                    <RTooltip contentStyle={{ fontSize: 11 }} />
                    <Line type="monotone" dataKey="value" stroke="#1d5b8f" strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>
          );
        })}
      </div>

      <Card title="Anomaly Indicator & Damage Indicator Trend" className="mb-4">
        <div className="h-44">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={series.map((s) => ({ insp: s.insp.inspectionId.replace('INS-', ''), anomaly: s.anomaly ? Number(s.anomaly.anomalyIndicator.toFixed(3)) : null, indicator: s.indicator !== undefined ? Number(s.indicator.toFixed(3)) : null }))}
              margin={{ top: 4, right: 8, left: -10, bottom: 4 }}
            >
              <CartesianGrid stroke="#eef1f5" />
              <XAxis dataKey="insp" tick={{ fontSize: 10 }} stroke="#94a3b8" />
              <YAxis tick={{ fontSize: 10 }} stroke="#94a3b8" domain={[0, 1]} />
              <RTooltip contentStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="anomaly" name="Anomaly Indicator" stroke="#b5292f" strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
              <Line type="monotone" dataKey="indicator" name="Damage Indicator" stroke="#1d5b8f" strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card
        title="I-MR Control Chart"
        className="mb-4"
        right={<span className="text-[11px] text-slate-400">Shewhart individuals chart, baseline from {baselineInspectionId} repeat acquisitions</span>}
      >
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <label className="text-[11px] uppercase tracking-wide text-slate-500 font-medium mr-1">Metric</label>
          {CONTROL_CHART_METRIC_OPTIONS.map((f) => (
            <button
              key={f.key}
              onClick={() => setControlMetric(f.key)}
              className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors ${
                controlMetric === f.key ? 'border-[#1d5b8f] bg-[#e6eef5] text-[#1d5b8f]' : 'border-slate-300 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {controlChart ? (
          <>
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={controlChart.points.map((p) => ({ insp: p.x, value: p.value, outOfControl: p.outOfControl }))}
                  margin={{ top: 8, right: 16, left: -10, bottom: 4 }}
                >
                  <CartesianGrid stroke="#eef1f5" />
                  <XAxis dataKey="insp" tick={{ fontSize: 10 }} stroke="#94a3b8" />
                  <YAxis tick={{ fontSize: 10 }} stroke="#94a3b8" domain={['auto', 'auto']} />
                  <RTooltip contentStyle={{ fontSize: 11 }} labelFormatter={(l) => `INS-${l}`} />
                  <ReferenceLine y={controlChart.centerLine} stroke="#1d5b8f" strokeDasharray="4 2" label={{ value: 'CL', position: 'insideTopLeft', fontSize: 10, fill: '#1d5b8f' }} />
                  <ReferenceLine y={controlChart.ucl} stroke="#b5292f" strokeDasharray="3 3" label={{ value: 'UCL (+3σ)', position: 'insideTopLeft', fontSize: 10, fill: '#b5292f' }} />
                  <ReferenceLine y={controlChart.lcl} stroke="#b5292f" strokeDasharray="3 3" label={{ value: 'LCL (-3σ)', position: 'insideBottomLeft', fontSize: 10, fill: '#b5292f' }} />
                  <Line
                    type="monotone"
                    dataKey="value"
                    name={CONTROL_CHART_METRIC_OPTIONS.find((f) => f.key === controlMetric)?.label ?? 'value'}
                    stroke="#1d5b8f"
                    strokeWidth={2}
                    isAnimationActive={false}
                    connectNulls
                    dot={(dotProps: { cx?: number; cy?: number; index?: number; payload?: { outOfControl?: boolean; value?: number | null } }) => {
                      const { cx, cy, index, payload } = dotProps;
                      if (cx === undefined || cy === undefined || payload?.value == null) return <g key={`dot-${index}`} />;
                      return (
                        <circle
                          key={`dot-${index}`}
                          cx={cx}
                          cy={cy}
                          r={payload.outOfControl ? 5 : 3}
                          fill={payload.outOfControl ? '#b5292f' : '#1d5b8f'}
                          stroke={payload.outOfControl ? '#7a1c1f' : 'none'}
                          strokeWidth={payload.outOfControl ? 1.5 : 0}
                        />
                      );
                    }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mt-2 text-[11px] font-mono-lab">
              <div className="border border-slate-200 rounded px-2 py-1.5"><div className="text-slate-400">Center Line</div>{controlChart.centerLine.toFixed(4)}</div>
              <div className="border border-slate-200 rounded px-2 py-1.5"><div className="text-slate-400">σ (from baseline MR)</div>{controlChart.sigma.toFixed(4)}</div>
              <div className="border border-slate-200 rounded px-2 py-1.5"><div className="text-slate-400">UCL / LCL</div>{controlChart.ucl.toFixed(4)} / {controlChart.lcl.toFixed(4)}</div>
              <div className="border border-slate-200 rounded px-2 py-1.5"><div className="text-slate-400">MR̄ / UCL_MR</div>{controlChart.mrBar.toFixed(4)} / {controlChart.uclMR.toFixed(4)}</div>
              <div className="border border-slate-200 rounded px-2 py-1.5"><div className="text-slate-400">Baseline n</div>{controlChart.baselineN} repeat(s) at {baselineInspectionId}</div>
            </div>

            {controlChart.points.some((p) => p.outOfControl) ? (
              <div className="mt-3 space-y-1.5">
                {controlChart.points.filter((p) => p.outOfControl).map((p) => (
                  <div key={p.x} className="flex items-start gap-2 text-[12px] text-red-800 bg-red-50 border border-red-200 rounded px-2.5 py-1.5">
                    <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                    <span>
                      <strong>INS-{p.x}</strong>: {p.violatedRules.map((r) => WESTERN_ELECTRIC_RULES[r]).join('; ')}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[12px] text-slate-400 mt-3">No Western Electric rule violations for this sensor/metric — all points fall within statistical control relative to the {baselineInspectionId} baseline.</p>
            )}
          </>
        ) : (
          <p className="text-[12px] text-slate-400">Not enough baseline repeat acquisitions for {selectedSensorId} at {baselineInspectionId} to estimate control limits.</p>
        )}
      </Card>

      <InfoNote>
        Demonstration composite indicators derived from selected synthetic features. They are not experimentally
        validated structural damage indices or percentages of physical damage.
      </InfoNote>
      <div className="mt-4">
        <ResearchLimitations
          items={[
            'Five inspections is a small longitudinal sequence for trend analysis; conclusions here demonstrate method, not statistically established behavior.',
            'Feature values shown as averages across repeat acquisitions within each inspection; repeat-to-repeat variability is not shown on this page (see Ultrasonic Signals for individual records).',
            'The I-MR control chart estimates its center line and 3σ limits from only 2-3 repeat acquisitions at a single baseline inspection — a genuine SPC calculation, but on a far smaller baseline sample than real practice would require; treat the limits as illustrative of the method, not validated process limits.',
            'Control-chart out-of-control signals (Western Electric rules) are a statistically principled alternative to this app\'s flat 0.3/0.55 anomaly-indicator thresholds used elsewhere, not a replacement for them — the two can and do disagree, since they encode different assumptions.',
          ]}
        />
      </div>
    </div>
  );
}
