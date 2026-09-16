// Client-side IFC (Industry Foundation Classes) geometry loader.
//
// Uses web-ifc (the open-source WASM engine behind most browser BIM
// viewers) to parse a real .ifc file and produce actual three.js geometry
// from it — not a schematic approximation. The WASM binary is inlined as
// base64 (see ../vendor/webIfcWasmBase64.ts) rather than fetched from a
// CDN, so this works both offline and inside the sandboxed Artifact viewer,
// which blocks external network requests.
//
// Scope note: web-ifc handles building-oriented IFC2x3/IFC4 geometry well
// (walls, beams, slabs, columns, footings). Bridge-specific alignment and
// civil-engineering entities (the newer IFC 4.3 / IFC-Bridge extension) are
// a less mature part of the open-source tooling — a bridge IFC model's
// structural member geometry will generally import fine, but alignment
// curves / civil-specific semantics may not be represented.

import * as THREE from 'three';
import { IfcAPI } from 'web-ifc';
import { WEB_IFC_WASM_BASE64 } from '../vendor/webIfcWasmBase64';

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

let wasmBlobUrl: string | null = null;
function getWasmBlobUrl(): string {
  if (!wasmBlobUrl) {
    const bytes = base64ToBytes(WEB_IFC_WASM_BASE64);
    const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'application/wasm' });
    wasmBlobUrl = URL.createObjectURL(blob);
  }
  return wasmBlobUrl;
}

let apiPromise: Promise<IfcAPI> | null = null;
async function getApi(): Promise<IfcAPI> {
  if (!apiPromise) {
    apiPromise = (async () => {
      const api = new IfcAPI();
      // forceSingleThread=true avoids needing the multi-threaded wasm
      // variant (which needs cross-origin isolation headers we can't rely
      // on inside an embedded/sandboxed viewer).
      await api.Init(() => getWasmBlobUrl(), true);
      return api;
    })();
  }
  return apiPromise;
}

export interface IfcParseResult {
  group: THREE.Group;
  boundingBox: THREE.Box3;
  elementCount: number;
  modelId: number;
}

/** Parses an IFC file's real geometry into a three.js Group. Every mesh
 * comes directly from the file's actual placed geometry and transform — no
 * synthetic or approximated shapes are introduced here. */
export async function parseIfcFile(bytes: Uint8Array): Promise<IfcParseResult> {
  const api = await getApi();
  const modelID = api.OpenModel(bytes, { COORDINATE_TO_ORIGIN: true });
  const group = new THREE.Group();
  const box = new THREE.Box3();
  let elementCount = 0;

  api.StreamAllMeshes(modelID, (mesh) => {
    const placedGeoms = mesh.geometries;
    const n = placedGeoms.size();
    for (let i = 0; i < n; i++) {
      const placed = placedGeoms.get(i);
      const ifcGeom = api.GetGeometry(modelID, placed.geometryExpressID);
      const vertexData = api.GetVertexArray(ifcGeom.GetVertexData(), ifcGeom.GetVertexDataSize());
      const indexData = api.GetIndexArray(ifcGeom.GetIndexData(), ifcGeom.GetIndexDataSize());
      if (vertexData.length === 0 || indexData.length === 0) {
        ifcGeom.delete();
        continue;
      }

      const vertexCount = vertexData.length / 6;
      const positions = new Float32Array(vertexCount * 3);
      const normals = new Float32Array(vertexCount * 3);
      for (let v = 0, p = 0; v < vertexData.length; v += 6, p += 3) {
        positions[p] = vertexData[v];
        positions[p + 1] = vertexData[v + 1];
        positions[p + 2] = vertexData[v + 2];
        normals[p] = vertexData[v + 3];
        normals[p + 1] = vertexData[v + 4];
        normals[p + 2] = vertexData[v + 5];
      }

      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
      geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(indexData), 1));

      const matrix = new THREE.Matrix4().fromArray(placed.flatTransformation);
      geometry.applyMatrix4(matrix);
      geometry.computeBoundingBox();
      if (geometry.boundingBox) box.union(geometry.boundingBox);

      const c = placed.color;
      const material = new THREE.MeshStandardMaterial({
        color: new THREE.Color(c.x, c.y, c.z),
        opacity: c.w,
        transparent: c.w < 0.98,
        side: THREE.DoubleSide,
        roughness: 0.85,
        metalness: 0.05,
      });
      const meshObj = new THREE.Mesh(geometry, material);
      meshObj.castShadow = true;
      meshObj.receiveShadow = true;
      group.add(meshObj);
      elementCount++;

      ifcGeom.delete();
    }
  });

  return { group, boundingBox: box, elementCount, modelId: modelID };
}

export async function closeIfcModel(modelId: number): Promise<void> {
  try {
    const api = await getApi();
    api.CloseModel(modelId);
  } catch {
    // best-effort cleanup only
  }
}
