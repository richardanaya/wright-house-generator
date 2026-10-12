import { describe, expect, it } from 'vitest';
import { loopArea, pointInUnion, unionFootprints } from '../src/geometry/union';

describe('rectangle union', () => {
  it('traces a single rectangle counterclockwise', () => {
    const { loops } = unionFootprints([{ x: 0, z: 0, w: 10, d: 6 }]);
    expect(loops).toHaveLength(1);
    expect(loopArea(loops[0]!)).toBeCloseTo(60, 4);
    expect(pointInUnion(5, 3, loops)).toBe(true);
    expect(pointInUnion(-1, 3, loops)).toBe(false);
  });

  it('merges two rectangles into an L whose area counts the overlap once', () => {
    const rects = [
      { x: 0, z: 0, w: 10, d: 4 },
      { x: 0, z: 0, w: 4, d: 12 },
    ];
    const { loops } = unionFootprints(rects);
    expect(loops).toHaveLength(1);
    expect(loopArea(loops[0]!)).toBeCloseTo(10 * 4 + 4 * 8, 3);
    expect(pointInUnion(2, 2, loops)).toBe(true);
    expect(pointInUnion(2, 10, loops)).toBe(true);
    expect(pointInUnion(8, 10, loops)).toBe(false);
  });

  it('keeps a hole when a ring of rectangles surrounds one', () => {
    const rects = [
      { x: 0, z: 0, w: 12, d: 2 },
      { x: 0, z: 2, w: 2, d: 8 },
      { x: 10, z: 2, w: 2, d: 8 },
      { x: 0, z: 10, w: 12, d: 2 },
    ];
    const { loops } = unionFootprints(rects);
    expect(loops.length).toBeGreaterThanOrEqual(2);
    expect(pointInUnion(6, 6, loops)).toBe(false);
    expect(pointInUnion(1, 6, loops)).toBe(true);
    const outer = loopArea(loops[0]!);
    const hole = loopArea(loops[1]!);
    expect(outer - hole).toBeCloseTo(12 * 12 - 8 * 8, 2);
  });
});
