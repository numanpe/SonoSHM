import { useMemo } from 'react';
import { ArrowRight } from 'lucide-react';
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip as RTooltip } from 'recharts';
import { useApp } from '../state/store';
import { SectionHeader, Card, StatCard, ResearchLimitations, InfoNote } from '../components/common/Panels';
import { ProvenanceBadge, DamageStatePill } from '../components/common/Badge';
import { assessDataQuality } from '../engine/quality';
import type { SectionId } from '../components/layout/navConfig';

const WORKFLOW = [
  { id: 'signals', label: 'Measure' },
  { id: 'processing', label: 'Process' },
  { id: 'features', label: 'Extract Features' },
  { id: 'diagnosis', label: 'Diagnose' },
  { id: 'longitudinal', label: 'Track' },
  { id: 'prognosis', label: 'Prognose' },
  { id: 'twin', label: 'Digital Twin' },
] as const;

export default function Overview({ onNavigate }: { onNavigate: (s: SectionId) => void }) {
  const { dataset, featuresAgg, anomalyResults, damageIndicatorMap, portfolio } = useApp();

  const latestInspection = useMemo(
    () => [...dataset.inspections].sort((a, b) => b.index - a.index)[0],
    [dataset]
  );

  const highestAnomaly = useMemo(() => {
    const atLatest = anomalyResults.filter((a) => a.inspectionId === latestInspection?.inspectionId);
    return atLatest.sort((a, b) => b.anomalyIndicator - a.anomalyIndicator)[0];
  }, [anomalyResults, latestInspection]);

  const quality = useMemo(() => assessDataQuality(dataset), [dataset]);
  const qualityGood = quality.filter((q) => q.level === 'Good').length;

  const trendData = useMemo(() => {
    const sensorId = highestAnomaly?.sensorId ?? dataset.sensors[Math.floor(dataset.sensors.length / 2)]?.sensorId ?? dataset.sensors[0]?.sensorId;
    return dataset.inspections
      .slice()
      .sort((a, b) => a.index - b.index)
      .map((insp) => {
        const rec = featuresAgg.find((f) => f.sensorId === sensorId && f.inspectionId === insp.inspectionId);
        return {
          inspection: insp.inspectionId.replace('INS-', ''),
          H2H1: rec ? Number(rec.H2H1.toFixed(4)) : null,
          indicator: damageIndicatorMap.get(`${sensorId}__${insp.inspectionId}`) ?? null,
        };
      });
  }, [dataset, featuresAgg, highestAnomaly, damageIndicatorMap]);

  return (
    <div>
      <SectionHeader
        title="Structural Health Monitoring Campaign"
        subtitle="SonoSHM demonstrates a computational research framework connecting nonlinear ultrasonic measurement to AI-assisted diagnosis, reference-free diagnostics, longitudinal monitoring, prognosis, and digital-twin visualization — motivated by the aim of addressing limitations in current structural safety inspection and forecasting practice across diverse infrastructure. Experimental measurement remains the foundation — this prototype illustrates the computational layer around it."
        right={<ProvenanceBadge kind="SIMULATED" />}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <StatCard label="Structure" value={dataset.structure.structureId} hint={dataset.structure.componentType} />
        <StatCard label="Sensors" value={dataset.sensors.length} hint={`${dataset.sensors[0]?.sensorId} – ${dataset.sensors[dataset.sensors.length - 1]?.sensorId} pitch-catch pairs`} />
        <StatCard label="Inspections" value={dataset.inspections.length} hint="Longitudinal sequence" />
        <StatCard label="Signal Records" value={dataset.signals.length} hint="Raw ultrasonic waveforms" />
        <StatCard
          label="Latest Inspection"
          value={latestInspection?.inspectionId ?? '—'}
          hint={latestInspection?.isoDate}
        />
        <StatCard
          label="Highest Anomaly Indicator"
          value={highestAnomaly ? highestAnomaly.anomalyIndicator.toFixed(2) : '—'}
          hint={highestAnomaly ? `${highestAnomaly.sensorId} · ${highestAnomaly.status}` : undefined}
          accent={highestAnomaly && highestAnomaly.anomalyIndicator >= 0.55 ? 'bad' : highestAnomaly && highestAnomaly.anomalyIndicator >= 0.3 ? 'warn' : 'good'}
        />
        <StatCard label="Damage States Modeled" value={dataset.damageStates.length} hint="Healthy → Severe" />
        <StatCard
          label="Data Quality"
          value={`${qualityGood}/${quality.length}`}
          hint="Checks rated Good"
          accent={qualityGood === quality.length ? 'good' : 'warn'}
        />
      </div>

      <Card title="Research Context & Motivation" className="mb-5">
        <p className="text-[13px] text-slate-600 leading-relaxed">
          This prototype is framed by a research aim: developing new technology and frameworks for structural damage
          diagnosis and prognosis using nonlinear ultrasonics, to address limitations in existing structural safety
          inspection and forecasting practice. That broader research programme spans three areas of interest —
          nonlinear feature extraction, reference-free diagnostics, and system-level structural safety prognostics
          for diverse infrastructure — which this application demonstrates computationally on synthetic data across{' '}
          {portfolio.length} representative demonstration asset{portfolio.length === 1 ? '' : 's'} (
          {portfolio.map((p) => p.shortLabel).join(', ')}). Anticipated longer-term outcomes of that research
          programme — improved infrastructure reliability and operational safety, and reduced maintenance cost — are
          <strong> aims of the broader research, not claims about, or results achieved by, this prototype.</strong>
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mt-3">
          {portfolio.map((p) => (
            <div key={p.profileId} className="border border-slate-200 rounded-md px-3 py-2">
              <div className="text-[12px] font-semibold text-slate-700">{p.shortLabel}</div>
              <div className="text-[11px] text-slate-400">{p.componentType}</div>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-slate-400 mt-2">
          See <button className="underline" onClick={() => onNavigate('report')}>Research Report</button> for how the
          research roadmap maps onto these three pillars. You can also{' '}
          <button className="underline" onClick={() => onNavigate('import')}>import a real structure</button> (IFC
          model or point-cloud survey) as a fourth asset, or open{' '}
          <button className="underline" onClick={() => onNavigate('live')}>Live Monitoring</button> to see the
          live-data connector layer (simulated replay by default).
        </p>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-5">
        <Card
          title="Research Workflow"
          className="lg:col-span-2"
        >
          <div className="flex flex-wrap items-center gap-1.5">
            {WORKFLOW.map((step, i) => (
              <div key={step.id} className="flex items-center gap-1.5">
                <button
                  onClick={() => onNavigate(step.id as SectionId)}
                  className="px-3 py-2 rounded-md border border-slate-300 bg-slate-50 hover:bg-[#e6eef5] hover:border-[#1d5b8f] text-[12px] font-medium text-slate-700 transition-colors"
                >
                  {step.label}
                </button>
                {i < WORKFLOW.length - 1 && <ArrowRight size={14} className="text-slate-300" />}
              </div>
            ))}
          </div>
          <p className="text-[12px] text-slate-500 mt-3">
            This closed loop — Measure → Process → Extract Features → Diagnose → Track → Prognose → Digital Twin — is
            the central conceptual and computational structure of SonoSHM. See <button className="underline" onClick={() => onNavigate('questions')}>Research Questions</button> for the
            full experimental knowledge loop including hypothesis generation and next-inspection planning.
          </p>
        </Card>

        <Card title={`Feature Trend — ${highestAnomaly?.sensorId ?? dataset.sensors[0]?.sensorId ?? '—'} (H2/H1)`}>
          <div className="h-32">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <XAxis dataKey="inspection" tick={{ fontSize: 10 }} stroke="#94a3b8" />
                <YAxis tick={{ fontSize: 10 }} stroke="#94a3b8" width={40} />
                <RTooltip contentStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="H2H1" stroke="#1d5b8f" strokeWidth={2} dot={{ r: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <ProvenanceBadge kind="SIMULATED" className="mt-1" />
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">
        {dataset.damageStates.map((ds) => (
          <div key={ds.id} className="bg-white border border-[#d7dbe2] rounded-lg px-4 py-3 flex items-center justify-between">
            <div>
              <DamageStatePill state={ds.id} />
              <p className="text-[12px] text-slate-500 mt-1.5">{ds.description}</p>
            </div>
          </div>
        ))}
      </div>

      <InfoNote>
        This overview reflects a <strong>synthetic demonstration dataset</strong> generated from a fixed random seed
        ({dataset.seed}). It is populated automatically on launch so the full workflow can be explored immediately —
        see Experiment Setup to import real [MEASURED] laboratory data in place of any synthetic sensor.
      </InfoNote>

      <div className="mt-4">
        <ResearchLimitations
          items={[
            'All signals, features, and inspection history shown here are [SIMULATED] unless explicitly marked [MEASURED].',
            'The "damage states" are synthetic generation labels, not calibrated measures of real crack size, strength loss, or failure proximity.',
            `Sample size (${dataset.sensors.length} sensors × ${dataset.inspections.length} inspections × 3 repeats, per demonstration asset) is a demonstration scale, not a statistically powered experimental campaign.`,
            'The three demonstration asset types (RC beam, bridge deck, pipeline) illustrate methodological generality across structurally different infrastructure; they are simplified stand-ins, not a validated survey of real diverse infrastructure.',
            'The prototype does not implement or claim structural safety certification.',
          ]}
        />
      </div>
    </div>
  );
}
