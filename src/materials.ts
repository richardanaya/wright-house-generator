import {
  CanvasTexture,
  Color,
  DoubleSide,
  MeshStandardMaterial,
  RepeatWrapping,
  SRGBColorSpace,
  type Texture,
} from 'three';
import type { ResolvedStyle } from './types';
import { rngFromSeed } from './rng';

export interface Palette {
  stucco: MeshStandardMaterial;
  brick: MeshStandardMaterial;
  batten: MeshStandardMaterial;
  oak: MeshStandardMaterial;
  oakDark: MeshStandardMaterial;
  roof: MeshStandardMaterial;
  fascia: MeshStandardMaterial;
  soffit: MeshStandardMaterial;
  glass: MeshStandardMaterial;
  artGlass: MeshStandardMaterial;
  limestone: MeshStandardMaterial;
  cherokee: MeshStandardMaterial;
  coping: MeshStandardMaterial;
  copper: MeshStandardMaterial;
  foliage: MeshStandardMaterial;
  foliageDark: MeshStandardMaterial;
  trunk: MeshStandardMaterial;
  grass: MeshStandardMaterial;
  gravel: MeshStandardMaterial;
  mullion: MeshStandardMaterial;
  fire: MeshStandardMaterial;
}

const textures = new Map<string, CanvasTexture>();

export function createPalette(seed: number, style: ResolvedStyle): Palette {
  const rng = rngFromSeed(seed ^ 0x51ed);
  const jitter = (hex: string, amount = 0.025) => {
    const color = new Color(hex);
    color.offsetHSL(rng.float(-amount, amount), rng.float(-amount * 0.6, amount * 0.4), rng.float(-amount, amount * 0.5));
    return color;
  };
  const roofHex = style === 'prairie' ? (rng.bool(0.55) ? '#5d6c63' : '#5c5148') : '#3c4441';
  return {
    stucco: mat(jitter('#e7d8c4'), { map: tex('stucco', stuccoTexture), roughness: 0.94 }),
    brick: mat(jitter('#8a4034', 0.03), { map: tex('brick', brickTexture), roughness: 0.88 }),
    batten: mat(jitter('#c4a36a', 0.03), { map: tex('batten', battenTexture), roughness: 0.78 }),
    oak: mat(jitter('#b08960'), { map: tex('oak', woodTexture), roughness: 0.62 }),
    oakDark: mat(jitter('#6e4e34'), { map: tex('oak', woodTexture), roughness: 0.7 }),
    roof: mat(jitter(roofHex, 0.02), { map: tex('roof', roofTexture), roughness: 0.78, metalness: 0.08 }),
    fascia: mat(jitter(style === 'prairie' ? '#5c4636' : '#2a2e2c'), { roughness: 0.55, metalness: 0.12 }),
    soffit: mat(jitter('#efe4d4'), { roughness: 0.9 }),
    glass: mat(new Color('#9eb6b4'), { roughness: 0.06, metalness: 0.25, transparent: true, opacity: 0.45 }),
    artGlass: mat(new Color('#ffffff'), { map: tex('glass', artGlassTexture), roughness: 0.28, metalness: 0.04 }),
    limestone: mat(jitter('#d7d0c4'), { map: tex('stone', stoneTexture), roughness: 0.9 }),
    cherokee: mat(jitter('#a34332', 0.02), { roughness: 0.84 }),
    coping: mat(jitter('#e5dccb'), { roughness: 0.72 }),
    copper: mat(new Color('#6d8f78'), { roughness: 0.45, metalness: 0.55 }),
    foliage: mat(jitter('#5d7d55', 0.04), { roughness: 0.95 }),
    foliageDark: mat(jitter('#3e5a40', 0.04), { roughness: 0.95 }),
    trunk: mat(new Color('#6b5344'), { roughness: 0.9 }),
    grass: mat(jitter('#6f8f62', 0.02), { map: tex('grass', grassTexture), roughness: 1 }),
    gravel: mat(new Color('#b7aa98'), { map: tex('gravel', gravelTexture), roughness: 0.95, side: DoubleSide }),
    mullion: mat(new Color('#2b2724'), { roughness: 0.45, metalness: 0.05 }),
    fire: mat(new Color('#e0703a'), { emissive: new Color('#c4552a'), emissiveIntensity: 0.6, roughness: 0.8 }),
  };
}

export function disposePalette(palette: Palette): void {
  for (const material of Object.values(palette)) material.dispose();
}

export function setAnisotropy(palette: Palette, value: number): void {
  for (const material of Object.values(palette)) {
    if (material.map) material.map.anisotropy = value;
  }
}

function mat(color: Color, extra: Partial<MeshStandardMaterial> & { map?: Texture }): MeshStandardMaterial {
  return new MeshStandardMaterial({ color, ...extra });
}

function tex(key: string, draw: (ctx: CanvasRenderingContext2D, size: number) => void, size = 256): CanvasTexture {
  const cached = textures.get(key);
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = key === 'brick' ? size / 2 : size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas unavailable');
  draw(ctx, size);
  const texture = new CanvasTexture(canvas);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;
  textures.set(key, texture);
  return texture;
}

