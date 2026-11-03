import { describe, expect, it } from 'vitest';
import { requiredPx, targetProblem } from './data';

const A3_PORTRAIT = { count: 3, size: 'A3', orientation: 'portrait', ppi: 300 } as const;

describe('print target', () => {
  it('A3 at 300 PPI needs 3508 × 4961 px', () => {
    expect(requiredPx('A3', 300)).toEqual([3508, 4961]);
  });
  it('flags landscape against a portrait target', () => {
    expect(targetProblem({ w: 6000, h: 4000 }, A3_PORTRAIT)).toBe('Landscape. Target is portrait.');
  });
  it('flags too few pixels with the exact requirement', () => {
    expect(targetProblem({ w: 2848, h: 4272 }, A3_PORTRAIT)).toBe(
      '2848 × 4272 px. A3 at 300 PPI needs 3508 × 4961.',
    );
  });
  it('passes a large portrait and a null target', () => {
    expect(targetProblem({ w: 4000, h: 6000 }, A3_PORTRAIT)).toBeNull();
    expect(targetProblem({ w: 10, h: 10 }, null)).toBeNull();
  });
});
