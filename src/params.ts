import {
  DEFAULT_PARAMS,
  MAX_OVERHANG,
  MAX_SEED,
  MAX_SIZE,
  MAX_WINGS,
  MIN_OVERHANG,
  MIN_SEED,
  MIN_SIZE,
  MIN_WINGS,
} from './constants';
import type { Params, Style } from './types';

const STYLES: readonly Style[] = ['prairie', 'usonian', 'mixed'];

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function num(value: string | null, fallback: number): number {
  if (value === null || value.trim() === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function clampParams(input: Partial<Params>): Params {
  const style = STYLES.includes(input.style as Style)
    ? (input.style as Style)
    : DEFAULT_PARAMS.style;
  const wings = Math.round(num(input.wings?.toString() ?? null, DEFAULT_PARAMS.wings));
  return {
    seed: Math.round(clamp(num(input.seed?.toString() ?? null, DEFAULT_PARAMS.seed), MIN_SEED, MAX_SEED)),
    style,
    size: Math.round(clamp(num(input.size?.toString() ?? null, DEFAULT_PARAMS.size), MIN_SIZE, MAX_SIZE) * 20) / 20,
    wings: clamp(wings, MIN_WINGS, MAX_WINGS),
    overhang:
      Math.round(clamp(num(input.overhang?.toString() ?? null, DEFAULT_PARAMS.overhang), MIN_OVERHANG, MAX_OVERHANG) * 2) /
      2,
  };
}

export function paramsFromSearch(search: string): Params {
  const q = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const styleRaw = q.get('style');
  return clampParams({
    seed: num(q.get('seed'), DEFAULT_PARAMS.seed),
    style: STYLES.includes(styleRaw as Style) ? (styleRaw as Style) : DEFAULT_PARAMS.style,
    size: num(q.get('size'), DEFAULT_PARAMS.size),
    wings: num(q.get('wings'), DEFAULT_PARAMS.wings),
    overhang: num(q.get('overhang'), DEFAULT_PARAMS.overhang),
  });
}

export function paramsToQuery(params: Params): string {
  const p = clampParams(params);
  const q = new URLSearchParams({
    seed: String(p.seed),
    style: p.style,
    size: String(p.size),
    wings: String(p.wings),
    overhang: String(p.overhang),
  });
  return q.toString();
}
