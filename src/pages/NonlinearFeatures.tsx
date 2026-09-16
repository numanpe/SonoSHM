import { useMemo, useState } from 'react';
import { BarChart, Bar, ScatterChart, Scatter, XAxis, YAxis, ResponsiveContainer, Tooltip as RTooltip, CartesianGrid } from 'recharts';
import { useApp } from '../state/store';
import { SectionHeader, Card, StatCard, ResearchLimitations, CautionNote, Tooltip } from '../components/common/Panels';
import { ProvenanceBadge } from '../components/common/Badge';
import { pearson } from '../engine/stats';

const TABS = ['Feature Values', 'Linear vs Nonlinear', 'Wave Propagation', 'Feature Relationships'] as const;

export default function NonlinearFeatures() {
  const [tab, setTab] = useState<(typeof TABS)[number]>('Feature Values');
  return (
    <div>
      <SectionHeader
        title="Nonlinear Features"
        subtitle="Fundamental and harmonic amplitudes, nonlinearity ratios, wave-propagation metrics, and their relationship to the demonstration damage indicator."
        right={<ProvenanceBadge kind="SIMULATED" />}
      />
      <div className="flex gap-1 mb-4 border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-2 text-[13px] font-medium border-b-2 -mb-px transition-colors ${
              tab === t ? 'border-[#1d5b8f] text-[#1d5b8f]' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {t}
          </button>
        ))}
      </div>
      {tab === 'Feature Values' && <FeatureValuesTab />}
      {tab === 'Linear vs Nonlinear' && <LinearVsNonlinearTab />}
      {tab === 'Wave Propagation' && <WavePropagationTab />}
      {tab === 'Feature Relationships' && <FeatureRelationshipsTab />}
    </div>
  );
}

