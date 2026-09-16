import { useMemo } from 'react';
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip as RTooltip, ReferenceLine, CartesianGrid } from 'recharts';
import { useApp } from '../state/store';
import { SectionHeader, Card, StatCard, ResearchLimitations, InfoNote, Tooltip } from '../components/common/Panels';
import { ProvenanceBadge, DamageStatePill } from '../components/common/Badge';
import { processSignal } from '../engine/features';
import { peakNear } from '../engine/signalProcessing';
import type { DamageStateId } from '../data/types';

const STATES: DamageStateId[] = ['healthy', 'early', 'moderate', 'severe'];

export default function UltrasonicSignals() {
  const { dataset, selectedSensorId, setSelectedSensorId, selectedDamageState, setSelectedDamageState, findRepresentativeSignal } = useApp();

  const match = useMemo(
    () => findRepresentativeSignal(selectedSensorId, selectedDamageState),
    [findRepresentativeSignal, selectedSensorId, selectedDamageState]
  );
  const sensor = dataset.sensors.find((s) => s.sensorId === selectedSensorId)!;

  const processed = useMemo(() => (match ? processSignal(match.signal, true) : null), [match]);

  const timeData = useMemo(() => {
    if (!processed) return [];
    return processed.raw.map((v, i) => ({ t: Number(processed.timeAxisUs[i].toFixed(2)), amplitude: v }));
  }, [processed]);

  const freqData = useMemo(() => {
    if (!processed) return [];
    return processed.fftFreqKHz
      .map((f, i) => ({ f: Number(f.toFixed(1)), amplitude: processed.fftAmplitude[i] }))
      .filter((d) => d.f <= 500);
  }, [processed]);

  const harmonics = useMemo(() => {
    if (!processed) return null;
    const fftLike = { freqBinsKHz: processed.fftFreqKHz, amplitude: processed.fftAmplitude, real: [], imag: [] };
    const f1 = peakNear(fftLike, sensor.excitationFrequencyKHz, 12);
    const f2 = peakNear(fftLike, sensor.excitationFrequencyKHz * 2, 12);
    const f3 = peakNear(fftLike, sensor.excitationFrequencyKHz * 3, 12);
    return { f1, f2, f3 };
  }, [processed, sensor]);

  return (
    <div>
      <SectionHeader
        title="Ultrasonic Signal Lab"
        subtitle="Interactive time-domain and frequency-domain view of a synthetic nonlinear ultrasonic response for a selected sensor and demonstration damage state."
        right={<ProvenanceBadge kind="SIMULATED" />}
      />

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div>
          <label className="text-[11px] uppercase tracking-wide text-slate-500 font-medium mr-2">Sensor</label>
          <select
            value={selectedSensorId}
            onChange={(e) => setSelectedSensorId(e.target.value)}
            className="border border-slate-300 rounded-md px-2 py-1.5 text-[13px] font-mono-lab"
          >
            {dataset.sensors.map((s) => (
              <option key={s.sensorId} value={s.sensorId}>
                {s.sensorId}
              </option>
            ))}
          </select>
        </div>
        <div className="flex gap-1.5">
          {STATES.map((s) => (
            <button
              key={s}
              onClick={() => setSelectedDamageState(s)}
              className={`px-3 py-1.5 rounded-md text-[12px] font-medium border transition-colors ${
                selectedDamageState === s
                  ? 'border-[#1d5b8f] bg-[#e6eef5] text-[#1d5b8f]'
                  : 'border-slate-300 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {s[0].toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
        {match && !match.exact && (
          <span className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
            No signal at {selectedSensorId} reached "{selectedDamageState}" in the generated dataset (damage is
            localized near midspan) — showing the nearest available severity ({match.signal.generatedState}) instead.
          </span>
        )}
      </div>

      {processed && harmonics && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
            <Card title="Time-Domain Signal" right={<span className="text-[11px] text-slate-400 font-mono-lab">{sensor.samplingFrequencyMHz} MHz, {sensor.acquisitionDurationUs} µs</span>}>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={timeData} margin={{ top: 4, right: 8, left: -10, bottom: 4 }}>
                    <CartesianGrid stroke="#eef1f5" />
                    <XAxis dataKey="t" tick={{ fontSize: 10 }} stroke="#94a3b8" label={{ value: 'Time (µs)', position: 'insideBottom', offset: -2, fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} stroke="#94a3b8" label={{ value: 'Amplitude (a.u.)', angle: -90, position: 'insideLeft', fontSize: 10 }} />
                    <RTooltip contentStyle={{ fontSize: 11 }} />
                    <Line type="monotone" dataKey="amplitude" stroke="#1d5b8f" dot={false} strokeWidth={1.2} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>
            <Card title="Frequency-Domain Spectrum" right={<span className="text-[11px] text-slate-400">Hann-windowed FFT</span>}>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={freqData} margin={{ top: 4, right: 8, left: -10, bottom: 4 }}>
                    <CartesianGrid stroke="#eef1f5" />
                    <XAxis dataKey="f" tick={{ fontSize: 10 }} stroke="#94a3b8" label={{ value: 'Frequency (kHz)', position: 'insideBottom', offset: -2, fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} stroke="#94a3b8" label={{ value: 'Amplitude (a.u.)', angle: -90, position: 'insideLeft', fontSize: 10 }} />
                    <RTooltip contentStyle={{ fontSize: 11 }} />
                    <ReferenceLine x={sensor.excitationFrequencyKHz} stroke="#1d5b8f" strokeDasharray="3 3" label={{ value: 'f₁', fontSize: 10, fill: '#1d5b8f' }} />
                    <ReferenceLine x={sensor.excitationFrequencyKHz * 2} stroke="#c9971e" strokeDasharray="3 3" label={{ value: '2f₁', fontSize: 10, fill: '#c9971e' }} />
                    <ReferenceLine x={sensor.excitationFrequencyKHz * 3} stroke="#b5292f" strokeDasharray="3 3" label={{ value: '3f₁', fontSize: 10, fill: '#b5292f' }} />
                    <Line type="monotone" dataKey="amplitude" stroke="#334155" dot={false} strokeWidth={1.2} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>

          <Card title="Harmonic Components" className="mb-4">
            <div className="grid grid-cols-3 gap-3">
              <StatCard label="Fundamental (f₁)" value={harmonics.f1.amplitude.toFixed(4)} hint={`${harmonics.f1.freqKHz.toFixed(0)} kHz`} />
              <StatCard label="2nd Harmonic (2f₁)" value={harmonics.f2.amplitude.toFixed(4)} hint={`${harmonics.f2.freqKHz.toFixed(0)} kHz`} />
              <StatCard label="3rd Harmonic (3f₁)" value={harmonics.f3.amplitude.toFixed(4)} hint={`${harmonics.f3.freqKHz.toFixed(0)} kHz`} />
            </div>
          </Card>

          <div className="flex items-center gap-3 mb-4">
            <DamageStatePill state={match!.signal.generatedState} />
            <span className="text-[12px] text-slate-500 font-mono-lab">
              {match!.signal.signalId} · {match!.signal.inspectionId}
            </span>
            <Tooltip text="Nonlinear ultrasonic methods examine features of an ultrasonic response that are not fully represented by a linear response. Harmonic generation and other nonlinear characteristics may provide sensitivity to changes in material or structural condition, but this sensitivity has not been established for this synthetic demonstration.">
              <span className="text-[11px] text-[#1d5b8f] underline decoration-dotted cursor-help">What is nonlinear ultrasonics?</span>
            </Tooltip>
          </div>
        </>
      )}

      <InfoNote>
        Signals follow a simplified demonstration model x(t) = A₁sin(ωt) + A₂sin(2ωt) + A₃sin(3ωt) + noise, wrapped in
        a burst envelope and combined with attenuation, damping, and small frequency jitter. This does not reproduce
        actual nonlinear wave propagation in a concrete structure.
      </InfoNote>
      <div className="mt-4">
        <ResearchLimitations
          items={[
            'The synthetic signal model is a simplified additive-harmonic representation and does not capture true elastic nonlinearity, contact acoustic nonlinearity, or wave scattering at cracks.',
            'Harmonic amplitudes are read from the FFT of a single acquisition; real measurements would typically average multiple repeats and account for transducer coupling variability.',
            'Frequency-domain values are demonstration parameters (f₁ = 100 kHz) and are not derived from an actual transducer or material calibration.',
          ]}
        />
      </div>
    </div>
  );
}
