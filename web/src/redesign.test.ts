import { describe, expect, it } from 'vitest';
import { optionsFor, wallFromRects } from './components/NewComposition';
import { stepOf } from './components/Shell';
import { greetingFor } from './pages/Today';
import { seasonOf } from './season';

describe('greeting', () => {
  it('follows the device clock: before 5 up late, before 12 morning, before 17 afternoon, else evening', () => {
    expect([0, 4, 5, 11, 12, 16, 17, 23].map(greetingFor)).toEqual(['Up late', 'Up late', 'Good morning', 'Good morning', 'Good afternoon', 'Good afternoon', 'Good evening', 'Good evening']);
  });
});

describe('workflow steps', () => {
  it('highlights Upload for photoshoots and Compose for the library, compositions and the editor', () => {
    expect(stepOf('/shoots')).toBe(1);
    expect(stepOf('/shoots/4')).toBe(1);
    expect(stepOf('/library')).toBe(2);
    expect(stepOf('/collections')).toBe(2);
    expect(stepOf('/collections/9')).toBe(2);
    expect(stepOf('/')).toBe(0);
    expect(stepOf('/settings')).toBe(0);
  });
});

describe('seasons', () => {
  it('flips between hemispheres', () => {
    expect(seasonOf(1, 'north')).toBe('winter');
    expect(seasonOf(1, 'south')).toBe('summer');
    expect(seasonOf(10, 'north')).toBe('autumn');
    expect(seasonOf(10, 'south')).toBe('spring');
  });
});

describe('new composition layouts', () => {
  it('offers four options for 1 to 6 prints and a row only for 7 to 12', () => {
    for (let n = 1; n <= 6; n++) expect(optionsFor(n), `n=${n}`).toHaveLength(4);
    for (let n = 7; n <= 12; n++) { const o = optionsFor(n); expect(o).toHaveLength(1); expect(o[0].mode).toBe('row'); expect(o[0].prints).toHaveLength(n); }
  });
  it('gives each option the right number of prints, and four prints a grid that is not a row', () => {
    for (let n = 1; n <= 12; n++) for (const o of optionsFor(n)) expect(o.prints, `${o.key}`).toHaveLength(n);
    expect(optionsFor(4).some((o) => o.mode === 'grid')).toBe(true);
  });
  it('builds the wall as drawn: each rectangle becomes a print of the closest size, in the right shape and place', () => {
    const c = optionsFor(3).find((o) => o.label === 'Centre feature')!;
    const w = wallFromRects(c.rects);
    expect(w).toHaveLength(3);
    expect(w[1].size > w[0].size || w[1].size === 'A3').toBe(true); // the middle one is the big one
    expect(w.every((p) => p.orientation === 'portrait')).toBe(true);
    expect(w[0].x).toBeLessThan(w[1].x);
    expect(w[1].x).toBeLessThan(w[2].x);
    const landscape = wallFromRects(optionsFor(1).find((o) => o.label === 'Panorama')!.rects);
    expect(landscape[0].orientation).toBe('landscape');
  });
});
