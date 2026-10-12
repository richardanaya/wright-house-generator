import { describe, expect, it } from 'vitest';
import { checkPlan, boxesOverlap } from '../src/grammar/invariants';
import { generatePlan } from '../src/grammar/plan';
import type { Params, Style, Volume } from '../src/types';

const styles: Style[] = ['prairie', 'usonian', 'mixed'];

function params(partial: Partial<Params> & Pick<Params, 'seed'>): Params {
  return {
    style: 'prairie',
    size: 1,
    wings: 3,
    overhang: 5,
    ...partial,
  };
}

describe('plan grammar', () => {
  it('is deterministic and does not call Math.random', () => {
    const input = params({ seed: 12045, style: 'mixed', wings: 4, size: 1.15, overhang: 6 });
    const original = Math.random;
    Math.random = () => {
      throw new Error('Math.random');
    };
    try {
      expect(generatePlan(input)).toEqual(generatePlan(input));
    } finally {
      Math.random = original;
    }
  });

  it('changes with the seed', () => {
    const a = generatePlan(params({ seed: 3, style: 'prairie', wings: 4 }));
    const b = generatePlan(params({ seed: 4, style: 'prairie', wings: 4 }));
    expect(a).not.toEqual(b);
  });

  it('keeps the hearth, connectivity, separation, and roof bounds across seeds', () => {
    const failures: string[] = [];
    const wingCounts = [2, 3, 4];
    const sizes = [0.75, 1, 1.45];
    const overhangs = [2, 5, 8];
    let count = 0;
    for (const style of styles) {
      for (let n = 0; n < 24; n++) {
        const input = params({
          seed: n * 97 + 11,
          style,
          wings: wingCounts[n % wingCounts.length]!,
          size: sizes[n % sizes.length]!,
          overhang: overhangs[n % overhangs.length]!,
        });
        let plan;
        try {
          plan = generatePlan(input);
        } catch (error) {
          failures.push(`seed ${input.seed} ${style} threw ${String(error)}`);
          continue;
        }
        const errors = checkPlan(plan, input);
        if (errors.length) failures.push(`seed ${input.seed} ${style} wings ${input.wings}: ${errors.join('; ')}`);
        count += 1;
      }
    }
    expect(failures).toEqual([]);
    expect(count).toBe(styles.length * 24);
  });

  it('rejects a synthetic overlap and a short roof', () => {
    const plan = generatePlan(params({ seed: 8, style: 'usonian', wings: 2 }));
    const hearth = plan.volumes.find((volume) => volume.kind === 'hearth')!;
    const intruder: Volume = { ...hearth, id: 'intruder', kind: 'wing', x: hearth.x + 1, role: 'chamber' };
    expect(boxesOverlap(hearth, intruder)).toBe(true);

    const broken = {
      ...plan,
      roofs: plan.roofs.map((roof, index) => (index === 0 ? { ...roof, w: roof.covers.w / 2 } : roof)),
    };
    expect(checkPlan(broken, params({ seed: 8, style: 'usonian', wings: 2 })).length).toBeGreaterThan(0);
  });
});
