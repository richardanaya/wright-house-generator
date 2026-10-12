import { describe, expect, it } from 'vitest';
import { rngFromSeed } from '../src/rng';

describe('rng', () => {
  it('repeats the same sequence for a seed', () => {
    const a = rngFromSeed(12045);
    const b = rngFromSeed(12045);
    const seq = () => [a.next(), a.next(), a.int(0, 10), a.pick(['n', 'e', 's']), a.bool()];
    const first = seq();
    const second = [b.next(), b.next(), b.int(0, 10), b.pick(['n', 'e', 's']), b.bool()];
    expect(first).toEqual(second);
  });

  it('changes the sequence when the seed changes', () => {
    const a = [rngFromSeed(1).next(), rngFromSeed(1).next()];
    const b = [rngFromSeed(2).next(), rngFromSeed(2).next()];
    expect(a).not.toEqual(b);
  });

  it('stays inside the unit interval', () => {
    const rng = rngFromSeed(99);
    for (let i = 0; i < 1000; i++) {
      const value = rng.next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});
