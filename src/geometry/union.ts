import type { Footprint } from '../types';

export interface Point {
  x: number;
  z: number;
}

export interface UnionLoops {
  /** First loop is the outer boundary (CCW). Remaining loops are holes (CW). */
  loops: Point[][];
}

const KEY = 1000;

function k(x: number, z: number): string {
  return `${Math.round(x * KEY) / KEY},${Math.round(z * KEY) / KEY}`;
}

function parse(key: string): Point {
  const [x, z] = key.split(',').map(Number);
  return { x: x!, z: z! };
}

function signedArea(loop: Point[]): number {
  let area = 0;
  for (let i = 0; i < loop.length; i++) {
    const a = loop[i]!;
    const b = loop[(i + 1) % loop.length]!;
    area += a.x * b.z - b.x * a.z;
  }
  return area / 2;
}

function simplify(loop: Point[]): Point[] {
  if (loop.length < 3) return loop;
  const out: Point[] = [];
  for (let i = 0; i < loop.length; i++) {
    const prev = loop[(i + loop.length - 1) % loop.length]!;
    const curr = loop[i]!;
    const next = loop[(i + 1) % loop.length]!;
    const dx1 = curr.x - prev.x;
    const dz1 = curr.z - prev.z;
    const dx2 = next.x - curr.x;
    const dz2 = next.z - curr.z;
    const colinear = Math.abs(dx1 * dz2 - dz1 * dx2) < 1e-6;
    if (!colinear) out.push(curr);
  }
  return out.length >= 3 ? out : loop;
}

/**
 * Union axis-aligned rectangles into boundary loops.
 * Edges keep the occupied region on the left, so outers are CCW and holes are CW.
 */
export function unionFootprints(rects: readonly Footprint[]): UnionLoops {
  if (rects.length === 0) return { loops: [] };

  const xs = unique(rects.flatMap((r) => [r.x, r.x + r.w]));
  const zs = unique(rects.flatMap((r) => [r.z, r.z + r.d]));
  const nx = xs.length - 1;
  const nz = zs.length - 1;
  const occ: boolean[][] = Array.from({ length: nx }, () => Array<boolean>(nz).fill(false));

  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) {
      const cx = (xs[i]! + xs[i + 1]!) / 2;
      const cz = (zs[j]! + zs[j + 1]!) / 2;
      occ[i]![j] = rects.some(
        (r) => cx >= r.x - 1e-6 && cx <= r.x + r.w + 1e-6 && cz >= r.z - 1e-6 && cz <= r.z + r.d + 1e-6,
      );
    }
  }

  const next = new Map<string, string[]>();
  const add = (x0: number, z0: number, x1: number, z1: number) => {
    if (Math.abs(x0 - x1) < 1e-8 && Math.abs(z0 - z1) < 1e-8) return;
    const a = k(x0, z0);
    const b = k(x1, z1);
    const list = next.get(a);
    if (list) list.push(b);
    else next.set(a, [b]);
  };

  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) {
      if (!occ[i]![j]) continue;
      const x0 = xs[i]!;
      const x1 = xs[i + 1]!;
      const z0 = zs[j]!;
      const z1 = zs[j + 1]!;
      if (j === 0 || !occ[i]![j - 1]) add(x0, z0, x1, z0);
      if (j === nz - 1 || !occ[i]![j + 1]) add(x1, z1, x0, z1);
      if (i === 0 || !occ[i - 1]![j]) add(x0, z1, x0, z0);
      if (i === nx - 1 || !occ[i + 1]![j]) add(x1, z0, x1, z1);
    }
  }

  const used = new Set<string>();
  const loops: Point[][] = [];

  for (const [start, dests] of next) {
    for (const first of dests) {
      const mark = `${start}>${first}`;
      if (used.has(mark)) continue;
      const keys = [start];
      let prev = start;
      let curr = first;
      let guard = 0;
      let closed = false;
      while (guard++ < 20000) {
        used.add(`${prev}>${curr}`);
        keys.push(curr);
        if (curr === start) {
          closed = true;
          break;
        }
        const options = (next.get(curr) ?? []).filter((d) => !used.has(`${curr}>${d}`));
        if (options.length === 0) break;
        const incoming = sub(parse(prev), parse(curr));
        const chosen =
          options.length === 1
            ? options[0]!
            : options.slice().sort((a, b) => {
                const pa = parse(a);
                const pb = parse(b);
                return clockwiseAngle(incoming, sub(parse(curr), pa)) - clockwiseAngle(incoming, sub(parse(curr), pb));
              })[0]!;
        prev = curr;
        curr = chosen;
      }
      if (!closed) continue;
      const pts = simplify(keys.slice(0, -1).map(parse));
      if (pts.length >= 3 && Math.abs(signedArea(pts)) > 1e-4) loops.push(pts);
    }
  }

  loops.sort((a, b) => Math.abs(signedArea(b)) - Math.abs(signedArea(a)));
  return { loops };
}

function sub(from: Point, to: Point): Point {
  return { x: to.x - from.x, z: to.z - from.z };
}

/** Clockwise angle from an incoming direction to an outgoing one. Larger means a sharper right preference when sorted ascending? */
function clockwiseAngle(incoming: Point, outgoing: Point): number {
  const cross = incoming.x * outgoing.z - incoming.z * outgoing.x;
  const dot = incoming.x * outgoing.x + incoming.z * outgoing.z;
  return -Math.atan2(cross, dot);
}

function unique(values: number[]): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  const out: number[] = [];
  for (const value of sorted) {
    if (out.length === 0 || Math.abs(value - out[out.length - 1]!) > 1e-6) out.push(value);
  }
  return out;
}

export function loopArea(loop: Point[]): number {
  return Math.abs(signedArea(loop));
}

export function pointInLoop(x: number, z: number, loop: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
    const a = loop[i]!;
    const b = loop[j]!;
    const intersect = a.z > z !== b.z > z && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z + 0) + a.x;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function pointInUnion(x: number, z: number, loops: Point[][]): boolean {
  if (loops.length === 0) return false;
  if (!pointInLoop(x, z, loops[0]!)) return false;
  for (let i = 1; i < loops.length; i++) {
    if (pointInLoop(x, z, loops[i]!)) return false;
  }
  return true;
}
