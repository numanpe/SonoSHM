// Lightweight point-cloud parsers for formats that are practical to read
// directly in the browser without a native/WASM library: ASCII and
// binary_little_endian PLY, and plain XYZ / CSV text.
//
// LAS/LAZ (the common surveying/LiDAR interchange format) is NOT supported
// here — it requires a dedicated binary parser (variable point-record
// formats, compression for LAZ) that's a meaningfully bigger undertaking
// than this demonstration scope. Export a .ply or .xyz from your point
// cloud software (CloudCompare, MeshLab, etc.) to use it here.

export interface PointCloudData {
  positions: Float32Array;
  colors?: Float32Array; // 0..1 RGB, same length as positions
  pointCount: number;
}

export async function parsePointCloudFile(file: File): Promise<PointCloudData> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.ply')) {
    return parsePly(await file.arrayBuffer());
  }
  if (name.endsWith('.xyz') || name.endsWith('.csv') || name.endsWith('.txt')) {
    return parseXyzText(await file.text());
  }
  throw new Error('Unsupported point cloud format. Please provide a .ply, .xyz, or .csv file (LAS/LAZ is not supported in this browser-based demo).');
}

function parseXyzText(text: string): PointCloudData {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const positions: number[] = [];
  const colors: number[] = [];
  let hasColor = false;
  for (const line of lines) {
    const parts = line.trim().split(/[\s,]+/).map(Number);
    if (parts.length < 3 || parts.slice(0, 3).some((v) => Number.isNaN(v))) continue;
    positions.push(parts[0], parts[1], parts[2]);
    if (parts.length >= 6 && !parts.slice(3, 6).some((v) => Number.isNaN(v))) {
      hasColor = true;
      const maxC = Math.max(parts[3], parts[4], parts[5]);
      const scale = maxC > 1 ? 1 / 255 : 1;
      colors.push(parts[3] * scale, parts[4] * scale, parts[5] * scale);
    }
  }
  return {
    positions: new Float32Array(positions),
    colors: hasColor ? new Float32Array(colors) : undefined,
    pointCount: positions.length / 3,
  };
}

interface PlyProperty {
  name: string;
  type: string;
}

const PLY_TYPE_SIZE: Record<string, number> = {
  char: 1, uchar: 1, int8: 1, uint8: 1,
  short: 2, ushort: 2, int16: 2, uint16: 2,
  int: 4, uint: 4, int32: 4, uint32: 4,
  float: 4, float32: 4,
  double: 8, float64: 8,
};

function readPlyScalar(view: DataView, offset: number, type: string, littleEndian: boolean): number {
  switch (type) {
    case 'char': case 'int8': return view.getInt8(offset);
    case 'uchar': case 'uint8': return view.getUint8(offset);
    case 'short': case 'int16': return view.getInt16(offset, littleEndian);
    case 'ushort': case 'uint16': return view.getUint16(offset, littleEndian);
    case 'int': case 'int32': return view.getInt32(offset, littleEndian);
    case 'uint': case 'uint32': return view.getUint32(offset, littleEndian);
    case 'float': case 'float32': return view.getFloat32(offset, littleEndian);
    case 'double': case 'float64': return view.getFloat64(offset, littleEndian);
    default: return 0;
  }
}

