import { expect, it } from 'vitest';
import { printedPages, spreadsOf } from './Zines';

it('lays pages out as the cover alone, facing pairs, and the back cover alone', () => {
  const printed = printedPages([{ layout: 'one', photos: [1] }, { layout: 'two', photos: [1, 2] }, { layout: 'spread', photos: [3] }]);
  expect(printed.map((p) => p.layout)).toEqual(['one', 'two', 'blank', 'left', 'right', 'blank', 'blank', 'blank']);
  expect(spreadsOf(printed)).toEqual([[null, 0], [1, 2], [3, 4], [5, 6], [7, null]]);
  expect(spreadsOf([])).toEqual([]);
});
