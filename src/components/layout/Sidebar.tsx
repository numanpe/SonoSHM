import { Activity } from 'lucide-react';
import { NAV_SECTIONS, type SectionId } from './navConfig';

export function Sidebar({ active, onSelect }: { active: SectionId; onSelect: (id: SectionId) => void }) {
  return (
    <aside className="w-64 shrink-0 bg-[#0f2138] text-slate-200 flex flex-col h-full">
      <div className="px-4 py-4 border-b border-white/10">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded bg-[#1d5b8f] flex items-center justify-center">
            <Activity size={17} className="text-white" />
          </div>
          <div>
            <div className="text-[15px] font-semibold text-white tracking-tight leading-none">SonoSHM</div>
            <div className="text-[10px] text-slate-400 mt-0.5 leading-none">Nonlinear Ultrasonic Diagnosis & Prognosis — Diverse Infrastructure</div>
          </div>
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto py-2 lab-scroll">
        {NAV_SECTIONS.map((s) => {
          const Icon = s.icon;
          const isActive = s.id === active;
          return (
            <button
              key={s.id}
              onClick={() => onSelect(s.id)}
              className={`w-full flex items-center gap-2.5 px-4 py-2 text-[13px] transition-colors border-l-2 ${
                isActive
                  ? 'bg-white/10 border-[#4ea1e8] text-white font-medium'
                  : 'border-transparent text-slate-400 hover:bg-white/5 hover:text-slate-200'
              }`}
            >
              <Icon size={15} className={isActive ? 'text-[#4ea1e8]' : 'text-slate-500'} />
              {s.label}
            </button>
          );
        })}
      </nav>
      <div className="px-4 py-3 border-t border-white/10 text-[10px] text-slate-500 leading-relaxed">
        Research prototype. Synthetic demonstration data unless labeled [MEASURED]. Requires experimental validation.
      </div>
    </aside>
  );
}
