import { MULLION_SPACING } from '../constants';
import type { Footprint, HousePlan, Params, Volume } from '../types';

const SIDES = ['n', 'e', 's', 'w'] as const;

export function checkPlan(plan: HousePlan, params: Params): string[] {
  const errors: string[] = [];
  const hearths = plan.volumes.filter((volume) => volume.kind === 'hearth');
  if (hearths.length !== 1) errors.push(`expected one hearth, found ${hearths.length}`);
  const hearth = hearths[0];
  if (hearth && (hearth.x > 0 || hearth.z > 0 || hearth.x + hearth.w < 0 || hearth.z + hearth.d < 0)) {
    errors.push('hearth does not contain the origin');
  }

  const wings = plan.volumes.filter((volume) => volume.kind === 'wing');
  if (wings.length !== params.wings) errors.push(`expected ${params.wings} wings, found ${wings.length}`);
  if (hearth) {
    for (const wing of wings) {
      if (!sharesVerticalFace(wing, hearth, 2)) errors.push(`${wing.id} is not connected to the hearth`);
    }
  }

  const carport = plan.volumes.find((volume) => volume.kind === 'carport');
  if (plan.style === 'usonian' && !carport) errors.push('usonian plan is missing a carport');
  if (plan.style === 'prairie' && carport) errors.push('prairie plan should not include a carport');
  if (plan.style === 'prairie' && !plan.volumes.some((volume) => volume.kind === 'upper')) {
    errors.push('prairie plan is missing the upper pavilion');
  }
  if (plan.style === 'usonian' && plan.volumes.some((volume) => volume.kind === 'upper')) {
    errors.push('usonian plan should stay one story');
  }
  if (carport) {
    const host = plan.volumes.find((volume) => volume.id === carport.parentId);
    if (!host || !sharesVerticalFace(carport, host, 2)) errors.push('carport is not connected to its wing');
  }

  if (!connected(plan.volumes)) errors.push('volumes are not a single connected assembly');

  for (let i = 0; i < plan.volumes.length; i++) {
    for (let j = i + 1; j < plan.volumes.length; j++) {
      const a = plan.volumes[i]!;
      const b = plan.volumes[j]!;
      if (boxesOverlap(a, b)) errors.push(`${a.id} overlaps ${b.id}`);
    }
  }

  for (const terrace of plan.terraces) {
    for (const volume of plan.volumes) {
      if (area(terrace, volume) > 0.05) errors.push(`${terrace.id} overlaps ${volume.id}`);
    }
  }

  for (const volume of plan.volumes) {
    const covering = plan.roofs.filter((roof) => contains(roof, volume) && roof.eaveY >= volume.y + volume.h - 0.05);
    if (covering.length === 0) errors.push(`no roof covers ${volume.id}`);
  }

  for (const roof of plan.roofs) {
    const o = roof.overhang;
    if (Math.abs(roof.x - (roof.covers.x - o.w)) > 0.02) errors.push(`${roof.id} west edge does not match its overhang`);
    if (Math.abs(roof.z - (roof.covers.z - o.s)) > 0.02) errors.push(`${roof.id} south edge does not match its overhang`);
    if (Math.abs(roof.w - (roof.covers.w + o.w + o.e)) > 0.02) errors.push(`${roof.id} width does not match its overhang`);
    if (Math.abs(roof.d - (roof.covers.d + o.s + o.n)) > 0.02) errors.push(`${roof.id} depth does not match its overhang`);
    for (const side of SIDES) {
      const value = o[side];
      if (value < -0.01 || value > params.overhang + 0.02) {
        errors.push(`${roof.id} overhang on ${side} is ${value}, outside 0..${params.overhang}`);
      }
    }
    if (!contains(roof, roof.covers)) errors.push(`${roof.id} does not contain the volume it covers`);
  }

  const maxOverhang = Math.max(...plan.roofs.flatMap((roof) => SIDES.map((side) => roof.overhang[side])));
  if (Math.abs(maxOverhang - params.overhang) > 0.02) {
    errors.push(`expected an eave of ${params.overhang} ft, deepest eave is ${maxOverhang}`);
  }

  if (hearth && area(plan.chimney, hearth) + 0.01 < plan.chimney.w * plan.chimney.d) {
    errors.push('chimney is not inside the hearth');
  }

  for (const volume of plan.volumes) {
    for (const value of [volume.x, volume.z, volume.w, volume.d]) {
      if (Math.abs(value / 2 - Math.round(value / 2)) > 1e-6) {
        errors.push(`${volume.id} is off the 2 ft module (${value})`);
      }
    }
  }

  for (const windowBand of plan.windows) {
    if (windowBand.mullionSpacing !== MULLION_SPACING) {
      errors.push(`${windowBand.id} mullion spacing is ${windowBand.mullionSpacing}`);
    }
    if (windowBand.u1 - windowBand.u0 < 4) errors.push(`${windowBand.id} is shorter than one bay`);
    if (windowBand.y1 > (plan.volumes.find((v) => v.id === windowBand.volumeId)?.y ?? 0) +
      (plan.volumes.find((v) => v.id === windowBand.volumeId)?.h ?? 0) + 0.05) {
      errors.push(`${windowBand.id} rises above its wall`);
    }
  }

  return errors;
}

