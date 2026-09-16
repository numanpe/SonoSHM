import { useRef, useState } from 'react';
import { Download, Upload } from 'lucide-react';
import { useApp } from '../state/store';
import { SectionHeader, Card, ResearchLimitations, InfoNote } from '../components/common/Panels';
import { ProvenanceBadge } from '../components/common/Badge';
import { assessDataQuality, qualityBadgeClasses } from '../engine/quality';
import {
  downloadCsv,
  exportFeaturesCsv,
  exportInspectionCsv,
  importFeatureCsv,
  importSignalCsv,
  type CsvValidationIssue,
} from '../engine/csv';

const TABS = ['Structure & Sensors', 'Damage States', 'Data Management'] as const;

export default function ExperimentSetup() {
  const [tab, setTab] = useState<(typeof TABS)[number]>('Structure & Sensors');
  return (
    <div>
      <SectionHeader
        title="Experiment Setup"
        subtitle="Structure geometry, sensor configuration, damage-state definitions, and data import / export for this monitoring campaign."
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
      {tab === 'Structure & Sensors' && <StructureSensorsTab />}
      {tab === 'Damage States' && <DamageStatesTab />}
      {tab === 'Data Management' && <DataManagementTab />}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <label className="text-[11px] uppercase tracking-wide text-slate-500 font-medium">{label}</label>
      <div className="mt-1 border border-slate-300 rounded-md px-3 py-2 text-[13px] font-mono-lab bg-slate-50 text-slate-700">
        {value}
      </div>
    </div>
  );
}

