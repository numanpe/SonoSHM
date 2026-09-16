import { useCallback, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { UploadCloud, Trash2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { useApp } from '../state/store';
import { SectionHeader, Card, ResearchLimitations, InfoNote } from '../components/common/Panels';
import { ProvenanceBadge } from '../components/common/Badge';
import { ImportedModelViewer, type ViewerSensor } from '../components/import/ImportedModelViewer';
import { parseIfcFile, type IfcParseResult } from '../engine/ifcLoader';
import { parsePointCloudFile, computeDeviationColors, type PointCloudData } from '../engine/pointCloudLoader';
import { buildCustomProfile, type CustomSensorInput } from '../data/syntheticData';
import type { Point3D } from '../data/types';
import type { SectionId } from '../components/layout/navConfig';

const TABS = ['IFC Import', 'Point Cloud'] as const;
const CUSTOM_ID = 'CUSTOM-IMPORT-01';

const MATERIAL_PRESETS: { label: string; material: string; baseVelocityMs: number }[] = [
  { label: 'Concrete', material: 'Reinforced concrete (assumed)', baseVelocityMs: 3900 },
  { label: 'Steel', material: 'Structural steel (assumed)', baseVelocityMs: 5600 },
  { label: 'Composite (steel + concrete)', material: 'Steel–concrete composite (assumed)', baseVelocityMs: 4200 },
  { label: 'Unknown / Other', material: 'Unspecified (assumed)', baseVelocityMs: 4200 },
];

export default function ImportStructure({ onNavigate }: { onNavigate: (s: SectionId) => void }) {
  const [tab, setTab] = useState<(typeof TABS)[number]>('IFC Import');
  return (
    <div>
      <SectionHeader
        title="Import a Real Structure"
        subtitle="Bring in an actual structure's geometry — from a BIM/IFC model or a point-cloud survey — place sensors on it, and generate a demonstration dataset for it using the same generic pipeline as the built-in assets."
        right={<ProvenanceBadge kind="DEMONSTRATION" />}
      />
      <div className="flex gap-1 mb-4 border-b border-slate-200">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`px-3 py-2 text-[13px] font-medium border-b-2 -mb-px transition-colors ${tab === t ? 'border-[#1d5b8f] text-[#1d5b8f]' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
            {t}
          </button>
        ))}
      </div>
      {tab === 'IFC Import' && <IfcImportTab onNavigate={onNavigate} />}
      {tab === 'Point Cloud' && <PointCloudTab />}
    </div>
  );
}

function IfcImportTab({ onNavigate }: { onNavigate: (s: SectionId) => void }) {
  const { importCustomProfile, structureId } = useApp();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parsed, setParsed] = useState<IfcParseResult | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  const [sensors, setSensors] = useState<CustomSensorInput[]>([]);
  const [damageMarker, setDamageMarker] = useState<Point3D | null>(null);
  const [pickMode, setPickMode] = useState<'sensor' | 'damage' | null>(null);

  const [shortLabel, setShortLabel] = useState('My Imported Structure');
  const [componentType, setComponentType] = useState('');
  const [materialPresetIdx, setMaterialPresetIdx] = useState(0);
  const [generated, setGenerated] = useState(false);

  const handleFile = useCallback(async (file: File) => {
    setParsing(true);
    setError(null);
    setSensors([]);
    setDamageMarker(null);
    setGenerated(false);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const result = await parseIfcFile(bytes);
      if (result.elementCount === 0) {
        setError('No renderable geometry was found in this IFC file (it may only contain non-geometric data, or use unsupported entity types).');
      }
      setParsed(result);
      setFileName(file.name);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to parse this IFC file.');
      setParsed(null);
    } finally {
      setParsing(false);
    }
  }, []);

  const viewerSensors: ViewerSensor[] = useMemo(
    () => sensors.map((s) => ({ id: s.sensorId, label: s.label, position: s.position3D })),
    [sensors]
  );

  const addPoint = useCallback(
    (p: Point3D) => {
      if (pickMode === 'sensor') {
        setSensors((prev) => {
          if (prev.length >= 10) return prev;
          const n = prev.length + 1;
          const sensorId = `C${String(n).padStart(2, '0')}`;
          return [...prev, { sensorId, label: `${sensorId} — placed point`, position3D: p, direction: 'transverse' }];
        });
      } else if (pickMode === 'damage') {
        setDamageMarker(p);
        setPickMode(null);
      }
    },
    [pickMode]
  );

  const canGenerate = sensors.length >= 3 && !!damageMarker;

  const handleGenerate = useCallback(() => {
    if (!canGenerate || !damageMarker) return;
    const preset = MATERIAL_PRESETS[materialPresetIdx];
    const profile = buildCustomProfile({
      id: CUSTOM_ID,
      shortLabel: shortLabel.trim() || 'Imported Structure',
      componentType: componentType.trim() || 'Imported Structural Component',
      material: preset.material,
      sourceKind: 'ifc',
      sensors,
      damageMarker3D: damageMarker,
      baseVelocityMs: preset.baseVelocityMs,
    });
    importCustomProfile(profile, parsed?.group ?? null);
    setGenerated(true);
  }, [canGenerate, damageMarker, materialPresetIdx, shortLabel, componentType, sensors, importCustomProfile, parsed]);

  return (
    <div className="space-y-4">
      <Card title="1. Upload an IFC File">
        <div className="flex items-center gap-3">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 text-[13px] px-3 py-2 rounded-md border border-slate-300 hover:bg-slate-50"
          >
            <UploadCloud size={15} /> Choose .ifc file
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".ifc"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
              e.target.value = '';
            }}
          />
          {fileName && <span className="text-[12px] text-slate-500 font-mono-lab">{fileName}</span>}
          {parsing && <span className="text-[12px] text-slate-400">Parsing…</span>}
        </div>
        {error && (
          <div className="mt-3 flex items-start gap-2 text-[12px] text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" /> {error}
          </div>
        )}
        <p className="text-[11px] text-slate-400 mt-2">
          Parsed client-side with web-ifc (a real IFC/BIM geometry engine, not a mock) — nothing is uploaded anywhere.
          Building-oriented IFC2x3/IFC4 geometry (beams, slabs, columns, walls) imports well; bridge-specific
          alignment/civil entities (IFC 4.3 / IFC-Bridge) have thinner open-source support and may not appear.
        </p>
      </Card>

      {parsed && parsed.elementCount > 0 && (
        <>
          <Card title="2. Place Sensors and a Damage Marker">
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <button
                onClick={() => setPickMode(pickMode === 'sensor' ? null : 'sensor')}
                className={`text-[12px] px-3 py-1.5 rounded-md border ${pickMode === 'sensor' ? 'border-[#1d5b8f] bg-[#e6eef5] text-[#1d5b8f]' : 'border-slate-300 text-slate-600 hover:bg-slate-50'}`}
              >
                {pickMode === 'sensor' ? 'Click the model to place a sensor…' : 'Place Sensor'}
              </button>
              <button
                onClick={() => setPickMode(pickMode === 'damage' ? null : 'damage')}
                className={`text-[12px] px-3 py-1.5 rounded-md border ${pickMode === 'damage' ? 'border-[#b5292f] bg-red-50 text-[#b5292f]' : 'border-slate-300 text-slate-600 hover:bg-slate-50'}`}
              >
                {pickMode === 'damage' ? 'Click the model to place the damage marker…' : 'Place Damage Marker'}
              </button>
              <button
                onClick={() => { setSensors([]); setDamageMarker(null); setPickMode(null); setGenerated(false); }}
                className="text-[12px] px-3 py-1.5 rounded-md border border-slate-300 text-slate-600 hover:bg-slate-50"
              >
                Reset Placements
              </button>
              <span className="text-[11px] text-slate-400 ml-auto">{sensors.length} sensor(s) · damage marker {damageMarker ? 'set' : 'not set'}</span>
            </div>

            <ImportedModelViewer
              modelGroup={parsed.group}
              sensors={viewerSensors}
              damageMarker={damageMarker}
              pickMode={pickMode}
              onPick={addPoint}
              onError={() => setError('3D rendering is unavailable in this browser (WebGL required).')}
            />

            {sensors.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-3">
                {sensors.map((s) => (
                  <div key={s.sensorId} className="flex items-center justify-between border border-slate-200 rounded-md px-3 py-1.5 text-[12px]">
                    <span className="font-mono-lab">{s.sensorId}</span>
                    <span className="text-slate-400 font-mono-lab">
                      ({s.position3D.x.toFixed(2)}, {s.position3D.y.toFixed(2)}, {s.position3D.z.toFixed(2)}) m
                    </span>
                    <button onClick={() => setSensors((prev) => prev.filter((x) => x.sensorId !== s.sensorId))} className="text-slate-400 hover:text-red-600">
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card title="3. Describe the Structure &amp; Generate a Demonstration Dataset">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
              <label className="text-[12px] text-slate-600">
                Name
                <input value={shortLabel} onChange={(e) => setShortLabel(e.target.value)} className="mt-1 w-full border border-slate-300 rounded-md px-2 py-1.5 text-[13px]" />
              </label>
              <label className="text-[12px] text-slate-600">
                Component type
                <input value={componentType} onChange={(e) => setComponentType(e.target.value)} placeholder="e.g. Pedestrian bridge girder" className="mt-1 w-full border border-slate-300 rounded-md px-2 py-1.5 text-[13px]" />
              </label>
              <label className="text-[12px] text-slate-600">
                Assumed material
                <select value={materialPresetIdx} onChange={(e) => setMaterialPresetIdx(Number(e.target.value))} className="mt-1 w-full border border-slate-300 rounded-md px-2 py-1.5 text-[13px]">
                  {MATERIAL_PRESETS.map((m, i) => (<option key={m.label} value={i}>{m.label}</option>))}
                </select>
              </label>
            </div>
            <button
              onClick={handleGenerate}
              disabled={!canGenerate}
              className="flex items-center gap-2 text-[13px] px-4 py-2 rounded-md bg-[#1d5b8f] text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#164a75]"
            >
              <CheckCircle2 size={15} /> Generate Demonstration Dataset
            </button>
            {!canGenerate && <p className="text-[11px] text-amber-700 mt-2">Place at least 3 sensors and 1 damage marker first.</p>}
            {generated && structureId === CUSTOM_ID && (
              <div className="mt-3 text-[12px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-3 py-2">
                Done — "{shortLabel}" is now the active demonstration asset. Explore it via{' '}
                <button className="underline" onClick={() => onNavigate('twin')}>Digital Twin</button>,{' '}
                <button className="underline" onClick={() => onNavigate('diagnosis')}>AI Diagnosis</button>, or{' '}
                <button className="underline" onClick={() => onNavigate('prognosis')}>Damage Prognosis</button> like any other asset —
                or switch back any time from the selector in the top bar.
              </div>
            )}
          </Card>
        </>
      )}

      <ResearchLimitations
        items={[
          'The imported IFC geometry is real, but sensor placement is manual (clicked by the user) — there is no automatic sensor-placement optimization.',
          'Signals generated for an imported structure use the same synthetic model as the built-in demonstration assets, with damage coupling based on 3D distance from the marked damage point — the geometry is real, the sensor data is still [SIMULATED].',
          'Sensor position is collapsed onto a single dominant axis (the greatest-extent direction of the placed points) to reuse the rest of the pipeline’s 1D span-fraction model — this is a simplification for structures that are not straightforwardly axial.',
          'IFC 4.3 / IFC-Bridge civil alignment entities are not fully supported by the open-source parser used here.',
        ]}
      />
    </div>
  );
}

function PointCloudTab() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cloud, setCloud] = useState<PointCloudData | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [reference, setReference] = useState<{ points: Float32Array; label: string } | null>(null);
  const [showDeviation, setShowDeviation] = useState(false);

  const handleFile = useCallback(async (file: File) => {
    setLoading(true);
    setError(null);
    try {
      const data = await parsePointCloudFile(file);
      setCloud(data);
      setFileName(file.name);
      setShowDeviation(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to parse this point cloud file.');
      setCloud(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const captureReferenceFromIfc = useCallback(async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.ifc';
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return;
      setLoading(true);
      try {
        const bytes = new Uint8Array(await f.arrayBuffer());
        const result: IfcParseResult = await parseIfcFile(bytes);
        const pts: number[] = [];
        result.group.traverse((o) => {
          if (o instanceof THREE.Mesh) {
            const pos = o.geometry.getAttribute('position');
            for (let i = 0; i < pos.count; i += Math.max(1, Math.floor(pos.count / 4000))) {
              pts.push(pos.getX(i), pos.getY(i), pos.getZ(i));
            }
          }
        });
        setReference({ points: new Float32Array(pts), label: f.name });
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to parse reference IFC file.');
      } finally {
        setLoading(false);
      }
    };
    input.click();
  }, []);

  const deviationColors = useMemo(() => {
    if (!showDeviation || !cloud || !reference) return null;
    return computeDeviationColors(cloud.positions, reference.points);
  }, [showDeviation, cloud, reference]);

  return (
    <div className="space-y-4">
      <Card title="1. Upload a Point Cloud">
        <div className="flex flex-wrap items-center gap-3">
          <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-2 text-[13px] px-3 py-2 rounded-md border border-slate-300 hover:bg-slate-50">
            <UploadCloud size={15} /> Choose .ply / .xyz / .csv file
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".ply,.xyz,.csv,.txt"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
              e.target.value = '';
            }}
          />
          {fileName && <span className="text-[12px] text-slate-500 font-mono-lab">{fileName} · {cloud?.pointCount.toLocaleString()} points</span>}
          {loading && <span className="text-[12px] text-slate-400">Working…</span>}
        </div>
        {error && (
          <div className="mt-3 flex items-start gap-2 text-[12px] text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" /> {error}
          </div>
        )}
        <p className="text-[11px] text-slate-400 mt-2">
          Supports ASCII and binary_little_endian PLY, and plain XYZ/CSV text. LAS/LAZ is not supported in this
          browser-based demo — export to .ply or .xyz from your point-cloud software first.
        </p>
      </Card>

      {cloud && (
        <Card title="2. View &amp; Check Against a Reference Model (Optional)">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <button onClick={captureReferenceFromIfc} className="text-[12px] px-3 py-1.5 rounded-md border border-slate-300 hover:bg-slate-50">
              Load a reference IFC model…
            </button>
            {reference && <span className="text-[11px] text-slate-500 font-mono-lab">Reference: {reference.label}</span>}
            <label className="flex items-center gap-1.5 text-[12px] text-slate-600 ml-auto">
              <input type="checkbox" checked={showDeviation} onChange={(e) => setShowDeviation(e.target.checked)} disabled={!reference} />
              Show as-built vs as-designed deviation
            </label>
          </div>
          <ImportedModelViewer
            pointCloud={{ positions: cloud.positions, colors: cloud.colors }}
            deviationColors={deviationColors}
            sensors={[]}
            damageMarker={null}
          />
          {showDeviation && (
            <div className="flex items-center gap-3 mt-2 text-[11px]">
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-[#1f8a5f] inline-block" /> Close to reference</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-[#c9971e] inline-block" /> Moderate deviation</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-[#b5292f] inline-block" /> &gt;15 cm deviation</span>
            </div>
          )}
        </Card>
      )}

      <InfoNote>
        This tab is a viewer and a simple nearest-point deviation check, not a scan-to-BIM reconstruction pipeline.
        Automatically inferring parametric structural geometry (beams, slabs, girders) from raw point-cloud data is
        its own substantial research problem and is intentionally out of scope here.
      </InfoNote>
      <ResearchLimitations
        items={[
          'The deviation check is brute-force nearest-neighbor distance against a (downsampled) reference point set — not a registered ICP alignment. Cloud and reference should already share a coordinate frame.',
          'No automatic geometry fitting (plane/cylinder detection, member segmentation) is performed — the cloud is displayed as raw points.',
          'Large files are not decimated automatically; very large point clouds may be slow to render or compute deviation for in-browser.',
        ]}
      />
    </div>
  );
}
