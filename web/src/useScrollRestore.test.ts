import { afterEach, describe, expect, it, vi } from 'vitest';
import { rememberScroll, takeScroll } from './useScrollRestore';

describe('scroll position kept for Back', () => {
  const store = new Map<string, string>();
  vi.stubGlobal('sessionStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) });
  afterEach(() => store.clear());

  it('gives back where a history entry was scrolled to, once', () => {
    rememberScroll('abc', 1500.4);
    expect(takeScroll('other')).toBe(0);
    expect(takeScroll('abc')).toBe(1500);
    // A later, fresh visit that happens to get the same key (the first page of a visit is always "default") opens at the top.
    expect(takeScroll('abc')).toBe(0);
  });
  it('opens at the top when the browser blocks storage', () => {
    vi.stubGlobal('sessionStorage', { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); }, removeItem: () => {} });
    expect(() => rememberScroll('abc', 10)).not.toThrow();
    expect(takeScroll('abc')).toBe(0);
  });
});
