import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { SensorConfig } from '../../data/types';
import type { StructureKind } from '../../data/syntheticData';

export interface TwinSensorDatum {
  sensor: SensorConfig;
  indicator: number; // 0-1 anomaly indicator
  isSelected: boolean;
  tofUs: number;
}

interface KindGeometry {
  length: number;
  height: number;
  depth: number;
  supportInset: number;
  narrative: string;
}

const KIND_GEOMETRY: Record<StructureKind, KindGeometry> = {
  beam: { length: 6, height: 0.5, depth: 0.5, supportInset: 0.15, narrative: 'crack' },
  deck: { length: 6.4, height: 0.32, depth: 1.9, supportInset: 0.08, narrative: 'crack' },
  pipe: { length: 6, height: 0.64, depth: 0.64, supportInset: 0.13, narrative: 'patch' },
  custom: { length: 6, height: 0.5, depth: 0.5, supportInset: 0.15, narrative: 'crack' },
};

function colorForIndicator(indicator: number): THREE.Color {
  if (indicator < 0.3) return new THREE.Color('#1f8a5f');
  if (indicator < 0.55) return new THREE.Color('#c9971e');
  return new THREE.Color('#b5292f');
}

/** Draws either a jagged crack (beam/deck) growing from the base, or a
 * blotchy corrosion/degradation patch (pipe), whose extent encodes the
 * current damage indicator near the demonstration damage location. This is
 * a schematic visual cue only — not a measured defect geometry. */
function drawDamageTexture(canvas: HTMLCanvasElement, severity: number, style: 'crack' | 'patch') {
  const ctx = canvas.getContext('2d')!;
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  if (severity < 0.06) return;
  const growth = Math.min(1, severity);
  const seedBase = Math.round(severity * 997);

  if (style === 'crack') {
    const tipY = h - growth * h * 0.92;
    let x = w / 2;
    let y = h;
    ctx.strokeStyle = 'rgba(20,18,16,0.88)';
    ctx.lineWidth = 2 + growth * 2.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x, y);
    const steps = 14;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const curY = y - t * (y - tipY);
      if (curY < tipY) break;
      const jitter = Math.sin(seedBase + i * 12.9898) * 4.5 * growth;
      x = w / 2 + jitter * (1 - t * 0.4);
      ctx.lineTo(x, curY);
      if (growth > 0.5 && i % 4 === 0) {
        const bx = x + (i % 8 === 0 ? 10 : -10) * growth;
        const by = curY + 10;
        ctx.lineTo(bx, by);
        ctx.lineTo(x, curY);
      }
    }
    ctx.stroke();
  } else {
    // patch: irregular concentric blotches, e.g. localized wall-thickness
    // loss / corrosion staining around a girth weld
    const cx = w / 2;
    const cy = h / 2;
    const maxR = Math.min(w, h) * 0.55 * growth;
    for (let ring = 0; ring < 4; ring++) {
      const r = maxR * (1 - ring * 0.2);
      if (r <= 0) continue;
      ctx.beginPath();
      const pts = 16;
      for (let i = 0; i <= pts; i++) {
        const t = (i / pts) * Math.PI * 2;
        const jitter = 1 + Math.sin(seedBase + ring * 5 + i * 1.7) * 0.18;
        const px = cx + Math.cos(t) * r * jitter;
        const py = cy + Math.sin(t) * r * jitter * 0.7;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fillStyle = `rgba(90,58,30,${0.12 + ring * 0.07 * growth})`;
      ctx.fill();
    }
  }
}

/** A short-lived travelling pulse representing an ultrasonic wave packet
 * moving from the excitation point toward a sensor. Purely illustrative. */
interface WavePulse {
  mesh: THREE.Mesh;
  startTime: number;
  duration: number;
  fromX: number;
  toX: number;
}

