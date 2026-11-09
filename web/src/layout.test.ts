import { describe, expect, it } from 'vitest';
import { sizeLabel, arrange, cellOf, chosenIn, findPhoto, place, unplace, dims, photosOf, fits, frameOf, fromPreset, GAP, MOULD, nextUp, PRESETS, lowRes, ppiOf, printsSummary, problem, rectsIn, shoppingList, type Print } from './layout';

const pr = (o: Partial<Print> = {}): Print => ({ id: 1, size: 'A4', orientation: 'portrait', frame: null, photoId: null, stack: false, photoId2: null, x: 0, y: 0, ...o });

describe('wall geometry', () => {
  it('a print is its paper turned the way it hangs, a frame adds its moulding and the frame’s own size', () => {
    expect(dims(pr({ size: 'A4', orientation: 'portrait' }))).toEqual([210, 297]);
    expect(dims(pr({ size: 'A4', orientation: 'landscape' }))).toEqual([297, 210]);
    expect(dims(pr({ size: 'A4', frame: { size: 'A3', mat: 'white', color: 'oak' } }))).toEqual([297 + 2 * MOULD, 420 + 2 * MOULD]);
    expect(dims(pr({ size: 'A4', frame: { size: 'A4', mat: 'white', color: 'none' } }))).toEqual([210, 297]); // no moulding
  });
  it('knows what fits in what, and the next size up', () => {
    expect(fits('A3', 'A4')).toBe(true);
    expect(fits('A4', 'A3')).toBe(false);
    expect(nextUp('A4')).toBe('A3');
    expect(nextUp('8×10″')).toBe('11×14″');
    expect(nextUp('A1')).toBe('A1'); // nothing is bigger, so it stays
  });
  it('a row puts prints side by side with a gap, centred up and down', () => {
    const l = arrange([pr({ size: 'A4' }), pr({ size: 'A3', orientation: 'landscape' })], 'row');
    expect(l[0].x).toBe(0);
    expect(l[1].x).toBe(210 + GAP);
    expect(l[0].y).toBe((Math.max(297, 297) - 297) / 2); // both 297 tall
    expect(l[1].y).toBe(0);
  });
  it('a feature puts the first print large with the rest stacked in a column beside it', () => {
    const l = arrange(fromPreset(PRESETS[3]), 'feature');
    expect(l[1].x).toBeGreaterThan(l[0].x + dims(l[0])[0]);
    expect(l[2].y).toBeGreaterThan(l[1].y);
  });
  it('a grid wraps to the square root of the count, and the wall fits every print', () => {
    const l = arrange(fromPreset(PRESETS[4]), 'grid');
    expect(l.map((p) => [p.x > 0, p.y > 0])).toEqual([[false, false], [true, false], [false, true], [true, true]]);
    const f = frameOf(l, 0);
    for (const r of rectsIn(l, f)) { expect(parseFloat(r.left)).toBeGreaterThanOrEqual(0); expect(parseFloat(r.left) + parseFloat(r.width)).toBeLessThanOrEqual(100.0001); }
  });
});