function parsePly(buffer: ArrayBuffer): PointCloudData {
  const headerBytes = new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 20000));
  const headerText = new TextDecoder('ascii').decode(headerBytes);
  const endHeaderIdx = headerText.indexOf('end_header');
  if (endHeaderIdx === -1) throw new Error('Not a valid PLY file (missing end_header).');
  const headerLines = headerText.slice(0, endHeaderIdx).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  let format: 'ascii' | 'binary_little_endian' | 'binary_big_endian' = 'ascii';
  let vertexCount = 0;
  const properties: PlyProperty[] = [];
  let inVertexElement = false;

  for (const line of headerLines) {
    if (line.startsWith('format')) {
      if (line.includes('binary_little_endian')) format = 'binary_little_endian';
      else if (line.includes('binary_big_endian')) format = 'binary_big_endian';
      else format = 'ascii';
    } else if (line.startsWith('element')) {
      const parts = line.split(/\s+/);
      inVertexElement = parts[1] === 'vertex';
      if (inVertexElement) vertexCount = parseInt(parts[2], 10);
    } else if (line.startsWith('property') && inVertexElement) {
      const parts = line.split(/\s+/);
      if (parts[1] === 'list') continue; // skip list properties (e.g. face indices, not expected on vertices)
      properties.push({ name: parts[2], type: parts[1] });
    }
  }

  const xIdx = properties.findIndex((p) => p.name === 'x');
  const yIdx = properties.findIndex((p) => p.name === 'y');
  const zIdx = properties.findIndex((p) => p.name === 'z');
  const rIdx = properties.findIndex((p) => p.name === 'red' || p.name === 'r' || p.name === 'diffuse_red');
  const gIdx = properties.findIndex((p) => p.name === 'green' || p.name === 'g' || p.name === 'diffuse_green');
  const bIdx = properties.findIndex((p) => p.name === 'blue' || p.name === 'b' || p.name === 'diffuse_blue');
  if (xIdx === -1 || yIdx === -1 || zIdx === -1) throw new Error('PLY file has no x/y/z vertex properties.');
  const hasColor = rIdx !== -1 && gIdx !== -1 && bIdx !== -1;

  const positions = new Float32Array(vertexCount * 3);
  const colors = hasColor ? new Float32Array(vertexCount * 3) : undefined;

  if (format === 'ascii') {
    const headerByteLen = new TextEncoder().encode(headerText.slice(0, endHeaderIdx + 'end_header'.length)).length;
    const bodyText = new TextDecoder('ascii').decode(new Uint8Array(buffer, headerByteLen));
    const lines = bodyText.split(/\r?\n/).filter((l) => l.trim().length > 0);
    for (let i = 0; i < Math.min(vertexCount, lines.length); i++) {
      const vals = lines[i].trim().split(/\s+/).map(Number);
      positions[i * 3] = vals[xIdx];
      positions[i * 3 + 1] = vals[yIdx];
      positions[i * 3 + 2] = vals[zIdx];
      if (colors) {
        const maxC = Math.max(vals[rIdx], vals[gIdx], vals[bIdx]);
        const scale = maxC > 1 ? 1 / 255 : 1;
        colors[i * 3] = vals[rIdx] * scale;
        colors[i * 3 + 1] = vals[gIdx] * scale;
        colors[i * 3 + 2] = vals[bIdx] * scale;
      }
    }
  } else {
    const littleEndian = format === 'binary_little_endian';
    const headerByteLen = headerBytes.byteLength >= buffer.byteLength
      ? headerText.indexOf('end_header') + 'end_header\n'.length
      : new TextEncoder().encode(headerText.slice(0, endHeaderIdx + 'end_header\n'.length)).length;
    const stride = properties.reduce((sum, p) => sum + (PLY_TYPE_SIZE[p.type] ?? 4), 0);
    const view = new DataView(buffer, headerByteLen);
    let maxColorVal = 1;
    for (let i = 0; i < vertexCount; i++) {
      let offset = i * stride;
      const rowVals: number[] = [];
      for (const prop of properties) {
        const size = PLY_TYPE_SIZE[prop.type] ?? 4;
        rowVals.push(readPlyScalar(view, offset, prop.type, littleEndian));
        offset += size;
      }
      positions[i * 3] = rowVals[xIdx];
      positions[i * 3 + 1] = rowVals[yIdx];
      positions[i * 3 + 2] = rowVals[zIdx];
      if (colors) {
        if (rowVals[rIdx] > maxColorVal) maxColorVal = 255;
        colors[i * 3] = rowVals[rIdx];
        colors[i * 3 + 1] = rowVals[gIdx];
        colors[i * 3 + 2] = rowVals[bIdx];
      }
    }
    if (colors && maxColorVal > 1) {
      for (let i = 0; i < colors.length; i++) colors[i] = colors[i] / 255;
    }
  }

  return { positions, colors, pointCount: vertexCount };
}

/** Simple nearest-distance "as-built vs as-designed" deviation check: for
 * each point, finds the nearest vertex among a (typically downsampled)
 * reference point set and returns a green->amber->red color scaled by that
 * distance relative to `maxDeviationM`. This is a plain nearest-neighbor
 * proxy for illustration, not a registered ICP alignment or a validated
 * survey-tolerance check — the cloud and reference should already be in
 * the same coordinate frame. */
export function computeDeviationColors(
  cloud: Float32Array,
  referencePoints: Float32Array,
  maxDeviationM = 0.15
): Float32Array {
  const n = cloud.length / 3;
  const refN = referencePoints.length / 3;
  const colors = new Float32Array(n * 3);
  if (refN === 0) {
    colors.fill(0.6);
    return colors;
  }
  // cap reference size for O(n * refN) brute force to stay responsive
  const refStep = Math.max(1, Math.floor(refN / 2000));
  for (let i = 0; i < n; i++) {
    const px = cloud[i * 3], py = cloud[i * 3 + 1], pz = cloud[i * 3 + 2];
    let best = Infinity;
    for (let j = 0; j < refN; j += refStep) {
      const dx = px - referencePoints[j * 3];
      const dy = py - referencePoints[j * 3 + 1];
      const dz = pz - referencePoints[j * 3 + 2];
      const d = dx * dx + dy * dy + dz * dz;
      if (d < best) best = d;
    }
    const dist = Math.sqrt(best);
    const t = Math.min(1, dist / maxDeviationM);
    // green (t=0) -> amber (t=0.5) -> red (t=1)
    if (t < 0.5) {
      const u = t / 0.5;
      colors[i * 3] = 0.12 + u * (0.79 - 0.12);
      colors[i * 3 + 1] = 0.54 + u * (0.59 - 0.54);
      colors[i * 3 + 2] = 0.37 + u * (0.12 - 0.37);
    } else {
      const u = (t - 0.5) / 0.5;
      colors[i * 3] = 0.79 + u * (0.71 - 0.79);
      colors[i * 3 + 1] = 0.59 + u * (0.16 - 0.59);
      colors[i * 3 + 2] = 0.12 + u * (0.18 - 0.12);
    }
  }
  return colors;
}
