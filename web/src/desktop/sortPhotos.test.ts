import { describe, expect, it } from 'vitest';
import type { PhotoLite } from '../data';
import { sortPhotos } from './LibraryPage';

const p = (id: number, o: Partial<PhotoLite>) => ({ id, addedAt: '', capturedAt: null, dateEdit: null, reviewCount: 0, avgRating: 0, ...o }) as PhotoLite;
const ids = (ps: PhotoLite[]) => ps.map((x) => x.id);
const list = [
  p(1, { addedAt: '2026-01-02', capturedAt: '2020-05-01', reviewCount: 2, avgRating: 3 }),
  p(2, { addedAt: '2026-03-01', capturedAt: null, reviewCount: 0 }),
  p(3, { addedAt: '2026-02-01', capturedAt: '2019-01-01', dateEdit: '2024-06-01', reviewCount: 1, avgRating: 5 }),
];

describe('the Library’s Sort by', () => {
  it('sorts by upload or taken date, newest or oldest, with undated photographs last', () => {
    expect(ids(sortPhotos(list, 'added'))).toEqual([2, 3, 1]);
    expect(ids(sortPhotos(list, 'added-old'))).toEqual([1, 3, 2]);
    expect(ids(sortPhotos(list, 'taken'))).toEqual([3, 1, 2]); // a date set by hand wins over the camera's
    expect(ids(sortPhotos(list, 'taken-old'))).toEqual([1, 3, 2]);
  });
  it('sorts by score either way with unrated photographs last, and keeps the given order for best match', () => {
    expect(ids(sortPhotos(list, 'score'))).toEqual([3, 1, 2]);
    expect(ids(sortPhotos(list, 'score-low'))).toEqual([1, 3, 2]);
    expect(ids(sortPhotos(list, 'match'))).toEqual([1, 2, 3]);
  });
});
