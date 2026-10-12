import { MODULE, MULLION_SPACING, PRAIRIE_PITCH } from '../constants';
import { rngFromSeed, type Rng } from '../rng';
import type {
  Chimney,
  Entry,
  Footprint,
  HousePlan,
  Overhang,
  Params,
  Planter,
  PlanType,
  ResolvedStyle,
  Roof,
  Side,
  Terrace,
  Volume,
  WindowBand,
  WingRole,
} from '../types';

const SIDES: readonly Side[] = ['n', 'e', 's', 'w'];

const OPPOSITE: Record<Side, Side> = { n: 's', s: 'n', e: 'w', w: 'e' };
const CW: Record<Side, Side> = { n: 'e', e: 's', s: 'w', w: 'n' };
const CCW: Record<Side, Side> = { n: 'w', w: 's', s: 'e', e: 'n' };

const HEARTH_SPAN: Record<ResolvedStyle, number> = { prairie: 16, usonian: 12 };
const WALL_H: Record<ResolvedStyle, number> = { prairie: 10, usonian: 8.75 };
const UPPER_H = 7.25;

/**
 * Shape grammar
 * --------------
 * Start symbol: a square hearth on the module grid, centered at the origin.
 * Plan type is a production of wing count and style:
 *   2 wings -> L, rotated
 *   3 wings -> T, one side omitted
 *   4 wings -> pinwheel (favored for Prairie) or cruciform (favored for Usonian)
 * Each wing is extruded from a hearth face on the 4 ft module.
 * Corner rules keep wings in their outward half-planes so footprints meet the
 * hearth along a real edge and never overlap.
 * Usonian plans then add a carport on the far end of the living wing.
 * Prairie plans stack a second-story pavilion on the hearth.
 * Terraces, planters, roofs, and window bands are derived from that massing.
 */
export function generatePlan(params: Params): HousePlan {
  const rng = rngFromSeed(params.seed);
  const style: ResolvedStyle = params.style === 'mixed' ? (rng.bool(0.5) ? 'prairie' : 'usonian') : params.style;
  const planType = choosePlanType(style, params.wings, rng);
  const axes = chooseAxes(planType, params.wings, rng);

  const span = HEARTH_SPAN[style];
  const wallH = WALL_H[style];
  const hearth: Volume = {
    id: 'hearth',
    kind: 'hearth',
    x: -span / 2,
    z: -span / 2,
    w: span,
    d: span,
    y: 0,
    h: wallH,
  };

  const volumes: Volume[] = [hearth];
  axes.forEach((side, index) => {
    const role: WingRole = index === 0 ? 'living' : 'chamber';
    const width = chooseWidth(style, span, planType, side, axes, rng);
    const length = chooseLength(role === 'living', params.size, rng);
    const tangentMin = tangentOrigin(planType, side, axes, width, hearth);
    volumes.push(extrudeWing(hearth, side, tangentMin, width, length, role, wallH, index));
  });

  if (style === 'prairie') {
    volumes.push({
      id: 'upper',
      kind: 'upper',
      x: hearth.x,
      z: hearth.z,
      w: hearth.w,
      d: hearth.d,
      y: wallH,
      h: UPPER_H,
      parentId: 'hearth',
    });
  }

  if (style === 'usonian') {
    const host = volumes.find((v) => v.role === 'living') ?? volumes.find((v) => v.kind === 'wing');
    if (host) {
      const length = snapModule(Math.round(rng.pick([3, 3, 4]) * Math.max(0.85, Math.min(params.size, 1.2))));
      const carport = extrudeFromFarEnd(host, Math.max(MODULE * 3, length));
      if (carport && !hitsAny(carport, volumes)) volumes.push(carport);
    }
  }

  const terraces: Terrace[] = [];
  const planters: Planter[] = [];
  placeTerraces(volumes, terraces, planters, rng);

  const roofs = buildRoofs(volumes, params.overhang, style);
  const windows = buildWindows(volumes, style);
  const chimney = buildChimney(hearth, style, roofs, rng);
  const plinth = buildPlinth(volumes, terraces, style === 'prairie' ? 1.55 : 0.45, style === 'prairie' ? 3 : 1.5);
  const entry = buildEntry(volumes);

  return {
    seed: params.seed,
    style,
    requestedStyle: params.style,
    planType,
    module: MODULE,
    volumes,
    roofs,
    windows,
    terraces,
    planters,
    chimney,
    plinth,
    entry,
  };
}

