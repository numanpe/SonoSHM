import { useMemo } from 'react';
import type { TwinSensorDatum } from './DigitalTwin3D';
import type { StructureKind } from '../../data/syntheticData';

function colorForIndicator(indicator: number): string {
  if (indicator < 0.3) return '#1f8a5f';
  if (indicator < 0.55) return '#c9971e';
  return '#b5292f';
}

/** Builds a jagged crack path string growing upward from the member soffit,
 * whose extent encodes the current damage indicator near the demonstration
 * damage location. Schematic visual cue only — not a measured crack geometry. */
function crackPath(cx: number, baseY: number, height: number, severity: number): string {
  const growth = Math.min(1, severity);
  if (growth < 0.06) return '';
  const tipY = baseY - growth * height * 0.92;
  const steps = 10;
  const seedBase = Math.round(severity * 997);
  let d = `M ${cx} ${baseY}`;
  let x = cx;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const y = baseY - t * (baseY - tipY);
    const jitter = Math.sin(seedBase + i * 12.9898) * 5 * growth;
    x = cx + jitter * (1 - t * 0.4);
    d += ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
  }
  return d;
}

export function DigitalTwinFallback({
  sensorData,
  kind = 'beam',
  spanMm = 3000,
  damageLocationFraction = 0.5,
  onSelectSensor,
}: {
  sensorData: TwinSensorDatum[];
  kind?: StructureKind;
  spanMm?: number;
  damageLocationFraction?: number;
  onSelectSensor: (sensorId: string) => void;
}) {
  const W = 900;
  const H = 460;
  const beamX = 120;
  const beamW = W - 240;
  const beamY = 220;
  const beamH = kind === 'deck' ? 26 : kind === 'pipe' ? 46 : 38;
  const skew = 40;
  const isPipe = kind === 'pipe';
  const isDeck = kind === 'deck';

  const nearbySensors = useMemo(
    () => sensorData.filter((d) => Math.abs(d.sensor.positionFraction - damageLocationFraction) <= 0.16),
    [sensorData, damageLocationFraction]
  );
  const damageSeverity = useMemo(
    () => Math.max(0, ...(nearbySensors.length ? nearbySensors : sensorData).map((d) => d.indicator)),
    [nearbySensors, sensorData]
  );
  const damageCx = beamX + damageLocationFraction * beamW - damageLocationFraction * skew * 0.5;
  const crackD = !isPipe ? crackPath(damageCx, beamY + beamH, beamH * 0.98, damageSeverity) : '';
  const patchR = 6 + damageSeverity * 16;

  return (
    <div className="w-full h-[460px] rounded-lg overflow-hidden" style={{ background: 'linear-gradient(180deg, #e3e9f0 0%, #f7f8fa 70%)' }}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full">
        <defs>
          <linearGradient id="beamGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={isPipe ? '#a3aab5' : '#e6eaf0'} />
            <stop offset="100%" stopColor={isPipe ? '#7d8592' : '#c7ced9'} />
          </linearGradient>
          <radialGradient id="haloGrad" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.55" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </radialGradient>
        </defs>
        {/* ground */}
        {Array.from({ length: 10 }).map((_, i) => (
          <line key={i} x1={40 + i * 82} y1={H - 60} x2={40 + i * 82 - skew} y2={H - 110} stroke="#dfe3e9" strokeWidth={1} />
        ))}
        <ellipse cx={W / 2} cy={H - 55} rx={beamW / 2 + 40} ry={22} fill="#0f2138" opacity={0.06} />

        {/* isometric structural member */}
        {isPipe ? (
          <>
            <ellipse cx={beamX - skew / 2} cy={beamY - skew * 0.25} rx={beamH / 2} ry={beamH / 2 - skew * 0.15} fill="url(#beamGrad)" stroke="#5b6472" />
            <rect x={beamX - skew / 2} y={beamY - skew * 0.25 - beamH / 2} width={beamW} height={beamH} fill="url(#beamGrad)" stroke="#5b6472" />
            <ellipse cx={beamX + beamW - skew / 2} cy={beamY - skew * 0.25} rx={beamH / 2} ry={beamH / 2 - skew * 0.15} fill="#9aa2ae" stroke="#5b6472" />
            {[0.15, 0.45, 0.85].map((f) => (
              <line key={f} x1={beamX - skew / 2 + f * beamW} y1={beamY - skew * 0.25 - beamH / 2} x2={beamX - skew / 2 + f * beamW} y2={beamY - skew * 0.25 + beamH / 2} stroke="#5b6472" strokeWidth={1.5} opacity={0.5} />
            ))}
          </>
        ) : (
          <>
            <polygon
              points={`${beamX},${beamY} ${beamX + beamW},${beamY} ${beamX + beamW - skew},${beamY - skew * 0.5} ${beamX - skew},${beamY - skew * 0.5}`}
              fill="url(#beamGrad)"
              stroke="#94a3b8"
            />
            <polygon
              points={`${beamX},${beamY} ${beamX + beamW},${beamY} ${beamX + beamW},${beamY + beamH} ${beamX},${beamY + beamH}`}
              fill="#d6dbe3"
              stroke="#94a3b8"
            />
          </>
        )}

        {/* damage marker: crack for beam/deck, corrosion patch for pipe */}
        {!isPipe && crackD && (
          <path d={crackD} stroke="#221f1d" strokeWidth={2 + damageSeverity * 2.5} fill="none" strokeLinecap="round" opacity={0.85} />
        )}
        {isPipe && damageSeverity >= 0.06 && (
          <ellipse cx={damageCx} cy={beamY - skew * 0.25} rx={patchR} ry={patchR * 0.6} fill="rgba(90,58,30,0.55)" />
        )}

        {/* excitation marker */}
        <g transform={`translate(${beamX - 14}, ${beamY - skew * 0.35})`}>
          <polygon points="0,-8 12,0 0,8" fill="#1d5b8f" />
        </g>

        {/* supports */}
        {isDeck &&
          [beamX + 12, beamX + beamW - 12].map((sx) => (
            <g key={sx}>
              <rect x={sx - 22} y={beamY + beamH} width={44} height={64} fill="#5b6472" />
              <rect x={sx - 30} y={beamY + beamH + 60} width={60} height={8} fill="#8a92a0" />
            </g>
          ))}
        {isPipe &&
          [beamX + 30, beamX + beamW - 30].map((sx) => (
            <g key={sx}>
              <path d={`M ${sx - 24} ${beamY + 8} Q ${sx} ${beamY + 40} ${sx + 24} ${beamY + 8} L ${sx + 24} ${beamY + 55} L ${sx - 24} ${beamY + 55} Z`} fill="#5b6472" />
              <rect x={sx - 28} y={beamY + 52} width={56} height={8} fill="#8a92a0" />
            </g>
          ))}
        {!isDeck && !isPipe &&
          [beamX + 12, beamX + beamW - 12].map((sx) => (
            <g key={sx}>
              <polygon points={`${sx - 18},${beamY + beamH + 60} ${sx + 18},${beamY + beamH + 60} ${sx},${beamY + beamH}`} fill="#5b6472" />
              <rect x={sx - 26} y={beamY + beamH + 56} width={52} height={8} fill="#8a92a0" />
            </g>
          ))}

        <text x={W / 2} y={beamY + beamH + 90} textAnchor="middle" fontSize={12} fontFamily="monospace" fill="#334155" fontWeight="bold">
          SPAN {spanMm} mm
        </text>

        {sensorData.map((d) => {
          const x = beamX + d.sensor.positionFraction * beamW - d.sensor.positionFraction * skew * 0.5;
          const y = beamY - skew * 0.25;
          const color = colorForIndicator(d.indicator);
          const r = 10 + d.indicator * 6;
          return (
            <g
              key={d.sensor.sensorId}
              transform={`translate(${x}, ${y})`}
              onClick={() => onSelectSensor(d.sensor.sensorId)}
              style={{ cursor: 'pointer', color }}
            >
              <line x1={0} y1={0} x2={0} y2={-38} stroke="#94a3b8" strokeWidth={1.5} />
              {d.indicator > 0.3 && <circle r={r + 14} cy={-46} fill="url(#haloGrad)" />}
              <circle
                r={r}
                cy={-46}
                fill={color}
                stroke={d.isSelected ? '#1d5b8f' : '#0f2138'}
                strokeWidth={d.isSelected ? 3 : 1}
              />
              <text y={-42} textAnchor="middle" fontSize={9} fontFamily="monospace" fill="#fff" fontWeight="bold">
                {d.sensor.sensorId.replace(/^[A-Z]0/, '')}
              </text>
              <rect x={-22} y={-70 - (d.isSelected ? 4 : 0)} width={44} height={16} rx={3} fill="#0f2138" opacity={0.85} />
              <text y={-58 - (d.isSelected ? 4 : 0)} textAnchor="middle" fontSize={9} fontFamily="monospace" fill="#fff">
                {d.sensor.sensorId}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
