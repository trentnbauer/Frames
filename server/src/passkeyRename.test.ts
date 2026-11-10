import Database from 'better-sqlite3';
import { expect, it } from 'vitest';
import { PASSKEY_SCHEMA, listPasskeys, renamePasskey } from './passkeys.js';

it('renames only the passkeys of the person asking, and never to a blank name', () => {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = OFF');
  db.exec(PASSKEY_SCHEMA);
  db.prepare("INSERT INTO passkeys(id, user_id, public_key, name, created) VALUES('k1', 1, x'00', 'This device', '2026-01-01')").run();
  expect(renamePasskey(db, 1, 'k1', '  Work laptop  ')).toBe(true);
  expect(listPasskeys(db, 1)[0].name).toBe('Work laptop');
  expect(renamePasskey(db, 2, 'k1', 'Stolen')).toBe(false); // somebody else's
  expect(renamePasskey(db, 1, 'k1', '   ')).toBe(false);
  expect(listPasskeys(db, 1)[0].name).toBe('Work laptop');
});