function choosePlanType(style: ResolvedStyle, wings: number, rng: Rng): PlanType {
  if (wings <= 2) return 'l';
  if (wings === 3) return 't';
  const pinwheelBias = style === 'prairie' ? 0.72 : 0.38;
  return rng.bool(pinwheelBias) ? 'pinwheel' : 'cruciform';
}

function chooseAxes(planType: PlanType, wings: number, rng: Rng): Side[] {
  if (planType === 'l' || wings <= 2) {
    const start = rng.pick(SIDES);
    const partner = rng.bool() ? CW[start] : CCW[start];
    return [start, partner];
  }
  if (planType === 't' || wings === 3) {
    const missing = rng.pick(SIDES);
    const axes = SIDES.filter((side) => side !== missing);
    const cross = axes.find((side) => axes.includes(OPPOSITE[side])) ?? axes[0]!;
    return [cross, ...axes.filter((side) => side !== cross)];
  }
  const turn = rng.int(0, 3);
  return SIDES.map((_, index) => SIDES[(index + turn) % SIDES.length]!);
}

function chooseWidth(
  style: ResolvedStyle,
  hearthSpan: number,
  planType: PlanType,
  side: Side,
  axes: readonly Side[],
  rng: Rng,
): number {
  const options = style === 'prairie' ? [12, 16, 16, 20] : [12, 12, 16];
  let width = rng.pick(options);
  const neighbors = tangentNeighbors(side, axes);
  const blockedBoth = neighbors.min && neighbors.max && planType !== 'pinwheel';
  if (blockedBoth || planType === 'cruciform') width = Math.min(width, hearthSpan);
  return Math.max(MODULE * 2, width);
}

function chooseLength(living: boolean, size: number, rng: Rng): number {
  const base = living ? rng.pick([5, 6, 6, 7]) : rng.pick([3, 4, 4, 5]);
  const modules = clamp(Math.round(base * size), 3, 10);
  return modules * MODULE;
}

function snapModule(modules: number): number {
  return clamp(modules, 3, 6) * MODULE;
}

/**
 * Where the wing starts on the hearth face's tangent axis.
 * Pinwheel shifts every wing the same rotational sense, flush on one end,
 * so wide wings pass the corner without entering a sibling's half-plane.
 * L and T flush toward the neighboring wing and grow into the open side.
 * Cruciform wings are centered and never wider than the hearth.
 */
function tangentOrigin(
  planType: PlanType,
  side: Side,
  axes: readonly Side[],
  width: number,
  hearth: Volume,
): number {
  const { min, span } = faceTangent(hearth, side);
  if (planType === 'pinwheel') {
    return align(min, span, width, pinwheelTowardPositive(side));
  }
  if (planType === 'cruciform') {
    return min + (span - width) / 2;
  }
  const neighbors = tangentNeighbors(side, axes);
  if (neighbors.min && neighbors.max) return min + (span - width) / 2;
  // Flush against the sibling and grow into the open side, so a wide wing
  // cannot cross into that sibling's half-plane.
  if (neighbors.max && !neighbors.min) return placeFlush(min, span, width, 'max');
  if (neighbors.min && !neighbors.max) return placeFlush(min, span, width, 'min');
  return min + (span - width) / 2;
}

function placeFlush(hearthMin: number, span: number, width: number, flush: 'min' | 'max'): number {
  if (flush === 'max') return hearthMin + span - width;
  return hearthMin;
}

/** towardPositive grows any extra width toward +tangent and stays flush on the min end when wider than the face. */
function align(hearthMin: number, span: number, width: number, towardPositive: boolean): number {
  if (width <= span) return towardPositive ? hearthMin + (span - width) : hearthMin;
  return towardPositive ? hearthMin : hearthMin - (width - span);
}

function pinwheelTowardPositive(side: Side): boolean {
  return side === 'e' || side === 's';
}

function tangentNeighbors(side: Side, axes: readonly Side[]): { min: boolean; max: boolean } {
  if (side === 'n' || side === 's') {
    return { min: axes.includes('w'), max: axes.includes('e') };
  }
  return { min: axes.includes('s'), max: axes.includes('n') };
}

