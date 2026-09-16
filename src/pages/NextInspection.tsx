import { useMemo } from 'react';
import { CalendarClock } from 'lucide-react';
import { useApp } from '../state/store';
import { SectionHeader, Card, ResearchLimitations, Pill } from '../components/common/Panels';
import { assessDataQuality } from '../engine/quality';

interface Recommendation {
  title: string;
  detail: string;
  severity: 'info' | 'warn';
}

export default function NextInspection() {
  const { dataset, anomalyResults, selectedInspectionId } = useApp();

  const recommendations = useMemo<Recommendation[]>(() => {
    const recs: Recommendation[] = [];

    // Under-sampled sensors
    const counts = new Map<string, number>();
    for (const s of dataset.signals) counts.set(s.sensorId, (counts.get(s.sensorId) || 0) + 1);
    const values = Array.from(counts.values());
    const median = values.slice().sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? 0;
    for (const sensor of dataset.sensors) {
      const c = counts.get(sensor.sensorId) ?? 0;
      if (c < median) {
        recs.push({
          title: `Sensor ${sensor.sensorId} has limited longitudinal observations`,
          detail: `${sensor.sensorId} has ${c} signal record(s), below the campaign median of ${median}. An additional measurement could improve the temporal dataset.`,
          severity: 'warn',
        });
      }
    }

    // Longitudinal coverage
    if (dataset.inspections.length < 6) {
      recs.push({
        title: 'Longitudinal sequence remains short',
        detail: `Only ${dataset.inspections.length} inspection(s) are available. Trend and prognosis analyses would benefit from additional future inspections at a consistent interval.`,
        severity: 'info',
      });
    }

    // Anomalous sensors requiring confirmation
    const latest = anomalyResults.filter((a) => a.inspectionId === selectedInspectionId);
    for (const a of latest) {
      if (a.status === 'Requires inspection' || a.status === 'Potential anomaly') {
        recs.push({
          title: `Confirm anomaly at ${a.sensorId}`,
          detail: `${a.sensorId} shows an anomaly indicator of ${a.anomalyIndicator.toFixed(2)} (${a.status}) at ${selectedInspectionId}. A follow-up acquisition, ideally with repeated measurements, would help confirm whether this is a persistent trend or measurement variability.`,
          severity: 'warn',
        });
      }
    }

    // Data quality gaps
    const quality = assessDataQuality(dataset);
    for (const q of quality) {
      if (q.level !== 'Good') {
        recs.push({
          title: `Data quality gap: ${q.label}`,
          detail: q.detail,
          severity: q.level === 'Insufficient' ? 'warn' : 'info',
        });
      }
    }

    if (recs.length === 0) {
      recs.push({
        title: 'No immediate data-quality gaps identified',
        detail: 'Continue the existing monitoring interval and routine data quality checks.',
        severity: 'info',
      });
    }

    return recs;
  }, [dataset, anomalyResults, selectedInspectionId]);

  return (
    <div>
      <SectionHeader
        title="Suggest Next Inspection"
        subtitle="Rule-based planning suggestions derived from sensor coverage, longitudinal depth, anomaly indicators, and data quality checks."
      />
      <div className="space-y-3">
        {recommendations.map((r, i) => (
          <Card key={i}>
            <div className="flex items-start gap-3">
              <CalendarClock size={16} className={r.severity === 'warn' ? 'text-amber-600 mt-0.5' : 'text-slate-400 mt-0.5'} />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <div className="text-[13px] font-semibold text-[#16202a]">{r.title}</div>
                  <Pill color={r.severity === 'warn' ? 'amber' : 'slate'}>Research Planning Suggestion</Pill>
                </div>
                <p className="text-[12px] text-slate-600 mt-1">{r.detail}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>
      <div className="mt-4">
        <ResearchLimitations
          items={[
            'These are rule-based heuristics (sensor observation counts, fixed anomaly thresholds, data-quality checks) — not an optimal experimental-design algorithm.',
            'Every suggestion here requires researcher review and approval before any physical inspection or measurement is scheduled.',
          ]}
        />
      </div>
    </div>
  );
}
