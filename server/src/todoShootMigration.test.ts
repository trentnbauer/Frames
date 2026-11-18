import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { migrate } from './db.js';
import { loadSettings } from './settings.js';

describe('To do’s Shoot reason', () => {
  it('stays on for a library that chose its reasons before it existed, and is on by default for a new one', () => {
    const fresh = new Database(':memory:');
    migrate(fresh);
    expect(loadSettings(fresh as any).todoReasons).toContain('shoot');
    const old = new Database(':memory:');
    migrate(old);
    old.prepare("INSERT OR REPLACE INTO settings(key, value) VALUES('settings', ?)").run(JSON.stringify({ todoReasons: ['camera', 'tags'] }));
    old.pragma(`user_version = ${Number(old.pragma('user_version', { simple: true })) - 3}`); // that migration and the photo-rotation and subjects ones after it
    migrate(old);
    expect(loadSettings(old as any).todoReasons).toEqual(['shoot', 'camera', 'tags']);
  });
});
