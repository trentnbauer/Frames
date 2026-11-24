import { describe, expect, it } from 'vitest';
import { listOrder } from './screens/Compositions';

describe('Compositions list order', () => {
  const items = [{ id: 1, updatedAt: '2026-03-01' }, { id: 3, updatedAt: '2026-01-01' }, { id: 2, updatedAt: '2026-02-01' }];
  const ids = (created: boolean, asc: boolean) => [...items].sort(listOrder(created, asc)).map((i) => i.id);
  it('sorts Created by id and Updated by date, newest first unless reversed', () => {
    expect(ids(true, false)).toEqual([3, 2, 1]);
    expect(ids(true, true)).toEqual([1, 2, 3]);
    expect(ids(false, false)).toEqual([1, 2, 3]);
    expect(ids(false, true)).toEqual([3, 2, 1]);
  });
});
