import { expect, it } from 'vitest';
import { fillInOrder, fitTo, printedPages, spreadsOf, stackPair } from './Zines';

it('lays pages out as the cover alone, facing pairs, and the back cover alone', () => {
  const printed = printedPages([{ layout: 'one', photos: [1] }, { layout: 'two', photos: [1, 2] }, { layout: 'spread', photos: [3] }]);
  expect(printed.map((p) => p.layout)).toEqual(['one', 'two', 'blank', 'left', 'right', 'blank', 'blank', 'blank']);
  expect(spreadsOf(printed)).toEqual([[null, 0], [1, 2], [3, 4], [5, 6], [7, null]]);
  expect(spreadsOf([])).toEqual([]);
});

it('keeps a zine with a set length at exactly that many pages', () => {
  const one = (id: number | null) => ({ layout: 'one' as const, photos: [id] });
  expect(printedPages(fitTo([one(1)], 8)).length).toBe(8);
  expect(fitTo([one(1)], 8)).toHaveLength(8);
  const long = [...Array(7).fill(one(null)), { layout: 'spread' as const, photos: [2] }];
  expect(printedPages(fitTo(long, 8), 8)).toHaveLength(8);
  expect(fitTo(long, 8).some((p) => p.layout === 'spread')).toBe(false);
  expect(printedPages(fitTo(long, 16), 16).map((p) => p.layout).slice(7, 9)).toEqual(['left', 'right']);
});

it('runs a carousel as a row of slides: no cover, no blank before a spread, no padding', () => {
  const pages = [{ layout: 'one' as const, photos: [1] }, { layout: 'spread' as const, photos: [2] }];
  expect(printedPages(pages, 0, 'carousel').map((p) => p.layout)).toEqual(['one', 'left', 'right']);
  expect(printedPages(pages).map((p) => p.layout)).toEqual(['one', 'left', 'right', 'blank']);
});

it('stacks two landscapes and puts two portraits side by side, as the server does', () => {
  expect(stackPair(1.5, 1.5, 4 / 5, 5)).toBe(true);
  expect(stackPair(2 / 3, 2 / 3, 4 / 5, 5)).toBe(false);
});

it('fills empty slots in candidate order, skipping placed photos, and keeps text and arrangement', () => {
  const pages = [{ layout: 'one' as const, photos: [1] }, { layout: 'three' as const, photos: [null, null, null], arrange: 'landscape-top' as const }, { layout: 'one' as const, photos: [null], text: { on: true, body: 'Hi', pos: 'top' as const, font: 'serif' as const } }];
  const r = fillInOrder(pages, [1, 2, 3, 4, 5], 'zine');
  expect(r.placed).toBe(4);
  expect(r.pages.map((p) => p.photos)).toEqual([[1], [2, 3, 4], [5]]);
  expect(r.pages[1].arrange).toBe('landscape-top');
  expect(r.pages[2].text?.body).toBe('Hi');
});

it('adds a slide a photo to a carousel, up to 20', () => {
  const r = fillInOrder([], Array.from({ length: 25 }, (_, i) => i + 1), 'carousel');
  expect(r.pages).toHaveLength(20);
  expect(r.placed).toBe(20);
});

it('lays a notebook out a pair of pages an entry, the note facing the photo, and fills it a page a photo', () => {
  const pages = [{ layout: 'one' as const, photos: [1] }, { layout: 'one' as const, photos: [null] }];
  expect(printedPages(pages, 0, 'notebook').map((p) => [p.layout, p.entry])).toEqual([['note', 0], ['photo', 0], ['note', 1], ['photo', 1]]);
  const r = fillInOrder(pages, [1, 2, 3, 4], 'notebook');
  expect(r.placed).toBe(3);
  expect(r.pages.map((p) => p.photos[0])).toEqual([1, 2, 3, 4]);
});
