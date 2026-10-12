import { Group, Mesh } from 'three';
import { facePlane, exposedSpans } from '../grammar/plan';
import type { Footprint, HousePlan, Side, Volume } from '../types';
import type { Palette } from '../materials';
import { buildRoofMeshes } from './roofs';
import { buildWindowParts, trimBoard } from './windows';
import { Batch, boxGeometry } from './mesh';

const BRICK_UV = { u: 4, v: 2 };
const STUCCO_UV = { u: 4, v: 4 };
const BATTEN_UV = { u: 2, v: 4 };
const SIDES: Side[] = ['n', 'e', 's', 'w'];

export function buildHouse(plan: HousePlan, palette: Palette): Group {
  const group = new Group();
  group.name = 'house';
  const batch = new Batch();
  const groundY = -plan.plinth.h;

  const plinthPads = [
    ...plan.volumes.filter((volume) => volume.kind !== 'upper').map((volume) => pad(volume, plan.style === 'prairie' ? 3 : 1.5)),
    ...plan.terraces.map((terrace) => pad(terrace, 0.5)),
  ];
  addSlab(batch, palette.limestone, plinthPads, 0, plan.plinth.h);

  for (const terrace of plan.terraces) {
    const material = plan.style === 'usonian' ? palette.cherokee : palette.limestone;
    batch.add(material, boxGeometry(terrace.x, 0.02, terrace.z, terrace.w, 0.16, terrace.d, STUCCO_UV));
  }

  for (const planter of plan.planters) {
    batch.add(palette.brick, boxGeometry(planter.x, planter.y, planter.z, planter.w, planter.h, planter.d, BRICK_UV));
    const cap = 0.22;
    const lip = 0.18;
    batch.add(
      palette.coping,
      boxGeometry(planter.x - lip, planter.h - 0.02, planter.z - lip, planter.w + lip * 2, cap, planter.d + lip * 2),
    );
  }

  for (const volume of plan.volumes) {
    if (volume.kind === 'carport') continue;
    for (const face of SIDES) {
      const spans = exposedSpans(volume, face, plan.volumes);
      const plane = facePlane(volume, face);
      for (const span of spans) {
        addWall(batch, palette, plan, volume, face, span.u0, span.u1, plane);
        addStringCourses(batch, palette, plan, volume, face, span.u0, span.u1, plane);
      }
    }
    batch.add(
      plan.style === 'usonian' ? palette.cherokee : palette.oak,
      boxGeometry(volume.x + 0.4, 0.05, volume.z + 0.4, Math.max(0.2, volume.w - 0.8), 0.08, Math.max(0.2, volume.d - 0.8)),
    );
  }

  for (const windowBand of plan.windows) {
    const parts = buildWindowParts(windowBand);
    const glassMaterial = plan.style === 'prairie' && windowBand.kind === 'ribbon' ? palette.artGlass : palette.glass;
    for (const glass of parts.glass) batch.add(glassMaterial, glass);
    for (const mullion of parts.mullions) batch.add(palette.mullion, mullion);
  }

  addRoofs(batch, palette, plan);
  addChimney(batch, palette, plan);
  addCarport(batch, palette, plan);
  addDoor(batch, palette, plan, groundY);
  if (plan.style === 'prairie') addPergola(batch, palette, plan);
  addFirebox(batch, palette, plan);

  batch.into(group);
  return group;
}

function addWall(
  batch: Batch,
  palette: Palette,
  plan: HousePlan,
  volume: Volume,
  face: Side,
  u0: number,
  u1: number,
  plane: number,
): void {
  const top = volume.y + volume.h - 0.08;
  const brickBase = volume.kind === 'hearth' || volume.kind === 'upper' ? top : volume.y + (plan.style === 'prairie' ? 2.55 : 2.15);
  const baseTop = Math.min(brickBase, top);
  if (baseTop > volume.y + 0.05) {
    addFaceSlab(batch, palette.brick, face, u0, u1, volume.y, baseTop, plane, BRICK_UV);
  }
  if (top > baseTop + 0.05 && volume.kind !== 'hearth' && volume.kind !== 'upper') {
    const upperMat = plan.style === 'usonian' ? palette.batten : palette.stucco;
    const uv = plan.style === 'usonian' ? BATTEN_UV : STUCCO_UV;
    addFaceSlab(batch, upperMat, face, u0, u1, baseTop, top, plane, uv);
  }
  if ((volume.kind === 'hearth' || volume.kind === 'upper') && top > volume.y) {
    // Masonry core is brick for its full height. The base pass already covered it when brickBase === top.
  }
  if (volume.kind === 'upper') {
    addFaceSlab(batch, palette.coping, face, u0 - 0.04, u1 + 0.04, volume.y, volume.y + 0.38, plane, undefined, 0.22, 0.02);
  }
}

