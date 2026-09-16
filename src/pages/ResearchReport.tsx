import { useMemo } from 'react';
import { ArrowRight, Printer } from 'lucide-react';
import { useApp } from '../state/store';
import { SectionHeader, Card, ResearchLimitations } from '../components/common/Panels';
import { ProvenanceBadge, DamageStatePill } from '../components/common/Badge';
import { fitLinearTrend } from '../engine/prognosis';
import { assessDataQuality } from '../engine/quality';
import type { SectionId } from '../components/layout/navConfig';

const RESEARCH_PILLARS = [
  {
    id: 'pillar-1',
    title: 'Pillar 1 — Nonlinear Feature Extraction',
    description:
      'New nonlinear-ultrasonic feature-extraction methods for structural damage diagnosis (harmonic ratios, higher-order nonlinearity parameters, wave-velocity and attenuation changes).',
  },
  {
    id: 'pillar-2',
    title: 'Pillar 2 — Reference-Free Diagnostics',
    description:
      'Diagnostics that reduce dependence on an undamaged baseline measurement from the same structure, toward assessing structures without a known healthy reference.',
  },
  {
    id: 'pillar-3',
    title: 'Pillar 3 — System-Level Prognostics for Diverse Infrastructure',
    description:
      'A system-level structural safety prognostics methodology applicable across diverse infrastructure types, not a single specimen or structure class.',
  },
];

const ROADMAP = [
  { phase: 1, pillar: 1, label: 'Synthetic signal demonstrator', status: 'Implemented in this prototype' },
  { phase: 2, pillar: 1, label: 'Laboratory ultrasonic measurements', status: 'Not started' },
  { phase: 3, pillar: 1, label: 'Validated nonlinear feature extraction', status: 'Not started' },
  { phase: 4, pillar: 1, label: 'Controlled damage experiments', status: 'Not started' },
  { phase: 5, pillar: 2, label: 'Reference-free diagnostics', status: 'Concept demonstrated only' },
  { phase: 6, pillar: 2, label: 'Longitudinal monitoring', status: 'Demonstrated on synthetic data' },
  { phase: 7, pillar: 2, label: 'Validated prognosis', status: 'Not started' },
  { phase: 8, pillar: 3, label: 'Digital twin integration across asset types', status: 'Demonstrated on synthetic data' },
  { phase: 9, pillar: 3, label: 'System-level prognostics across diverse infrastructure', status: 'Concept demonstrated only (3 synthetic asset types)' },
  { phase: 9.5, pillar: 3, label: 'Real-geometry ingestion (IFC import, point-cloud viewer)', status: 'Demonstrated — real geometry, synthetic sensor data' },
  { phase: 9.7, pillar: 3, label: 'Live sensor data connector layer', status: 'Architecture demonstrated — simulated replay by default' },
  { phase: 10, pillar: 3, label: 'Field infrastructure deployment', status: 'Not started' },
];

const ARCHITECTURE = [
  'STRUCTURE (built-in, IFC import, or point cloud)',
  'ULTRASONIC MEASUREMENT (synthetic, or live connector)',
  'SIGNAL PROCESSING',
  'NONLINEAR FEATURES (H2/H1, H3/H1, β′, ToF, Δv/v₀, attenuation)',
  'AI / ANOMALY DETECTION',
  'DAMAGE DIAGNOSIS',
  'LONGITUDINAL MONITORING',
  'PROGNOSIS',
  'DIGITAL TWIN',
  'DECISION SUPPORT',
  'NEXT INSPECTION',
];

