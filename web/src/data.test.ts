import { describe, expect, it } from 'vitest';
import { checkTarget, fmtCoord, parseTarget, printRatio, requiredPx } from './data';

const t = (o: object) => parseTarget({ size: 'none', orientation: 'any', ppi: 300, count: 1, ...o })!;

describe('print target', () => {
  it('A3 at 300 PPI needs 3508 × 4961 px', () => {
    expect(requiredPx(t({ size: 'A3' }))).toEqual([3508, 4961]);
  });
  it('explains orientation, size, minimum pixels and aspect failures in plain words', () => {
    expect(checkTarget({ w: 6000, h: 4000 }, t({ size: 'A3', orientation: 'portrait' })).problem).toBe('Landscape. Target is portrait.');
    expect(checkTarget({ w: 2848, h: 4272 }, t({ size: 'A3', orientation: 'portrait' })).problem).toBe('2848 × 4272 px. A3 at 300 PPI needs 3508 × 4961.');
    expect(checkTarget({ w: 3000, h: 2000 }, t({ minWidth: 4000, minHeight: 3000 })).problem).toBe('3000 × 2000 px. Needs at least 4000 × 3000 px.');
    expect(checkTarget({ w: 4000, h: 3000 }, t({ aspect: '3:2', aspectMode: 'required' })).problem).toMatch(/Target is 3:2/);
  });
  it('treats a preferred aspect ratio as advice, not a failure', () => {
    const r = checkTarget({ w: 4000, h: 3000 }, t({ aspect: '3:2', aspectMode: 'preferred' }));
    expect(r.problem).toBeNull();
    expect(r.note).toMatch(/cropping/);
  });
  it('passes a large enough photo, a null target, and refuses to guess when the size is unknown', () => {
    expect(checkTarget({ w: 4000, h: 6000 }, t({ size: 'A3', orientation: 'portrait' })).problem).toBeNull();
    expect(checkTarget({ w: 10, h: 10 }, null).problem).toBeNull();
    expect(checkTarget({ w: 0, h: 0 }, t({ size: 'A3' })).problem).toBe('Pixel size unknown.');
  });
});

describe('the shape of a print slot', () => {
  it('follows the paper and the orientation', () => {
    expect(printRatio(t({ size: 'A4', orientation: 'landscape' }))).toBeCloseTo(297 / 210, 3);
    expect(printRatio(t({ size: 'A4', orientation: 'portrait' }))).toBeCloseTo(210 / 297, 3);
    expect(printRatio(t({ size: 'custom', widthMm: 200, heightMm: 300, orientation: 'portrait' }))).toBeCloseTo(2 / 3, 3);
  });
  it('with no orientation follows the photograph in the slot, and is landscape when empty', () => {
    expect(printRatio(t({ size: 'A3' }))).toBeGreaterThan(1);
    expect(printRatio(t({ size: 'A3' }), { w: 2000, h: 3000 })).toBeLessThan(1);
    expect(printRatio(t({ size: 'A3' }), { w: 3000, h: 2000 })).toBeGreaterThan(1);
  });
  it('uses the aspect ratio, or the minimum pixels, when there is no paper, and 3:2 when there is nothing', () => {
    expect(printRatio(t({ aspect: '4:5', orientation: 'portrait' }))).toBeCloseTo(0.8, 3);
    expect(printRatio(t({ minWidth: 4000, minHeight: 3000 }))).toBeCloseTo(4 / 3, 3);
    expect(printRatio(t({}))).toBeCloseTo(1.5, 3);
  });
});

describe('formatting', () => {
  it('writes GPS coordinates with hemispheres', () => {
    expect(fmtCoord(-33.8567, 151.2153)).toBe('33.8567°S, 151.2153°E');
  });
});
