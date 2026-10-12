import { BufferAttribute, BufferGeometry, Float32BufferAttribute } from 'three';
import { unionFootprints, type Point } from './union';
import type { Footprint } from '../types';

const RES = 0.5;

export interface RoofMeshes {
  /** Upward face of a flat roof, or null when a hip surface replaces it. */
  top: BufferGeometry | null;
  underside: BufferGeometry;
  surface: BufferGeometry | null;
  fascia: BufferGeometry;
}

/**
 * Flat decks follow the union of the eave rectangles.
 * Hip surfaces are a rise/run distance field over that same union, so wings
 * join with real hips and valleys instead of intersecting boxes.
 */
export function buildRoofMeshes(rects: readonly Footprint[], wallTop: number, pitch: number, deckThickness = 0.42): RoofMeshes {
  const grid = raster(rects);
  const segments = boundarySegments(grid);
  const deck = deckGeometry(grid, wallTop, deckThickness, pitch === 0);
  const surface = pitch > 0 ? hipGeometry(grid, segments, wallTop, pitch) : null;
  const fascia = fasciaGeometry(unionFootprints(rects).loops, wallTop - deckThickness - 0.18, wallTop + 0.02, 0.14);
  return { top: deck.top, underside: deck.underside, surface, fascia };
}

interface Grid {
  x0: number;
  z0: number;
  nx: number;
  nz: number;
  occ: Uint8Array;
}

function raster(rects: readonly Footprint[]): Grid {
  let minX = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxZ = -Infinity;
  for (const rect of rects) {
    minX = Math.min(minX, rect.x);
    minZ = Math.min(minZ, rect.z);
    maxX = Math.max(maxX, rect.x + rect.w);
    maxZ = Math.max(maxZ, rect.z + rect.d);
  }
  const x0 = Math.floor(minX / RES + 1e-6) * RES;
  const z0 = Math.floor(minZ / RES + 1e-6) * RES;
  const x1 = Math.ceil(maxX / RES - 1e-6) * RES;
  const z1 = Math.ceil(maxZ / RES - 1e-6) * RES;
  const nx = Math.max(1, Math.round((x1 - x0) / RES));
  const nz = Math.max(1, Math.round((z1 - z0) / RES));
  const occ = new Uint8Array(nx * nz);
  for (const rect of rects) {
    const i0 = clamp(Math.round((rect.x - x0) / RES), 0, nx);
    const j0 = clamp(Math.round((rect.z - z0) / RES), 0, nz);
    const i1 = clamp(Math.round((rect.x + rect.w - x0) / RES), 0, nx);
    const j1 = clamp(Math.round((rect.z + rect.d - z0) / RES), 0, nz);
    for (let j = j0; j < j1; j++) {
      for (let i = i0; i < i1; i++) occ[i + j * nx] = 1;
    }
  }
  return { x0, z0, nx, nz, occ };
}

function occupied(grid: Grid, i: number, j: number): boolean {
  if (i < 0 || j < 0 || i >= grid.nx || j >= grid.nz) return false;
  return grid.occ[i + j * grid.nx] === 1;
}

