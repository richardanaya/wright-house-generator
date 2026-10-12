import { describe, expect, it } from 'vitest';
import html from '../index.html?raw';

describe('pages bundle', () => {
  it('loads a committed relative bundle instead of TypeScript source', () => {
    expect(html).not.toContain('/src/main.ts');
    expect(html).toMatch(/\.\/app\/assets\/[^"]+\.js/);
    expect(html).toMatch(/\.\/app\/assets\/[^"]+\.css/);
  });
});
