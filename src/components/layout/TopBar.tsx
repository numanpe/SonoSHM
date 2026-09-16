import { RotateCcw } from 'lucide-react';
import { useApp } from '../../state/store';

export function TopBar() {
  const { dataset, resetDataset, structureProfile, structureProfileList, structureId, setStructureId } = useApp();
  return (
    <header className="h-14 shrink-0 bg-white border-b border-[#d7dbe2] flex items-center justify-between px-5 gap-4">
      <div className="min-w-0">
        <div className="text-[13px] font-semibold text-[#16202a] truncate">
          {structureProfile.structure.componentType} Demonstration — Nonlinear Ultrasonic Damage Monitoring
        </div>
        <div className="text-[11px] text-slate-400 font-mono-lab">
          Structure {dataset.structure.structureId} · Seed {dataset.seed} · {dataset.sensors.length} sensors ·{' '}
          {dataset.inspections.length} inspections
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <div>
          <label className="sr-only" htmlFor="structure-select">Demonstration Asset</label>
          <select
            id="structure-select"
            value={structureId}
            onChange={(e) => setStructureId(e.target.value)}
            className="border border-slate-300 rounded-md px-2 py-1.5 text-[12px] font-mono-lab bg-white"
            title="Switch between demonstration infrastructure assets — the same generic diagnosis/prognosis pipeline is applied to each, illustrating applicability across diverse structure types."
          >
            {structureProfileList.map((p) => (
              <option key={p.id} value={p.id}>{p.shortLabel} ({p.id})</option>
            ))}
          </select>
        </div>
        <button
          onClick={resetDataset}
          className="flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded-md border border-slate-300 text-slate-600 hover:bg-slate-50"
          title="Regenerate the synthetic demonstration dataset from the fixed seed"
        >
          <RotateCcw size={13} /> Reset
        </button>
      </div>
    </header>
  );
}
