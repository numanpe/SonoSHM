import { useMemo } from 'react';
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip as RTooltip, CartesianGrid, ReferenceLine } from 'recharts';
import { useApp } from '../state/store';
import { SectionHeader, Card, StatCard, ResearchLimitations, InfoNote } from '../components/common/Panels';
import { ProvenanceBadge } from '../components/common/Badge';
import { processSignal } from '../engine/features';
import { estimateToF, hannWindow, movingRmsEnvelope } from '../engine/signalProcessing';

const PIPELINE = ['Raw Signal', 'Preprocessing', 'Detrending', 'Hann Window', 'FFT', 'Frequency Spectrum', 'Harmonic Peak Detection', 'Nonlinear Feature Extraction'];

export default function SignalProcessingPage() {
  const { dataset, selectedSensorId, selectedDamageState, useHannWindow, setUseHannWindow, findRepresentativeSignal } = useApp();
  const sensor = dataset.sensors.find((s) => s.sensorId === selectedSensorId)!;
  const match = findRepresentativeSignal(selectedSensorId, selectedDamageState);

  const processedOn = useMemo(() => (match ? processSignal(match.signal, true) : null), [match]);
  const processedOff = useMemo(() => (match ? processSignal(match.signal, false) : null), [match]);

  const windowShape = useMemo(() => {
    if (!match) return [];
    const w = hannWindow(match.signal.samples.length);
    return w.map((v, i) => ({ t: Number((i / sensor.samplingFrequencyMHz).toFixed(2)), w: v }));
  }, [match, sensor]);

  const timeCompare = useMemo(() => {
    if (!processedOn || !processedOff) return [];
    return processedOn.timeAxisUs.map((t, i) => ({
      t: Number(t.toFixed(2)),
      raw: processedOff.detrended[i],
      windowed: processedOn.windowed[i],
    }));
  }, [processedOn, processedOff]);

  const freqCompare = useMemo(() => {
    if (!processedOn || !processedOff) return [];
    return processedOn.fftFreqKHz
      .map((f, i) => ({ f: Number(f.toFixed(1)), withWindow: processedOn.fftAmplitude[i], withoutWindow: processedOff.fftAmplitudeRaw[i] }))
      .filter((d) => d.f <= 500);
  }, [processedOn, processedOff]);

  const tof = useMemo(() => {
    if (!match) return null;
    const p = processSignal(match.signal, false);
    return { result: estimateToF(p.detrended, p.timeAxisUs, 0.25), envelope: movingRmsEnvelope(p.detrended, Math.max(8, Math.floor(p.detrended.length / 20))), time: p.timeAxisUs, raw: p.detrended };
  }, [match]);

  const tofChartData = useMemo(() => {
    if (!tof) return [];
    return tof.time.map((t, i) => ({ t: Number(t.toFixed(2)), signal: tof.raw[i], envelope: tof.envelope[i] }));
  }, [tof]);

  return (
    <div>
      <SectionHeader
        title="Signal Processing Pipeline"
        subtitle="Raw signal → preprocessing → detrending → Hann window → FFT → frequency spectrum → harmonic peak detection → nonlinear feature extraction."
        right={<ProvenanceBadge kind="SIMULATED" />}
      />

      <Card className="mb-4">
        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
          {PIPELINE.map((step, i) => (
            <span key={step} className="flex items-center gap-1.5">
              <span className="px-2.5 py-1.5 rounded border border-slate-300 bg-slate-50 text-slate-600 font-medium">{step}</span>
              {i < PIPELINE.length - 1 && <span className="text-slate-300">→</span>}
            </span>
          ))}
        </div>
      </Card>

      <Card
        title="Hann Window"
        className="mb-4"
        right={
          <label className="flex items-center gap-2 text-[12px] font-medium text-slate-600">
            <input type="checkbox" checked={useHannWindow} onChange={(e) => setUseHannWindow(e.target.checked)} />
            Window: {useHannWindow ? 'Hann (ON)' : 'None (OFF)'}
          </label>
        }
      >
        <p className="text-[13px] text-slate-600 mb-3">
          The Hann window reduces spectral leakage caused by finite signal acquisition windows and can improve
          interpretation of frequency-domain components. It does not eliminate spectral leakage completely.
        </p>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-slate-500 font-medium mb-1">Raw vs Windowed Signal</div>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={timeCompare} margin={{ top: 4, right: 8, left: -10, bottom: 4 }}>
                  <CartesianGrid stroke="#eef1f5" />
                  <XAxis dataKey="t" tick={{ fontSize: 10 }} stroke="#94a3b8" />
                  <YAxis tick={{ fontSize: 10 }} stroke="#94a3b8" />
                  <RTooltip contentStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="raw" stroke="#94a3b8" dot={false} strokeWidth={1} name="Detrended (no window)" isAnimationActive={false} />
                  <Line type="monotone" dataKey="windowed" stroke="#1d5b8f" dot={false} strokeWidth={1.3} name="Hann-windowed" isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wide text-slate-500 font-medium mb-1">Hann Window Shape</div>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={windowShape} margin={{ top: 4, right: 8, left: -10, bottom: 4 }}>
                  <CartesianGrid stroke="#eef1f5" />
                  <XAxis dataKey="t" tick={{ fontSize: 10 }} stroke="#94a3b8" />
                  <YAxis tick={{ fontSize: 10 }} stroke="#94a3b8" domain={[0, 1]} />
                  <RTooltip contentStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="w" stroke="#c9971e" dot={false} strokeWidth={1.5} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </Card>

      <Card title="FFT — Effect of Windowing on Spectral Leakage" className="mb-4">
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={freqCompare} margin={{ top: 4, right: 8, left: -10, bottom: 4 }}>
              <CartesianGrid stroke="#eef1f5" />
              <XAxis dataKey="f" tick={{ fontSize: 10 }} stroke="#94a3b8" label={{ value: 'Frequency (kHz)', position: 'insideBottom', offset: -2, fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} stroke="#94a3b8" />
              <RTooltip contentStyle={{ fontSize: 11 }} />
              <ReferenceLine x={sensor.excitationFrequencyKHz} stroke="#1d5b8f" strokeDasharray="3 3" />
              <ReferenceLine x={sensor.excitationFrequencyKHz * 2} stroke="#c9971e" strokeDasharray="3 3" />
              <ReferenceLine x={sensor.excitationFrequencyKHz * 3} stroke="#b5292f" strokeDasharray="3 3" />
              <Line type="monotone" dataKey="withoutWindow" stroke="#94a3b8" dot={false} strokeWidth={1} name="No window" isAnimationActive={false} />
              <Line type="monotone" dataKey="withWindow" stroke="#1d5b8f" dot={false} strokeWidth={1.3} name="Hann window" isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {tof && (
        <Card title="Wave Propagation — Time-of-Flight Detection" className="mb-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={tofChartData} margin={{ top: 4, right: 8, left: -10, bottom: 4 }}>
                  <CartesianGrid stroke="#eef1f5" />
                  <XAxis dataKey="t" tick={{ fontSize: 10 }} stroke="#94a3b8" label={{ value: 'Time (µs)', position: 'insideBottom', offset: -2, fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} stroke="#94a3b8" />
                  <RTooltip contentStyle={{ fontSize: 11 }} />
                  <ReferenceLine x={Number(tof.result.tofUs.toFixed(2))} stroke="#b5292f" strokeWidth={1.5} label={{ value: 'Detected arrival', fontSize: 10, fill: '#b5292f' }} />
                  <Line type="monotone" dataKey="signal" stroke="#94a3b8" dot={false} strokeWidth={1} isAnimationActive={false} />
                  <Line type="monotone" dataKey="envelope" stroke="#1d5b8f" dot={false} strokeWidth={1.5} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-3">
              <StatCard label="Detected ToF" value={tof.result.tofUs.toFixed(2)} unit="µs" hint="Envelope-threshold method (25% of peak)" />
              <StatCard label="Propagation Distance" value={sensor.propagationDistanceMm} unit="mm" />
              <StatCard label="Estimated Velocity" value={((sensor.propagationDistanceMm / tof.result.tofUs) * 1000).toFixed(0)} unit="m/s" hint="v = L / ToF" />
            </div>
          </div>
        </Card>
      )}

      <InfoNote>
        Time-of-flight is detected here using moving-RMS envelope threshold crossing. Cross-correlation against a
        reference pulse (also implemented in the processing engine) is an alternative onset-detection method noted
        for future integration with real excitation waveforms.
      </InfoNote>
      <div className="mt-4">
        <ResearchLimitations
          items={[
            'Detrending removes only a linear trend; more advanced baseline correction may be needed for real sensor data.',
            'The Hann window trades frequency resolution for reduced spectral leakage — other windows (Hamming, Blackman) may perform differently and are not compared here.',
            'ToF detection via a fixed threshold fraction is sensitive to noise level and burst shape; a lower threshold can bias ToF earlier under high noise.',
          ]}
        />
      </div>
    </div>
  );
}
