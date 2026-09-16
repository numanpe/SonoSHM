import { useMemo, useState } from 'react';
import { ComposedChart, Line, Area, XAxis, YAxis, ResponsiveContainer, Tooltip as RTooltip, CartesianGrid, BarChart, Bar, Cell } from 'recharts';
import { useApp } from '../state/store';
import { SectionHeader, Card, StatCard, ResearchLimitations, InfoNote, CautionNote, Pill } from '../components/common/Panels';
import { ProvenanceBadge } from '../components/common/Badge';
import { fitLinearTrend } from '../engine/prognosis';
import { fitGPR, predictGPR } from '../engine/gpr';

const TABS = ['Sensor Prognosis', 'System-Level View', 'Diverse Infrastructure', 'Decision Support'] as const;
const FUTURE_STEPS = 2;

export default function DamagePrognosis() {
  const [tab, setTab] = useState<(typeof TABS)[number]>('Sensor Prognosis');
  return (
    <div>
      <SectionHeader
        title="Damage Prognosis"
        subtitle="Demonstration longitudinal-trend extrapolation from the available inspection sequence — not a validated remaining-useful-life or failure prediction."
        right={<ProvenanceBadge kind="MODEL_OUTPUT" />}
      />
      <div className="flex gap-1 mb-4 border-b border-slate-200">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`px-3 py-2 text-[13px] font-medium border-b-2 -mb-px transition-colors ${tab === t ? 'border-[#1d5b8f] text-[#1d5b8f]' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
            {t}
          </button>
        ))}
      </div>
      {tab === 'Sensor Prognosis' && <SensorPrognosisTab />}
      {tab === 'System-Level View' && <SystemLevelTab />}
      {tab === 'Diverse Infrastructure' && <DiverseInfrastructureTab />}
      {tab === 'Decision Support' && <DecisionSupportTab />}
    </div>
  );
}

function SensorPrognosisTab() {
  const { dataset, selectedSensorId, setSelectedSensorId, damageIndicatorMap } = useApp();
  const [method, setMethod] = useState<'linear' | 'gp'>('gp');
  const inspections = useMemo(() => [...dataset.inspections].sort((a, b) => a.index - b.index), [dataset]);

  const observed = inspections.map((insp) => ({
    x: insp.index,
    label: insp.inspectionId,
    value: damageIndicatorMap.get(`${selectedSensorId}__${insp.inspectionId}`) ?? 0,
  }));

  const fit = useMemo(() => fitLinearTrend(observed.map((o) => o.x), observed.map((o) => o.value)), [observed]);
  const gpr = useMemo(() => fitGPR(observed.map((o) => o.x), observed.map((o) => o.value)), [observed]);

  const chartData = useMemo(() => {
    const rows = observed.map((o) => {
      if (method === 'gp') {
        const p = predictGPR(gpr, o.x);
        return {
          label: o.label,
          observed: Number(o.value.toFixed(3)),
          fitted: Number(p.mean.toFixed(3)),
          lower: Number(Math.max(0, p.lower95).toFixed(3)),
          upper: Number(Math.min(1.4, p.upper95).toFixed(3)),
        };
      }
      return {
        label: o.label,
        observed: Number(o.value.toFixed(3)),
        fitted: Number(fit.predict(o.x).toFixed(3)),
        lower: undefined as number | undefined,
        upper: undefined as number | undefined,
      };
    });
    for (let i = 1; i <= FUTURE_STEPS; i++) {
      const x = inspections.length - 1 + i;
      const label = `INS-${String(inspections.length + i).padStart(3, '0')} (proj.)`;
      if (method === 'gp') {
        const p = predictGPR(gpr, x);
        rows.push({
          label,
          observed: undefined as unknown as number,
          fitted: Number(p.mean.toFixed(3)),
          lower: Number(Math.max(0, p.lower95).toFixed(3)),
          upper: Number(Math.min(1.4, p.upper95).toFixed(3)),
        });
      } else {
        const interval = fit.predictInterval(x);
        rows.push({
          label,
          observed: undefined as unknown as number,
          fitted: Number(interval.mean.toFixed(3)),
          lower: Number(Math.max(0, interval.lower).toFixed(3)),
          upper: Number(Math.min(1.4, interval.upper).toFixed(3)),
        });
      }
    }
    return rows;
  }, [observed, fit, gpr, method, inspections.length]);

  const trendWord = fit.slope > 0.01 ? 'an increasing' : fit.slope < -0.01 ? 'a decreasing' : 'an approximately flat';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <label className="text-[11px] uppercase tracking-wide text-slate-500 font-medium mr-2">Sensor</label>
          <select value={selectedSensorId} onChange={(e) => setSelectedSensorId(e.target.value)} className="border border-slate-300 rounded-md px-2 py-1.5 text-[13px] font-mono-lab">
            {dataset.sensors.map((s) => (<option key={s.sensorId} value={s.sensorId}>{s.sensorId}</option>))}
          </select>
        </div>
        <div>
          <label className="text-[11px] uppercase tracking-wide text-slate-500 font-medium mr-2">Uncertainty Model</label>
          <div className="inline-flex rounded-md border border-slate-300 overflow-hidden text-[12px]">
            <button
              onClick={() => setMethod('linear')}
              className={`px-2.5 py-1.5 ${method === 'linear' ? 'bg-[#1d5b8f] text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
            >
              Linear (residual band)
            </button>
            <button
              onClick={() => setMethod('gp')}
              className={`px-2.5 py-1.5 border-l border-slate-300 ${method === 'gp' ? 'bg-[#1d5b8f] text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
            >
              Gaussian Process (recommended)
            </button>
          </div>
        </div>
      </div>

      <Card title="Observed Trend & Demonstration Future Trajectory">
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 8, right: 16, left: -10, bottom: 4 }}>
              <CartesianGrid stroke="#eef1f5" />
              <XAxis dataKey="label" tick={{ fontSize: 9 }} stroke="#94a3b8" />
              <YAxis tick={{ fontSize: 10 }} stroke="#94a3b8" domain={[0, 1.2]} />
              <RTooltip contentStyle={{ fontSize: 11 }} />
              <Area type="monotone" dataKey="upper" stroke="none" fill="#1d5b8f" fillOpacity={0.08} isAnimationActive={false} />
              <Area type="monotone" dataKey="lower" stroke="none" fill="#ffffff" fillOpacity={1} isAnimationActive={false} />
              <Line
                type="monotone"
                dataKey="fitted"
                name={method === 'gp' ? 'GP posterior mean' : 'Linear trend fit'}
                stroke="#94a3b8"
                strokeDasharray="4 3"
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={false}
              />
              <Line type="monotone" dataKey="observed" name="Observed damage indicator" stroke="#1d5b8f" strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        {method === 'linear' ? (
          <div className="grid grid-cols-3 gap-3 mt-3">
            <StatCard label="Trend Slope" value={fit.slope.toFixed(4)} unit="/ inspection" />
            <StatCard label="R²" value={fit.rSquared.toFixed(3)} hint="Linear fit goodness-of-fit" />
            <StatCard label="Residual Std. Dev." value={fit.residualStd.toFixed(3)} hint="Used for the shaded prediction interval" />
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3 mt-3">
            <StatCard label="Trend Slope" value={fit.slope.toFixed(4)} unit="/ inspection" hint="From the GP's linear mean function" />
            <StatCard label="Kernel Length Scale" value={gpr.lengthScale.toFixed(2)} unit="inspections" hint="Selected by log marginal likelihood" />
            <StatCard label="Log Marginal Likelihood" value={gpr.logMarginalLikelihood.toFixed(2)} hint="Higher = better hyperparameter fit" />
          </div>
        )}
      </Card>

      <InfoNote>
        The demonstration dataset shows {trendWord} damage indicator for {selectedSensorId} across the available
        inspection sequence. The modelled trajectory represents a demonstration of longitudinal trend analysis and
        requires experimental validation.
        {method === 'gp' && (
          <>
            {' '}The Gaussian Process here uses the linear fit above as its mean function and models the residuals
            with a squared-exponential kernel (length scale and noise level chosen by maximizing the log marginal
            likelihood over a small candidate grid) — its shaded band is a real posterior credible interval, not the
            residual-std heuristic the linear model's band uses.
          </>
        )}
      </InfoNote>

      <CautionNote>
        This is not a remaining-useful-life estimate and does not predict when or whether the structure will fail.
        {method === 'linear'
          ? ' The shaded band is an approximate residual-based prediction interval from a simple linear fit — it does not account for model-form uncertainty, autocorrelation, or the small sample size.'
          : ' The shaded band is a Gaussian Process posterior credible interval — a more principled uncertainty quantification than the linear model\'s heuristic band, but still fit to the same very small sample size, and it assumes the squared-exponential kernel is an adequate model of how damage-indicator correlation decays over time, which is not independently validated.'}
        {' '}(n={fit.n})
      </CautionNote>
    </div>
  );
}

function SystemLevelTab() {
  const { dataset, damageIndicatorMap, selectedInspectionId, setSelectedInspectionId, structureProfile } = useApp();
  const sorted = useMemo(() => [...dataset.sensors].sort((a, b) => a.positionFraction - b.positionFraction), [dataset]);
  const third = Math.max(1, Math.ceil(sorted.length / 3));
  const components = [
    { id: 'Zone A (near-support)', sensors: sorted.slice(0, third).map((s) => s.sensorId) },
    { id: `Zone B (near ${structureProfile.damageNarrative.split(' ').slice(0, 3).join(' ').toLowerCase()}…)`, sensors: sorted.slice(third, sorted.length - third).map((s) => s.sensorId) },
    { id: 'Zone C (far-support)', sensors: sorted.slice(sorted.length - third).map((s) => s.sensorId) },
  ].filter((c) => c.sensors.length > 0);
  const data = components.map((c) => {
    const vals = c.sensors.map((s) => damageIndicatorMap.get(`${s}__${selectedInspectionId}`) ?? 0);
    return { name: c.id, indicator: Number((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(3)), sensors: c.sensors.join(', ') };
  });
  return (
    <div className="space-y-4">
      <div>
        <label className="text-[11px] uppercase tracking-wide text-slate-500 font-medium mr-2">Inspection</label>
        <select value={selectedInspectionId} onChange={(e) => setSelectedInspectionId(e.target.value)} className="border border-slate-300 rounded-md px-2 py-1.5 text-[13px] font-mono-lab">
          {dataset.inspections.map((i) => (<option key={i.inspectionId} value={i.inspectionId}>{i.inspectionId}</option>))}
        </select>
      </div>
      <Card title="System Monitoring — Aggregated Component Indicators">
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 16, left: -10, bottom: 4 }}>
              <CartesianGrid stroke="#eef1f5" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="#94a3b8" />
              <YAxis tick={{ fontSize: 10 }} stroke="#94a3b8" domain={[0, 1]} />
              <RTooltip contentStyle={{ fontSize: 11 }} />
              <Bar dataKey="indicator" radius={[3, 3, 0, 0]}>
                {data.map((d) => (<Cell key={d.name} fill={d.indicator >= 0.55 ? '#b5292f' : d.indicator >= 0.3 ? '#c9971e' : '#1f8a5f'} />))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mt-3">
          {data.map((d) => (
            <div key={d.name} className="border border-slate-200 rounded-md px-3 py-2">
              <div className="text-[12px] font-semibold text-slate-700">{d.name}</div>
              <div className="text-[11px] text-slate-400 mb-1">Sensors: {d.sensors}</div>
              <div className="text-[13px] font-mono-lab">Indicator: {d.indicator.toFixed(2)}</div>
            </div>
          ))}
        </div>
      </Card>
      <CautionNote>
        This is a demonstration aggregation of monitored component indicators, not a structural reliability
        probability. System-level structural safety prognostics requires validated deterioration, reliability,
        uncertainty and system-response models, none of which are implemented here.
      </CautionNote>
    </div>
  );
}

/** Cross-asset "system-level" prognostics: the same generic signal -> feature
 * -> indicator -> trend pipeline is run independently across every
 * demonstration asset (RC beam, bridge deck, pipeline), illustrating the
 * research aim of a system-level prognostics methodology spanning diverse
 * infrastructure — as a conceptual demonstration only, not a validated
 * cross-asset reliability methodology. */
function DiverseInfrastructureTab() {
  const { portfolio, structureId, setStructureId } = useApp();
  const data = portfolio.map((p) => ({
    name: p.shortLabel,
    id: p.profileId,
    indicator: Number(p.latestIndicator.toFixed(3)),
    trendSlope: p.trendSlope,
    kind: p.kind,
    componentType: p.componentType,
    worstSensorId: p.worstSensorId,
    latestInspectionId: p.latestInspectionId,
  }));

  return (
    <div className="space-y-4">
      <InfoNote>
        This tab demonstrates applying the identical diagnosis-and-prognosis pipeline — signal processing, nonlinear
        feature extraction, reference-free anomaly indicators, and linear trend fitting — independently across three
        structurally distinct demonstration assets, as a small-scale illustration of a{' '}
        <em>system-level structural safety prognostics methodology for diverse infrastructure</em>. It is a
        conceptual demonstration of the approach, not a validated cross-asset reliability or portfolio-risk model.
      </InfoNote>

      <Card title="Portfolio Snapshot — Worst-Sensor Damage Indicator by Asset">
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 16, left: -10, bottom: 4 }}>
              <CartesianGrid stroke="#eef1f5" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="#94a3b8" />
              <YAxis tick={{ fontSize: 10 }} stroke="#94a3b8" domain={[0, 1]} />
              <RTooltip contentStyle={{ fontSize: 11 }} />
              <Bar dataKey="indicator" radius={[3, 3, 0, 0]}>
                {data.map((d) => (<Cell key={d.id} fill={d.indicator >= 0.55 ? '#b5292f' : d.indicator >= 0.3 ? '#c9971e' : '#1f8a5f'} />))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {data.map((d) => (
          <button
            key={d.id}
            onClick={() => setStructureId(d.id)}
            className={`text-left border rounded-lg px-3 py-3 transition-colors ${d.id === structureId ? 'border-[#1d5b8f] bg-[#e6eef5]' : 'border-slate-200 bg-white hover:bg-slate-50'}`}
            title="Switch the active demonstration asset (used across the whole application) to this one"
          >
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-semibold text-slate-700">{d.name}</span>
              <Pill color={d.indicator >= 0.55 ? 'red' : d.indicator >= 0.3 ? 'amber' : 'green'}>{d.indicator.toFixed(2)}</Pill>
            </div>
            <div className="text-[11px] text-slate-400 mt-1">{d.componentType}</div>
            <div className="text-[11px] text-slate-500 mt-1.5 font-mono-lab">
              Worst sensor {d.worstSensorId} · trend {d.trendSlope >= 0 ? '+' : ''}{d.trendSlope.toFixed(4)}/insp. · {d.latestInspectionId}
            </div>
          </button>
        ))}
      </div>

      <ResearchLimitations
        items={[
          'Each demonstration asset uses an independently generated synthetic dataset (fixed seed with a per-asset offset) — the three are not measurements of related real structures.',
          'The three assets are simplified stand-ins for genuinely diverse infrastructure classes (a laboratory RC beam, a composite bridge deck, and a pipeline girth-weld region), chosen to illustrate methodological generality, not to represent a real asset portfolio.',
          'Combining a "system-level" view here means running the same per-asset pipeline three times and comparing outputs — it does not include a validated inter-asset reliability, correlation, or network-risk model.',
          'Clicking an asset card switches the demonstration asset used throughout the rest of the application (Experiment Setup, Signals, Features, Diagnosis, Digital Twin, etc.).',
        ]}
      />
    </div>
  );
}

function DecisionSupportTab() {
  const { dataset, damageIndicatorMap } = useApp();
  const inspections = useMemo(() => [...dataset.inspections].sort((a, b) => a.index - b.index), [dataset]);

  const rows = dataset.sensors.map((sensor) => {
    const series = inspections.map((i) => damageIndicatorMap.get(`${sensor.sensorId}__${i.inspectionId}`) ?? 0);
    const fit = fitLinearTrend(inspections.map((i) => i.index), series);
    const trend = fit.slope > 0.015 ? 'Increasing' : fit.slope < -0.015 ? 'Decreasing' : 'Stable';
    const latest = series[series.length - 1];
    let action = 'Continue routine monitoring interval.';
    if (trend === 'Increasing' && latest >= 0.3) {
      action = 'Consider targeted physical inspection at the corresponding structural region.';
    } else if (latest >= 0.55) {
      action = 'Prioritize targeted physical inspection and consider increased monitoring frequency.';
    }
    return { sensor: sensor.sensorId, trend, latest, action };
  });

  return (
    <div className="space-y-4">
      <Card title="Maintenance Decision Support">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="text-left text-slate-500 border-b border-slate-200">
              <th className="py-2 pr-3 font-medium">Sensor</th>
              <th className="py-2 pr-3 font-medium">Trend</th>
              <th className="py-2 pr-3 font-medium">Latest Indicator</th>
              <th className="py-2 pr-3 font-medium">Suggested Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.sensor} className="border-b border-slate-100">
                <td className="py-2 pr-3 font-mono-lab font-semibold">{r.sensor}</td>
                <td className="py-2 pr-3">
                  <Pill color={r.trend === 'Increasing' ? 'amber' : r.trend === 'Decreasing' ? 'blue' : 'slate'}>{r.trend}</Pill>
                </td>
                <td className="py-2 pr-3 font-mono-lab">{r.latest.toFixed(2)}</td>
                <td className="py-2 pr-3 text-slate-600">{r.action}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <CautionNote>
        Decision-support suggestion — not a structural safety certification. Any recommended inspection or action
        requires review and approval by a qualified engineer.
      </CautionNote>
      <ResearchLimitations
        items={[
          'Trend classification uses a fixed slope threshold (±0.015 per inspection) chosen for this demonstration, not derived from a validated decision-theoretic model.',
          'Suggested actions are illustrative decision-support text, not outputs of an optimization or risk model.',
        ]}
      />
    </div>
  );
}