function FeatureValuesTab() {
  const { dataset, featuresAgg, selectedSensorId, setSelectedSensorId, selectedInspectionId, setSelectedInspectionId } = useApp();
  const rec = featuresAgg.find((f) => f.sensorId === selectedSensorId && f.inspectionId === selectedInspectionId);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <div>
          <label className="text-[11px] uppercase tracking-wide text-slate-500 font-medium mr-2">Sensor</label>
          <select value={selectedSensorId} onChange={(e) => setSelectedSensorId(e.target.value)} className="border border-slate-300 rounded-md px-2 py-1.5 text-[13px] font-mono-lab">
            {dataset.sensors.map((s) => (
              <option key={s.sensorId} value={s.sensorId}>{s.sensorId}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-[11px] uppercase tracking-wide text-slate-500 font-medium mr-2">Inspection</label>
          <select value={selectedInspectionId} onChange={(e) => setSelectedInspectionId(e.target.value)} className="border border-slate-300 rounded-md px-2 py-1.5 text-[13px] font-mono-lab">
            {dataset.inspections.map((i) => (
              <option key={i.inspectionId} value={i.inspectionId}>{i.inspectionId}</option>
            ))}
          </select>
        </div>
      </div>

      {rec && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="Fundamental Amplitude A₁" value={rec.A1.toFixed(4)} unit="a.u." />
            <StatCard label="2nd Harmonic Amplitude A₂" value={rec.A2.toFixed(5)} unit="a.u." />
            <StatCard label="3rd Harmonic Amplitude A₃" value={rec.A3.toFixed(5)} unit="a.u." />
            <StatCard label="RMS Amplitude" value={rec.rms.toFixed(4)} unit="a.u." />
            <StatCard label="H2/H1" value={rec.H2H1.toFixed(4)} />
            <StatCard label="H3/H1" value={rec.H3H1.toFixed(4)} />
            <StatCard label="Peak Amplitude" value={rec.peak.toFixed(4)} unit="a.u." />
            <StatCard label="Signal Energy" value={rec.energy.toFixed(2)} unit="a.u.²" />
            <StatCard label="Attenuation Indicator" value={rec.attenuationIndicator.toFixed(3)} hint="Relative to sensor baseline (INS-001)" />
            <StatCard label="Frequency Shift" value={rec.frequencyShiftKHz.toFixed(1)} unit="kHz" hint="Detected f₁ − nominal excitation freq." />
            <StatCard
              label={
                <span className="flex items-center gap-1">
                  β′{' '}
                  <Tooltip text="Relative Acoustic Nonlinearity Parameter, β′ = A₂ / A₁²">
                    <span className="text-slate-400">ⓘ</span>
                  </Tooltip>
                </span>
              }
              value={rec.betaPrime.toExponential(2)}
            />
            <StatCard label="Nonlinear Response Indicator" value={(rec.H2H1 + rec.H3H1).toFixed(4)} hint="H2/H1 + H3/H1 (demonstration composite)" />
          </div>

          <CautionNote>
            β′ can be sensitive to measurement amplitude, transducer characteristics, propagation distance, experimental
            configuration, calibration and signal-processing conditions. In this prototype, β′ is a demonstration
            feature (<ProvenanceBadge kind="SIMULATED" />) unless the experimental setup provides the appropriate
            calibration and normalization required for quantitative comparison.
          </CautionNote>
        </>
      )}
    </div>
  );
}

function LinearVsNonlinearTab() {
  const data = [
    { name: 'Fundamental', linear: 1.0, nonlinear: 0.94 },
    { name: '2nd Harmonic', linear: 0.01, nonlinear: 0.11 },
    { name: '3rd Harmonic', linear: 0.003, nonlinear: 0.04 },
  ];
  return (
    <div className="space-y-4">
      <Card title="Linear-Style vs Nonlinear Response Demonstration" right={<span className="text-[11px] px-2 py-0.5 rounded bg-slate-100 border border-slate-300 text-slate-600 font-mono-lab">[CONCEPTUAL DEMONSTRATION]</span>}>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 16, left: -10, bottom: 4 }}>
              <CartesianGrid stroke="#eef1f5" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="#94a3b8" />
              <YAxis tick={{ fontSize: 10 }} stroke="#94a3b8" />
              <RTooltip contentStyle={{ fontSize: 11 }} />
              <Bar dataKey="linear" name="Linear-style (dominant fundamental)" fill="#94a3b8" radius={[3, 3, 0, 0]} />
              <Bar dataKey="nonlinear" name="Nonlinear response (fundamental + harmonics)" fill="#1d5b8f" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="text-[12px] text-slate-500 mt-2">
          This illustrative comparison shows, conceptually, how a nonlinear response redistributes energy into
          harmonic components relative to an idealized linear-style response with a dominant fundamental. It is a
          teaching illustration, not measured data.
        </p>
      </Card>
    </div>
  );
}

function WavePropagationTab() {
  const { dataset, featuresAgg, selectedSensorId, setSelectedSensorId } = useApp();
  const rows = useMemo(
    () =>
      dataset.inspections
        .slice()
        .sort((a, b) => a.index - b.index)
        .map((insp) => {
          const rec = featuresAgg.find((f) => f.sensorId === selectedSensorId && f.inspectionId === insp.inspectionId);
          return { insp, rec };
        }),
    [dataset, featuresAgg, selectedSensorId]
  );
  return (
    <div className="space-y-4">
      <div>
        <label className="text-[11px] uppercase tracking-wide text-slate-500 font-medium mr-2">Sensor</label>
        <select value={selectedSensorId} onChange={(e) => setSelectedSensorId(e.target.value)} className="border border-slate-300 rounded-md px-2 py-1.5 text-[13px] font-mono-lab">
          {dataset.sensors.map((s) => (
            <option key={s.sensorId} value={s.sensorId}>{s.sensorId}</option>
          ))}
        </select>
      </div>
      <Card title="Wave Propagation Metrics">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="text-left text-slate-500 border-b border-slate-200">
              <th className="py-2 pr-3 font-medium">Inspection</th>
              <th className="py-2 pr-3 font-medium">ToF</th>
              <th className="py-2 pr-3 font-medium">Velocity</th>
              <th className="py-2 pr-3 font-medium">Δv/v₀</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ insp, rec }) => (
              <tr key={insp.inspectionId} className="border-b border-slate-100 font-mono-lab">
                <td className="py-2 pr-3 font-sans font-medium text-slate-700">{insp.inspectionId}</td>
                <td className="py-2 pr-3">{rec ? `${rec.tofUs.toFixed(1)} µs` : '—'}</td>
                <td className="py-2 pr-3">{rec ? `${rec.velocityMs.toFixed(0)} m/s` : '—'}</td>
                <td className={`py-2 pr-3 ${rec && (rec.deltaVOverV0 ?? 0) < -0.02 ? 'text-red-600' : ''}`}>
                  {rec && rec.deltaVOverV0 !== null ? `${(rec.deltaVOverV0 * 100).toFixed(1)}%` : '0.0%'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <ProvenanceBadge kind="SIMULATED" className="mt-2" />
      </Card>
      <CautionNote>
        Wave velocity and measured ToF may be affected by material condition, temperature, moisture, stress state,
        sensor coupling, sensor positioning, propagation path, heterogeneity and measurement uncertainty. A velocity
        decrease is reported here as a <strong>potential damage-related change</strong>, not confirmed damage, unless
        supported by experimental evidence.
      </CautionNote>
    </div>
  );
}

