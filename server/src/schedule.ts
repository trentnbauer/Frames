export type ReviewSettings = { sessions: number; intervals: string[]; adaptive: boolean };

const DAYS: Record<string, number> = { '1 day': 1, '1 week': 7, '1 month': 30, '3 months': 90, '6 months': 182, '1 year': 365 };
export const INTERVAL_OPTIONS = Object.keys(DAYS);

/**
 * Days until the next review after `ratings.length` sessions are done, or null when all sessions are complete.
 * Adaptive mode: steady ratings are seen less often, scattered ratings more often.
 */
export function nextIntervalDays(s: ReviewSettings, ratings: number[]): number | null {
  const done = ratings.length;
  if (done === 0) return 0;
  if (done >= s.sessions) return null;
  const label = s.intervals[Math.min(done - 1, s.intervals.length - 1)];
  let days = DAYS[label] ?? 30;
  if (s.adaptive && done >= 2) {
    const last = ratings.slice(-3);
    const spread = Math.max(...last) - Math.min(...last);
    if (spread === 0) days *= 1.5;
    else if (spread >= 2) days *= 0.5;
  }
  return Math.max(1, Math.round(days));
}

export const addDays = (from: Date, days: number) => new Date(from.getTime() + days * 86_400_000);
