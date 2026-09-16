import React, { useState } from 'react';
import { AlertTriangle, ChevronDown, Info } from 'lucide-react';

export { Pill } from './Badge';

export function SectionHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 mb-5">
      <div>
        <h1 className="text-xl font-semibold text-[#16202a] tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-slate-500 mt-1 max-w-3xl">{subtitle}</p>}
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  );
}

export function Card({
  title,
  children,
  className = '',
  right,
}: {
  title?: string;
  children: React.ReactNode;
  className?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className={`bg-white border border-[#d7dbe2] rounded-lg shadow-sm ${className}`}>
      {title && (
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#e7e9ee]">
          <h3 className="text-[13px] font-semibold uppercase tracking-wide text-slate-600">{title}</h3>
          {right}
        </div>
      )}
      <div className="p-4">{children}</div>
    </div>
  );
}

export function StatCard({
  label,
  value,
  unit,
  hint,
  accent = 'default',
}: {
  label: React.ReactNode;
  value: string | number;
  unit?: string;
  hint?: string;
  accent?: 'default' | 'good' | 'warn' | 'bad';
}) {
  const accentColor = {
    default: 'text-[#16202a]',
    good: 'text-emerald-700',
    warn: 'text-amber-700',
    bad: 'text-red-700',
  }[accent];
  return (
    <div className="bg-white border border-[#d7dbe2] rounded-lg px-4 py-3">
      <div className="text-[11px] uppercase tracking-wide text-slate-500 font-medium">{label}</div>
      <div className={`mt-1 font-mono-lab text-2xl font-semibold ${accentColor}`}>
        {value}
        {unit && <span className="text-sm font-normal text-slate-400 ml-1">{unit}</span>}
      </div>
      {hint && <div className="text-[11px] text-slate-400 mt-1">{hint}</div>}
    </div>
  );
}

export function ResearchLimitations({ items }: { items: string[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-amber-200 bg-amber-50/60 rounded-lg">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-left"
      >
        <span className="flex items-center gap-2 text-[13px] font-semibold text-amber-900">
          <AlertTriangle size={14} /> Research Limitations
        </span>
        <ChevronDown size={16} className={`text-amber-700 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <ul className="px-4 pb-3 space-y-1.5 text-[13px] text-amber-900/90 list-disc list-inside">
          {items.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function InfoNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2 text-[13px] text-slate-600 bg-slate-50 border border-slate-200 rounded-md px-3 py-2">
      <Info size={15} className="shrink-0 mt-0.5 text-slate-400" />
      <div>{children}</div>
    </div>
  );
}

export function CautionNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2 text-[13px] text-rose-900 bg-rose-50 border border-rose-200 rounded-md px-3 py-2">
      <AlertTriangle size={15} className="shrink-0 mt-0.5 text-rose-500" />
      <div>{children}</div>
    </div>
  );
}

export function ProvenanceTrace({ items }: { items: { label: string; value: string }[] }) {
  return (
    <div className="border border-slate-200 rounded-lg bg-slate-50/60 px-4 py-3">
      <div className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold mb-2">Data Provenance</div>
      <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1.5">
        {items.map((it) => (
          <div key={it.label}>
            <dt className="text-[10px] uppercase text-slate-400">{it.label}</dt>
            <dd className="text-[12px] font-mono-lab text-slate-700">{it.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function Tooltip({ text, children }: { text: string; children: React.ReactNode }) {
  return (
    <span className="relative group inline-flex items-center">
      {children}
      <span className="pointer-events-none absolute left-1/2 top-full z-20 mt-1.5 w-64 -translate-x-1/2 rounded-md bg-slate-900 px-2.5 py-1.5 text-[11px] leading-snug text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
        {text}
      </span>
    </span>
  );
}
