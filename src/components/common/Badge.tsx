import React from 'react';
import type { DataProvenance } from '../../data/types';

const PROVENANCE_STYLE: Record<DataProvenance, { bg: string; text: string; border: string; label: string }> = {
  SIMULATED: { bg: 'bg-sky-50', text: 'text-sky-800', border: 'border-sky-200', label: 'SIMULATED' },
  MEASURED: { bg: 'bg-emerald-50', text: 'text-emerald-800', border: 'border-emerald-200', label: 'MEASURED' },
  MODEL_OUTPUT: { bg: 'bg-violet-50', text: 'text-violet-800', border: 'border-violet-200', label: 'MODEL OUTPUT' },
  CONCEPTUAL: { bg: 'bg-slate-100', text: 'text-slate-700', border: 'border-slate-300', label: 'CONCEPTUAL' },
  DEMONSTRATION: { bg: 'bg-amber-50', text: 'text-amber-800', border: 'border-amber-200', label: 'DEMONSTRATION' },
  HYPOTHESIS: { bg: 'bg-fuchsia-50', text: 'text-fuchsia-800', border: 'border-fuchsia-200', label: 'HYPOTHESIS' },
  REQUIRES_VALIDATION: { bg: 'bg-rose-50', text: 'text-rose-800', border: 'border-rose-200', label: 'REQUIRES VALIDATION' },
};

export function ProvenanceBadge({ kind, className = '' }: { kind: DataProvenance; className?: string }) {
  const s = PROVENANCE_STYLE[kind];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-mono-lab font-semibold tracking-wide ${s.bg} ${s.text} ${s.border} ${className}`}
      title="Data provenance label — see Research Limitations for definitions."
    >
      [{s.label}]
    </span>
  );
}

export function Pill({
  children,
  color = 'slate',
  className = '',
}: {
  children: React.ReactNode;
  color?: 'slate' | 'green' | 'amber' | 'orange' | 'red' | 'blue';
  className?: string;
}) {
  const map: Record<string, string> = {
    slate: 'bg-slate-100 text-slate-700 border-slate-300',
    green: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    amber: 'bg-amber-50 text-amber-800 border-amber-200',
    orange: 'bg-orange-50 text-orange-800 border-orange-200',
    red: 'bg-red-50 text-red-700 border-red-200',
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${map[color]} ${className}`}>
      {children}
    </span>
  );
}

export function DamageStatePill({ state }: { state: 'healthy' | 'early' | 'moderate' | 'severe' }) {
  const map = {
    healthy: { color: 'green' as const, label: 'Healthy' },
    early: { color: 'amber' as const, label: 'Early Damage' },
    moderate: { color: 'orange' as const, label: 'Moderate Damage' },
    severe: { color: 'red' as const, label: 'Severe Damage' },
  };
  const m = map[state];
  return <Pill color={m.color}>{m.label}</Pill>;
}
