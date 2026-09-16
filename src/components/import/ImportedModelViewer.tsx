import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { Point3D } from '../../data/types';

export interface ViewerSensor {
  id: string;
  label: string;
  position: Point3D;
  /** 0-1 anomaly/damage indicator — colors and scales the marker the same
   * way the built-in Digital Twin does, when provided. */
  indicator?: number;
  isSelected?: boolean;
}

export interface ImportedModelViewerProps {
  /** Real IFC geometry to display (from engine/ifcLoader.ts). */
  modelGroup?: THREE.Group | null;
  /** Real point-cloud data to display, as a flat [x,y,z,x,y,z,...] array
   * in meters, with an optional parallel RGB [0..1] color array. */
  pointCloud?: { positions: Float32Array; colors?: Float32Array } | null;
  /** Optional per-point deviation-check colors (overrides pointCloud.colors),
   * same length/order as pointCloud.positions/3. */
  deviationColors?: Float32Array | null;
  sensors: ViewerSensor[];
  damageMarker?: Point3D | null;
  /** When set, clicking the model/point cloud calls onPick with the picked
   * point instead of doing nothing. */
  pickMode?: 'sensor' | 'damage' | null;
  onPick?: (p: Point3D) => void;
  /** When set (and pickMode is not active), clicking a sensor marker calls
   * this instead — lets this viewer double as a data-connected twin view. */
  onSelectSensor?: (id: string) => void;
  onError?: () => void;
  heightPx?: number;
}

function colorForIndicator(indicator: number): THREE.Color {
  if (indicator < 0.3) return new THREE.Color('#1f8a5f');
  if (indicator < 0.55) return new THREE.Color('#c9971e');
  return new THREE.Color('#b5292f');
}