function brickTexture(ctx: CanvasRenderingContext2D, size: number): void {
  const h = size / 2;
  ctx.fillStyle = '#cbbba8';
  ctx.fillRect(0, 0, size, h);
  const brickH = 11;
  const mortar = 3;
  const brickW = 62;
  let row = 0;
  for (let y = 0; y < h; y += brickH + mortar) {
    const offset = row % 2 === 0 ? 0 : brickW / 2;
    for (let x = -brickW; x < size + brickW; x += brickW + mortar) {
      const shade = 118 + ((x * 13 + y * 7) % 28);
      ctx.fillStyle = `rgb(${shade}, ${Math.round(shade * 0.42)}, ${Math.round(shade * 0.34)})`;
      ctx.fillRect(x + offset, y, brickW, brickH);
    }
    row += 1;
  }
}

function stuccoTexture(ctx: CanvasRenderingContext2D, size: number): void {
  ctx.fillStyle = '#eadccb';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 4000; i++) {
    const x = (i * 97) % size;
    const y = (i * 57) % size;
    const v = 210 + ((i * 13) % 35);
    ctx.fillStyle = `rgba(${v}, ${v - 12}, ${v - 28}, 0.35)`;
    ctx.fillRect(x, y, 2, 2);
  }
}

function battenTexture(ctx: CanvasRenderingContext2D, size: number): void {
  ctx.fillStyle = '#c6a56e';
  ctx.fillRect(0, 0, size, size);
  const board = 28;
  for (let x = 0; x < size; x += board) {
    ctx.fillStyle = x % (board * 2) === 0 ? '#d4b483' : '#c19a62';
    ctx.fillRect(x, 0, board - 3, size);
    ctx.fillStyle = '#8d6a42';
    ctx.fillRect(x + board - 3, 0, 3, size);
  }
  for (let i = 0; i < 1500; i++) {
    ctx.fillStyle = 'rgba(90, 60, 30, 0.08)';
    ctx.fillRect((i * 47) % size, (i * 91) % size, 1, 8 + (i % 20));
  }
}

function woodTexture(ctx: CanvasRenderingContext2D, size: number): void {
  ctx.fillStyle = '#b58962';
  ctx.fillRect(0, 0, size, size);
  for (let y = 0; y < size; y += 3) {
    const v = 150 + ((y * 5) % 40);
    ctx.fillStyle = `rgba(${v}, ${v - 30}, ${v - 60}, 0.25)`;
    ctx.fillRect(0, y, size, 1);
  }
}

function roofTexture(ctx: CanvasRenderingContext2D, size: number): void {
  ctx.fillStyle = '#d5ddd6';
  ctx.fillRect(0, 0, size, size);
  for (let y = 0; y < size; y += 6) {
    ctx.fillStyle = y % 12 === 0 ? 'rgba(40,50,45,0.18)' : 'rgba(255,255,255,0.2)';
    ctx.fillRect(0, y, size, 2);
  }
}

function artGlassTexture(ctx: CanvasRenderingContext2D, size: number): void {
  ctx.fillStyle = '#1c1916';
  ctx.fillRect(0, 0, size, size);
  const panes = [
    [8, 8, 70, 50, '#e6d7b8'],
    [86, 8, 50, 50, '#d7a15a'],
    [144, 8, 100, 28, '#efe6d4'],
    [144, 44, 46, 50, '#7f8f62'],
    [198, 44, 46, 50, '#c9844a'],
    [8, 66, 40, 70, '#eadcc4'],
    [56, 66, 80, 34, '#f0e2c4'],
    [56, 108, 80, 28, '#b86a45'],
    [144, 102, 100, 34, '#d9c39a'],
    [8, 144, 110, 40, '#e7c27a'],
    [126, 144, 60, 40, '#6e8668'],
    [194, 144, 50, 40, '#f3eadc'],
    [8, 192, 236, 52, '#e8dcc6'],
  ] as const;
  for (const [x, y, w, h, color] of panes) {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#211e1b';
    ctx.lineWidth = 4;
    ctx.strokeRect(x, y, w, h);
  }
}

function stoneTexture(ctx: CanvasRenderingContext2D, size: number): void {
  ctx.fillStyle = '#d9d2c6';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 2000; i++) {
    ctx.fillStyle = `rgba(120, 110, 96, ${0.05 + (i % 5) * 0.02})`;
    ctx.fillRect((i * 53) % size, (i * 29) % size, 3, 2);
  }
}

function grassTexture(ctx: CanvasRenderingContext2D, size: number): void {
  ctx.fillStyle = '#6e8d60';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 5000; i++) {
    const g = 90 + ((i * 17) % 50);
    ctx.fillStyle = `rgba(${g - 30}, ${g}, ${g - 40}, 0.35)`;
    ctx.fillRect((i * 73) % size, (i * 41) % size, 2, 3);
  }
}

function gravelTexture(ctx: CanvasRenderingContext2D, size: number): void {
  ctx.fillStyle = '#c2b5a4';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 2500; i++) {
    ctx.fillStyle = i % 2 ? '#a89884' : '#ddd2c2';
    ctx.beginPath();
    ctx.arc((i * 61) % size, (i * 37) % size, 1 + (i % 3), 0, Math.PI * 2);
    ctx.fill();
  }
}