function FeatureRelationshipsTab() {
  const { featuresAgg, damageIndicatorMap } = useApp();
  const pairs: { key: keyof typeof featuresAgg[0]; label: string }[] = [
    { key: 'H2H1', label: 'H2/H1' },
    { key: 'betaPrime', label: "β′" },
    { key: 'tofUs', label: 'ToF (µs)' },
    { key: 'deltaVOverV0', label: 'Δv/v₀' },
    { key: 'attenuationIndicator', label: 'Attenuation Indicator' },
  ];
  const [xKey, setXKey] = useState<string>('H2H1');

  const chartData = useMemo(
    () =>
      featuresAgg.map((f) => ({
        x: (f as unknown as Record<string, number>)[xKey] ?? 0,
        indicator: damageIndicatorMap.get(`${f.sensorId}__${f.inspectionId}`) ?? 0,
        sensor: f.sensorId,
      })),
    [featuresAgg, xKey]
  );

  const r = useMemo(() => pearson(chartData.map((d) => d.x), chartData.map((d) => d.indicator)), [chartData]);
  const label = pairs.find((p) => p.key === xKey)?.label ?? xKey;

  return (
    <div className="space-y-4">
      <div>
        <label className="text-[11px] uppercase tracking-wide text-slate-500 font-medium mr-2">Feature</label>
        <select value={xKey} onChange={(e) => setXKey(e.target.value)} className="border border-slate-300 rounded-md px-2 py-1.5 text-[13px]">
          {pairs.map((p) => (
            <option key={p.key as string} value={p.key as string}>{p.label} vs Damage Indicator</option>
          ))}
        </select>
      </div>
      <Card title={`${label} vs Demonstration Damage Indicator`}>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
              <CartesianGrid stroke="#eef1f5" />
              <XAxis type="number" dataKey="x" name={label} tick={{ fontSize: 10 }} stroke="#94a3b8" />
              <YAxis type="number" dataKey="indicator" name="Damage Indicator" tick={{ fontSize: 10 }} stroke="#94a3b8" domain={[0, 1]} />
              <RTooltip contentStyle={{ fontSize: 11 }} cursor={{ strokeDasharray: '3 3' }} />
              <Scatter data={chartData} fill="#1d5b8f" />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-2 text-[12px] text-slate-600">
          Pearson correlation coefficient (this synthetic dataset): <span className="font-mono-lab font-semibold">{r.toFixed(3)}</span>
        </div>
      </Card>
      <CautionNote>
        Statistical association does not establish a physical damage mechanism. This correlation is computed from a
        small synthetic demonstration dataset and reflects how the dataset was generated, not a validated
        relationship in real structures.
      </CautionNote>
      <ResearchLimitations
        items={[
          'The composite damage indicator used here is itself a demonstration aggregation (see Damage Prognosis) — correlating a feature against it is partly circular by construction and is shown for illustration only.',
          'Sample size (30 sensor–inspection combinations) is too small for robust statistical inference.',
        ]}
      />
    </div>
  );
}
