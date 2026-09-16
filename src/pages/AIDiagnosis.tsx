import { useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip as RTooltip, CartesianGrid, Cell } from 'recharts';
import { useApp } from '../state/store';
import { SectionHeader, Card, StatCard, ResearchLimitations, InfoNote, Tooltip } from '../components/common/Panels';
import { DamageStatePill, ProvenanceBadge } from '../components/common/Badge';
import { DAMAGE_STATE_ORDER } from '../data/syntheticData';
import { trainTestSplit, FULL_FEATURE_SET, FEATURE_LABELS, vectorOf } from '../engine/ml';
import { evaluateGBT, gbtPredict, gbtScores, type GBTModel } from '../engine/gbt';
import { computeShapleyValues } from '../engine/shapley';
import type { ClassifierMetrics, DamageStateId, FeatureRecord } from '../data/types';

const TABS = ['Diagnosis', 'Model Performance', 'Model Comparison', 'Feature Importance'] as const;
const STATE_COLORS: Record<string, string> = { healthy: '#1f8a5f', early: '#c9971e', moderate: '#d1651f', severe: '#b5292f' };

interface GBTBundle {
  metrics: ClassifierMetrics;
  model: GBTModel;
  background: number[][];
}

export default function AIDiagnosis() {
  const [tab, setTab] = useState<(typeof TABS)[number]>('Diagnosis');
  const [method, setMethod] = useState<'knn' | 'gbt'>('knn');
  const { featuresAll, seed } = useApp();

  const gbt = useMemo<GBTBundle>(() => {
    const { train, test } = trainTestSplit(featuresAll, seed + 99, 0.3);
    const { metrics, model } = evaluateGBT(train, test, FULL_FEATURE_SET, { nRounds: 40, learningRate: 0.25, maxDepth: 3, minLeaf: 3 });
    const background = train.slice(0, 20).map((r) => vectorOf(r, FULL_FEATURE_SET));
    return { metrics, model, background };
  }, [featuresAll, seed]);

  return (
    <div>
      <SectionHeader
        title="AI Damage Diagnosis"
        subtitle="Features → classifier → diagnostic state. Two real, differently-behaved models are offered side by side — a transparent k-nearest-neighbour classifier, and a gradient-boosted tree ensemble with exact Shapley-value explanations — both calculated from the synthetic demonstration dataset, never fabricated."
        right={<ProvenanceBadge kind="MODEL_OUTPUT" />}
      />
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex gap-1 border-b border-slate-200 flex-1">
          {TABS.map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`px-3 py-2 text-[13px] font-medium border-b-2 -mb-px transition-colors ${tab === t ? 'border-[#1d5b8f] text-[#1d5b8f]' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
              {t}
            </button>
          ))}
        </div>
        {tab !== 'Model Comparison' && (
          <div className="inline-flex rounded-md border border-slate-300 overflow-hidden text-[12px] shrink-0">
            <button
              onClick={() => setMethod('knn')}
              className={`px-2.5 py-1.5 ${method === 'knn' ? 'bg-[#1d5b8f] text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
            >
              k-NN (Model C)
            </button>
            <button
              onClick={() => setMethod('gbt')}
              className={`px-2.5 py-1.5 border-l border-slate-300 ${method === 'gbt' ? 'bg-[#1d5b8f] text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
            >
              Gradient Boosted Trees
            </button>
          </div>
        )}
      </div>
      {tab === 'Diagnosis' && <DiagnosisTab method={method} gbt={gbt} />}
      {tab === 'Model Performance' && <ModelPerformanceTab method={method} gbt={gbt} />}
      {tab === 'Model Comparison' && <ModelComparisonTab gbt={gbt} />}
      {tab === 'Feature Importance' && <FeatureImportanceTab method={method} gbt={gbt} />}
    </div>
  );
}

function DiagnosisTab({ method, gbt }: { method: 'knn' | 'gbt'; gbt: GBTBundle }) {
  const { dataset, featuresAgg, selectedSensorId, setSelectedSensorId, selectedInspectionId, setSelectedInspectionId, diagnose } = useApp();
  const rec = featuresAgg.find((f) => f.sensorId === selectedSensorId && f.inspectionId === selectedInspectionId);
  const gbtResult = method === 'gbt' && rec ? gbtPredict(gbt.model, rec) : null;
  const knnResult = method === 'knn' ? diagnose(selectedSensorId, selectedInspectionId) : null;
  const result: { predictedState: DamageStateId; probabilities: Record<DamageStateId, number> } | null = gbtResult
    ? { predictedState: gbtResult.label, probabilities: gbtResult.probabilities }
    : knnResult;
  const resultModelId = method === 'gbt' ? 'Gradient Boosted Trees' : knnResult?.modelId;

  const probData = result
    ? DAMAGE_STATE_ORDER.map((s) => ({ state: s, probability: result.probabilities[s] }))
    : [];

  const shapData = useMemo(() => {
    if (method !== 'gbt' || !rec || !result) return [];
    const classIdx = gbt.model.labels.indexOf(result.predictedState);
    const x = vectorOf(rec as FeatureRecord, FULL_FEATURE_SET);
    const f = (xi: number[]) => gbtScores(gbt.model, xi)[classIdx];
    return computeShapleyValues(f, x, gbt.background, FULL_FEATURE_SET.map((k) => FEATURE_LABELS[k]))
      .sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
  }, [method, rec, result, gbt]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <div>
          <label className="text-[11px] uppercase tracking-wide text-slate-500 font-medium mr-2">Sensor</label>
          <select value={selectedSensorId} onChange={(e) => setSelectedSensorId(e.target.value)} className="border border-slate-300 rounded-md px-2 py-1.5 text-[13px] font-mono-lab">
            {dataset.sensors.map((s) => (<option key={s.sensorId} value={s.sensorId}>{s.sensorId}</option>))}
          </select>
        </div>
        <div>
          <label className="text-[11px] uppercase tracking-wide text-slate-500 font-medium mr-2">Inspection</label>
          <select value={selectedInspectionId} onChange={(e) => setSelectedInspectionId(e.target.value)} className="border border-slate-300 rounded-md px-2 py-1.5 text-[13px] font-mono-lab">
            {dataset.inspections.map((i) => (<option key={i.inspectionId} value={i.inspectionId}>{i.inspectionId}</option>))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card title="Input Features" className="lg:col-span-1">
          {rec && (
            <ul className="space-y-2 text-[12px] font-mono-lab">
              <li className="flex justify-between"><span className="text-slate-500 font-sans">H2/H1</span>{rec.H2H1.toFixed(4)}</li>
              <li className="flex justify-between"><span className="text-slate-500 font-sans">H3/H1</span>{rec.H3H1.toFixed(4)}</li>
              <li className="flex justify-between"><span className="text-slate-500 font-sans">β′</span>{rec.betaPrime.toExponential(2)}</li>
              <li className="flex justify-between"><span className="text-slate-500 font-sans">Attenuation</span>{rec.attenuationIndicator.toFixed(3)}</li>
              <li className="flex justify-between"><span className="text-slate-500 font-sans">ToF</span>{rec.tofUs.toFixed(1)} µs</li>
              <li className="flex justify-between"><span className="text-slate-500 font-sans">Δv/v₀</span>{((rec.deltaVOverV0 ?? 0) * 100).toFixed(1)}%</li>
            </ul>
          )}
        </Card>
        <Card title="Predicted Diagnostic State" className="lg:col-span-2">
          {result && (
            <>
              <div className="flex items-center gap-3 mb-3">
                <DamageStatePill state={result.predictedState} />
                <span className="text-[11px] text-slate-400 font-mono-lab">Model: {resultModelId}</span>
              </div>
              <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={probData} margin={{ top: 4, right: 8, left: -10, bottom: 4 }}>
                    <CartesianGrid stroke="#eef1f5" />
                    <XAxis dataKey="state" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                    <YAxis tick={{ fontSize: 10 }} stroke="#94a3b8" domain={[0, 1]} />
                    <RTooltip contentStyle={{ fontSize: 11 }} />
                    <Bar dataKey="probability" radius={[3, 3, 0, 0]}>
                      {probData.map((d) => (<Cell key={d.state} fill={STATE_COLORS[d.state]} />))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </>
          )}
        </Card>
      </div>

      {method === 'gbt' && shapData.length > 0 && (
        <Card title={`Shapley Feature Attribution — why "${result?.predictedState}"?`} right={<span className="text-[11px] text-slate-400">Exact Shapley values on the predicted class's log-odds score</span>}>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={shapData} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
                <CartesianGrid stroke="#eef1f5" />
                <XAxis type="number" tick={{ fontSize: 10 }} stroke="#94a3b8" />
                <YAxis type="category" dataKey="feature" width={170} tick={{ fontSize: 11 }} stroke="#94a3b8" />
                <RTooltip contentStyle={{ fontSize: 11 }} />
                <Bar dataKey="value" radius={[0, 3, 3, 0]}>
                  {shapData.map((d) => (<Cell key={d.feature} fill={d.value >= 0 ? '#1d5b8f' : '#b5292f'} />))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="text-[11px] text-slate-400 mt-2">
            Positive (blue) = pushed the model toward "{result?.predictedState}"; negative (red) = pushed away from
            it. These are genuine Shapley values (exact 2⁶-coalition enumeration, not an approximation) and sum
            exactly to this prediction's log-odds minus the background average.
          </p>
        </Card>
      )}

      <InfoNote>
        {method === 'gbt'
          ? 'Class "probability" here is a softmax over the gradient-boosted ensemble\'s per-class log-odds scores — a real, if small-scale, boosted-tree probability estimate, not a calibrated statistical probability validated against real structures.'
          : 'Class "probability" here is the vote fraction among the k nearest neighbours in standardized feature space — a transparent, inspectable quantity, not a calibrated statistical probability.'}
      </InfoNote>
    </div>
  );
}

function ModelPerformanceTab({ method, gbt }: { method: 'knn' | 'gbt'; gbt: GBTBundle }) {
  const { primaryModel } = useApp();
  const m = method === 'gbt' ? gbt.metrics : primaryModel.metrics;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Accuracy" value={(m.accuracy * 100).toFixed(1)} unit="%" hint={`n_test = ${m.nTest}`} />
        <StatCard label="Macro Precision" value={(m.macroPrecision * 100).toFixed(1)} unit="%" />
        <StatCard label="Macro Recall" value={(m.macroRecall * 100).toFixed(1)} unit="%" />
        <StatCard label="Macro F1" value={(m.macroF1 * 100).toFixed(1)} unit="%" />
      </div>
      <Card title="Confusion Matrix" right={<span className="text-[11px] text-slate-400">rows = actual, columns = predicted</span>}>
        <table className="text-[12px] font-mono-lab">
          <thead>
            <tr>
              <th className="p-2" />
              {m.labelsOrder.map((l) => (<th key={l} className="p-2 text-slate-500 font-medium">{l}</th>))}
            </tr>
          </thead>
          <tbody>
            {m.confusionMatrix.map((row, i) => (
              <tr key={i}>
                <td className="p-2 text-slate-500 font-medium font-sans">{m.labelsOrder[i]}</td>
                {row.map((v, j) => (
                  <td key={j} className={`p-2 text-center rounded ${i === j ? 'bg-emerald-50 text-emerald-800 font-semibold' : v > 0 ? 'bg-red-50 text-red-700' : ''}`}>{v}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <Card title="Per-Class Metrics">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="text-left text-slate-500 border-b border-slate-200">
              <th className="py-2 pr-3 font-medium">Class</th>
              <th className="py-2 pr-3 font-medium">Precision</th>
              <th className="py-2 pr-3 font-medium">Recall</th>
              <th className="py-2 pr-3 font-medium">F1</th>
              <th className="py-2 pr-3 font-medium">Support</th>
            </tr>
          </thead>
          <tbody>
            {m.labelsOrder.map((l) => {
              const pc = m.perClass[l];
              return (
                <tr key={l} className="border-b border-slate-100 font-mono-lab">
                  <td className="py-2 pr-3 font-sans"><DamageStatePill state={l} /></td>
                  <td className="py-2 pr-3">{(pc.precision * 100).toFixed(0)}%</td>
                  <td className="py-2 pr-3">{(pc.recall * 100).toFixed(0)}%</td>
                  <td className="py-2 pr-3">{(pc.f1 * 100).toFixed(0)}%</td>
                  <td className="py-2 pr-3">{pc.support}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
      <InfoNote>
        {method === 'gbt'
          ? 'Synthetic-data demonstration model (gradient-boosted regression trees, 40 rounds, depth 3, one-vs-rest softmax boosting over the full feature set). Performance does not represent validated structural damage detection on real structures.'
          : 'Synthetic-data demonstration model (k-nearest-neighbours, k=5, standardized features). Performance does not represent validated structural damage detection on real structures.'}
      </InfoNote>
    </div>
  );
}

function ModelComparisonTab({ gbt }: { gbt: GBTBundle }) {
  const { modelEvaluations } = useApp();
  const data = [
    ...modelEvaluations.map((m) => ({
      name: m.label,
      accuracy: Number((m.metrics.accuracy * 100).toFixed(1)),
      f1: Number((m.metrics.macroF1 * 100).toFixed(1)),
    })),
    {
      name: 'Model D — Gradient Boosted Trees',
      accuracy: Number((gbt.metrics.accuracy * 100).toFixed(1)),
      f1: Number((gbt.metrics.macroF1 * 100).toFixed(1)),
    },
  ];
  return (
    <div className="space-y-4">
      <Card title="Model A / B / C / D — Accuracy on Held-Out Test Set">
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 16, left: -10, bottom: 4 }}>
              <CartesianGrid stroke="#eef1f5" />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} stroke="#94a3b8" />
              <YAxis tick={{ fontSize: 10 }} stroke="#94a3b8" domain={[0, 100]} />
              <RTooltip contentStyle={{ fontSize: 11 }} />
              <Bar dataKey="accuracy" name="Accuracy (%)" fill="#1d5b8f" radius={[3, 3, 0, 0]} />
              <Bar dataKey="f1" name="Macro F1 (%)" fill="#94a3b8" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        {modelEvaluations.map((m) => (
          <Card key={m.presetId} title={m.label}>
            <div className="text-[12px] text-slate-600 space-y-1">
              <div>Features: <span className="font-mono-lab">{m.featureKeys.join(', ')}</span></div>
              <div>Accuracy: <span className="font-mono-lab font-semibold">{(m.metrics.accuracy * 100).toFixed(1)}%</span></div>
              <div>Macro F1: <span className="font-mono-lab font-semibold">{(m.metrics.macroF1 * 100).toFixed(1)}%</span></div>
            </div>
          </Card>
        ))}
        <Card title="Model D — Gradient Boosted Trees">
          <div className="text-[12px] text-slate-600 space-y-1">
            <div>Features: <span className="font-mono-lab">{FULL_FEATURE_SET.join(', ')}</span></div>
            <div>Accuracy: <span className="font-mono-lab font-semibold">{(gbt.metrics.accuracy * 100).toFixed(1)}%</span></div>
            <div>Macro F1: <span className="font-mono-lab font-semibold">{(gbt.metrics.macroF1 * 100).toFixed(1)}%</span></div>
          </div>
        </Card>
      </div>
      <InfoNote>
        Models A/B/C (k-nearest-neighbours) and D (gradient-boosted trees) are all trained and evaluated on the same
        train/test split of the synthetic dataset for a fair comparison. Differences reflect this demonstration
        dataset only and should not be read as evidence that any model family or feature combination is superior for
        real structural diagnosis.
      </InfoNote>
    </div>
  );
}

function FeatureImportanceTab({ method, gbt }: { method: 'knn' | 'gbt'; gbt: GBTBundle }) {
  const { primaryModel, featuresAll } = useApp();

  const shapImportance = useMemo(() => {
    if (method !== 'gbt') return [];
    // Average |Shapley value| across a sample of test-set records, for each
    // predicted class's own log-odds — a genuine (if more expensive) global
    // importance measure built from the same exact per-prediction Shapley
    // values shown on the Diagnosis tab, rather than a separate heuristic.
    const { test } = trainTestSplit(featuresAll, 0, 0.3);
    const sample = test.slice(0, 15);
    const totals = new Array(FULL_FEATURE_SET.length).fill(0);
    for (const rec of sample) {
      const pred = gbtPredict(gbt.model, rec);
      const classIdx = gbt.model.labels.indexOf(pred.label);
      const x = vectorOf(rec, FULL_FEATURE_SET);
      const f = (xi: number[]) => gbtScores(gbt.model, xi)[classIdx];
      const shap = computeShapleyValues(f, x, gbt.background, FULL_FEATURE_SET as unknown as string[]);
      shap.forEach((s, i) => (totals[i] += Math.abs(s.value)));
    }
    const maxTotal = Math.max(...totals, 1e-9);
    return FULL_FEATURE_SET.map((k, i) => ({ feature: FEATURE_LABELS[k], importance: totals[i] / maxTotal }))
      .sort((a, b) => b.importance - a.importance);
  }, [method, featuresAll, gbt]);

  const chartData = method === 'gbt' ? shapImportance : primaryModel.featureImportance;
  const chartTitle = method === 'gbt' ? 'Mean |Shapley Value| Feature Importance' : 'Permutation Feature Importance';
  const tooltipText = method === 'gbt'
    ? 'Averaged across a sample of held-out predictions\' exact Shapley attributions to the predicted class\'s log-odds — a global summary of the same per-prediction explanations shown on the Diagnosis tab, not a physical damage mechanism.'
    : 'Feature importance reflects the behaviour of the demonstration model and does not establish a physical damage mechanism.';

  return (
    <div className="space-y-4">
      <Card title={chartTitle} right={<Tooltip text={tooltipText}><span className="text-[11px] text-[#1d5b8f] underline decoration-dotted cursor-help">What does this mean?</span></Tooltip>}>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
              <CartesianGrid stroke="#eef1f5" />
              <XAxis type="number" domain={[0, 1]} tick={{ fontSize: 10 }} stroke="#94a3b8" />
              <YAxis type="category" dataKey="feature" width={170} tick={{ fontSize: 11 }} stroke="#94a3b8" />
              <RTooltip contentStyle={{ fontSize: 11 }} />
              <Bar dataKey="importance" fill="#1d5b8f" radius={[0, 3, 3, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
      <ResearchLimitations
        items={method === 'gbt' ? [
          'The classifier is a gradient-boosted regression-tree ensemble (40 rounds, depth-3 trees, one-vs-rest softmax boosting) — a real, if small-scale, second model family offered alongside k-NN for comparison.',
          'Importance here is the mean absolute exact Shapley value over a 15-record sample of the held-out test set; small sample size makes these estimates noisy, same as the k-NN permutation-importance method.',
          'Ground-truth labels are the synthetic generation parameters, not independently verified real damage states.',
        ] : [
          'The classifier is k-nearest-neighbours (k=5) on standardized features — a transparent, simple model chosen for methodological demonstration rather than predictive optimality.',
          'Feature importance is computed via permutation on the held-out test set; small test-set size (≈30% of ~90 records) makes these estimates noisy.',
          'Ground-truth labels are the synthetic generation parameters, not independently verified real damage states.',
        ]}
      />
    </div>
  );
}