function faceTangent(hearth: Volume, side: Side): { min: number; span: number } {
  if (side === 'n' || side === 's') return { min: hearth.x, span: hearth.w };
  return { min: hearth.z, span: hearth.d };
}

function extrudeWing(
  hearth: Volume,
  side: Side,
  tangentMin: number,
  width: number,
  length: number,
  role: WingRole,
  wallH: number,
  index: number,
): Volume {
  const id = `wing-${side}`;
  const common = { id, kind: 'wing' as const, y: 0, h: wallH, role, parentId: hearth.id };
  if (side === 'n') {
    return { ...common, x: tangentMin, z: hearth.z + hearth.d, w: width, d: length, attach: 's' };
  }
  if (side === 's') {
    return { ...common, x: tangentMin, z: hearth.z - length, w: width, d: length, attach: 'n' };
  }
  if (side === 'e') {
    return { ...common, x: hearth.x + hearth.w, z: tangentMin, w: length, d: width, attach: 'w' };
  }
  return {
    ...common,
    x: hearth.x - length,
    z: tangentMin,
    w: length,
    d: width,
    attach: 'e',
    id: index >= 0 ? id : id,
  };
}

function extrudeFromFarEnd(host: Volume, length: number): Volume | null {
  if (!host.attach) return null;
  const far = OPPOSITE[host.attach];
  const common = {
    id: 'carport',
    kind: 'carport' as const,
    y: 0,
    h: host.h,
    attach: OPPOSITE[far],
    parentId: host.id,
  };
  if (far === 'n') return { ...common, x: host.x, z: host.z + host.d, w: host.w, d: length };
  if (far === 's') return { ...common, x: host.x, z: host.z - length, w: host.w, d: length };
  if (far === 'e') return { ...common, x: host.x + host.w, z: host.z, w: length, d: host.d };
  return { ...common, x: host.x - length, z: host.z, w: length, d: host.d };
}

function hitsAny(foot: Footprint, volumes: readonly Volume[]): boolean {
  return volumes.some((volume) => areaOverlap(foot, volume) > 0.01);
}

function placeTerraces(volumes: Volume[], terraces: Terrace[], planters: Planter[], rng: Rng): void {
  const living = volumes.find((v) => v.role === 'living');
  if (!living) return;
  const sides = longFaces(living);
  const ordered = rng.bool() ? sides : ([sides[1], sides[0]] as Side[]);
  for (const side of ordered) {
    if (side === living.attach) continue;
    const depth = rng.pick([8, 12]);
    const hostLen = faceLength(living, side);
    const length = Math.max(MODULE * 3, Math.round((hostLen * 0.72) / MODULE) * MODULE);
    const terrace = terraceBeside(living, side, depth, Math.min(length, hostLen));
    if (!terrace) continue;
    if (hitsAny(terrace, volumes) || terraces.some((existing) => areaOverlap(existing, terrace) > 0.01)) continue;
    terraces.push(terrace);
    planters.push(planterOn(terrace, terraces.length));
    if (terraces.length >= 2) break;
  }
  if (terraces.length === 0) {
    for (const side of SIDES) {
      if (side === living.attach) continue;
      const terrace = terraceBeside(living, side, 8, Math.min(12, faceLength(living, side)));
      if (!terrace || hitsAny(terrace, volumes)) continue;
      terraces.push(terrace);
      planters.push(planterOn(terrace, 1));
      break;
    }
  }
}

function longFaces(volume: Volume): [Side, Side] {
  return volume.w >= volume.d ? ['n', 's'] : ['e', 'w'];
}

function faceLength(volume: Volume, side: Side): number {
  return side === 'n' || side === 's' ? volume.w : volume.d;
}

