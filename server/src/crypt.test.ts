import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { keyFor, seal, unseal } from './crypt.js';
import { getSetting, openDb, setSetting } from './db.js';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'frames-crypt-'));
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));
afterEach(() => { delete process.env.FRAMES_SECRET_KEY; });
const SECRET = 'sk-live-' + Buffer.from('crypt-test').toString('hex');
const raw = (dir: string, key: string) => (new Database(path.join(dir, 'frames.db'), { readonly: true }).prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined)?.value;

describe('secrets at rest', () => {
  it('seals and opens a value, never twice the same, and refuses a wrong key', () => {
    const k = keyFor(path.join(tmp, 'k1'));
    const a = seal(k, SECRET), b = seal(k, SECRET);
    expect(a).not.toBe(b); // a fresh nonce each time
    expect(a).not.toContain(SECRET);
    expect(unseal(k, a)).toBe(SECRET);
    expect(unseal(keyFor(path.join(tmp, 'k2')), a)).toBe(''); // another key cannot read it
    expect(unseal(k, SECRET)).toBe(SECRET); // plain text from before encryption still reads
  });
  it('writes a secret setting encrypted, reads it back, and leaves other settings readable', () => {
    const dir = path.join(tmp, 'a');
    const db = openDb(dir);
    setSetting(db, 'secret:ai:one:key', SECRET);
    setSetting(db, 'portfolio', { tagline: 'visible' });
    expect(raw(dir, 'secret:ai:one:key')).not.toContain(SECRET);
    expect(raw(dir, 'secret:ai:one:key')).toContain('enc:v1:');
    expect(raw(dir, 'portfolio')).toContain('visible');
    expect(getSetting(db, 'secret:ai:one:key', '')).toBe(SECRET);
    setSetting(db, 'secret:ai:one:key', ''); // an emptied secret stays empty
    expect(getSetting(db, 'secret:ai:one:key', 'x')).toBe('');
    expect(fs.statSync(path.join(dir, 'secret.key')).mode & 0o077).toBe(0); // the key file is for Frames' user only
  });
  it('encrypts secrets saved in plain text by an earlier version, the next time the database is opened', () => {
    const dir = path.join(tmp, 'b');
    openDb(dir).close();
    const plain = new Database(path.join(dir, 'frames.db'));
    plain.prepare("INSERT INTO settings(key, value) VALUES('secret:cloud:tok:abc', ?)").run(JSON.stringify(SECRET));
    plain.close();
    expect(raw(dir, 'secret:cloud:tok:abc')).toContain(SECRET);
    const db = openDb(dir);
    expect(raw(dir, 'secret:cloud:tok:abc')).not.toContain(SECRET);
    expect(getSetting(db, 'secret:cloud:tok:abc', '')).toBe(SECRET);
  });
  it('uses FRAMES_SECRET_KEY when it is set, so the data folder alone cannot read them, and gives back nothing for another key', () => {
    process.env.FRAMES_SECRET_KEY = 'a long enough secret key for the test';
    const dir = path.join(tmp, 'c');
    const db = openDb(dir);
    setSetting(db, 'secret:oauth:g', SECRET);
    expect(fs.existsSync(path.join(dir, 'secret.key'))).toBe(false); // no key file next to the data
    expect(getSetting(db, 'secret:oauth:g', '')).toBe(SECRET);
    db.close();
    process.env.FRAMES_SECRET_KEY = 'a different key, also long enough';
    expect(getSetting(openDb(dir), 'secret:oauth:g', 'fallback')).toBe(''); // not readable: enter it again
    process.env.FRAMES_SECRET_KEY = 'short';
    expect(() => keyFor(path.join(tmp, 'd'))).toThrow(/at least 16/);
  });
});
