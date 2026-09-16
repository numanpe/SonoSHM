import { useMemo, useState } from 'react';
import { useApp } from '../state/store';
import { SectionHeader, Card, ResearchLimitations } from '../components/common/Panels';
import { ProvenanceBadge } from '../components/common/Badge';
import { pearson, groupSeparation } from '../engine/stats';
import { DAMAGE_STATE_ORDER } from '../data/syntheticData';
import { fitLinearTrend } from '../engine/prognosis';
import type { FeatureRecord } from '../data/types';

interface Question {
  id: string;
  question: string;
  relevantVariables: string[];
  suggestedAnalysis: string[];
  requiredValidation: string;
  computeEvidence: (ctx: ReturnType<typeof useApp>) => string;
  limitation: string;
}

function groupBy(features: FeatureRecord[], key: keyof FeatureRecord): number[][] {
  return DAMAGE_STATE_ORDER.map((state) => features.filter((f) => f.generatedState === state).map((f) => (f[key] as number)));
}

const QUESTIONS: Question[] = [
  {
    id: 'q1',
    question: 'Can nonlinear ultrasonic features distinguish early-stage damage?',
    relevantVariables: ['H2/H1', 'H3/H1', "β′", 'Attenuation', 'Spectral energy', 'ToF', 'Δv/v₀'],
    suggestedAnalysis: ['Feature distributions', 'Classification', 'Confusion matrix', 'Correlation', 'Longitudinal comparison'],
    requiredValidation: 'Experimental ultrasonic measurements across controlled damage states are required to establish whether the observed feature differences persist in real structures.',
    limitation: 'The "early damage" class in this dataset is synthetic and was generated with an intentionally subtle perturbation; real early-stage damage signatures may be smaller, larger, or qualitatively different.',
    computeEvidence: (ctx) => {
      const early = ctx.featuresAll.filter((f) => f.generatedState === 'early');
      const healthy = ctx.featuresAll.filter((f) => f.generatedState === 'healthy');
      const meanEarly = early.length ? early.reduce((a, b) => a + b.H2H1, 0) / early.length : 0;
      const meanHealthy = healthy.length ? healthy.reduce((a, b) => a + b.H2H1, 0) / healthy.length : 0;
      const recall = ctx.primaryModel.metrics.perClass.early?.recall ?? 0;
      return `In the synthetic dataset, mean H2/H1 = ${meanEarly.toFixed(4)} for the "early" class vs ${meanHealthy.toFixed(4)} for "healthy" (n=${early.length} vs ${healthy.length}). The demonstration classifier's recall for the "early" class on the held-out test set is ${(recall * 100).toFixed(0)}%.`;
    },
  },
  {
    id: 'q2',
    question: 'Which nonlinear feature changes most strongly across damage states?',
    relevantVariables: ['H2/H1', 'H3/H1', "β′", 'Attenuation Indicator'],
    suggestedAnalysis: ['Group-mean comparison', 'Effect-size ranking', 'Box plots by damage state'],
    requiredValidation: 'A validated ranking requires real measurements across independently confirmed damage states, ideally with repeated specimens.',
    limitation: 'The effect-size proxy used here (range of group means normalized by pooled standard deviation) is a simple demonstration metric, not a formal statistical test with significance levels.',
    computeEvidence: (ctx) => {
      const keys: (keyof FeatureRecord)[] = ['H2H1', 'H3H1', 'betaPrime', 'attenuationIndicator'];
      const scores = keys.map((k) => ({ k, sep: groupSeparation(groupBy(ctx.featuresAll, k)) }));
      scores.sort((a, b) => b.sep - a.sep);
      return `Ranked by demonstration effect size (this dataset): ${scores.map((s) => `${String(s.k)} (${s.sep.toFixed(2)})`).join(' > ')}.`;
    },
  },
  {
    id: 'q3',
    question: 'Can reference-free features identify anomalous structural regions?',
    relevantVariables: ['H2/H1', 'H3/H1', "β′", 'Anomaly Indicator'],
    suggestedAnalysis: ['Standardized distance from baseline', 'Spatial mapping across sensors', 'Threshold-based flagging'],
    requiredValidation: 'Requires testing on structures with independently confirmed, spatially localized real damage, without reliance on a per-sensor historical baseline.',
    limitation: 'The demonstration method still uses each sensor\'s own first-inspection baseline; it demonstrates the anomaly-scoring concept rather than a literal reference-free method.',
    computeEvidence: (ctx) => {
      const latest = [...ctx.dataset.inspections].sort((a, b) => b.index - a.index)[0];
      const atLatest = ctx.anomalyResults.filter((a) => a.inspectionId === latest.inspectionId);
      const flagged = atLatest.filter((a) => a.status !== 'Normal observation' && a.status !== 'Insufficient evidence');
      return `At ${latest.inspectionId}, ${flagged.length} of ${atLatest.length} sensors were flagged as "Potential anomaly" or "Requires inspection" — ${flagged.map((f) => f.sensorId).join(', ') || 'none'}.`;
    },
  },
  {
    id: 'q4',
    question: 'Does wave velocity change alongside nonlinear harmonic features?',
    relevantVariables: ['Δv/v₀', 'H2/H1', 'H3/H1'],
    suggestedAnalysis: ['Correlation analysis', 'Joint longitudinal trend plots'],
    requiredValidation: 'Real coupled velocity/harmonic measurements under controlled damage progression are needed to test this relationship.',
    limitation: 'Both features were generated from the same underlying synthetic severity parameter, which can inflate their apparent association compared to independently measured physical quantities.',
    computeEvidence: (ctx) => {
      const dv = ctx.featuresAgg.map((f) => f.deltaVOverV0 ?? 0);
      const h2 = ctx.featuresAgg.map((f) => f.H2H1);
      const r = pearson(dv, h2);
      return `Pearson correlation between Δv/v₀ and H2/H1 across all sensor–inspection combinations in this dataset: r = ${r.toFixed(3)}.`;
    },
  },
  {
    id: 'q5',
    question: 'Can longitudinal ultrasonic features support damage prognosis?',
    relevantVariables: ['Damage Indicator (composite)', 'Inspection index', 'Sensor position'],
    suggestedAnalysis: ['Linear/polynomial trend fitting', 'Residual-based uncertainty', 'Cross-sensor comparison'],
    requiredValidation: 'Prognosis claims require a longitudinal experimental campaign with many more inspections and independently verified damage progression.',
    limitation: 'Five inspections is far too few to validate a prognosis model; the trend fit shown elsewhere in this application is illustrative of method only.',
    computeEvidence: (ctx) => {
      let nearestSensorId = ctx.dataset.sensors[0]?.sensorId ?? '';
      let bestDist = Infinity;
      for (const s of ctx.dataset.sensors) {
        const d = Math.abs(s.positionFraction - ctx.structureProfile.damageLocationFraction);
        if (d < bestDist) { bestDist = d; nearestSensorId = s.sensorId; }
      }
      const inspections = [...ctx.dataset.inspections].sort((a, b) => a.index - b.index);
      const series = inspections.map((i) => ctx.damageIndicatorMap.get(`${nearestSensorId}__${i.inspectionId}`) ?? 0);
      const fit = fitLinearTrend(inspections.map((i) => i.index), series);
      return `For sensor ${nearestSensorId} (nearest the synthetic damage location), a linear fit of the damage indicator across ${inspections.length} inspections gives slope = ${fit.slope.toFixed(4)} per inspection, R² = ${fit.rSquared.toFixed(3)}.`;
    },
  },
];

