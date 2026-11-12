import { afterEach, describe, expect, it, vi } from 'vitest';
import { newSharePin } from './sharePin';

afterEach(() => vi.unstubAllGlobals());
describe('share PIN generation', () => {
  it('rejects out-of-range values and weak PINs, retaining leading zeroes', () => {
    const draws = [65535, 10000, 9999, 1234, 9876, 72];
    const random = vi.fn((values: Uint16Array) => {
      const next = draws.shift();
      if (next === undefined) throw new Error('Unexpected additional random draw');
      values[0] = next; return values;
    });
    vi.stubGlobal('crypto', { getRandomValues: random });
    expect(newSharePin()).toBe('0072');
    expect(draws).toHaveLength(0);
  });
});