export function ImportedModelViewer({
  modelGroup,
  pointCloud,
  deviationColors,
  sensors,
  damageMarker,
  pickMode,
  onPick,
  onSelectSensor,
  onError,
  heightPx = 460,
}: ImportedModelViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const pickModeRef = useRef(pickMode);
  pickModeRef.current = pickMode;
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;
  const onSelectSensorRef = useRef(onSelectSensor);
  onSelectSensorRef.current = onSelectSensor;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      onError?.();
      return;
    }

    const width = container.clientWidth || 800;
    const height = container.clientHeight || heightPx;
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
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

    scene.add(new THREE.AmbientLight('#ffffff', 0.6));
    const hemi = new THREE.HemisphereLight('#f4f6f9', '#c7ced9', 0.5);
    scene.add(hemi);
    const dir = new THREE.DirectionalLight('#ffffff', 1.0);
    dir.position.set(5, 8, 4);
    dir.castShadow = true;
    scene.add(dir);

    const groundGeo = new THREE.PlaneGeometry(200, 200);
    const groundMat = new THREE.ShadowMaterial({ opacity: 0.15 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    const content = new THREE.Group();
    scene.add(content);

    const pickables: THREE.Object3D[] = [];
    let pointsObj: THREE.Points | null = null;

    if (modelGroup) {
      content.add(modelGroup);
      modelGroup.traverse((o) => {
        if (o instanceof THREE.Mesh) pickables.push(o);
      });
    }

    if (pointCloud && pointCloud.positions.length > 0) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pointCloud.positions, 3));
      const colorSrc = deviationColors ?? pointCloud.colors;
      if (colorSrc) geo.setAttribute('color', new THREE.BufferAttribute(colorSrc, 3));
      const mat = new THREE.PointsMaterial({
        size: 0.03,
        vertexColors: !!colorSrc,
        color: colorSrc ? undefined : new THREE.Color('#4ea1e8'),
        sizeAttenuation: true,
      });
      pointsObj = new THREE.Points(geo, mat);
      content.add(pointsObj);
      pickables.push(pointsObj);
    }

    // Fit camera to content bounding box
    const box = new THREE.Box3().setFromObject(content);
    let center = new THREE.Vector3(0, 0.5, 0);
    let radius = 4;
    if (!box.isEmpty()) {
      box.getCenter(center);
      radius = Math.max(box.getSize(new THREE.Vector3()).length() * 0.6, 1.5);
    }

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.05, radius * 50 + 100);
    camera.position.set(center.x + radius * 0.9, center.y + radius * 0.7, center.z + radius * 0.9);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.target.copy(center);
    controls.minDistance = radius * 0.1;
    controls.maxDistance = radius * 8;

    // Sensor + damage markers, rebuilt whenever props change (see effect below)
    const markerGroup = new THREE.Group();
    scene.add(markerGroup);

    const raycaster = new THREE.Raycaster();
    raycaster.params.Points = { threshold: Math.max(0.02, radius * 0.01) };
    const pointer = new THREE.Vector2();

    function onClick(event: MouseEvent) {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);

      if (pickModeRef.current && pickables.length > 0) {
        const hits = raycaster.intersectObjects(pickables, false);
        if (hits.length > 0) {
          const p = hits[0].point;
          onPickRef.current?.({ x: p.x, y: p.y, z: p.z });
        }
        return;
      }
      if (!pickModeRef.current && onSelectSensorRef.current) {
        const meshMap = (container as unknown as { __sensorMeshes?: Map<string, THREE.Mesh> }).__sensorMeshes;
        if (meshMap && meshMap.size > 0) {
          const hits = raycaster.intersectObjects(Array.from(meshMap.values()), false);
          if (hits.length > 0) {
            const id = (hits[0].object.userData as { sensorId?: string }).sensorId;
            if (id) onSelectSensorRef.current(id);
          }
        }
      }
    }
    renderer.domElement.addEventListener('click', onClick);

    let raf = 0;
    let disposed = false;
    function animate() {
      if (disposed) return;
      controls.update();
      renderer.render(scene, camera);
      raf = requestAnimationFrame(animate);
    }
    animate();

    function handleResize() {
      if (!container) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    }
    window.addEventListener('resize', handleResize);

    // expose a way for the marker-update effect to reach this scene instance
    (container as unknown as { __markerGroup?: THREE.Group }).__markerGroup = markerGroup;

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', handleResize);
      renderer.domElement.removeEventListener('click', onClick);
      controls.dispose();
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh || obj instanceof THREE.Points) {
          obj.geometry?.dispose();
          const mat = (obj as THREE.Mesh).material;
          if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
          else mat?.dispose();
        }
      });
      renderer.dispose();
      if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelGroup, pointCloud, deviationColors]);

  // Rebuild sensor/damage markers on a lightweight pass without re-initializing the whole scene
  useEffect(() => {
    const container = containerRef.current as unknown as {
      __markerGroup?: THREE.Group;
      __sensorMeshes?: Map<string, THREE.Mesh>;
    } | null;
    const markerGroup = container?.__markerGroup;
    if (!markerGroup || !container) return;
    markerGroup.clear();

    const sensorMeshes = new Map<string, THREE.Mesh>();
    const sphereGeo = new THREE.SphereGeometry(0.05, 20, 20);
    for (const s of sensors) {
      const hasIndicator = typeof s.indicator === 'number';
      const color = hasIndicator ? colorForIndicator(s.indicator as number) : new THREE.Color('#1d5b8f');
      const mat = new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: s.isSelected ? 0.7 : 0.3,
      });
      const mesh = new THREE.Mesh(sphereGeo, mat);
      mesh.position.set(s.position.x, s.position.y, s.position.z);
      const scale = hasIndicator
        ? (0.85 + (s.indicator as number) * 0.5) * (s.isSelected ? 1.15 : 1)
        : s.isSelected
          ? 1.15
          : 1;
      mesh.scale.setScalar(scale);
      mesh.userData.sensorId = s.id;
      markerGroup.add(mesh);
      sensorMeshes.set(s.id, mesh);
    }
    container.__sensorMeshes = sensorMeshes;

    if (damageMarker) {
      const mat = new THREE.MeshStandardMaterial({ color: '#b5292f', emissive: '#b5292f', emissiveIntensity: 0.5 });
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.06, 20, 20), mat);
      mesh.position.set(damageMarker.x, damageMarker.y, damageMarker.z);
      markerGroup.add(mesh);
    }
  }, [sensors, damageMarker]);

  return (
    <div
      ref={containerRef}
      className="w-full rounded-lg overflow-hidden"
      style={{ height: heightPx, cursor: pickMode ? 'crosshair' : 'grab' }}
    />
  );
}
