import { BoxGeometry, BufferGeometry, Float32BufferAttribute, Material, Mesh, MeshStandardMaterial } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export function boxGeometry(
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  d: number,
  uv?: { u: number; v: number },
): BufferGeometry {
  const geo = new BoxGeometry(Math.max(0.02, w), Math.max(0.02, h), Math.max(0.02, d));
  geo.translate(x + w / 2, y + h / 2, z + d / 2);
  if (uv) applyWorldUVs(geo, uv.u, uv.v);
  return geo;
}

export function applyWorldUVs(geo: BufferGeometry, scaleU: number, scaleV: number): void {
  const pos = geo.attributes.position;
  const normal = geo.attributes.normal;
  const uv = geo.attributes.uv;
  if (!pos || !normal || !uv) return;
  for (let i = 0; i < pos.count; i++) {
    const nx = Math.abs(normal.getX(i));
    const ny = Math.abs(normal.getY(i));
    const nz = Math.abs(normal.getZ(i));
    let u: number;
    let v: number;
    if (ny >= nx && ny >= nz) {
      u = pos.getX(i);
      v = pos.getZ(i);
    } else if (nx >= nz) {
      u = pos.getZ(i);
      v = pos.getY(i);
    } else {
      u = pos.getX(i);
      v = pos.getY(i);
    }
    uv.setXY(i, u / scaleU, v / scaleV);
  }
  uv.needsUpdate = true;
}

export class Batch {
  private readonly groups = new Map<Material, BufferGeometry[]>();

  add(material: Material, geometry: BufferGeometry | null | undefined): void {
    if (!geometry || geometry.getAttribute('position')?.count === 0) return;
    let prepared = geometry;
    if (prepared.index) {
      const nonIndexed = prepared.toNonIndexed();
      prepared.dispose();
      prepared = nonIndexed;
    }
    prepared.clearGroups();
    if (!prepared.getAttribute('uv')) {
      const count = prepared.getAttribute('position')?.count ?? 0;
      prepared.setAttribute('uv', new Float32BufferAttribute(new Float32Array(count * 2), 2));
    }
    if (!prepared.getAttribute('normal')) prepared.computeVertexNormals();
    const list = this.groups.get(material);
    if (list) list.push(prepared);
    else this.groups.set(material, [prepared]);
  }

  into(parent: Mesh['parent'], shadows = true): Mesh[] {
    const meshes: Mesh[] = [];
    if (!parent) return meshes;
    for (const [material, geometries] of this.groups) {
      const merged = geometries.length === 1 ? geometries[0]! : mergeGeometries(geometries, false);
      if (!merged) continue;
      if (geometries.length > 1) {
        for (const geometry of geometries) geometry.dispose();
      }
      const mesh = new Mesh(merged, material);
      mesh.castShadow = shadows && !(material instanceof MeshStandardMaterial && material.transparent);
      mesh.receiveShadow = true;
      parent.add(mesh);
      meshes.push(mesh);
    }
    return meshes;
  }
}