function addStringCourses(
  batch: Batch,
  palette: Palette,
  plan: HousePlan,
  volume: Volume,
  face: Side,
  u0: number,
  u1: number,
  plane: number,
): void {
  if (volume.kind !== 'wing' || u1 - u0 < 6) return;
  const bands = plan.windows.filter((windowBand) => windowBand.volumeId === volume.id && windowBand.face === face && windowBand.kind === 'ribbon');
  const ribbon = bands[0];
  const sill = ribbon ? ribbon.y0 - 0.28 : volume.y + (plan.style === 'prairie' ? 2.55 : 2.15);
  const head = ribbon ? ribbon.y1 : volume.y + 6.4;
  batch.add(palette.oak, trimBoard(face, u0, u1, sill, plane, 0.26));
  batch.add(palette.oakDark, trimBoard(face, u0, u1, head, plane, 0.22));
  if (plan.style === 'usonian') {
    batch.add(palette.oakDark, trimBoard(face, u0, u1, volume.h - 1.42, plane, 0.16));
  }
}

function addFaceSlab(
  batch: Batch,
  material: Palette[keyof Palette],
  face: Side,
  u0: number,
  u1: number,
  y0: number,
  y1: number,
  plane: number,
  uv?: { u: number; v: number },
  thickness = 0.46,
  proud = 0,
): void {
  const slab = slabOnFace(face, u0, u1, y0, y1, plane, thickness, proud);
  if (slab.w <= 0.05 || slab.h <= 0.05 || slab.d <= 0.05) return;
  batch.add(material, boxGeometry(slab.x, slab.y, slab.z, slab.w, slab.h, slab.d, uv));
}

function addRoofs(batch: Batch, palette: Palette, plan: HousePlan): void {
  if (plan.style === 'usonian') {
    const rects = plan.roofs.map(foot);
    const eave = plan.roofs[0]?.eaveY ?? 8.75;
    const meshes = buildRoofMeshes(rects, eave, 0, 0.5);
    batch.add(palette.roof, meshes.top);
    batch.add(palette.soffit, meshes.underside);
    batch.add(palette.fascia, meshes.fascia);
    meshes.surface?.dispose();
    return;
  }
  const lower = plan.roofs.filter((roof) => roof.volumeId !== 'upper' && roof.volumeId !== 'hearth');
  const upper = plan.roofs.find((roof) => roof.volumeId === 'upper');
  if (lower.length) {
    const eave = lower[0]!.eaveY;
    const meshes = buildRoofMeshes(lower.map(foot), eave, lower[0]!.pitch, 0.38);
    meshes.top?.dispose();
    batch.add(palette.soffit, meshes.underside);
    batch.add(palette.roof, meshes.surface);
    batch.add(palette.fascia, meshes.fascia);
  }
  if (upper) {
    const meshes = buildRoofMeshes([upper], upper.eaveY, upper.pitch, 0.34);
    meshes.top?.dispose();
    batch.add(palette.soffit, meshes.underside);
    batch.add(palette.roof, meshes.surface);
    batch.add(palette.copper, meshes.fascia);
  }
}