describe('does a photograph suit a print', () => {
  it('refuses only the wrong way round, with the reason', () => {
    expect(problem({ w: 6000, h: 4000 }, pr({ orientation: 'portrait' }))).toBe('Landscape. This print is portrait.');
    expect(problem({ w: 4000, h: 6000 }, pr({ orientation: 'landscape' }))).toBe('Portrait. This print is landscape.');
    expect(problem({ w: 2400, h: 3600 }, pr({ size: 'A3', orientation: 'portrait' }))).toBeNull(); // too few pixels is a warning, not a refusal
    expect(problem(null, pr())).toBeNull();
  });
  it('warns, rather than refuses, when there are fewer pixels than the sharpness wanted, and says how many pixels per inch it will be', () => {
    expect(lowRes({ w: 2400, h: 3600 }, pr({ size: 'A3', orientation: 'portrait' }))).toBe('2400 × 3600 px is 205 PPI in A3, below the 300 wanted. It may look soft.');
    expect(ppiOf({ w: 2400, h: 3600 }, pr({ size: 'A3', orientation: 'portrait' }))).toBe(205);
    expect(lowRes({ w: 4000, h: 6000 }, pr({ size: 'A3', orientation: 'portrait' }))).toBeNull();
    // the case from real use: 2433 × 3601 px in A4 is 294 PPI, just under 300
    expect(ppiOf({ w: 2433, h: 3601 }, pr({ size: 'A4', orientation: 'portrait' }))).toBe(294);
    expect(lowRes({ w: 2433, h: 3601 }, pr({ size: 'A4', orientation: 'portrait' }))).toMatch(/294 PPI in A4, below the 300 wanted/);
    expect(lowRes({ w: 2433, h: 3601 }, pr({ size: 'A4', orientation: 'portrait' }), 240)).toBeNull(); // fine at the sharpness wanted
    expect(lowRes({ w: 0, h: 0 }, pr())).toBeNull(); // size not known: nothing to say
  });
  it('places a photograph below the sharpness wanted, with a warning', () => {
    const prints = [pr({ size: 'A4', orientation: 'portrait' })];
    const r = place(prints, 0, 7, () => ({ w: 2433, h: 3601 }));
    expect(r.prints?.[0].photoId).toBe(7);
    expect(r.warn).toMatch(/294 PPI/);
    expect(place(prints, 0, 7, () => ({ w: 2433, h: 3601 }), 240).warn).toBe('');
    expect(place(prints, 0, 7, () => ({ w: 3601, h: 2433 })).prints).toBeNull(); // the wrong way round is still refused
  });
});

describe('stacking two photographs in one print', () => {
  it('a portrait stack gives each photograph the top or bottom half, a landscape stack the left or right half', () => {
    expect(cellOf(pr({ size: 'A4', orientation: 'portrait', stack: true }))).toEqual([210, 148.5]);
    expect(cellOf(pr({ size: 'A4', orientation: 'landscape', stack: true }))).toEqual([148.5, 210]);
    expect(cellOf(pr({ size: 'A4', orientation: 'portrait' }))).toEqual([210, 297]);
  });
  it('a portrait stack takes two landscape photographs, a landscape stack two portrait ones', () => {
    const portrait = pr({ size: 'A4', orientation: 'portrait', stack: true }), landscape = pr({ size: 'A4', orientation: 'landscape', stack: true });
    expect(problem({ w: 6000, h: 4000 }, portrait)).toBeNull();
    expect(problem({ w: 4000, h: 6000 }, portrait)).toMatch(/takes two landscape photographs, one above the other/);
    expect(problem({ w: 4000, h: 6000 }, landscape)).toBeNull();
    expect(problem({ w: 6000, h: 4000 }, landscape)).toMatch(/takes two portrait photographs side by side/);
  });
  it('checks the pixels against half the print, so a stack asks for fewer pixels than a whole print', () => {
    expect(lowRes({ w: 2480, h: 1754 }, pr({ size: 'A4', orientation: 'portrait', stack: true }))).toBeNull(); // 210 × 148.5 mm at 300 PPI
    expect(lowRes({ w: 2000, h: 1400 }, pr({ size: 'A4', orientation: 'portrait', stack: true }))).toMatch(/^2000 × 1400 px is 239 PPI in half of A4, below the 300 wanted/);
  });
  it('lists the photographs a print holds, and the second only when stacked', () => {
    expect(photosOf(pr({ photoId: 4 }))).toEqual([4]);
    expect(photosOf(pr({ photoId: 4, stack: true, photoId2: 5 }))).toEqual([4, 5]);
    expect(photosOf(pr({ photoId: 4, stack: false, photoId2: 5 }))).toEqual([4]);
  });
});

