import { describe, expect, it } from 'vitest';
import { deriveNudge } from './ideaNudges.js';

const NOW = new Date('2026-08-10T12:00:00Z');
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 24 * 60 * 60 * 1000).toISOString();

describe('deriveNudge', () => {
  it('never nudges a done or archived idea', () => {
    expect(deriveNudge({ status: 'done', photoCount: 0, createdAt: daysAgo(30), lastActivity: null }, NOW)).toBeNull();
    expect(deriveNudge({ status: 'archived', photoCount: 0, createdAt: daysAgo(30), lastActivity: null }, NOW)).toBeNull();
  });

  it('does not nudge a fresh empty idea', () => {
    expect(deriveNudge({ status: 'active', photoCount: 0, createdAt: daysAgo(2), lastActivity: null }, NOW)).toBeNull();
  });

  it('nudges an empty idea after a week with no frames', () => {
    const nudge = deriveNudge({ status: 'active', photoCount: 0, createdAt: daysAgo(10), lastActivity: null }, NOW);
    expect(nudge).toMatchObject({ type: 'idle_idea' });
  });

  it('does not nudge an active idea with recent activity', () => {
    expect(
      deriveNudge({ status: 'active', photoCount: 3, createdAt: daysAgo(20), lastActivity: daysAgo(1) }, NOW)
    ).toBeNull();
  });

  it('nudges a stalled idea with no activity in two weeks', () => {
    const nudge = deriveNudge({ status: 'active', photoCount: 3, createdAt: daysAgo(30), lastActivity: daysAgo(20) }, NOW);
    expect(nudge).toMatchObject({ type: 'stalled' });
  });

  it('nudges ready_to_finish once frame count is high, even if also technically stalled', () => {
    const nudge = deriveNudge({ status: 'active', photoCount: 9, createdAt: daysAgo(40), lastActivity: daysAgo(25) }, NOW);
    expect(nudge).toMatchObject({ type: 'ready_to_finish' });
  });
});