function addChimney(batch: Batch, palette: Palette, plan: HousePlan): void {
  const chimney = plan.chimney;
  const roof = plan.roofs.find((item) => item.volumeId === 'upper') ?? plan.roofs.find((item) => item.volumeId === 'hearth');
  const rise = roof ? roof.pitch * Math.min(Math.max(0, roof.x + roof.w - (chimney.x + chimney.w / 2)), Math.max(0, chimney.x + chimney.w / 2 - roof.x), Math.max(0, roof.z + roof.d - (chimney.z + chimney.d / 2)), Math.max(0, chimney.z + chimney.d / 2 - roof.z)) : 0;
  const emerge = (roof?.eaveY ?? 10) + rise - 0.4;
  batch.add(palette.brick, boxGeometry(chimney.x, emerge, chimney.z, chimney.w, Math.max(4, chimney.h - emerge), chimney.d, BRICK_UV));
  batch.add(palette.coping, boxGeometry(chimney.x - 0.28, chimney.h - 0.35, chimney.z - 0.28, chimney.w + 0.56, 0.38, chimney.d + 0.56));
  batch.add(palette.copper, boxGeometry(chimney.x - 0.45, emerge - 0.08, chimney.z - 0.45, chimney.w + 0.9, 0.12, chimney.d + 0.9));
}

function addCarport(batch: Batch, palette: Palette, plan: HousePlan): void {
  const carport = plan.volumes.find((volume) => volume.kind === 'carport');
  if (!carport || !carport.attach) return;
  batch.add(palette.cherokee, boxGeometry(carport.x + 0.15, 0.04, carport.z + 0.15, carport.w - 0.3, 0.08, carport.d - 0.3));
  const far = opposite(carport.attach);
  const posts = cornerPoints(carport, far);
  for (const point of posts) {
    batch.add(palette.oakDark, boxGeometry(point.x - 0.28, 0, point.z - 0.28, 0.56, carport.h - 0.55, 0.56));
  }
  addBeam(batch, palette, carport, far);
  addScreen(batch, palette, carport);
}

function addBeam(batch: Batch, palette: Palette, carport: Volume, far: Side): void {
  const y = carport.h - 0.55;
  const h = 0.5;
  if (far === 'n' || far === 's') {
    const z = far === 'n' ? carport.z + carport.d - 0.7 : carport.z + 0.15;
    batch.add(palette.oak, boxGeometry(carport.x, y, z, carport.w, h, 0.55));
  } else {
    const x = far === 'e' ? carport.x + carport.w - 0.7 : carport.x + 0.15;
    batch.add(palette.oak, boxGeometry(x, y, carport.z, 0.55, h, carport.d));
  }
}

function addScreen(batch: Batch, palette: Palette, carport: Volume): void {
  if (!carport.attach) return;
  const side = screenSide(carport.attach);
  const plane = facePlane(carport, side);
  const span = side === 'n' || side === 's' ? { u0: carport.x, u1: carport.x + carport.w * 0.72 } : { u0: carport.z, u1: carport.z + carport.d * 0.72 };
  addFaceSlab(batch, palette.brick, side, span.u0, span.u1, 0, 3.35, plane, BRICK_UV, 0.55, 0);
  batch.add(palette.coping, trimBoard(side, span.u0, span.u1, 3.2, plane, 0.22));
}

function addDoor(batch: Batch, palette: Palette, plan: HousePlan, groundY: number): void {
  const host = plan.volumes.find((volume) => volume.id === plan.entry.volumeId);
  if (!host) return;
  const width = Math.min(3.3, Math.max(2.4, (host.w + host.d) * 0.08));
  const height = 7;
  const u0 = plan.entry.u - width / 2;
  const u1 = plan.entry.u + width / 2;
  batch.add(palette.oakDark, faceDoor(plan.entry.face, u0, u1, 0.08, height, plan.entry.plane));
  batch.add(palette.oak, faceDoor(plan.entry.face, u0 + 0.18, u1 - 0.18, 0.28, height - 0.45, plan.entry.plane, 0.12));
  if (u1 + 1.2 < (plan.entry.face === 'n' || plan.entry.face === 's' ? host.x + host.w : host.z + host.d)) {
    const glass = buildWindowParts({
      id: 'sidelight',
      volumeId: host.id,
      kind: 'ribbon',
      face: plan.entry.face,
      u0: u1 + 0.18,
      u1: u1 + 1.15,
      y0: 1.4,
      y1: 6.5,
      plane: plan.entry.plane,
      mullionSpacing: 2,
    });
    for (const item of glass.glass) batch.add(plan.style === 'prairie' ? palette.artGlass : palette.glass, item);
    for (const item of glass.mullions) batch.add(palette.mullion, item);
  }

  const rise = -groundY;
  const steps = plan.style === 'prairie' ? 3 : 2;
  const tread = 1.2;
  const stepH = rise / steps;
  const edge = facePlane(plinthVolume(plan), plan.entry.face);
  for (let i = 0; i < steps; i++) {
    const dist = tread * 0.5 + 0.15 + i * tread;
    const y = groundY + (steps - 1 - i) * stepH;
    const slab = centeredOnFace(plan.entry.face, plan.entry.u, edge, dist, 5.2, tread, y, stepH + 0.02);
    batch.add(palette.limestone, boxGeometry(slab.x, slab.y, slab.z, slab.w, slab.h, slab.d, STUCCO_UV));
  }
}

