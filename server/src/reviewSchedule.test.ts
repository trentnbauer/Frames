import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { openDb, setSetting } from './db.js';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'frames-rs-'));
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe('photographs nobody has reviewed yet', () => {
  it('are counted as reviewed when they were added, and first come up one interval later (existing libraries are moved once)', () => {
    const dir = path.join(tmp, 'a');
    const db = openDb(dir);
    db.prepare("INSERT INTO shoots(name, source, imported_at) VALUES('s', 'x', '2026-01-01T00:00:00.000Z')").run();
    const add = (file: string, added: string, next: string) => db.prepare("INSERT INTO photos(shoot_id, path, file, hash, title, file_type, size_bytes, added_at, next_review_at) VALUES(1, ?, ?, ?, ?, 'JPG', 1, ?, ?)").run('/p/' + file, file, file, file, added, next);
    add('unreviewed.jpg', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'); // due the moment it was added: the old way
    add('reviewed.jpg', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
    add('asked-again.jpg', '2026-01-01T00:00:00.000Z', '2026-03-05T10:00:00.000Z'); // "review again" set a date by hand
    db.prepare("INSERT INTO reviews(photo_id, session, run_id, date, rating) VALUES(2, 1, 'r', '2026-01-02T00:00:00.000Z', 4)").run();
    setSetting(db, 'settings', { intervals: ['1 month', '3 months'] });
    const v = db.pragma('user_version', { simple: true }) as number;
    db.pragma(`user_version = ${v - 6}`); // so the review step (and the steps after it, which can repeat) runs again
    db.close();
    const again = openDb(dir);
    const next = (f: string) => (again.prepare('SELECT next_review_at n FROM photos WHERE file = ?').get(f) as { n: string }).n;
    expect(next('unreviewed.jpg')).toBe('2026-01-31T00:00:00.000Z'); // added + the first interval (a month, as set)
    expect(next('reviewed.jpg')).toBe('2026-01-01T00:00:00.000Z'); // reviewed: left alone
    expect(next('asked-again.jpg')).toBe('2026-03-05T10:00:00.000Z'); // a date someone chose: left alone
    again.close();
  });
});
