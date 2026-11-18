import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { migrate } from './db.js';

describe('subjects become tags', () => {
  it('turns every subject into a tag on photographs, in the vocabulary, in a shoot’s shared tags and in the To do reasons', () => {
    const db = new Database(':memory:');
    migrate(db);
    db.pragma('foreign_keys = OFF');
    db.prepare("INSERT INTO tags(photo_id, name, source, accepted, kind) VALUES (1, 'harbour', 'user', 1, 'subject'), (1, 'moody', 'user', 1, 'tag')").run();
    db.prepare("INSERT INTO vocab(name, kind) VALUES ('street', 'subject'), ('street', 'tag'), ('boat', 'subject')").run();
    db.prepare("INSERT INTO shoots(name, source, imported_at, shared) VALUES ('Coast', 'Manual', '2026-01-01', ?)").run(JSON.stringify({ subjects: ['coast'], tags: ['moody'] }));
    db.prepare("INSERT OR REPLACE INTO settings(key, value) VALUES('settings', ?)").run(JSON.stringify({ todoReasons: ['shoot', 'subjects', 'description'] }));
    db.pragma(`user_version = ${Number(db.pragma('user_version', { simple: true })) - 2}`); // run the subjects migration again (and the one after it)
    migrate(db);
    expect(db.prepare('SELECT name, kind FROM tags ORDER BY name').all()).toEqual([{ name: 'harbour', kind: 'tag' }, { name: 'moody', kind: 'tag' }]);
    expect(db.prepare('SELECT name, kind FROM vocab ORDER BY name').all()).toEqual([{ name: 'boat', kind: 'tag' }, { name: 'street', kind: 'tag' }]);
    expect(JSON.parse((db.prepare("SELECT shared FROM shoots WHERE name = 'Coast'").get() as { shared: string }).shared)).toEqual({ tags: ['moody', 'coast'] });
    expect(JSON.parse((db.prepare("SELECT value FROM settings WHERE key = 'settings'").get() as { value: string }).value).todoReasons).toEqual(['shoot', 'description', 'tags']);
  });
});
