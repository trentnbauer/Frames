import { describe, expect, it } from 'vitest';
import { cleanEntries, unseen } from './useChangelog';

const e = (n: number, url = `https://github.com/o/r/pull/${n}`) => ({ number: n, title: `PR ${n}`, url, mergedAt: '2026-01-01T00:00:00Z' });

describe('changelog', () => {
  it('shows nothing on the very first visit, which becomes the baseline', () => {
    expect(unseen([e(1), e(2)], null)).toEqual([]);
  });
  it('shows what has appeared since last time, even when pull requests merged out of order', () => {
    expect(unseen([e(5), e(3), e(4)], new Set([3, 5])).map((x) => x.number)).toEqual([4]);
    expect(unseen([e(1)], new Set([1]))).toEqual([]);
  });
  it('keeps only well-formed entries that link to https pages', () => {
    expect(cleanEntries([e(1), e(2, 'javascript:alert(1)'), e(3, 'http://x'), { number: 'x' }, null, 'junk'])).toEqual([e(1)]);
    expect(cleanEntries({ not: 'a list' })).toEqual([]);
  });
});