export function DigitalTwin3D({
  sensorData,
  kind = 'beam',
  spanMm = 3000,
  damageLocationFraction = 0.5,
  onSelectSensor,
  onHoverSensor,
  onError,
  playToken,
}: {
  sensorData: TwinSensorDatum[];
  kind?: StructureKind;
  spanMm?: number;
  damageLocationFraction?: number;
  onSelectSensor: (sensorId: string) => void;
  onHoverSensor?: (sensorId: string | null) => void;
  onError: () => void;
  playToken?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sensorMeshesRef = useRef<Map<string, THREE.Mesh>>(new Map());
  const dataRef = useRef(sensorData);
  dataRef.current = sensorData;
  const onSelectRef = useRef(onSelectSensor);
  onSelectRef.current = onSelectSensor;
  const onHoverRef = useRef(onHoverSensor);
  onHoverRef.current = onHoverSensor;
  const crackCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const crackTextureRef = useRef<THREE.CanvasTexture | null>(null);
  const pulsesRef = useRef<WavePulse[]>([]);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const clockRef = useRef(0);
  const spawnPulsesRef = useRef<() => void>(() => {});

  const geo = KIND_GEOMETRY[kind] ?? KIND_GEOMETRY.beam;
  const BEAM_LENGTH = geo.length;
  const BEAM_HEIGHT = geo.height;
  const BEAM_DEPTH = geo.depth;
  const BEAM_Y = BEAM_HEIGHT / 2 + 0.3;

  function sensorX(positionFraction: number): number {
    return -BEAM_LENGTH / 2 + positionFraction * BEAM_LENGTH;
  }

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      onError();
      return;
    }

    const width = container.clientWidth || 800;
    const height = container.clientHeight || 460;
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    // Soft vertical gradient sky instead of a flat fill
    const skyCanvas = document.createElement('canvas');
    skyCanvas.width = 8;
    skyCanvas.height = 256;
    const skyCtx = skyCanvas.getContext('2d')!;
    const grad = skyCtx.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, '#e3e9f0');
    grad.addColorStop(1, '#f7f8fa');
    skyCtx.fillStyle = grad;
    skyCtx.fillRect(0, 0, 8, 256);
    scene.background = new THREE.CanvasTexture(skyCanvas);

    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
    camera.position.set(4.6, 3.1, 5.6);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 3;
    controls.maxDistance = 14;
    controls.maxPolarAngle = Math.PI / 2.05;
    controls.target.set(0, BEAM_Y, 0);
    controls.autoRotate = true;
    controls.autoRotateSpeed = 1.1;
    let userInteracted = false;
    controls.addEventListener('start', () => {
      userInteracted = true;
      controls.autoRotate = false;
    });

    scene.add(new THREE.AmbientLight('#ffffff', 0.55));
    const hemi = new THREE.HemisphereLight('#f4f6f9', '#c7ced9', 0.5);
    scene.add(hemi);
    const dir = new THREE.DirectionalLight('#ffffff', 1.05);
    dir.position.set(5, 8, 4);
    dir.castShadow = true;
    dir.shadow.mapSize.set(1024, 1024);
    dir.shadow.camera.left = -6;
    dir.shadow.camera.right = 6;
    dir.shadow.camera.top = 6;
    dir.shadow.camera.bottom = -6;
    scene.add(dir);

    // Ground: shadow-catcher plane + faint grid
    const groundGeo = new THREE.PlaneGeometry(20, 20);
    const groundMat = new THREE.ShadowMaterial({ opacity: 0.18 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
    const grid = new THREE.GridHelper(10, 20, '#c3c9d3', '#dfe3e9');
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.6;
    grid.position.y = 0.001;
    scene.add(grid);

    // Main structural member — geometry depends on demonstration asset kind
    const memberMat = new THREE.MeshStandardMaterial({
      color: kind === 'pipe' ? '#8f97a3' : '#d7dbe1',
      roughness: kind === 'pipe' ? 0.55 : 0.92,
      metalness: kind === 'pipe' ? 0.35 : 0.02,
    });
    let beam: THREE.Mesh;
    if (kind === 'pipe') {
      const radius = BEAM_HEIGHT / 2;
      const cylGeo = new THREE.CylinderGeometry(radius, radius, BEAM_LENGTH, 28);
      beam = new THREE.Mesh(cylGeo, memberMat);
      beam.rotation.z = Math.PI / 2;
    } else {
      const boxGeo = new THREE.BoxGeometry(BEAM_LENGTH, BEAM_HEIGHT, BEAM_DEPTH);
      beam = new THREE.Mesh(boxGeo, memberMat);
    }
    beam.position.y = BEAM_Y;
    beam.castShadow = true;
    beam.receiveShadow = true;
    scene.add(beam);

    // Faint form-line / weld-seam details to suggest a real fabricated member
    if (kind !== 'pipe') {
      const edgeMat = new THREE.LineBasicMaterial({ color: '#aab2bf', transparent: true, opacity: 0.5 });
      const edges = new THREE.EdgesGeometry(beam.geometry);
      const edgeLines = new THREE.LineSegments(edges, edgeMat);
      edgeLines.position.copy(beam.position);
      scene.add(edgeLines);
    } else {
      // girth-weld ring lines along the pipe
      for (const frac of [0.15, 0.45, 0.85]) {
        const ringGeo = new THREE.TorusGeometry(BEAM_HEIGHT / 2 + 0.002, 0.006, 8, 32);
        const ringMat = new THREE.MeshStandardMaterial({ color: '#5b6472', roughness: 0.6 });
        const weldRing = new THREE.Mesh(ringGeo, ringMat);
        weldRing.rotation.y = Math.PI / 2;
        weldRing.position.set(sensorX(frac), BEAM_Y, 0);
        scene.add(weldRing);
      }
    }

    // Damage decal near the demonstration damage location (front face)
    const damageX = sensorX(damageLocationFraction);
    const crackCanvas = document.createElement('canvas');
    crackCanvas.width = geo.narrative === 'patch' ? 200 : 64;
    crackCanvas.height = geo.narrative === 'patch' ? 200 : 256;
    crackCanvasRef.current = crackCanvas;
    const crackTexture = new THREE.CanvasTexture(crackCanvas);
    crackTextureRef.current = crackTexture;
    const crackMat = new THREE.MeshBasicMaterial({ map: crackTexture, transparent: true, depthWrite: false });
    const decalW = geo.narrative === 'patch' ? BEAM_HEIGHT * 1.3 : 0.5;
    const decalH = geo.narrative === 'patch' ? BEAM_HEIGHT * 1.3 : BEAM_HEIGHT * 0.98;
    const crackPlane = new THREE.Mesh(new THREE.PlaneGeometry(decalW, decalH), crackMat);
    const decalZOffset = kind === 'pipe' ? BEAM_HEIGHT / 2 + 0.01 : BEAM_DEPTH / 2 + 0.002;
    crackPlane.position.set(damageX, BEAM_Y, decalZOffset);
    scene.add(crackPlane);

    // Supports — geometry style depends on demonstration asset kind
    const insetX = BEAM_LENGTH / 2 - geo.supportInset;
    if (kind === 'deck') {
      const pierGeo = new THREE.BoxGeometry(0.45, 0.85, BEAM_DEPTH * 0.65);
      const pierMat = new THREE.MeshStandardMaterial({ color: '#5b6472', roughness: 0.75 });
      const capGeo = new THREE.BoxGeometry(0.7, 0.1, BEAM_DEPTH * 0.75);
      const capMat = new THREE.MeshStandardMaterial({ color: '#8a92a0', roughness: 0.8 });
      [-insetX, insetX].forEach((x) => {
        const pier = new THREE.Mesh(pierGeo, pierMat);
        pier.position.set(x, 0.425, 0);
        pier.castShadow = true;
        scene.add(pier);
        const cap = new THREE.Mesh(capGeo, capMat);
        cap.position.set(x, 0.85 + 0.05, 0);
        cap.receiveShadow = true;
        scene.add(cap);
      });
    } else if (kind === 'pipe') {
      const radius = BEAM_HEIGHT / 2;
      const cradleGeo = new THREE.CylinderGeometry(radius + 0.04, radius + 0.04, 0.3, 20, 1, false, Math.PI, Math.PI);
      const cradleMat = new THREE.MeshStandardMaterial({ color: '#5b6472', roughness: 0.7, side: THREE.DoubleSide });
      const baseGeo = new THREE.BoxGeometry(0.5, 0.08, 0.5);
      const baseMat = new THREE.MeshStandardMaterial({ color: '#8a92a0', roughness: 0.8 });
      [-insetX, insetX].forEach((x) => {
        const cradle = new THREE.Mesh(cradleGeo, cradleMat);
        cradle.rotation.z = Math.PI / 2;
        cradle.rotation.y = Math.PI / 2;
        cradle.position.set(x, 0.3, 0);
        cradle.castShadow = true;
        scene.add(cradle);
        const base = new THREE.Mesh(baseGeo, baseMat);
        base.position.set(x, 0.04, 0);
        base.receiveShadow = true;
        scene.add(base);
      });
    } else {
      const supportGeo = new THREE.ConeGeometry(0.28, 0.6, 4);
      const supportMat = new THREE.MeshStandardMaterial({ color: '#5b6472', roughness: 0.7 });
      const footingGeo = new THREE.BoxGeometry(0.55, 0.08, 0.55);
      const footingMat = new THREE.MeshStandardMaterial({ color: '#8a92a0', roughness: 0.8 });
      [-insetX, insetX].forEach((x) => {
        const support = new THREE.Mesh(supportGeo, supportMat);
        support.position.set(x, 0, 0);
        support.rotation.y = Math.PI / 4;
        support.castShadow = true;
        scene.add(support);
        const footing = new THREE.Mesh(footingGeo, footingMat);
        footing.position.set(x, -0.04, 0);
        footing.receiveShadow = true;
        scene.add(footing);
      });
    }

    // Span dimension label
    {
      const canvas = document.createElement('canvas');
      canvas.width = 240;
      canvas.height = 48;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#0f2138';
      ctx.font = 'bold 24px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`SPAN ${spanMm} mm`, 120, 32);
      const texture = new THREE.CanvasTexture(canvas);
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true }));
      sprite.scale.set(1.4, 0.28, 1);
      sprite.position.set(0, -0.32, 0.9 + BEAM_DEPTH / 2);
      scene.add(sprite);
    }

    // Sensors
    const sensorMeshes = new Map<string, THREE.Mesh>();
    const sphereGeo = new THREE.SphereGeometry(0.14, 24, 24);
    for (const d of dataRef.current) {
      const x = sensorX(d.sensor.positionFraction);
      const mat = new THREE.MeshStandardMaterial({
        color: colorForIndicator(d.indicator),
        roughness: 0.4,
        metalness: 0.1,
        emissive: colorForIndicator(d.indicator),
        emissiveIntensity: 0.15 + d.indicator * 0.35,
      });
      const mesh = new THREE.Mesh(sphereGeo, mat);
      const scale = 0.85 + d.indicator * 0.5;
      mesh.scale.setScalar(scale);
      mesh.position.set(x, BEAM_Y + BEAM_HEIGHT / 2 + 0.35, 0);
      mesh.castShadow = true;
      mesh.userData.sensorId = d.sensor.sensorId;
      mesh.userData.baseScale = scale;
      scene.add(mesh);
      sensorMeshes.set(d.sensor.sensorId, mesh);

      // thin stem connecting sensor to member surface
      const stemGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.3, 8);
      const stemMat = new THREE.MeshStandardMaterial({ color: '#94a3b8' });
      const stem = new THREE.Mesh(stemGeo, stemMat);
      stem.position.set(x, BEAM_Y + BEAM_HEIGHT / 2 + 0.15, 0);
      scene.add(stem);

      // ring beneath high-anomaly sensors (subtle halo)
      const ringGeo = new THREE.RingGeometry(0.18, 0.24, 32);
      const ringMat = new THREE.MeshBasicMaterial({ color: colorForIndicator(d.indicator), transparent: true, opacity: d.indicator > 0.3 ? 0.5 : 0, side: THREE.DoubleSide });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(x, BEAM_Y + BEAM_HEIGHT / 2 + 0.36, 0);
      ring.userData.isRing = true;
      ring.userData.sensorId = d.sensor.sensorId;
      scene.add(ring);

      // Label sprite
      const canvas = document.createElement('canvas');
      canvas.width = 128;
      canvas.height = 64;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = 'rgba(15,33,56,0.85)';
      if (ctx.roundRect) {
        ctx.beginPath();
        ctx.roundRect(4, 12, 120, 40, 8);
        ctx.fill();
      } else {
        ctx.fillRect(4, 12, 120, 40);
      }
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 28px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(d.sensor.sensorId, 64, 42);
      const texture = new THREE.CanvasTexture(canvas);
      const spriteMat = new THREE.SpriteMaterial({ map: texture, depthTest: false });
      const sprite = new THREE.Sprite(spriteMat);
      sprite.scale.set(0.6, 0.3, 1);
      sprite.position.set(x, BEAM_Y + BEAM_HEIGHT / 2 + 0.78, 0);
      scene.add(sprite);
    }
    sensorMeshesRef.current = sensorMeshes;

    // Excitation marker (left end)
    const excitationGeo = new THREE.ConeGeometry(0.09, 0.22, 16);
    const excitationMat = new THREE.MeshStandardMaterial({ color: '#1d5b8f', emissive: '#1d5b8f', emissiveIntensity: 0.3 });
    const excitationMarker = new THREE.Mesh(excitationGeo, excitationMat);
    excitationMarker.rotation.z = Math.PI / 2;
    excitationMarker.position.set(-BEAM_LENGTH / 2 - 0.05, BEAM_Y, 0);
    scene.add(excitationMarker);

    // --- Wave propagation pulse spawner ---
    function spawnPulses() {
      const now = clockRef.current;
      const maxTof = Math.max(...dataRef.current.map((d) => d.tofUs), 1);
      for (const d of dataRef.current) {
        const pGeo = new THREE.SphereGeometry(0.07, 12, 12);
        const mat = new THREE.MeshBasicMaterial({ color: '#4ea1e8', transparent: true, opacity: 0.95 });
        const mesh = new THREE.Mesh(pGeo, mat);
        const fromX = -BEAM_LENGTH / 2;
        const toX = sensorX(d.sensor.positionFraction);
        mesh.position.set(fromX, BEAM_Y + BEAM_HEIGHT / 2 + 0.06, 0);
        scene.add(mesh);
        pulsesRef.current.push({
          mesh,
          startTime: now,
          duration: 0.6 + (d.tofUs / maxTof) * 1.6,
          fromX,
          toX,
        });
      }
    }
    spawnPulsesRef.current = spawnPulses;

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    function pick(clientX: number, clientY: number): string | null {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const meshes = Array.from(sensorMeshesRef.current.values());
      const hits = raycaster.intersectObjects(meshes);
      return hits.length > 0 ? ((hits[0].object.userData.sensorId as string) ?? null) : null;
    }
    function onClick(event: MouseEvent) {
      const id = pick(event.clientX, event.clientY);
      if (id) onSelectRef.current(id);
    }
    let hoveredId: string | null = null;
    function onMove(event: MouseEvent) {
      const id = pick(event.clientX, event.clientY);
      if (id !== hoveredId) {
        hoveredId = id;
        onHoverRef.current?.(id);
        renderer.domElement.style.cursor = id ? 'pointer' : 'grab';
      }
    }
    renderer.domElement.addEventListener('click', onClick);
    renderer.domElement.addEventListener('mousemove', onMove);
    renderer.domElement.addEventListener('mouseleave', () => {
      hoveredId = null;
      onHoverRef.current?.(null);
    });

    let raf = 0;
    let disposed = false;
    let lastT = performance.now();
    function animate() {
      if (disposed) return;
      const now = performance.now();
      const dt = (now - lastT) / 1000;
      lastT = now;
      clockRef.current += dt;
      controls.update();

      // gentle pulsing halo for elevated-anomaly sensors
      scene.traverse((obj) => {
        if (obj.userData?.isRing) {
          const scalePulse = 1 + Math.sin(clockRef.current * 2.4) * 0.12;
          obj.scale.set(scalePulse, scalePulse, 1);
        }
      });

      // advance wave pulses
      if (pulsesRef.current.length > 0) {
        const remaining: WavePulse[] = [];
        for (const p of pulsesRef.current) {
          const t = (clockRef.current - p.startTime) / p.duration;
          if (t >= 1) {
            scene.remove(p.mesh);
            p.mesh.geometry.dispose();
            (p.mesh.material as THREE.Material).dispose();
            continue;
          }
          p.mesh.position.x = p.fromX + (p.toX - p.fromX) * t;
          (p.mesh.material as THREE.MeshBasicMaterial).opacity = 0.95 * (1 - t * 0.5);
          remaining.push(p);
        }
        pulsesRef.current = remaining;
      }

      renderer.render(scene, camera);
      raf = requestAnimationFrame(animate);
    }
    animate();

    // stop auto-rotate after a short showcase spin if the user hasn't touched it
    const autoRotateTimeout = window.setTimeout(() => {
      if (!userInteracted) controls.autoRotate = false;
    }, 4500);

    function handleResize() {
      if (!container) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    }
    window.addEventListener('resize', handleResize);

    return () => {
      disposed = true;
      window.clearTimeout(autoRotateTimeout);
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', handleResize);
      renderer.domElement.removeEventListener('click', onClick);
      renderer.domElement.removeEventListener('mousemove', onMove);
      controls.dispose();
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
          else obj.material.dispose();
        }
      });
      renderer.dispose();
      if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, spanMm, damageLocationFraction]);

  // Update sensor colors/scale/crack when data changes, without full re-init
  useEffect(() => {
    for (const d of sensorData) {
      const mesh = sensorMeshesRef.current.get(d.sensor.sensorId);
      if (mesh) {
        const mat = mesh.material as THREE.MeshStandardMaterial;
        mat.color = colorForIndicator(d.indicator);
        mat.emissive = colorForIndicator(d.indicator);
        mat.emissiveIntensity = d.isSelected ? 0.7 : 0.15 + d.indicator * 0.35;
        const scale = (0.85 + d.indicator * 0.5) * (d.isSelected ? 1.15 : 1);
        mesh.scale.setScalar(scale);
      }
      const scene = sceneRef.current;
      if (scene) {
        scene.traverse((obj) => {
          if (obj.userData?.isRing && obj.userData?.sensorId === d.sensor.sensorId) {
            (obj as THREE.Mesh).material && ((obj as THREE.Mesh).material as THREE.MeshBasicMaterial).color.set(colorForIndicator(d.indicator));
            ((obj as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = d.indicator > 0.3 ? 0.5 : 0;
          }
        });
      }
    }
  }, [sensorData]);

  // Redraw the damage decal whenever severity near the damage location changes
  const nearbySensors = sensorData.filter((d) => Math.abs(d.sensor.positionFraction - damageLocationFraction) <= 0.16);
  const damageSeverity = Math.max(0, ...(nearbySensors.length ? nearbySensors : sensorData).map((d) => d.indicator));
  useEffect(() => {
    if (crackCanvasRef.current && crackTextureRef.current) {
      drawDamageTexture(crackCanvasRef.current, damageSeverity, geo.narrative as 'crack' | 'patch');
      crackTextureRef.current.needsUpdate = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [damageSeverity]);

  // Trigger wave-propagation animation on demand
  useEffect(() => {
    if (playToken !== undefined && playToken > 0) {
      spawnPulsesRef.current();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playToken]);

  return <div ref={containerRef} className="w-full h-[460px] rounded-lg overflow-hidden cursor-grab" />;
}
