import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { splitNames } from './ai.js';
import { migrate, openDb } from './db.js';

describe('tags from the AI', () => {
  it('a list stays a list, and a name of up to three words stays whole', () => {
    expect(splitNames(['dog', 'golden hour', 'Nature'])).toEqual(['dog', 'golden hour', 'Nature']);
    expect(splitNames('dog, golden hour; forest\nnature')).toEqual(['dog', 'golden hour', 'forest', 'nature']);
  });
  it('a list run together into one entry becomes one tag each', () => {
    expect(splitNames(['dog sign signpost forest nature'])).toEqual(['dog', 'sign', 'signpost', 'forest', 'nature']);
    expect(splitNames('dog sign signpost forest nature')).toEqual(['dog', 'sign', 'signpost', 'forest', 'nature']);
    expect(splitNames(['dog sign signpost forest nature', 'moody'])).toEqual(['dog', 'sign', 'signpost', 'forest', 'nature', 'moody']);
    expect(splitNames(null)).toEqual([]);
  });
});

describe('tags already stored that way', () => {
  it('are split when the library is opened, keeping whether they were accepted and what they were', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'frames-tags-'));
    const db = openDb(dir);
    db.prepare("INSERT INTO shoots(id, name, imported_at) VALUES(1, 's', '2026-01-01')").run();
    db.prepare("INSERT INTO photos(id, shoot_id, path, file, hash, title, file_type, size_bytes, added_at) VALUES(1, 1, 'a.jpg', 'a.jpg', 'h', 'a', 'jpg', 1, '2026-01-01')").run();
    const ins = db.prepare('INSERT INTO tags(photo_id, name, source, accepted, kind) VALUES(1, ?, ?, ?, ?)');
    ins.run('dog sign signpost forest nature', 'ai', 0, 'tag');
    ins.run('golden hour', 'ai', 0, 'tag'); // a real name: kept
    ins.run('my own four word tag', 'user', 1, 'tag'); // the person's own: never touched
    db.pragma(`user_version = ${(db.pragma('user_version', { simple: true }) as number) - 1}`);
    migrate(db);
    const names = (db.prepare('SELECT name, source, accepted, kind FROM tags ORDER BY name').all() as any[]);
    expect(names.map((r) => r.name)).toEqual(['dog', 'forest', 'golden hour', 'my own four word tag', 'nature', 'sign', 'signpost']);
    expect(names.find((r) => r.name === 'dog')).toMatchObject({ source: 'ai', accepted: 0, kind: 'tag' });
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