export default function ResearchReport({ onNavigate }: { onNavigate: (s: SectionId) => void }) {
  const app = useApp();
  const { dataset, primaryModel, anomalyResults, damageIndicatorMap, structureProfile, portfolio } = app;

  const quality = useMemo(() => assessDataQuality(dataset), [dataset]);

  const nearestSensorId = useMemo(() => {
    let best = dataset.sensors[0]?.sensorId ?? '';
    let bestDist = Infinity;
    for (const s of dataset.sensors) {
      const d = Math.abs(s.positionFraction - structureProfile.damageLocationFraction);
      if (d < bestDist) { bestDist = d; best = s.sensorId; }
    }
    return best;
  }, [dataset, structureProfile]);

  const primaryTrend = useMemo(() => {
    const inspections = [...dataset.inspections].sort((a, b) => a.index - b.index);
    const series = inspections.map((i) => damageIndicatorMap.get(`${nearestSensorId}__${i.inspectionId}`) ?? 0);
    return fitLinearTrend(inspections.map((i) => i.index), series);
  }, [dataset, damageIndicatorMap, nearestSensorId]);

  const latestInspection = [...dataset.inspections].sort((a, b) => b.index - a.index)[0];
  const flaggedSensors = anomalyResults.filter((a) => a.inspectionId === latestInspection.inspectionId && a.status !== 'Normal observation' && a.status !== 'Insufficient evidence');

  return (
    <div className="print:text-black">
      <SectionHeader
        title="Research Report"
        subtitle="A compiled, live-generated summary of this SonoSHM demonstration session — research context, structure, methodology, results, roadmap, and limitations."
        right={
          <button onClick={() => window.print()} className="flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded-md border border-slate-300 hover:bg-slate-50">
            <Printer size={13} /> Print / Save as PDF
          </button>
        }
      />

      <div className="space-y-4">
        <Card title="0. Research Context & Motivation">
          <p className="text-[13px] text-slate-600 leading-relaxed mb-3">
            This prototype is motivated by a broader research aim of developing new technology and frameworks for
            structural damage diagnosis and prognosis using nonlinear ultrasonics, to address limitations in
            existing safety inspection and forecasting practice for engineering structures, and to build knowledge
            spanning nondestructive testing and structural health monitoring. That research programme is organized
            around three innovation pillars, which this application demonstrates computationally on synthetic data:
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            {RESEARCH_PILLARS.map((p) => (
              <div key={p.id} className="border border-slate-200 rounded-md px-3 py-2">
                <div className="text-[12px] font-semibold text-slate-700 mb-1">{p.title}</div>
                <div className="text-[11px] text-slate-500 leading-relaxed">{p.description}</div>
              </div>
            ))}
          </div>
          <p className="text-[12px] text-slate-500 mt-3">
            Anticipated outcomes of the broader research programme — improved infrastructure reliability and
            operational safety, and reduced maintenance and management cost — are stated here as the{' '}
            <strong>motivating aims of that research</strong>, not as results demonstrated, validated, or achieved by
            this synthetic-data prototype.
          </p>
        </Card>

        <Card title="1. Structure">
          <p className="text-[13px] text-slate-600">
            {dataset.structure.structureId} — {dataset.structure.componentType} ({dataset.structure.material}),
            span {dataset.structure.spanMm} mm, age {dataset.structure.ageYears} years. Loading condition:{' '}
            {dataset.structure.loadingCondition}.
          </p>
        </Card>

        <Card title="2. Inspection Configuration">
          <p className="text-[13px] text-slate-600">
            {dataset.inspections.length} inspections ({dataset.inspections.map((i) => i.inspectionId).join(', ')})
            spanning {dataset.inspections[0]?.isoDate} to {dataset.inspections[dataset.inspections.length - 1]?.isoDate}.
            Nominal generation states: {dataset.inspections.map((i) => i.nominalGlobalState).join(' → ')}.
          </p>
        </Card>

        <Card title="3. Sensors">
          <p className="text-[13px] text-slate-600">
            {dataset.sensors.length} sensors ({dataset.sensors.map((s) => s.sensorId).join(', ')}) positioned along the
            span at fractions {dataset.sensors.map((s) => s.positionFraction.toFixed(2)).join(', ')}, each sampled at{' '}
            {dataset.sensors[0]?.samplingFrequencyMHz} MHz for {dataset.sensors[0]?.acquisitionDurationUs} µs.
          </p>
        </Card>

        <Card title="4. Signal Acquisition">
          <p className="text-[13px] text-slate-600">
            {dataset.signals.length} synthetic ultrasonic signal records were generated ({dataset.sensors.length} sensors ×{' '}
            {dataset.inspections.length} inspections × repeat acquisitions), following a simplified additive-harmonic
            burst model with attenuation, damping, and noise. <ProvenanceBadge kind="SIMULATED" />
          </p>
        </Card>

        <Card title="5. Signal Processing">
          <p className="text-[13px] text-slate-600">
            Each signal was detrended, optionally Hann-windowed, and transformed via FFT. Harmonic peaks were located
            within a ±12 kHz tolerance of the nominal fundamental and its 2nd/3rd multiples. Time-of-flight was
            estimated via moving-RMS envelope threshold crossing (25% of peak).
          </p>
        </Card>

        <Card title="6. Nonlinear Features">
          <p className="text-[13px] text-slate-600">
            The synthetic demonstration dataset shows increasing H2/H1 and β′ values across the predefined
            demonstration damage states, consistent with how the generator was parameterized. Mean H2/H1 by class:{' '}
            {(['healthy', 'early', 'moderate', 'severe'] as const)
              .map((s) => {
                const vals = app.featuresAll.filter((f) => f.generatedState === s).map((f) => f.H2H1);
                const m = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
                return `${s}: ${m.toFixed(4)}`;
              })
              .join(', ')}
            .
          </p>
        </Card>

        <Card title="7. ToF / Wave Velocity">
          <p className="text-[13px] text-slate-600">
            Relative wave velocity decreased across the demonstration inspection sequence at sensors coupled to the
            synthetic damage location (notably near {nearestSensorId}), while distant sensors remained comparatively
            stable. This is a potential damage-related change in the synthetic model, not confirmed damage in a real
            structure.
          </p>
        </Card>

        <Card title="8. Damage Diagnosis">
          <p className="text-[13px] text-slate-600">
            The demonstration classifier ({primaryModel.label}) identified differences between the synthetic classes
            with {(primaryModel.metrics.accuracy * 100).toFixed(1)}% accuracy and {(primaryModel.metrics.macroF1 * 100).toFixed(1)}%
            macro F1 on a held-out test set (n={primaryModel.metrics.nTest}). This does not represent validated
            structural damage detection.
          </p>
        </Card>

        <Card title="9. Reference-Free Analysis">
          <p className="text-[13px] text-slate-600">
            At {latestInspection.inspectionId}, {flaggedSensors.length} of {dataset.sensors.length} sensors were flagged
            by the reference-free anomaly indicator ({flaggedSensors.map((f) => f.sensorId).join(', ') || 'none'}). This
            demonstrates the anomaly-scoring concept only and requires experimental validation.
          </p>
        </Card>

        <Card title="10. Longitudinal Monitoring">
          <p className="text-[13px] text-slate-600">
            Feature and indicator trends were tracked across all {dataset.inspections.length} inspections for each
            sensor. Sensor {nearestSensorId} (nearest the synthetic damage location) shows the strongest
            damage-indicator trend in this dataset.
          </p>
        </Card>

        <Card title="11. Prognosis">
          <p className="text-[13px] text-slate-600">
            A linear trend fit of {nearestSensorId}'s damage indicator gives slope = {primaryTrend.slope.toFixed(4)} per
            inspection (R² = {primaryTrend.rSquared.toFixed(3)}). The modelled trajectory represents a demonstration
            of longitudinal trend analysis and requires experimental validation — it is not a remaining-useful-life
            estimate.
          </p>
        </Card>

        <Card title="12. Digital Twin">
          <p className="text-[13px] text-slate-600">
            The structural digital twin renders sensor positions and anomaly indicators for the selected inspection,
            connected live to the same underlying feature and diagnosis engines used throughout this application,
            with kind-specific schematic geometry for each demonstration asset (beam, deck, pipeline) and an
            automatic 2D fallback when WebGL 3D rendering is unavailable.
          </p>
        </Card>

        <Card title="12b. System-Level Prognostics Across Diverse Infrastructure">
          <p className="text-[13px] text-slate-600 mb-2">
            The identical pipeline was additionally run independently across {portfolio.length} demonstration asset
            types to illustrate a system-level prognostics methodology spanning diverse infrastructure (see Damage
            Prognosis → Diverse Infrastructure):
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            {portfolio.map((p) => (
              <div key={p.profileId} className="border border-slate-200 rounded-md px-3 py-2">
                <div className="text-[12px] font-semibold text-slate-700">{p.shortLabel}</div>
                <div className="text-[11px] text-slate-400">{p.componentType}</div>
                <div className="text-[11px] font-mono-lab mt-1">Indicator {p.latestIndicator.toFixed(2)} · trend {p.trendSlope >= 0 ? '+' : ''}{p.trendSlope.toFixed(4)}/insp.</div>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-slate-400 mt-2">
            This is a small-scale, conceptual demonstration of methodological generality across three synthetic asset
            types — not a validated cross-asset reliability or portfolio-risk methodology.
          </p>
        </Card>

        <Card title="12c. Real-Structure Ingestion &amp; Live Data">
          <p className="text-[13px] text-slate-600 mb-2">
            Beyond the three hand-authored demonstration assets, the application supports bringing in a real
            structure's geometry and, separately, a pluggable live-data layer — both aimed at making the
            "diverse infrastructure" and "system-level" pillars concrete beyond synthetic examples:
          </p>
          <ul className="text-[13px] text-slate-600 space-y-1.5 list-disc pl-5">
            <li><strong>IFC import</strong> (Import Structure page): parses a real IFC/BIM file client-side (web-ifc) and renders its actual geometry; the user places sensors and a damage marker on that real geometry, and a demonstration dataset is generated against it using the same synthetic signal model as the other assets.</li>
            <li><strong>Point-cloud viewer</strong>: loads a real .ply/.xyz survey and renders it, with an optional simple nearest-point deviation check against an imported IFC reference — a viewer and sanity-check, not automatic scan-to-BIM reconstruction.</li>
            <li><strong>Live Monitoring page</strong>: a pluggable data-source layer with a working WebSocket and REST-polling connector (functional against a real endpoint if one exists) alongside a simulated-replay mode, used throughout this session since no real sensor feed is connected.</li>
          </ul>
          <p className="text-[11px] text-slate-400 mt-2">
            In all three cases: the geometry or connector plumbing is real, but the resulting sensor data in this
            application remains [SIMULATED] or [SIMULATED REPLAY] — see the Import Structure and Live Monitoring
            pages' own limitations sections for specifics (e.g. IFC 4.3/IFC-Bridge alignment entities and LAS/LAZ
            point clouds are not supported; MQTT and other IoT protocols are not implemented).
          </p>
        </Card>

        <Card title="13. Limitations">
          <ResearchLimitations
            items={[
              'All data is [SIMULATED] from a fixed-seed synthetic generator unless explicitly imported and marked [MEASURED].',
              'Sample size (6 sensors × 5 inspections × 3 repeats) is a demonstration scale, not a statistically powered campaign.',
              'The synthetic signal model is a simplified additive-harmonic representation and does not capture true elastic or contact acoustic nonlinearity.',
              'β′ is uncalibrated in this demonstration and sensitive to amplitude, transducer, and configuration effects.',
              'Two diagnosis classifiers are offered side by side (k-nearest-neighbours, k=5, and a small gradient-boosted-tree ensemble with exact Shapley-value feature attribution) — both are transparent methodological demonstrations, not optimized or clinically/structurally validated models, and neither has been checked against independent real-damage data.',
              'The reference-free method offers a baseline z-score approach and an alternative healthy-pooled autoencoder; both still rely on synthetic-generator ground truth (a per-sensor historical baseline, or a pooled "healthy" training set) and neither solves general reference-free diagnosis without such ground truth.',
              'Prognosis offers a simple linear trend and an alternative Gaussian Process fit (same linear trend as its mean function, with a kernel-based uncertainty band) over 5 inspections; both are illustrative of method, not validated forecasts, and the GP\'s hyperparameters are selected by grid search on this small sample, not independently cross-validated.',
              'No structural safety certification, failure prediction, or remaining-useful-life estimate is made anywhere in this application.',
            ]}
          />
          <div className="mt-2 text-[12px] text-slate-500">
            Data quality checks: {quality.filter((q) => q.level === 'Good').length}/{quality.length} rated "Good" for this
            session's dataset.
          </div>
        </Card>

        <Card title="14. Suggested Next Inspection">
          <p className="text-[13px] text-slate-600">
            See the{' '}
            <button className="underline text-[#1d5b8f]" onClick={() => onNavigate('next-inspection')}>
              Next Inspection
            </button>{' '}
            page for the full, live-generated list of research planning suggestions based on sensor coverage,
            longitudinal depth, anomaly indicators, and data-quality checks.
          </p>
        </Card>

        <Card title="Research Roadmap — Mapped to the Three Innovation Pillars">
          <div className="space-y-3">
            {RESEARCH_PILLARS.map((pillar, pIdx) => (
              <div key={pillar.id}>
                <div className="text-[12px] font-semibold text-[#1d5b8f] mb-1.5">{pillar.title}</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {ROADMAP.filter((r) => r.pillar === pIdx + 1).map((r) => (
                    <div key={r.phase} className="flex items-center justify-between border border-slate-200 rounded-md px-3 py-2">
                      <span className="text-[12px] font-medium text-slate-700">Phase {r.phase} — {r.label}</span>
                      <span className="text-[10px] text-slate-400 font-mono-lab">{r.status}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Final Architecture Diagram">
          <div className="flex flex-col items-center gap-1.5">
            {ARCHITECTURE.map((step, i) => (
              <div key={step} className="flex flex-col items-center gap-1.5">
                <span className="px-4 py-2 rounded-md border border-slate-300 bg-slate-50 text-[12px] font-medium text-slate-700 text-center">{step}</span>
                {i < ARCHITECTURE.length - 1 && <ArrowRight size={14} className="rotate-90 text-slate-300" />}
              </div>
            ))}
          </div>
        </Card>

        <Card title="Final Product Message">
          <p className="text-[13px] text-slate-700 leading-relaxed">
            SonoSHM demonstrates a computational framework for transforming ultrasonic measurements into nonlinear
            features, reference-free anomaly indicators, AI-assisted structural damage diagnosis, longitudinal
            condition monitoring, prognosis, and digital-twin visualization — applied across multiple demonstration
            infrastructure types to illustrate methodological generality in the direction of a system-level
            prognostics approach for diverse infrastructure. The current implementation uses synthetic data and is
            intended as a research prototype requiring experimental validation. Experimental ultrasonic measurement
            remains the foundation; the computational contribution demonstrated here is the transformation of raw
            measurements into features, automated analysis, damage indicators, longitudinal trends, prognosis, and
            digital-twin representation — not a replacement for ultrasonic experiments, NDT expertise, structural
            mechanics, SHM experiments, or engineering judgement, and not a validated or "first-ever" prognostics
            methodology in itself.
          </p>
        </Card>

        <div className="text-center py-2">
          <DamageStatePill state="healthy" /> <DamageStatePill state="early" /> <DamageStatePill state="moderate" /> <DamageStatePill state="severe" />
        </div>
      </div>
    </div>
  );
}
