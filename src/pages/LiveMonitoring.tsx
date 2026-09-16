import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip as RTooltip, CartesianGrid, Legend } from 'recharts';
import { Radio, Play, Pause, Plug, PlugZap } from 'lucide-react';
import { useApp } from '../state/store';
import { SectionHeader, Card, StatCard, ResearchLimitations, InfoNote, CautionNote } from '../components/common/Panels';
import { ProvenanceBadge } from '../components/common/Badge';
import type { LiveProtocol } from '../state/store';

const MAX_POINTS = 40;
const SENSOR_COLORS = ['#1d5b8f', '#b5292f', '#1f8a5f', '#c9971e', '#7c5cbf', '#0e7490', '#be185d', '#4d7c0f'];

export default function LiveMonitoring() {
  const {
    liveMode, setLiveMode,
    liveSimulating, setLiveSimulating,
    liveSamples, liveChartKeys,
    liveProtocol, setLiveProtocol,
    liveUrl, setLiveUrl,
    livePollMs, setLivePollMs,
    liveStatus, liveStatusMessage, liveMessageCount,
    connectLive, disconnectLive,
  } = useApp();

  return (
    <div>
      <SectionHeader
        title="Live Monitoring"
        subtitle="A pluggable live-data layer: simulated replay of this session's demonstration data by default, with a real WebSocket / REST connector you can point at actual sensor infrastructure when you have one. The feed keeps running in the background while you navigate elsewhere — see it reflected on the Digital Twin page's 'Live' view."
        right={<ProvenanceBadge kind={liveMode === 'simulated' ? 'DEMONSTRATION' : 'MEASURED'} />}
      />

      <div className="flex gap-1 mb-4 border-b border-slate-200">
        {(['simulated', 'connector'] as const).map((m) => (
          <button
            key={m}
            onClick={() => setLiveMode(m)}
            className={`px-3 py-2 text-[13px] font-medium border-b-2 -mb-px transition-colors ${liveMode === m ? 'border-[#1d5b8f] text-[#1d5b8f]' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
          >
            {m === 'simulated' ? 'Simulated Replay' : 'Connect a Real Feed'}
          </button>
        ))}
      </div>

      {liveMode === 'simulated' && (
        <>
          <div className="flex items-center gap-2 mb-3">
            <button
              onClick={() => setLiveSimulating((v) => !v)}
              className="flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded-md border border-slate-300 hover:bg-slate-50"
            >
              {liveSimulating ? <Pause size={13} /> : <Play size={13} />} {liveSimulating ? 'Pause' : 'Resume'} Replay
            </button>
            <span className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
              [SIMULATED REPLAY] — not a live hardware feed. Values are this session's already-computed demonstration
              damage indicators with small added jitter, updated once per second to illustrate a live-monitoring UX.
            </span>
          </div>
        </>
      )}

      {liveMode === 'connector' && (
        <Card title="Connector Configuration" className="mb-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
            <label className="text-[12px] text-slate-600">
              Protocol
              <select value={liveProtocol} onChange={(e) => setLiveProtocol(e.target.value as LiveProtocol)} className="mt-1 w-full border border-slate-300 rounded-md px-2 py-1.5 text-[13px]" disabled={liveStatus === 'connected' || liveStatus === 'connecting'}>
                <option value="websocket">WebSocket (ws:// or wss://)</option>
                <option value="rest">REST polling (http(s)://)</option>
              </select>
            </label>
            <label className="text-[12px] text-slate-600 md:col-span-2">
              Endpoint URL
              <input
                value={liveUrl}
                onChange={(e) => setLiveUrl(e.target.value)}
                placeholder={liveProtocol === 'websocket' ? 'wss://your-daq-gateway.example.com/stream' : 'https://your-api.example.com/latest-readings'}
                className="mt-1 w-full border border-slate-300 rounded-md px-2 py-1.5 text-[13px] font-mono-lab"
                disabled={liveStatus === 'connected' || liveStatus === 'connecting'}
              />
            </label>
            {liveProtocol === 'rest' && (
              <label className="text-[12px] text-slate-600">
                Poll interval (ms)
                <input
                  type="number"
                  value={livePollMs}
                  min={500}
                  onChange={(e) => setLivePollMs(Number(e.target.value) || 2000)}
                  className="mt-1 w-full border border-slate-300 rounded-md px-2 py-1.5 text-[13px]"
                  disabled={liveStatus === 'connected' || liveStatus === 'connecting'}
                />
              </label>
            )}
            {liveStatus === 'connected' || liveStatus === 'connecting' ? (
              <button onClick={disconnectLive} className="flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded-md border border-slate-300 hover:bg-slate-50">
                <Plug size={13} /> Disconnect
              </button>
            ) : (
              <button onClick={connectLive} className="flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded-md bg-[#1d5b8f] text-white hover:bg-[#164a75]">
                <PlugZap size={13} /> Connect
              </button>
            )}
          </div>
          <div className="flex items-center gap-2 mt-3 text-[12px]">
            <Radio size={13} className={liveStatus === 'connected' ? 'text-emerald-600' : liveStatus === 'error' ? 'text-red-600' : 'text-slate-400'} />
            <span className="text-slate-600">{liveStatusMessage}</span>
            {liveMessageCount > 0 && <span className="text-slate-400 font-mono-lab">· {liveMessageCount} message(s) received</span>}
          </div>
          <div className="mt-3 text-[11px] text-slate-500 bg-slate-50 border border-slate-200 rounded px-3 py-2 font-mono-lab">
            Expected message shape: {'{ "sensorId": "S04", "value": 0.62 }'} or an array of these objects — any
            numeric fields matching this shape are plotted below as they arrive.
          </div>
        </Card>
      )}

      <Card title="Live Sensor Readings">
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={liveSamples} margin={{ top: 8, right: 16, left: -10, bottom: 4 }}>
              <CartesianGrid stroke="#eef1f5" />
              <XAxis dataKey="t" tick={{ fontSize: 10 }} stroke="#94a3b8" />
              <YAxis tick={{ fontSize: 10 }} stroke="#94a3b8" domain={[0, 'auto']} />
              <RTooltip contentStyle={{ fontSize: 11 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {liveChartKeys.map((key, i) => (
                <Line key={key} type="monotone" dataKey={key} stroke={SENSOR_COLORS[i % SENSOR_COLORS.length]} strokeWidth={1.75} dot={false} isAnimationActive={false} connectNulls />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
        {liveSamples.length === 0 && (
          <p className="text-[12px] text-slate-400 text-center py-2">
            {liveMode === 'simulated' ? 'Starting replay…' : 'No data yet — connect to a feed above.'}
          </p>
        )}
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
        <StatCard label="Mode" value={liveMode === 'simulated' ? 'Simulated Replay' : 'Real Connector'} />
        <StatCard label="Sensors Tracked" value={liveChartKeys.length} />
        <StatCard label="Points in Window" value={liveSamples.length} hint={`of ${MAX_POINTS} max`} />
        <StatCard label="Status" value={liveMode === 'simulated' ? (liveSimulating ? 'Running' : 'Paused') : liveStatus} accent={liveStatus === 'error' ? 'bad' : liveStatus === 'connected' ? 'good' : undefined} />
      </div>

      <div className="mt-4 space-y-3">
        <InfoNote>
          This page is a pluggable data-source layer, not a claim that live hardware is currently connected. The
          WebSocket and REST connectors are real and will work against an actual endpoint if you have one — MQTT and
          other IoT protocols are documented as a future extension, not implemented here. The feed itself runs at the
          application level, so it keeps ticking (and the Digital Twin page's "Live" view keeps updating) even while
          you're looking at a different page.
        </InfoNote>
        <CautionNote>
          A real connector ingests whatever numeric values a feed sends and plots them as-is — this page does no
          validation, calibration, or anomaly scoring on live data. The Digital Twin's Live view colors sensor
          markers directly from these same raw values (the same 0.3 / 0.55 thresholds used elsewhere); it is not an
          independently recomputed anomaly score, and live values are still not wired into feature extraction,
          diagnosis, or prognosis.
        </CautionNote>
        <ResearchLimitations
          items={[
            'Simulated Replay mode adds small random jitter to already-computed demonstration indicators — it is not a physically simulated live signal, and is clearly labeled as a replay.',
            'The real connector supports WebSocket and REST polling only; MQTT, OPC-UA, and vendor-specific DAQ protocols are not implemented.',
            'There is no authentication, TLS pinning, or production-grade error handling here — a real deployment would need a proper backend/gateway, not a static browser page talking directly to field hardware.',
            'Live values are not currently wired into feature extraction, diagnosis, or prognosis — they drive monitoring/visualization only (this page, and the Digital Twin\'s optional Live view).',
          ]}
        />
      </div>
    </div>
  );
}
