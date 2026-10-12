import {
  BufferGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  IcosahedronGeometry,
  Mesh,
  PlaneGeometry,
  RepeatWrapping,
} from 'three';
import { rngFromSeed } from './rng';
import type { Palette } from './materials';
import type { HousePlan, Side } from './types';

export function buildLandscape(plan: HousePlan, palette: Palette): Group {
  const group = new Group();
  group.name = 'landscape';
  const groundY = -plan.plinth.h;

  if (palette.grass.map) {
    palette.grass.map.wrapS = RepeatWrapping;
    palette.grass.map.wrapT = RepeatWrapping;
    palette.grass.map.repeat.set(48, 48);
    palette.grass.map.needsUpdate = true;
  }
  const ground = new Mesh(new PlaneGeometry(720, 720), palette.grass);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = groundY - 0.03;
  ground.receiveShadow = true;
  group.add(ground);

  const rng = rngFromSeed(plan.seed ^ 0x51f1e);
  const limit = Math.max(plan.plinth.w, plan.plinth.d) * 0.5 + 8;
  const cx = plan.plinth.x + plan.plinth.w / 2;
  const cz = plan.plinth.z + plan.plinth.d / 2;

  for (let i = 0; i < 9; i++) {
    const angle = rng.float(0, Math.PI * 2);
    const radius = limit + rng.float(10, 46);
    const x = cx + Math.cos(angle) * radius;
    const z = cz + Math.sin(angle) * radius;
    if (inside(x, z, plan, 4)) continue;
    group.add(tree(palette, x, groundY, z, rng.float(13, 26), rng.float(0.8, 1.25)));
  }

  for (let i = 0; i < 14; i++) {
    const edge = rng.pick(['n', 'e', 's', 'w'] as const);
    const along = rng.float(0.1, 0.9);
    const outset = rng.float(1.5, 4.5);
    const point = around(plan, edge, along, outset);
    if (inside(point.x, point.z, plan, 0.4)) continue;
    const shrub = new Mesh(new IcosahedronGeometry(0.8, 0), i % 2 ? palette.foliage : palette.foliageDark);
    shrub.position.set(point.x, groundY + 0.7, point.z);
    shrub.scale.y = 0.7;
    shrub.scale.set(rng.float(0.7, 1.3), 1, rng.float(0.7, 1.4));
    shrub.castShadow = true;
    shrub.receiveShadow = true;
    group.add(shrub);
  }

  const drive = driveway(plan, groundY);
  if (drive) {
    const mesh = new Mesh(drive, palette.gravel);
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  return group;
}

function tree(palette: Palette, x: number, groundY: number, z: number, height: number, bulk: number): Group {
  const group = new Group();
  const trunkH = height * 0.34;
  const trunk = new Mesh(new CylinderGeometry(0.22, 0.4, trunkH, 6), palette.trunk);
  trunk.position.set(x, groundY + trunkH / 2, z);
  trunk.castShadow = true;
  group.add(trunk);
  const canopy = new Mesh(new IcosahedronGeometry(2.15 * bulk, 1), palette.foliage);
  canopy.position.set(x, groundY + trunkH + 1.2 * bulk, z);
  canopy.scale.set(1.15, 0.62, 1);
  canopy.castShadow = true;
  canopy.receiveShadow = true;
  group.add(canopy);
  const side = new Mesh(new IcosahedronGeometry(1.35 * bulk, 1), palette.foliageDark);
  side.position.set(x + 0.8 * bulk, groundY + trunkH + 0.4, z - 0.5 * bulk);
  side.scale.set(1.2, 0.55, 1);
  side.castShadow = true;
  group.add(side);
  return group;
}

function driveway(plan: HousePlan, groundY: number): BufferGeometry | null {
  const carport = plan.volumes.find((volume) => volume.kind === 'carport');
  if (!carport?.attach) return null;
  const outward = opposite(carport.attach);
  const length = 34;
  const width = Math.max(10, Math.min(carport.w, carport.d));
  const y0 = 0.05;
  const y1 = groundY + 0.04;
  const positions: number[] = [];
  const push = (x: number, y: number, z: number) => positions.push(x, y, z);
  if (outward === 'n' || outward === 's') {
    const sign = outward === 'n' ? 1 : -1;
    const zNear = outward === 'n' ? carport.z + carport.d : carport.z;
    const x0 = carport.x + carport.w / 2 - width / 2;
    const x1 = x0 + width;
    const zFar = zNear + sign * length;
    push(x0, y0, zNear); push(x1, y0, zNear); push(x1, y1, zFar);
    push(x0, y0, zNear); push(x1, y1, zFar); push(x0, y1, zFar);
  } else {
    const sign = outward === 'e' ? 1 : -1;
    const xNear = outward === 'e' ? carport.x + carport.w : carport.x;
    const z0 = carport.z + carport.d / 2 - width / 2;
    const z1 = z0 + width;
    const xFar = xNear + sign * length;
    push(xNear, y0, z0); push(xNear, y0, z1); push(xFar, y1, z1);
    push(xNear, y0, z0); push(xFar, y1, z1); push(xFar, y1, z0);
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geo.computeVertexNormals();
  return geo;
}

function opposite(side: Side): Side {
  const table: Record<Side, Side> = { n: 's', s: 'n', e: 'w', w: 'e' };
  return table[side];
}

function around(plan: HousePlan, edge: Side, along: number, outset: number): { x: number; z: number } {
  const p = plan.plinth;
  if (edge === 'n') return { x: p.x + p.w * along, z: p.z + p.d + outset };
  if (edge === 's') return { x: p.x + p.w * along, z: p.z - outset };
  if (edge === 'e') return { x: p.x + p.w + outset, z: p.z + p.d * along };
  return { x: p.x - outset, z: p.z + p.d * along };
}

function inside(x: number, z: number, plan: HousePlan, margin: number): boolean {
  const p = plan.plinth;
  return x > p.x - margin && x < p.x + p.w + margin && z > p.z - margin && z < p.z + p.d + margin;
}
