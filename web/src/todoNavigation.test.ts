import { expect, it } from 'vitest';
import { todoDestination } from './components/TodoNav';
it('opens the matching task instead of the unfiltered To do queue', () => {
 for (const key of ['camera', 'lens', 'tags', 'subjects', 'composition']) expect(todoDestination({key, count:2})).toBe(`/todo?reason=${key}`);
 expect(todoDestination({key:'place',count:1})).toBe('/todo?reason=location');
 expect(todoDestination({key:'delete',count:1})).toBe('/removals');
 expect(todoDestination({key:'ai-tags',count:1,ids:[42]})).toBe('/photo/42?todo=ai-tags');
 expect(todoDestination({key:'cloud',count:1,link:'/settings?section=cloud'})).toBe('/settings?section=cloud');
});