function terraceBeside(host: Volume, side: Side, depth: number, length: number): Terrace | null {
  const along = faceLength(host, side);
  if (length < MODULE * 2 || along < length - 0.01) return null;
  const inset = (along - length) / 2;
  if (side === 'n') {
    return { id: 'terrace-n', hostId: host.id, outer: 'n', x: host.x + inset, z: host.z + host.d, w: length, d: depth, y: 0.04, h: 0.16 };
  }
  if (side === 's') {
    return { id: 'terrace-s', hostId: host.id, outer: 's', x: host.x + inset, z: host.z - depth, w: length, d: depth, y: 0.04, h: 0.16 };
  }
  if (side === 'e') {
    return { id: 'terrace-e', hostId: host.id, outer: 'e', x: host.x + host.w, z: host.z + inset, w: depth, d: length, y: 0.04, h: 0.16 };
  }
  return { id: 'terrace-w', hostId: host.id, outer: 'w', x: host.x - depth, z: host.z + inset, w: depth, d: length, y: 0.04, h: 0.16 };
}

function planterOn(terrace: Terrace, index: number): Planter {
  const thickness = 1.5;
  const h = 1.7;
  if (terrace.outer === 'n') {
    return { id: `planter-${index}`, x: terrace.x, z: terrace.z + terrace.d - thickness, w: terrace.w, d: thickness, y: 0, h };
  }
  if (terrace.outer === 's') {
    return { id: `planter-${index}`, x: terrace.x, z: terrace.z, w: terrace.w, d: thickness, y: 0, h };
  }
  if (terrace.outer === 'e') {
    return { id: `planter-${index}`, x: terrace.x + terrace.w - thickness, z: terrace.z, w: thickness, d: terrace.d, y: 0, h };
  }
  return { id: `planter-${index}`, x: terrace.x, z: terrace.z, w: thickness, d: terrace.d, y: 0, h };
}

function buildRoofs(volumes: readonly Volume[], overhang: number, style: ResolvedStyle): Roof[] {
  const roofs: Roof[] = [];
  const upper = volumes.find((v) => v.kind === 'upper');
  for (const volume of volumes) {
    if (volume.kind === 'upper') continue;
    if (volume.kind === 'hearth' && upper) continue;
    const target = volume.kind === 'hearth' ? volume : volume;
    const eaveSource = volume.kind === 'hearth' && upper ? upper : target;
    const spec = overhangFor(volume, overhang);
    const expanded = expand(volume, spec);
    roofs.push({
      id: `roof-${volume.id}`,
      volumeId: volume.id,
      type: style === 'prairie' ? 'hip' : 'flat',
      x: expanded.x,
      z: expanded.z,
      w: expanded.w,
      d: expanded.d,
      eaveY: eaveSource.y + eaveSource.h,
      pitch: style === 'prairie' ? PRAIRIE_PITCH : 0,
      overhang: spec,
      covers: { x: volume.x, z: volume.z, w: volume.w, d: volume.d },
    });
  }
  if (upper) {
    const spec = overhangFor(upper, overhang);
    const expanded = expand(upper, spec);
    roofs.push({
      id: 'roof-upper',
      volumeId: upper.id,
      type: 'hip',
      x: expanded.x,
      z: expanded.z,
      w: expanded.w,
      d: expanded.d,
      eaveY: upper.y + upper.h,
      pitch: PRAIRIE_PITCH,
      overhang: spec,
      covers: { x: upper.x, z: upper.z, w: upper.w, d: upper.d },
    });
    const hearth = volumes.find((v) => v.kind === 'hearth');
    if (hearth) {
      roofs.push({
        id: 'roof-hearth',
        volumeId: hearth.id,
        type: 'hip',
        x: expanded.x,
        z: expanded.z,
        w: expanded.w,
        d: expanded.d,
        eaveY: upper.y + upper.h,
        pitch: PRAIRIE_PITCH,
        overhang: spec,
        covers: { x: hearth.x, z: hearth.z, w: hearth.w, d: hearth.d },
      });
    }
  }
  return roofs;
}

function overhangFor(volume: Volume, overhang: number): Overhang {
  const spec: Overhang = { n: overhang, e: overhang, s: overhang, w: overhang };
  // The side that dies into a parent keeps a flush eave. Every other side
  // takes the full cantilever, including the pavilion roof sailing over the wings.
  if (volume.attach) spec[volume.attach] = 0;
  return spec;
}

function expand(foot: Footprint, overhang: Overhang): Footprint {
  return {
    x: foot.x - overhang.w,
    z: foot.z - overhang.s,
    w: foot.w + overhang.w + overhang.e,
    d: foot.d + overhang.s + overhang.n,
  };
}

