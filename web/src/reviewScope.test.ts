import { describe, expect, it } from 'vitest';
import { reviewRequest, reviewUrl } from './reviewScope';

describe('review selection across navigation', () => {
  it('carries the selected photos into the request made by the review screen', () => {
    const url = reviewUrl([7, 12]);
    expect(reviewRequest(new URL(url, 'http://localhost').search)).toEqual({ photoIds: [7, 12] });
  });

  it('keeps an empty photoshoot selection empty instead of starting a library review', () => {
    const url = reviewUrl([]);
    expect(reviewRequest(new URL(url, 'http://localhost').search)).toEqual({ photoIds: [] });
  });

  it('never broadens a malformed selection to the library, even with early set', () => {
    expect(reviewRequest('?ids=bad,0,-1,1.5&early')).toEqual({ photoIds: [] });
  });

  it('preserves normal and early library review entry points', () => {
    expect(reviewRequest('')).toEqual({ early: false });
    expect(reviewRequest('?early')).toEqual({ early: true });
  });
});
