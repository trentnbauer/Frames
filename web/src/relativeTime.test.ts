import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { relativeTime } from './relativeTime.js';

const NOW = new Date('2026-08-10T12:00:00Z');

function isoMinutesAgo(minutes: number): string {
  const d = new Date(NOW.getTime() - minutes * 60000);
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

describe('relativeTime', () => {
  beforeEach(() => vi.setSystemTime(NOW));
  afterEach(() => vi.useRealTimers());

  it('reports "just now" for the current moment', () => {
    expect(relativeTime(isoMinutesAgo(0))).toBe('just now');
  });

  it('reports minutes for under an hour', () => {
    expect(relativeTime(isoMinutesAgo(5))).toBe('5 min ago');
  });

  it('reports singular hour correctly', () => {
    expect(relativeTime(isoMinutesAgo(60))).toBe('1 hour ago');
  });

  it('reports plural hours', () => {
    expect(relativeTime(isoMinutesAgo(180))).toBe('3 hours ago');
  });

  it('reports singular day correctly', () => {
    expect(relativeTime(isoMinutesAgo(60 * 24))).toBe('1 day ago');
  });

  it('reports weeks once past 7 days', () => {
    expect(relativeTime(isoMinutesAgo(60 * 24 * 10))).toBe('1 week ago');
  });

  it('reports months once past ~5 weeks', () => {
    expect(relativeTime(isoMinutesAgo(60 * 24 * 60))).toBe('2 months ago');
  });
});