describe('the shopping list', () => {
  it('counts frames by size and colour with their mount boards, posters with none, and the prints to order', () => {
    const list = shoppingList([
      pr({ size: 'A4', frame: { size: 'A3', mat: 'ivory', color: 'oak' } }),
      pr({ size: 'A4', frame: { size: 'A3', mat: 'ivory', color: 'oak' } }),
      pr({ size: 'A3', frame: { size: 'A3', mat: 'white', color: 'black' } }),
      pr({ size: 'A5' }),
    ]);
    expect(list.frames.map((f) => [f.qty, f.title])).toEqual([['2 ×', 'A3 frame, oak'], ['1 ×', 'A3 frame, black']]);
    expect(list.frames[0].detail).toBe('Ivory mount board, cut for A4 (opening 205 × 292 mm)');
    expect(list.frames[1].detail).toBe('No mount board. The print fills the frame');
    expect(list.posters).toBe(1);
    expect(list.printsList.map((p) => [p.qty, p.title])).toEqual([['2 ×', 'A4 print'], ['1 ×', 'A3 print'], ['1 ×', 'A5 print']]);
    expect(list.text).toContain('Frames to buy');
    expect(list.text).toContain('1 × poster hanging (no frame)');
  });
  it('summarises the prints', () => {
    expect(printsSummary(fromPreset(PRESETS[3]))).toBe('3 prints · A2, 2 × A5 · 3 framed');
    expect(printsSummary([pr()])).toBe('1 print · A4 · 0 framed');
  });
});

describe('putting photographs in prints', () => {
  const ph: Record<number, { w: number; h: number }> = { 1: { w: 6000, h: 4000 }, 2: { w: 6000, h: 4000 }, 3: { w: 4000, h: 6000 }, 4: { w: 300, h: 200 } };
  const dims = (id: number) => ph[id];
  const land = (o: Partial<Print> = {}) => pr({ size: 'A4', orientation: 'landscape', ...o });

  it('puts a photograph that fits in, and refuses one that does not, saying why', () => {
    expect(place([land(), land({ id: 2 })], 0, 1, dims).prints![0].photoId).toBe(1);
    expect(place([land()], 0, 3, dims)).toMatchObject({ prints: null, note: 'Portrait. This print is landscape.' });
    const tiny = place([land()], 0, 4, dims); // 300 × 200 px is far too few, but that is a warning, not a refusal
    expect(tiny.prints![0].photoId).toBe(4);
    expect(tiny.warn).toMatch(/300 × 200 px is 24 PPI in A4, below the 300 wanted/);
  });
  it('moving a photograph to another print swaps with what was there, when that fits where it goes', () => {
    const r = place([land({ photoId: 1 }), land({ id: 2, photoId: 2 })], 1, 1, dims).prints!;
    expect(r.map((p) => p.photoId)).toEqual([2, 1]);
  });
  it('a stack fills its first place, then its second, and finds and removes a photograph', () => {
    let ps = [land({ stack: true, orientation: 'portrait' })]; // two landscape photographs in a portrait stack
    ps = place(ps, 0, 1, dims).prints!;
    ps = place(ps, 0, 2, dims).prints!;
    expect([ps[0].photoId, ps[0].photoId2]).toEqual([1, 2]);
    expect(chosenIn(ps)).toEqual([1, 2]);
    expect(findPhoto(ps, 2)).toEqual({ index: 0, slot: 1 });
    expect(unplace(ps, 1)[0]).toMatchObject({ photoId: null, photoId2: 2 });
  });
});

describe('sizeLabel', () => {
  it('shows the print size, and the frame size when framed', () => {
    expect(sizeLabel(pr({ size: 'A3' }))).toBe('A3 Print');
    expect(sizeLabel(pr({ size: 'A3', frame: { size: 'A2', mat: 'white', color: 'black' } }))).toBe('A3 Print | A2 Frame');
  });
});