export function boxesOverlap(a: Volume, b: Volume, eps = 0.02): boolean {
  if (a.x + a.w <= b.x + eps) return false;
  if (b.x + b.w <= a.x + eps) return false;
  if (a.z + a.d <= b.z + eps) return false;
  if (b.z + b.d <= a.z + eps) return false;
  if (a.y + a.h <= b.y + eps) return false;
  if (b.y + b.h <= a.y + eps) return false;
  return true;
}

export function sharesVerticalFace(a: Volume, b: Volume, minLen: number): boolean {
  const y = overlapLen(a.y, a.h, b.y, b.h);
  if (y < 1) return false;
  const xOverlap = overlapLen(a.x, a.w, b.x, b.w);
  const zOverlap = overlapLen(a.z, a.d, b.z, b.d);
  const xTouch = Math.abs(a.x + a.w - b.x) < 0.05 || Math.abs(b.x + b.w - a.x) < 0.05;
  const zTouch = Math.abs(a.z + a.d - b.z) < 0.05 || Math.abs(b.z + b.d - a.z) < 0.05;
  if (xTouch && zOverlap >= minLen && xOverlap <= 0.05) return true;
  if (zTouch && xOverlap >= minLen && zOverlap <= 0.05) return true;
  return false;
}

function connected(volumes: readonly Volume[]): boolean {
  if (volumes.length === 0) return false;
  const hearth = volumes.find((volume) => volume.kind === 'hearth') ?? volumes[0]!;
  const seen = new Set<string>([hearth.id]);
  const queue = [hearth];
  while (queue.length) {
    const current = queue.pop()!;
    for (const other of volumes) {
      if (seen.has(other.id)) continue;
      const stacked =
        Math.abs(current.y + current.h - other.y) < 0.05 || Math.abs(other.y + other.h - current.y) < 0.05;
      const stackOverlap =
        overlapLen(current.x, current.w, other.x, other.w) > 2 && overlapLen(current.z, current.d, other.z, other.d) > 2;
      if (sharesVerticalFace(current, other, 2) || (stacked && stackOverlap)) {
        seen.add(other.id);
        queue.push(other);
      }
    }
  }
  return seen.size === volumes.length;
}

function contains(outer: Footprint, inner: Footprint): boolean {
  return (
    inner.x >= outer.x - 0.02 &&
    inner.z >= outer.z - 0.02 &&
    inner.x + inner.w <= outer.x + outer.w + 0.02 &&
    inner.z + inner.d <= outer.z + outer.d + 0.02
  );
}

function area(a: Footprint, b: Footprint): number {
  const x = overlapLen(a.x, a.w, b.x, b.w);
  const z = overlapLen(a.z, a.d, b.z, b.d);
  if (x <= 0 || z <= 0) return 0;
  return x * z;
}

function overlapLen(a0: number, aLen: number, b0: number, bLen: number): number {
  return Math.min(a0 + aLen, b0 + bLen) - Math.max(a0, b0);
}