function StructureSensorsTab() {
  const { dataset } = useApp();
  const s = dataset.structure;
  return (
    <div className="space-y-4">
      <Card title="Structure Configuration">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Field label="Structure ID" value={s.structureId} />
          <Field label="Structure Type" value={s.structureType} />
          <Field label="Component Type" value={s.componentType} />
          <Field label="Material" value={s.material} />
          <Field label="Length" value={`${s.lengthMm} mm`} />
          <Field label="Width" value={`${s.widthMm} mm`} />
          <Field label="Height" value={`${s.heightMm} mm`} />
          <Field label="Span" value={`${s.spanMm} mm`} />
          <Field label="Age" value={`${s.ageYears} years`} />
          <Field label="Loading Condition" value={s.loadingCondition} />
        </div>
      </Card>

      <Card title="Sensor Layout">
        <BeamSensorDiagram />
      </Card>

      <Card title="Sensor Configuration">
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-left text-slate-500 border-b border-slate-200">
                <th className="py-2 pr-3 font-medium">Sensor</th>
                <th className="py-2 pr-3 font-medium">Position (span fraction)</th>
                <th className="py-2 pr-3 font-medium">Direction</th>
                <th className="py-2 pr-3 font-medium">Excitation Location</th>
                <th className="py-2 pr-3 font-medium">Freq.</th>
                <th className="py-2 pr-3 font-medium">Sampling Freq.</th>
                <th className="py-2 pr-3 font-medium">Duration</th>
                <th className="py-2 pr-3 font-medium">Propagation Dist.</th>
              </tr>
            </thead>
            <tbody>
              {dataset.sensors.map((sn) => (
                <tr key={sn.sensorId} className="border-b border-slate-100 font-mono-lab">
                  <td className="py-2 pr-3 font-semibold text-slate-700">{sn.sensorId}</td>
                  <td className="py-2 pr-3">{sn.positionFraction.toFixed(2)}</td>
                  <td className="py-2 pr-3 capitalize">{sn.direction}</td>
                  <td className="py-2 pr-3 font-sans text-slate-600">{sn.excitationLocation}</td>
                  <td className="py-2 pr-3">{sn.excitationFrequencyKHz} kHz</td>
                  <td className="py-2 pr-3">{sn.samplingFrequencyMHz} MHz</td>
                  <td className="py-2 pr-3">{sn.acquisitionDurationUs} µs</td>
                  <td className="py-2 pr-3">{sn.propagationDistanceMm} mm</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <ResearchLimitations
        items={[
          'Sensor propagation distances are demonstration values used to compute wave velocity; they are not calibrated to a specific real transducer installation.',
          'A single excitation frequency (100 kHz) is used across all sensors for demonstration simplicity — real campaigns typically sweep or vary excitation frequency.',
        ]}
      />
    </div>
  );
}

function BeamSensorDiagram() {
  const { dataset, selectedSensorId } = useApp();
  const W = 760;
  const H = 130;
  const beamX = 60;
  const beamW = W - 120;
  const beamY = 55;
  const beamH = 26;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
      <line x1={beamX} y1={beamY + beamH + 18} x2={beamX} y2={beamY + beamH + 4} stroke="#64748b" strokeWidth={2} />
      <polygon points={`${beamX - 10},${beamY + beamH + 18} ${beamX + 10},${beamY + beamH + 18} ${beamX},${beamY + beamH + 4}`} fill="#64748b" />
      <line
        x1={beamX + beamW}
        y1={beamY + beamH + 18}
        x2={beamX + beamW}
        y2={beamY + beamH + 4}
        stroke="#64748b"
        strokeWidth={2}
      />
      <polygon
        points={`${beamX + beamW - 10},${beamY + beamH + 18} ${beamX + beamW + 10},${beamY + beamH + 18} ${beamX + beamW},${beamY + beamH + 4}`}
        fill="#64748b"
      />
      <rect x={beamX} y={beamY} width={beamW} height={beamH} rx={3} fill="#e2e8f0" stroke="#94a3b8" />
      {dataset.sensors.map((sn) => {
        const cx = beamX + sn.positionFraction * beamW;
        const isSel = sn.sensorId === selectedSensorId;
        return (
          <g key={sn.sensorId}>
            <line x1={cx} y1={beamY - 22} x2={cx} y2={beamY} stroke={isSel ? '#1d5b8f' : '#94a3b8'} strokeWidth={1.5} />
            <circle cx={cx} cy={beamY - 26} r={9} fill={isSel ? '#1d5b8f' : '#ffffff'} stroke={isSel ? '#1d5b8f' : '#64748b'} strokeWidth={1.5} />
            <text x={cx} y={beamY - 22} textAnchor="middle" fontSize={8} fontFamily="monospace" fill={isSel ? '#ffffff' : '#334155'}>
              {sn.sensorId.replace(/^[A-Z]0/, '')}
            </text>
            <text x={cx} y={beamY + beamH + 34} textAnchor="middle" fontSize={9} fontFamily="monospace" fill="#64748b">
              {sn.sensorId}
            </text>
          </g>
        );
      })}
      <text x={beamX + beamW / 2} y={beamY + beamH / 2 + 4} textAnchor="middle" fontSize={9} fill="#475569">
        {dataset.structure.componentType}
      </text>
    </svg>
  );
}

function DamageStatesTab() {
  const { dataset } = useApp();
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {dataset.damageStates.map((ds) => (
          <Card key={ds.id} title={ds.label}>
            <p className="text-[13px] text-slate-600">{ds.description}</p>
            <div className="mt-2 flex items-center gap-2">
              <span className="w-3 h-3 rounded-full" style={{ background: ds.color }} />
              <span className="text-[11px] font-mono-lab text-slate-400">Severity index {ds.severityIndex} / 3</span>
            </div>
          </Card>
        ))}
      </div>
      <InfoNote>
        These are <strong>synthetic demonstration states</strong> used to parameterize the signal generator. They do
        not correspond to a specific real crack width, stiffness reduction, or strength loss, and should not be read
        as a calibrated damage scale.
      </InfoNote>
    </div>
  );
}

function DataManagementTab() {
  const { dataset, featuresAgg, damageIndicatorMap, addImportedFeatures, addImportedSignal } = useApp();
  const quality = assessDataQuality(dataset);
  const [issues, setIssues] = useState<CsvValidationIssue[]>([]);
  const [importKind, setImportKind] = useState<'feature' | 'signal'>('feature');
  const featureFileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    const text = await file.text();
    if (importKind === 'feature') {
      const result = importFeatureCsv(text);
      addImportedFeatures(result.rows);
      setIssues(result.issues);
    } else {
      const result = importSignalCsv(text, dataset.sensors[0].sensorId, dataset.inspections[0].inspectionId, dataset.sensors[0].samplingFrequencyMHz);
      result.rows.forEach(addImportedSignal);
      setIssues(result.issues);
    }
  };

  return (
    <div className="space-y-4">
      <Card title="Data Quality">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {quality.map((q) => (
            <div key={q.label} className="flex items-start justify-between gap-3 border border-slate-200 rounded-md px-3 py-2">
              <div>
                <div className="text-[12px] font-medium text-slate-700">{q.label}</div>
                <div className="text-[11px] text-slate-500">{q.detail}</div>
              </div>
              <span className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded border ${qualityBadgeClasses(q.level)}`}>
                {q.level}
              </span>
            </div>
          ))}
        </div>
      </Card>

      <Card title="CSV Import">
        <div className="flex items-center gap-3 mb-3">
          <select
            value={importKind}
            onChange={(e) => setImportKind(e.target.value as 'feature' | 'signal')}
            className="border border-slate-300 rounded-md px-2 py-1.5 text-[12px]"
          >
            <option value="feature">Feature CSV (experiment_id, sensor_id, H2_H1, H3_H1, beta_prime, attenuation, ToF, velocity, damage_state)</option>
            <option value="signal">Signal CSV (timestamp, amplitude)</option>
          </select>
          <button
            onClick={() => featureFileRef.current?.click()}
            className="flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded-md border border-slate-300 hover:bg-slate-50"
          >
            <Upload size={13} /> Choose File
          </button>
          <input
            ref={featureFileRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          />
          <ProvenanceBadge kind="MEASURED" />
        </div>
        {issues.length > 0 && (
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {issues.map((iss, i) => (
              <div
                key={i}
                className={`text-[11px] px-2 py-1 rounded ${iss.level === 'error' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'}`}
              >
                {iss.level === 'error' ? 'Error: ' : 'Warning: '}
                {iss.message}
              </div>
            ))}
          </div>
        )}
        <InfoNote>
          Imported rows are tagged [MEASURED] and are additive — they do not overwrite the synthetic demonstration
          dataset. Reset the demonstration dataset to clear imported data.
        </InfoNote>
      </Card>

      <Card title="CSV Export">
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => downloadCsv('sonoshm_features.csv', exportFeaturesCsv(featuresAgg))}
            className="flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded-md border border-slate-300 hover:bg-slate-50"
          >
            <Download size={13} /> Export Extracted Features
          </button>
          <button
            onClick={() => downloadCsv('sonoshm_inspection_indicators.csv', exportInspectionCsv(dataset, damageIndicatorMap))}
            className="flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded-md border border-slate-300 hover:bg-slate-50"
          >
            <Download size={13} /> Export Damage Indicators
          </button>
        </div>
      </Card>
    </div>
  );
}
