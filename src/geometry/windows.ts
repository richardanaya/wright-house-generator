import { BufferGeometry } from 'three';
import type { Side, WindowBand } from '../types';
import { boxGeometry } from './mesh';

export interface WindowParts {
  glass: BufferGeometry[];
  mullions: BufferGeometry[];
}

export function buildWindowParts(band: WindowBand): WindowParts {
  const glass: BufferGeometry[] = [];
  const mullions: BufferGeometry[] = [];
  glass.push(faceBox(band.face, band.u0, band.u1, band.y0, band.y1, band.plane, 0.05, 0.045));

  const length = band.u1 - band.u0;
  const gaps = Math.max(1, Math.round(length / band.mullionSpacing));
  const step = length / gaps;
  const bar = 0.11;
  for (let i = 1; i < gaps; i++) {
    const u = band.u0 + i * step;
    mullions.push(faceBox(band.face, u - bar / 2, u + bar / 2, band.y0, band.y1, band.plane, 0.16, 0.1));
  }
  mullions.push(faceBox(band.face, band.u0, band.u1, band.y1 - bar, band.y1 + 0.02, band.plane, 0.16, 0.1));
  mullions.push(faceBox(band.face, band.u0, band.u1, band.y0 - 0.02, band.y0 + bar, band.plane, 0.16, 0.1));
  mullions.push(faceBox(band.face, band.u0, band.u0 + bar, band.y0, band.y1, band.plane, 0.16, 0.1));
  mullions.push(faceBox(band.face, band.u1 - bar, band.u1, band.y0, band.y1, band.plane, 0.16, 0.1));
  if (band.y1 - band.y0 > 4.4) {
    const mid = (band.y0 + band.y1) / 2;
    mullions.push(faceBox(band.face, band.u0, band.u1, mid - bar / 2, mid + bar / 2, band.plane, 0.16, 0.1));
  }
  return { glass, mullions };
}

export function trimBoard(face: Side, u0: number, u1: number, y: number, plane: number, height = 0.28): BufferGeometry {
  return faceBox(face, u0, u1, y, y + height, plane, 0.2, 0.16);
}

function faceBox(
  face: Side,
  u0: number,
  u1: number,
  y0: number,
  y1: number,
  plane: number,
  depth: number,
  offset: number,
): BufferGeometry {
  const outward = faceNormal(face);
  const alongX = face === 'n' || face === 's';
  const centerU = (u0 + u1) / 2;
  const centerY = (y0 + y1) / 2;
  const cx = alongX ? centerU : plane + outward.x * offset;
  const cz = alongX ? plane + outward.z * offset : centerU;
  const w = alongX ? Math.max(0.04, u1 - u0) : depth;
  const d = alongX ? depth : Math.max(0.04, u1 - u0);
  return boxGeometry(cx - w / 2, centerY - (y1 - y0) / 2, cz - d / 2, w, Math.max(0.04, y1 - y0), d);
}

function faceNormal(face: Side): { x: number; z: number } {
  if (face === 'n') return { x: 0, z: 1 };
  if (face === 's') return { x: 0, z: -1 };
  if (face === 'e') return { x: 1, z: 0 };
  return { x: -1, z: 0 };
}