function buildWindows(volumes: readonly Volume[], style: ResolvedStyle): WindowBand[] {
  const bands: WindowBand[] = [];
  for (const volume of volumes) {
    if (volume.kind === 'carport') continue;
    for (const face of SIDES) {
      for (const span of exposedSpans(volume, face, volumes)) {
        if (span.u1 - span.u0 < 8) continue;
        const margin = 1.5;
        const u0 = span.u0 + margin;
        const u1 = span.u1 - margin;
        if (u1 - u0 < 4) continue;
        const plane = facePlane(volume, face);
        if (volume.kind === 'upper') {
          bands.push(band(volume, face, 'ribbon', u0, u1, volume.y + 2.15, volume.y + 5.15, plane));
          continue;
        }
        if (volume.kind === 'hearth') continue;
        const garden = isLongFace(volume, face);
        if (style === 'usonian' && volume.role === 'living' && garden) {
          bands.push(band(volume, face, 'ribbon', u0, u1, 1.05, volume.h - 1.7, plane));
          bands.push(band(volume, face, 'clerestory', u0, u1, volume.h - 1.25, volume.h - 0.32, plane));
        } else if (style === 'usonian') {
          bands.push(band(volume, face, 'ribbon', u0, u1, 2.7, 5.7, plane));
          bands.push(band(volume, face, 'clerestory', u0, u1, volume.h - 1.25, volume.h - 0.32, plane));
        } else {
          bands.push(band(volume, face, 'ribbon', u0, u1, 3.05, 6.55, plane));
        }
      }
    }
  }
  return bands;
}

function band(
  volume: Volume,
  face: Side,
  kind: WindowBand['kind'],
  u0: number,
  u1: number,
  y0: number,
  y1: number,
  plane: number,
): WindowBand {
  return {
    id: `${kind}-${volume.id}-${face}-${bandsKey(u0)}`,
    volumeId: volume.id,
    kind,
    face,
    u0,
    u1,
    y0,
    y1,
    plane,
    mullionSpacing: MULLION_SPACING,
  };
}

function bandsKey(u0: number): string {
  return Math.round(u0 * 10).toString(36);
}

function isLongFace(volume: Volume, face: Side): boolean {
  const along = face === 'n' || face === 's' ? volume.w : volume.d;
  const across = face === 'n' || face === 's' ? volume.d : volume.w;
  return along >= across - 0.01;
}

interface Span {
  u0: number;
  u1: number;
}

export function exposedSpans(volume: Volume, face: Side, volumes: readonly Volume[]): Span[] {
  const full = faceSpan(volume, face);
  let spans: Span[] = [full];
  for (const other of volumes) {
    if (other.id === volume.id || other.kind === 'carport') continue;
    if (!verticalOverlap(volume, other)) continue;
    const contact = contactSpan(volume, face, other);
    if (!contact) continue;
    spans = subtractSpan(spans, contact);
  }
  return spans.filter((span) => span.u1 - span.u0 > 0.2);
}

function faceSpan(volume: Volume, face: Side): Span {
  if (face === 'n' || face === 's') return { u0: volume.x, u1: volume.x + volume.w };
  return { u0: volume.z, u1: volume.z + volume.d };
}

export function facePlane(volume: Volume, face: Side): number {
  if (face === 'n') return volume.z + volume.d;
  if (face === 's') return volume.z;
  if (face === 'e') return volume.x + volume.w;
  return volume.x;
}

function contactSpan(volume: Volume, face: Side, other: Volume): Span | null {
  const plane = facePlane(volume, face);
  const otherPlane =
    face === 'n'
      ? other.z
      : face === 's'
        ? other.z + other.d
        : face === 'e'
          ? other.x
          : other.x + other.w;
  if (Math.abs(plane - otherPlane) > 0.05) return null;
  const a = faceSpan(volume, face);
  const b = face === 'n' || face === 's' ? { u0: other.x, u1: other.x + other.w } : { u0: other.z, u1: other.z + other.d };
  const u0 = Math.max(a.u0, b.u0);
  const u1 = Math.min(a.u1, b.u1);
  if (u1 - u0 < 0.2) return null;
  return { u0, u1 };
}

