import { afterEach, describe, expect, it, vi } from 'vitest';
import { libraryReturn, setLibraryReturn } from './photoWalk';

describe('libraryReturn', () => {
  const store = new Map<string, string>();
  vi.stubGlobal('sessionStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) });
  afterEach(() => store.clear());

  it('goes back to the Library with the search and filters it was showing', () => {
    expect(libraryReturn()).toBe('/library');
    setLibraryReturn('view=photos&find=srt+101');
    expect(libraryReturn()).toBe('/library?view=photos&find=srt+101');
    setLibraryReturn('');
    expect(libraryReturn()).toBe('/library');
  });
});
