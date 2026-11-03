import { describe, expect, it } from 'vitest';
import { nextIntervalDays } from './schedule.js';

const S = { sessions: 6, intervals: ['1 day', '1 week', '1 month', '3 months', '6 months', '1 year'], adaptive: true };

describe('nextIntervalDays', () => {
  it('uses the interval for the session just finished', () => {
    expect(nextIntervalDays(S, [3])).toBe(1);
    expect(nextIntervalDays({ ...S, adaptive: false }, [3, 3])).toBe(7);
  });
  it('is complete after the last session', () => {
    expect(nextIntervalDays(S, [3, 3, 3, 3, 3, 3])).toBeNull();
  });
  it('lengthens for steady ratings and shortens for scattered ones', () => {
    expect(nextIntervalDays(S, [4, 4])).toBe(11); // 7 × 1.5
    expect(nextIntervalDays(S, [1, 5])).toBe(4); // 7 × 0.5
  });
  it('is off when adaptive is disabled', () => {
    expect(nextIntervalDays({ ...S, adaptive: false }, [4, 4])).toBe(7);
  });
});