function subtractSpan(spans: Span[], cut: Span): Span[] {
  const out: Span[] = [];
  for (const span of spans) {
    if (cut.u1 <= span.u0 + 0.01 || cut.u0 >= span.u1 - 0.01) {
      out.push(span);
      continue;
    }
    if (cut.u0 > span.u0 + 0.01) out.push({ u0: span.u0, u1: cut.u0 });
    if (cut.u1 < span.u1 - 0.01) out.push({ u0: cut.u1, u1: span.u1 });
  }
  return out;
}

function verticalOverlap(a: Volume, b: Volume): boolean {
  return overlapLen(a.y, a.h, b.y, b.h) > 0.2;
}

function buildChimney(hearth: Volume, style: ResolvedStyle, roofs: readonly Roof[], rng: Rng): Chimney {
  const w = style === 'prairie' ? 4.5 : 3.5;
  const d = style === 'prairie' ? 5.5 : 4;
  const margin = 1.75;
  const x = clamp(hearth.x + margin + rng.float(0, Math.max(0, hearth.w - w - margin * 2)), hearth.x + margin, hearth.x + hearth.w - w - margin);
  const z = clamp(hearth.z + margin + rng.float(0, Math.max(0, hearth.d - d - margin * 2)), hearth.z + margin, hearth.z + hearth.d - d - margin);
  const hearthRoof = roofs.find((roof) => roof.volumeId === 'upper') ?? roofs.find((roof) => roof.volumeId === 'hearth');
  const rise = hearthRoof ? hearthRoof.pitch * (Math.min(hearthRoof.w, hearthRoof.d) / 2) : 0;
  const peak = (hearthRoof?.eaveY ?? hearth.h) + rise;
  return { x, z, w, d, y: 0, h: peak + (style === 'prairie' ? 8.5 : 7) };
}

function buildPlinth(volumes: readonly Volume[], terraces: readonly Terrace[], h: number, skirt: number): Footprint & { h: number } {
  const feet = [
    ...volumes.filter((v) => v.kind !== 'upper').map((v) => pad(v, skirt)),
    ...terraces.map((t) => pad(t, 0.5)),
  ];
  let minX = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxZ = -Infinity;
  for (const foot of feet) {
    minX = Math.min(minX, foot.x);
    minZ = Math.min(minZ, foot.z);
    maxX = Math.max(maxX, foot.x + foot.w);
    maxZ = Math.max(maxZ, foot.z + foot.d);
  }
  return { x: minX, z: minZ, w: maxX - minX, d: maxZ - minZ, h };
}

function pad(foot: Footprint, amount: number): Footprint {
  return { x: foot.x - amount, z: foot.z - amount, w: foot.w + amount * 2, d: foot.d + amount * 2 };
}

function buildEntry(volumes: readonly Volume[]): Entry {
  const carport = volumes.find((v) => v.kind === 'carport');
  const host =
    (carport && volumes.find((v) => v.id === carport.parentId)) ||
    volumes.find((v) => v.role === 'living') ||
    volumes.find((v) => v.kind === 'wing')!;
  const face = carport?.attach ? OPPOSITE[carport.attach] : OPPOSITE[host.attach ?? 's'];
  const span = faceSpan(host, face);
  return {
    volumeId: host.id,
    face,
    u: (span.u0 + span.u1) / 2,
    plane: facePlane(host, face),
  };
}

function areaOverlap(a: Footprint, b: Footprint): number {
  const x = overlapLen(a.x, a.w, b.x, b.w);
  const z = overlapLen(a.z, a.d, b.z, b.d);
  if (x <= 0 || z <= 0) return 0;
  return x * z;
}

function overlapLen(a0: number, aLen: number, b0: number, bLen: number): number {
  return Math.min(a0 + aLen, b0 + bLen) - Math.max(a0, b0);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function describePlan(plan: HousePlan): string {
  const planName: Record<PlanType, string> = {
    l: 'L plan',
    t: 'T plan',
    cruciform: 'cruciform',
    pinwheel: 'pinwheel',
  };
  const style = plan.style === 'prairie' ? 'Prairie' : 'Usonian';
  const wings = plan.volumes.filter((volume) => volume.kind === 'wing').length;
  return `${style} · ${planName[plan.planType]} · ${wings} wings`;
}