interface Seg {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

function boundarySegments(grid: Grid): Seg[] {
  const segs: Seg[] = [];
  for (let j = 0; j < grid.nz; j++) {
    for (let i = 0; i < grid.nx; i++) {
      if (!occupied(grid, i, j)) continue;
      const x = grid.x0 + i * RES;
      const z = grid.z0 + j * RES;
      if (!occupied(grid, i, j - 1)) segs.push({ x0: x, z0: z, x1: x + RES, z1: z });
      if (!occupied(grid, i, j + 1)) segs.push({ x0: x, z0: z + RES, x1: x + RES, z1: z + RES });
      if (!occupied(grid, i - 1, j)) segs.push({ x0: x, z0: z, x1: x, z1: z + RES });
      if (!occupied(grid, i + 1, j)) segs.push({ x0: x + RES, z0: z, x1: x + RES, z1: z + RES });
    }
  }
  return segs;
}

function distToBoundary(x: number, z: number, segs: readonly Seg[]): number {
  let best = Infinity;
  for (const seg of segs) {
    const dx = seg.x1 - seg.x0;
    const dz = seg.z1 - seg.z0;
    const len2 = dx * dx + dz * dz;
    const t = len2 < 1e-8 ? 0 : clamp(((x - seg.x0) * dx + (z - seg.z0) * dz) / len2, 0, 1);
    const px = seg.x0 + t * dx - x;
    const pz = seg.z0 + t * dz - z;
    best = Math.min(best, Math.hypot(px, pz));
  }
  return best;
}

function deckGeometry(grid: Grid, wallTop: number, thickness: number, includeTop: boolean): { top: BufferGeometry | null; underside: BufferGeometry } {
  const topP: number[] = [];
  const topN: number[] = [];
  const topU: number[] = [];
  const botP: number[] = [];
  const botN: number[] = [];
  const botU: number[] = [];
  const y1 = wallTop;
  const y0 = wallTop - thickness;
  for (let j = 0; j < grid.nz; j++) {
    for (let i = 0; i < grid.nx; i++) {
      if (!occupied(grid, i, j)) continue;
      const x = grid.x0 + i * RES;
      const z = grid.z0 + j * RES;
      if (includeTop) {
        quad(topP, topN, topU, [x, y1, z], [x, y1, z + RES], [x + RES, y1, z + RES], [x + RES, y1, z], [0, 1, 0]);
      }
      quad(botP, botN, botU, [x, y0, z], [x + RES, y0, z], [x + RES, y0, z + RES], [x, y0, z + RES], [0, -1, 0]);
    }
  }
  return {
    top: includeTop ? geometry(topP, topN, topU) : null,
    underside: geometry(botP, botN, botU),
  };
}

function hipGeometry(grid: Grid, segs: readonly Seg[], wallTop: number, pitch: number): BufferGeometry {
  const heights: number[] = [];
  const vx = grid.nx + 1;
  const vz = grid.nz + 1;
  for (let j = 0; j < vz; j++) {
    for (let i = 0; i < vx; i++) {
      const x = grid.x0 + i * RES;
      const z = grid.z0 + j * RES;
      heights.push(wallTop + pitch * distToBoundary(x, z, segs));
    }
  }
  const positions: number[] = [];
  const uvs: number[] = [];
  for (let j = 0; j < grid.nz; j++) {
    for (let i = 0; i < grid.nx; i++) {
      if (!occupied(grid, i, j)) continue;
      const x = grid.x0 + i * RES;
      const z = grid.z0 + j * RES;
      const h00 = heights[i + j * vx]!;
      const h10 = heights[i + 1 + j * vx]!;
      const h11 = heights[i + 1 + (j + 1) * vx]!;
      const h01 = heights[i + (j + 1) * vx]!;
      tri(positions, uvs, [x, h00, z], [x + RES, h11, z + RES], [x + RES, h10, z]);
      tri(positions, uvs, [x, h00, z], [x, h01, z + RES], [x + RES, h11, z + RES]);
    }
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  geo.computeVertexNormals();
  return geo;
}

function fasciaGeometry(loops: Point[][], y0: number, y1: number, outset: number): BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  for (const loop of loops) {
    for (let i = 0; i < loop.length; i++) {
      const a = loop[i]!;
      const b = loop[(i + 1) % loop.length]!;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const len = Math.hypot(dx, dz);
      if (len < 1e-4) continue;
      const ux = dx / len;
      const uz = dz / len;
      const ox = (dz / len) * outset;
      const oz = (-dx / len) * outset;
      const extend = 0.08;
      const x0 = a.x - ux * extend + ox;
      const z0 = a.z - uz * extend + oz;
      const x1 = b.x + ux * extend + ox;
      const z1 = b.z + uz * extend + oz;
      const normal: [number, number, number] = [dz / len, 0, -dx / len];
      quad(positions, normals, uvs, [x0, y0, z0], [x1, y0, z1], [x1, y1, z1], [x0, y1, z0], normal);
    }
  }
  return geometry(positions, normals, uvs);
}

function tri(positions: number[], uvs: number[], a: number[], b: number[], c: number[]): void {
  for (const p of [a, b, c]) {
    positions.push(p[0]!, p[1]!, p[2]!);
    uvs.push(p[0]! / 4, p[2]! / 4);
  }
}

function quad(
  positions: number[],
  normals: number[],
  uvs: number[],
  a: number[],
  b: number[],
  c: number[],
  d: number[],
  normal: [number, number, number],
): void {
  for (const p of [a, b, c, a, c, d]) {
    positions.push(p[0]!, p[1]!, p[2]!);
    normals.push(normal[0], normal[1], normal[2]);
    uvs.push(p[0]! / 4, p[2]! / 4);
  }
}

function geometry(positions: number[], normals: number[], uvs: number[]): BufferGeometry {
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new Float32BufferAttribute(normals, 3));
  geo.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  if (positions.length === 0) {
    geo.setAttribute('position', new BufferAttribute(new Float32Array([0, 0, 0]), 3));
  }
  return geo;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
