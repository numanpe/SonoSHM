import { useMemo, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip as RTooltip, CartesianGrid, Cell } from 'recharts';
import { useApp } from '../state/store';
import { SectionHeader, Card, ResearchLimitations, InfoNote, Pill } from '../components/common/Panels';
import { ProvenanceBadge } from '../components/common/Badge';
import { trainAutoencoder, scoreAutoencoder } from '../engine/autoencoder';

const STATUS_COLOR: Record<string, string> = {
  'Normal observation': '#1f8a5f',
  'Potential anomaly': '#c9971e',
  'Requires inspection': '#b5292f',
  'Insufficient evidence': '#94a3b8',
};

function statusFor(indicator: number): 'Normal observation' | 'Potential anomaly' | 'Requires inspection' {
  if (indicator >= 0.55) return 'Requires inspection';
  if (indicator >= 0.3) return 'Potential anomaly';
  return 'Normal observation';
}

export default function ReferenceFree() {
  const { dataset, anomalyResults, featuresAll, featuresAgg, selectedInspectionId, setSelectedInspectionId, seed } = useApp();
  const [method, setMethod] = useState<'zscore' | 'autoencoder'>('zscore');

  const zscoreRows = useMemo(
    () => dataset.sensors.map((s) => anomalyResults.find((a) => a.sensorId === s.sensorId && a.inspectionId === selectedInspectionId)),
    [dataset, anomalyResults, selectedInspectionId]
  );

  const healthyPool = useMemo(() => featuresAll.filter((f) => f.generatedState === 'healthy'), [featuresAll]);
  const autoencoderModel = useMemo(() => trainAutoencoder(healthyPool, seed + 4242), [healthyPool, seed]);

  const autoencoderRows = useMemo(() => {
    if (!autoencoderModel) return dataset.sensors.map(() => null);
    return dataset.sensors.map((s) => {
      const rec = featuresAgg.find((f) => f.sensorId === s.sensorId && f.inspectionId === selectedInspectionId);
      if (!rec) return null;
      const score = scoreAutoencoder(autoencoderModel, rec);
      return {
        sensorId: s.sensorId,
        inspectionId: selectedInspectionId,
        anomalyIndicator: score.anomalyIndicator,
        zScoreMagnitude: score.reconstructionError,
        status: statusFor(score.anomalyIndicator),
      };
    });
  }, [autoencoderModel, dataset, featuresAgg, selectedInspectionId]);

  const rows = method === 'autoencoder' ? autoencoderRows : zscoreRows;

  const chartData = rows.map((r, i) => ({
    sensor: dataset.sensors[i].sensorId,
    indicator: r ? Number(r.anomalyIndicator.toFixed(3)) : 0,
    status: r?.status ?? 'Insufficient evidence',
  }));

  const worst = [...rows].filter(Boolean).sort((a, b) => (b!.anomalyIndicator - a!.anomalyIndicator))[0];

  return (
    <div>
      <SectionHeader
        title="Reference-Free Diagnostics"
        subtitle="This prototype demonstrates a reference-free diagnostic concept using signal-derived features. It does not claim to solve reference-free structural damage diagnosis."
        right={<ProvenanceBadge kind="CONCEPTUAL" />}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <Card title="Conventional Approach">
          <div className="flex flex-col gap-2 text-[12px]">
            {['Current measurement', 'Compare against healthy baseline', 'Damage indication'].map((s, i, arr) => (
              <div key={s} className="flex items-center gap-2">
                <span className="px-3 py-2 rounded border border-slate-300 bg-slate-50 text-slate-600 flex-1">{s}</span>
                {i < arr.length - 1 && <ArrowRight size={14} className="text-slate-300" />}
              </div>
            ))}
          </div>
        </Card>
        <Card title="Reference-Free Concept">
          <div className="flex flex-col gap-2 text-[12px]">
            {['Current signal', 'Signal-derived nonlinear features', 'Anomaly analysis', 'Potential damage indication'].map((s, i, arr) => (
              <div key={s} className="flex items-center gap-2">
                <span className="px-3 py-2 rounded border border-[#1d5b8f]/40 bg-[#e6eef5] text-[#1d5b8f] flex-1">{s}</span>
                {i < arr.length - 1 && <ArrowRight size={14} className="text-slate-300" />}
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div>
          <label className="text-[11px] uppercase tracking-wide text-slate-500 font-medium mr-2">Inspection</label>
          <select value={selectedInspectionId} onChange={(e) => setSelectedInspectionId(e.target.value)} className="border border-slate-300 rounded-md px-2 py-1.5 text-[13px] font-mono-lab">
            {dataset.inspections.map((i) => (<option key={i.inspectionId} value={i.inspectionId}>{i.inspectionId}</option>))}
          </select>
        </div>
        <div>
          <label className="text-[11px] uppercase tracking-wide text-slate-500 font-medium mr-2">Method</label>
          <div className="inline-flex rounded-md border border-slate-300 overflow-hidden text-[12px]">
            <button
              onClick={() => setMethod('zscore')}
              className={`px-2.5 py-1.5 ${method === 'zscore' ? 'bg-[#1d5b8f] text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
            >
              Baseline z-score
            </button>
            <button
              onClick={() => setMethod('autoencoder')}
              disabled={!autoencoderModel}
              className={`px-2.5 py-1.5 border-l border-slate-300 disabled:opacity-40 disabled:cursor-not-allowed ${method === 'autoencoder' ? 'bg-[#1d5b8f] text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
              title={!autoencoderModel ? 'Not enough synthetic healthy-labeled records to train the autoencoder for this asset' : undefined}
            >
              Autoencoder (healthy-pooled)
            </button>
          </div>
        </div>
      </div>

      <Card
        title="Reference-Free Anomaly Detection"
        className="mb-4"
        right={
          <span className="text-[11px] text-slate-400">
            {method === 'autoencoder'
              ? `Reconstruction error vs. a healthy-only autoencoder (n=${autoencoderModel?.nTrainingExamples ?? 0} pooled healthy records)`
              : "Standardized distance from each sensor's own baseline (INS-001)"}
          </span>
        }
      >
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 8, right: 16, left: -10, bottom: 4 }}>
              <CartesianGrid stroke="#eef1f5" />
              <XAxis dataKey="sensor" tick={{ fontSize: 11 }} stroke="#94a3b8" />
              <YAxis tick={{ fontSize: 10 }} stroke="#94a3b8" domain={[0, 1]} />
              <RTooltip contentStyle={{ fontSize: 11 }} />
              <Bar dataKey="indicator" radius={[3, 3, 0, 0]}>
                {chartData.map((d) => (<Cell key={d.sensor} fill={STATUS_COLOR[d.status]} />))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-3">
          {rows.map((r, i) => r && (
            <div key={dataset.sensors[i].sensorId} className="border border-slate-200 rounded-md px-3 py-2 flex items-center justify-between">
              <span className="text-[12px] font-mono-lab font-medium">{dataset.sensors[i].sensorId}</span>
              <span className="text-[12px] font-mono-lab">{r.anomalyIndicator.toFixed(2)}</span>
              <Pill color={r.anomalyIndicator >= 0.55 ? 'red' : r.anomalyIndicator >= 0.3 ? 'amber' : 'green'}>{r.status}</Pill>
            </div>
          ))}
        </div>
      </Card>

      {worst && (
        <InfoNote>
          <strong>{worst.sensorId}</strong>: Anomaly Indicator = {worst.anomalyIndicator.toFixed(2)} — Status:{' '}
          {worst.status}. Requires experimental validation.
          {method === 'autoencoder' && (
            <>
              {' '}Computed by a small feedforward autoencoder (6 → 4 → 2 → 4 → 6, tanh hidden layers) trained only
              on this asset's synthetic-generator-labeled "healthy" records, pooled across all its sensors — the
              indicator is the reconstruction error normalized against that training pool's own error distribution.
            </>
          )}
        </InfoNote>
      )}

      <div className="mt-4">
        <ResearchLimitations
          items={method === 'autoencoder' ? [
            'The autoencoder is trained on synthetic-generator ground-truth "healthy" labels pooled across sensors — a real deployment would not have this ground truth and would need another way to curate a trustworthy healthy-only training set.',
            'The healthy-pooled training set (tens of records) is still very small for a neural network by real-world standards; the model is offered to demonstrate the method, not as a validated anomaly detector.',
            'Reconstruction error is normalized against the same training pool\'s own error distribution (mean + 3σ = indicator 1.0) — this calibration has not been checked against independent, truly out-of-distribution real damage data.',
            'Anomaly indicators are 0-1 demonstration scores, not calibrated probabilities of damage.',
          ] : [
            'The anomaly "healthy region" is approximated from a single baseline observation per sensor with an assumed variability margin, not a statistically estimated distribution — a genuine reference-free method would need many baseline samples or population-based normalization.',
            'This demonstration still relies on each sensor\'s own historical baseline; a fully reference-free method would need to operate without any prior baseline at all, which is not implemented here.',
            'Anomaly indicators are 0-1 demonstration scores, not calibrated probabilities of damage.',
          ]}
        />
      </div>
    </div>
  );
}
