import { describe, expect, it } from 'vitest';
import { clampParams, paramsFromSearch, paramsToQuery } from '../src/params';

describe('params', () => {
  it('round-trips through the query string', () => {
    const params = clampParams({ seed: 42, style: 'usonian', size: 1.2, wings: 3, overhang: 6.5 });
    expect(paramsFromSearch(paramsToQuery(params))).toEqual(params);
  });

  it('reads a seed from the search string and clamps junk', () => {
    expect(paramsFromSearch('?seed=1847291&style=prairie&wings=4&overhang=5&size=1').seed).toBe(1847291);
    const clamped = paramsFromSearch('?seed=-5&style=nope&wings=9&overhang=40&size=0');
    expect(clamped.seed).toBe(1);
    expect(clamped.style).toBe('prairie');
    expect(clamped.wings).toBe(4);
    expect(clamped.overhang).toBe(8);
    expect(clamped.size).toBe(0.75);
  });
});