export default function ResearchQuestions() {
  const app = useApp();
  const [openId, setOpenId] = useState<string>('q1');

  const evidence = useMemo(() => {
    const map: Record<string, string> = {};
    for (const q of QUESTIONS) map[q.id] = q.computeEvidence(app);
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app.featuresAll, app.featuresAgg, app.anomalyResults, app.primaryModel, app.damageIndicatorMap]);

  return (
    <div>
      <SectionHeader
        title="Research Question Explorer"
        subtitle="Explore central research questions for this project. Answers are computed live from the current synthetic dataset — never pre-written conclusions."
        right={<ProvenanceBadge kind="MODEL_OUTPUT" />}
      />
      <div className="space-y-3">
        {QUESTIONS.map((q) => (
          <Card key={q.id}>
            <button className="w-full text-left" onClick={() => setOpenId(openId === q.id ? '' : q.id)}>
              <div className="text-[14px] font-semibold text-[#16202a]">{q.question}</div>
            </button>
            {openId === q.id && (
              <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4 text-[13px]">
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold mb-1">Relevant Variables</div>
                  <div className="flex flex-wrap gap-1.5">
                    {q.relevantVariables.map((v) => (
                      <span key={v} className="px-2 py-0.5 rounded-full bg-slate-100 border border-slate-300 text-[11px] font-mono-lab">{v}</span>
                    ))}
                  </div>
                  <div className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold mt-3 mb-1">Suggested Analysis</div>
                  <ul className="list-disc list-inside text-slate-600 space-y-0.5">
                    {q.suggestedAnalysis.map((s) => (<li key={s}>{s}</li>))}
                  </ul>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold mb-1">Available Data</div>
                  <p className="text-slate-600 mb-3">Synthetic demonstration dataset — {app.dataset.signals.length} signal records across {app.dataset.sensors.length} sensors and {app.dataset.inspections.length} inspections.</p>
                  <div className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold mb-1">Current Evidence</div>
                  <p className="text-slate-700 bg-slate-50 border border-slate-200 rounded-md px-3 py-2 mb-3 font-mono-lab text-[12px]">{evidence[q.id]}</p>
                  <div className="text-[11px] uppercase tracking-wide text-amber-700 font-semibold mb-1">Limitations</div>
                  <p className="text-amber-900/90 mb-2">{q.limitation}</p>
                  <div className="text-[11px] uppercase tracking-wide text-rose-700 font-semibold mb-1">Required Experimental Validation</div>
                  <p className="text-rose-900/90">{q.requiredValidation}</p>
                </div>
              </div>
            )}
          </Card>
        ))}
      </div>
      <div className="mt-4">
        <ResearchLimitations
          items={[
            'All "Current Evidence" statements are computed from the synthetic demonstration dataset in this session — they describe how the synthetic data behaves, not established scientific findings about real structures.',
            'None of these research questions are claimed to be answered by this prototype; the explorer demonstrates how such questions could be organized against real experimental data.',
          ]}
        />
      </div>
    </div>
  );
}
