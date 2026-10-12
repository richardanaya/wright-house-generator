/**
 * Mulberry32. Same uint32 seed, same sequence. No Math.random.
 */
export interface Rng {
  next(): number;
  int(min: number, maxInclusive: number): number;
  float(min: number, max: number): number;
  bool(probability?: number): boolean;
  pick<T>(items: readonly T[]): T;
}

export function rngFromSeed(seed: number): Rng {
  let a = seed >>> 0;
  const next = (): number => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int(min: number, maxInclusive: number): number {
      const span = maxInclusive - min + 1;
      return min + Math.floor(next() * span);
    },
    float(min: number, max: number): number {
      return min + next() * (max - min);
    },
    bool(probability = 0.5): boolean {
      return next() < probability;
    },
    pick<T>(items: readonly T[]): T {
      return items[Math.floor(next() * items.length)]!;
    },
  };
}
