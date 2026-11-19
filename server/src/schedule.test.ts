import Database from 'better-sqlite3';
import { getSetting, migrate, setSetting } from './db.js';
import { DEFAULT_SETTINGS, loadSettings } from './settings.js';
import { describe, expect, it } from 'vitest';
import { nextIntervalDays } from './schedule.js';

const S = { sessions: 6, intervals: ['1 day', '1 week', '1 month', '3 months', '6 months', '1 year'], adaptive: true };

describe('nextIntervalDays', () => {
  it('uses the interval for the session just finished', () => {
    expect(nextIntervalDays(S, [3])).toBe(1);
    expect(nextIntervalDays({ ...S, adaptive: false }, [3, 3])).toBe(7);
  });
  it('can be instant, however steady the ratings', () => {
    expect(nextIntervalDays({ ...S, intervals: ['Instant'] }, [4])).toBe(0);
    expect(nextIntervalDays({ ...S, intervals: ['Instant'] }, [4, 4, 4])).toBe(0);
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

describe('the default schedule', () => {
  it('reviews a photograph seven times at widening gaps, then done', () => {
    const d = { ...DEFAULT_SETTINGS, adaptive: false };
    expect(d.sessions).toBe(7);
    expect(d.intervals).toEqual(['Instant', '1 day', '3 days', '1 week', '1 week', '1 month', '6 months']);
    expect([0, 1, 2, 3, 4, 5, 6].map((n) => nextIntervalDays(d, Array(n).fill(3)))).toEqual([0, 0, 1, 3, 7, 7, 30]);
    expect(nextIntervalDays(d, Array(7).fill(3))).toBeNull(); // all seven sessions done
  });
  it('gives the new schedule to a new library but keeps the old one for a library that already has photographs', () => {
    const fresh = new Database(':memory:');
    migrate(fresh);
    expect(loadSettings(fresh).sessions).toBe(7);
    // The schedule migration is fifth from last; the four after it (private shoots, To do's Shoot reason, photo rotation, camera tags) are safe to run again.
    const rerunLast = (db: Database.Database) => { db.pragma(`user_version = ${Number(db.pragma('user_version', { simple: true })) - 8}`); migrate(db); };
    const old = new Database(':memory:');
    migrate(old);
    old.prepare("INSERT INTO shoots(id, name, imported_at) VALUES(1, 's', '2026-01-01')").run();
    old.prepare("INSERT INTO photos(id, shoot_id, path, file, hash, title, file_type, size_bytes, added_at) VALUES(1, 1, 'a.jpg', 'a.jpg', 'h', 'a', 'jpg', 1, '2026-01-01')").run();
    rerunLast(old);
    expect(loadSettings(old)).toMatchObject({ sessions: 4, intervals: ['1 week', '1 week', '1 week', '1 week'] });
    const chosen = new Database(':memory:');
    migrate(chosen);
    chosen.prepare("INSERT INTO shoots(id, name, imported_at) VALUES(1, 's', '2026-01-01')").run();
    chosen.prepare("INSERT INTO photos(id, shoot_id, path, file, hash, title, file_type, size_bytes, added_at) VALUES(1, 1, 'a.jpg', 'a.jpg', 'h', 'a', 'jpg', 1, '2026-01-01')").run();
    setSetting(chosen, 'settings', { sessions: 2, intervals: ['1 day'] });
    rerunLast(chosen);
    expect(getSetting(chosen, 'settings', {})).toMatchObject({ sessions: 2, intervals: ['1 day'] }); // a schedule the person chose is never replaced
  });
});
