import { expect, it } from 'vitest';
import { buildTasks } from './todoTasks';
import { todoDestination } from './components/TodoNav';

it('sends links to their own page and everything else to the one-at-a-time view', () => {
  expect(todoDestination({ key: 'cloud', count: 1, link: '/settings?section=cloud' })).toBe('/settings?section=cloud');
  expect(todoDestination({ key: 'tags', count: 2 })).toBe('/todo');
});

it('shows a photograph only for its most important task, and removal outranks the rest', () => {
  const t = buildTasks([
    { key: 'delete', count: 1, ids: [1] }, { key: 'ai-tags', count: 2, ids: [1, 2] }, { key: 'subjects', count: 2, ids: [2, 3] },
    { key: 'place', count: 1, ids: [3] }, { key: 'lens', count: 1, ids: [4] }, { key: 'camera', count: 1, ids: [4] },
  ]);
  expect(t.byPhoto.get(1)).toEqual(['delete', 'ai-tags']);
  expect(t.queue('all')).toEqual([1, 2, 3, 4]);
  expect(t.queue('ai-tags')).toEqual([2]); // photo 1 waits on removal first
  expect(t.queue('tags')).toEqual([3]);
  expect(t.rows.map((r) => `${r.key}:${r.n}`)).toEqual(['delete:1', 'ai-tags:1', 'tags:1', 'camera:1']);
});