function faceDoor(face: Side, u0: number, u1: number, y0: number, y1: number, plane: number, offset = 0.08): Mesh['geometry'] {
  const slab = slabOnFace(face, u0, u1, y0, y1, plane, 0.16, offset);
  return boxGeometry(slab.x, slab.y, slab.z, slab.w, slab.h, slab.d);
}

function addPergola(batch: Batch, palette: Palette, plan: HousePlan): void {
  const terrace = plan.terraces[0];
  const host = plan.volumes.find((volume) => volume.id === terrace?.hostId);
  if (!terrace || !host) return;
  const y = 8.15;
  const beam = 0.45;
  const depth = 0.7;
  if (terrace.outer === 'n' || terrace.outer === 's') {
    const z0 = terrace.outer === 'n' ? host.z + host.d - 0.4 : terrace.z;
    const z1 = terrace.outer === 'n' ? terrace.z + terrace.d + 0.8 : host.z + 0.4;
    const span = Math.abs(z1 - z0);
    const z = Math.min(z0, z1);
    for (let x = terrace.x + 1.2; x < terrace.x + terrace.w - 0.4; x += 4) {
      batch.add(palette.oak, boxGeometry(x, y, z, beam, depth, span));
    }
    const postZ = terrace.outer === 'n' ? terrace.z + terrace.d - 1.3 : terrace.z + 0.8;
    for (let x = terrace.x + 1.2; x < terrace.x + terrace.w - 0.4; x += 8) {
      batch.add(palette.oakDark, boxGeometry(x, 0, postZ, 0.42, y, 0.42));
    }
  } else {
    const x0 = terrace.outer === 'e' ? host.x + host.w - 0.4 : terrace.x;
    const x1 = terrace.outer === 'e' ? terrace.x + terrace.w + 0.8 : host.x + 0.4;
    const span = Math.abs(x1 - x0);
    const x = Math.min(x0, x1);
    for (let z = terrace.z + 1.2; z < terrace.z + terrace.d - 0.4; z += 4) {
      batch.add(palette.oak, boxGeometry(x, y, z, span, depth, beam));
    }
    const postX = terrace.outer === 'e' ? terrace.x + terrace.w - 1.3 : terrace.x + 0.8;
    for (let z = terrace.z + 1.2; z < terrace.z + terrace.d - 0.4; z += 8) {
      batch.add(palette.oakDark, boxGeometry(postX, 0, z, 0.42, y, 0.42));
    }
  }
}

function addFirebox(batch: Batch, palette: Palette, plan: HousePlan): void {
  const hearth = plan.volumes.find((volume) => volume.kind === 'hearth');
  if (!hearth) return;
  for (const face of SIDES) {
    const spans = exposedSpans(hearth, face, plan.volumes).filter((span) => span.u1 - span.u0 > 5);
    if (!spans.length) continue;
    const span = spans[0]!;
    const u = (span.u0 + span.u1) / 2;
    const plane = facePlane(hearth, face);
    batch.add(palette.brick, faceDoor(face, u - 1.7, u + 1.7, 0.7, 4.3, plane, 0.2));
    batch.add(palette.fire, faceDoor(face, u - 1.15, u + 1.15, 1.05, 3.5, plane, 0.28));
    batch.add(palette.coping, trimBoard(face, u - 1.9, u + 1.9, 4.15, plane, 0.28));
    break;
  }
}

function addSlab(batch: Batch, material: Palette[keyof Palette], rects: Footprint[], top: number, thickness: number): void {
  if (!rects.length) return;
  const meshes = buildRoofMeshes(rects, top, 0, thickness);
  batch.add(material, meshes.top);
  batch.add(material, meshes.underside);
  meshes.surface?.dispose();
  meshes.fascia.dispose();
}

function slabOnFace(
  face: Side,
  u0: number,
  u1: number,
  y0: number,
  y1: number,
  plane: number,
  thickness: number,
  proud: number,
): { x: number; y: number; z: number; w: number; h: number; d: number } {
  const n = normal(face);
  const outward = face === 'n' || face === 's' ? n.z : n.x;
  const outer = plane + outward * proud;
  const inner = plane + outward * (proud - thickness);
  const start = Math.min(outer, inner);
  const depth = Math.abs(outer - inner);
  if (face === 'n' || face === 's') {
    return { x: Math.min(u0, u1), y: y0, z: start, w: Math.abs(u1 - u0), h: y1 - y0, d: depth };
  }
  return { x: start, y: y0, z: Math.min(u0, u1), w: depth, h: y1 - y0, d: Math.abs(u1 - u0) };
}

function centeredOnFace(
  face: Side,
  u: number,
  plane: number,
  dist: number,
  width: number,
  depth: number,
  y: number,
  h: number,
): { x: number; y: number; z: number; w: number; h: number; d: number } {
  const n = normal(face);
  const alongX = face === 'n' || face === 's';
  const cx = (alongX ? u : plane) + n.x * dist;
  const cz = (alongX ? plane : u) + n.z * dist;
  const w = alongX ? width : depth;
  const d = alongX ? depth : width;
  return { x: cx - w / 2, y, z: cz - d / 2, w, h, d };
}

function plinthVolume(plan: HousePlan): Volume {
  return {
    id: 'plinth',
    kind: 'hearth',
    x: plan.plinth.x,
    z: plan.plinth.z,
    w: plan.plinth.w,
    d: plan.plinth.d,
    y: 0,
    h: plan.plinth.h,
  };
}

function cornerPoints(volume: Volume, far: Side): { x: number; z: number }[] {
  const inset = 0.7;
  if (far === 'n') {
    return [
      { x: volume.x + inset, z: volume.z + volume.d - inset },
      { x: volume.x + volume.w - inset, z: volume.z + volume.d - inset },
    ];
  }
  if (far === 's') {
    return [
      { x: volume.x + inset, z: volume.z + inset },
      { x: volume.x + volume.w - inset, z: volume.z + inset },
    ];
  }
  if (far === 'e') {
    return [
      { x: volume.x + volume.w - inset, z: volume.z + inset },
      { x: volume.x + volume.w - inset, z: volume.z + volume.d - inset },
    ];
  }
  return [
    { x: volume.x + inset, z: volume.z + inset },
    { x: volume.x + inset, z: volume.z + volume.d - inset },
  ];
}

function screenSide(attach: Side): Side {
  if (attach === 'n' || attach === 's') return 'e';
  return 'n';
}

function pad(foot: Footprint, amount: number): Footprint {
  return { x: foot.x - amount, z: foot.z - amount, w: foot.w + amount * 2, d: foot.d + amount * 2 };
}

function foot(rect: Footprint): Footprint {
  return { x: rect.x, z: rect.z, w: rect.w, d: rect.d };
}

function opposite(side: Side): Side {
  const table: Record<Side, Side> = { n: 's', s: 'n', e: 'w', w: 'e' };
  return table[side];
}

function normal(face: Side): { x: number; z: number } {
  if (face === 'n') return { x: 0, z: 1 };
  if (face === 's') return { x: 0, z: -1 };
  if (face === 'e') return { x: 1, z: 0 };
  return { x: -1, z: 0 };
}
