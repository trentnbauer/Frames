import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { isSealed, keyFor, seal, unseal } from './crypt.js';

export type DB = Database.Database;

// Version 1: the original schema. Existing databases already have it.
const SCHEMA = `
CREATE TABLE IF NOT EXISTS shoots (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT '',
  place TEXT NOT NULL DEFAULT '',
  imported_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS photos (
  id INTEGER PRIMARY KEY,
  shoot_id INTEGER NOT NULL REFERENCES shoots(id),
  path TEXT NOT NULL UNIQUE,
  file TEXT NOT NULL,
  hash TEXT NOT NULL,
  title TEXT NOT NULL,
  w INTEGER NOT NULL DEFAULT 0,
  h INTEGER NOT NULL DEFAULT 0,
  captured_at TEXT,
  camera TEXT NOT NULL DEFAULT '',
  lens TEXT NOT NULL DEFAULT '',
  exposure TEXT NOT NULL DEFAULT '',
  file_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  has_derivs INTEGER NOT NULL DEFAULT 0,
  added_at TEXT NOT NULL,
  next_review_at TEXT,
  archived INTEGER NOT NULL DEFAULT 0,
  missing INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS photos_hash ON photos(hash);
CREATE INDEX IF NOT EXISTS photos_shoot ON photos(shoot_id);
CREATE TABLE IF NOT EXISTS tags (
  photo_id INTEGER NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'user',
  accepted INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (photo_id, name)
);
CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY,
  photo_id INTEGER NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  session INTEGER NOT NULL,
  run_id TEXT,
  date TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  note TEXT
);
CREATE INDEX IF NOT EXISTS reviews_photo ON reviews(photo_id);
CREATE TABLE IF NOT EXISTS collections (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  target TEXT
);
CREATE TABLE IF NOT EXISTS collection_photos (
  collection_id INTEGER NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  photo_id INTEGER NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  pos INTEGER NOT NULL,
  chosen INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (collection_id, photo_id)
);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS dismissed (kind TEXT NOT NULL, photo_id INTEGER NOT NULL, PRIMARY KEY (kind, photo_id));
CREATE TABLE IF NOT EXISTS duplicates (path TEXT PRIMARY KEY, hash TEXT NOT NULL);
`;

const hasColumn = (db: DB, table: string, col: string) => (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).some((c) => c.name === col);
const addColumn = (db: DB, table: string, col: string, ddl: string) => { if (!hasColumn(db, table, col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${ddl}`); };

/** Days in each interval label (the same as schedule.ts, which cannot be imported here: it would be circular through settings). */
const INTERVAL_DAYS: Record<string, number> = { '1 day': 1, '1 week': 7, '1 month': 30, '3 months': 90, '6 months': 182, '1 year': 365 };

/** Each step runs once, in order, and is safe to re-run. The database version is stored in PRAGMA user_version. */
const MIGRATIONS: ((db: DB) => void)[] = [
  // 2: location, analysis, variants, metadata, AI, richer organisation
  (db) => {
    for (const [c, d] of [
      ['description', "TEXT NOT NULL DEFAULT ''"], ['desc_source', "TEXT NOT NULL DEFAULT ''"], ['title_user', 'INTEGER NOT NULL DEFAULT 0'],
      ['lat', 'REAL'], ['lon', 'REAL'], ['place', "TEXT NOT NULL DEFAULT ''"],
      ['dhash', 'TEXT'], ['palette', 'TEXT'], ['colors', "TEXT NOT NULL DEFAULT ''"],
      ['brightness', 'REAL'], ['contrast', 'REAL'], ['saturation', 'REAL'],
      ['parent_id', 'INTEGER'], ['mtime', 'INTEGER'],
      ['ai_status', 'TEXT'], ['ai_json', 'TEXT'], ['ai_attempts', 'INTEGER NOT NULL DEFAULT 0'], ['embedding', 'BLOB'],
      ['xmp_rating', 'INTEGER'], ['xmp_sig', 'TEXT'],
    ] as const) addColumn(db, 'photos', c, d);
    addColumn(db, 'shoots', 'description', "TEXT NOT NULL DEFAULT ''");
    addColumn(db, 'shoots', 'date_from', 'TEXT');
    addColumn(db, 'shoots', 'date_to', 'TEXT');
    addColumn(db, 'collections', 'theme', "TEXT NOT NULL DEFAULT ''");
    addColumn(db, 'tags', 'kind', "TEXT NOT NULL DEFAULT 'tag'");
    db.exec(`
      CREATE TABLE IF NOT EXISTS vocab (name TEXT NOT NULL, kind TEXT NOT NULL, PRIMARY KEY (name, kind));
      CREATE TABLE IF NOT EXISTS feedback (id INTEGER PRIMARY KEY, kind TEXT NOT NULL, photo_id INTEGER NOT NULL, verdict TEXT NOT NULL, ts TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS dup_ignored (a INTEGER NOT NULL, b INTEGER NOT NULL, PRIMARY KEY (a, b));
      CREATE TABLE IF NOT EXISTS xmp_conflicts (photo_id INTEGER NOT NULL, field TEXT NOT NULL, mine TEXT NOT NULL, theirs TEXT NOT NULL, PRIMARY KEY (photo_id, field));
      CREATE INDEX IF NOT EXISTS photos_captured ON photos(captured_at);
      CREATE INDEX IF NOT EXISTS photos_parent ON photos(parent_id);
      CREATE INDEX IF NOT EXISTS photos_next_review ON photos(next_review_at);
      CREATE INDEX IF NOT EXISTS photos_ai ON photos(ai_status);
      CREATE INDEX IF NOT EXISTS tags_name ON tags(name);
      CREATE INDEX IF NOT EXISTS reviews_date ON reviews(date);
      CREATE INDEX IF NOT EXISTS colpho_photo ON collection_photos(photo_id);
    `);
  },
  // 3: share links
  (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS shares (
        id INTEGER PRIMARY KEY, token TEXT NOT NULL UNIQUE, kind TEXT NOT NULL, target_id INTEGER NOT NULL,
        label TEXT NOT NULL DEFAULT '', allow_download INTEGER NOT NULL DEFAULT 0, allow_review INTEGER NOT NULL DEFAULT 0,
        expires_at TEXT, created_at TEXT NOT NULL, revoked INTEGER NOT NULL DEFAULT 0, views INTEGER NOT NULL DEFAULT 0, downloads INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS share_reviews (
        id INTEGER PRIMARY KEY, share_id INTEGER NOT NULL REFERENCES shares(id) ON DELETE CASCADE,
        photo_id INTEGER NOT NULL REFERENCES photos(id) ON DELETE CASCADE, reviewer TEXT NOT NULL DEFAULT '',
        rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5), note TEXT, ts TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS share_reviews_share ON share_reviews(share_id);
    `);
  },
  // 4: sign-in sessions (only a hash of each session token is stored)
  (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY, provider TEXT NOT NULL, sub TEXT NOT NULL, email TEXT NOT NULL DEFAULT '', name TEXT NOT NULL DEFAULT '',
        created TEXT NOT NULL, expires TEXT NOT NULL, last_seen TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS sessions_expires ON sessions(expires);
    `);
  },
  // 5: what has been copied from each cloud connection (so a file is fetched once and never overwritten)
  (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS cloud_files (
        conn_id TEXT NOT NULL, remote_id TEXT NOT NULL, rel TEXT NOT NULL, version TEXT NOT NULL DEFAULT '', size INTEGER NOT NULL DEFAULT 0, synced TEXT NOT NULL,
        PRIMARY KEY (conn_id, remote_id)
      );
      CREATE INDEX IF NOT EXISTS cloud_files_rel ON cloud_files(conn_id, rel);
    `);
  },
  // 6: several AI sources instead of one. The single old configuration becomes the first source and stays active.
  (db) => {
    const row = db.prepare("SELECT value FROM settings WHERE key = 'settings'").get() as { value: string } | undefined;
    if (!row) return;
    const st = JSON.parse(row.value) as Record<string, any>;
    if (st.ai !== undefined && st.ai !== 'off' || st.aiEndpoint) {
      const local = st.ai === 'local';
      const id = 'first';
      const src = { id, type: local ? 'ollama' : 'custom', name: local ? 'Ollama' : 'My AI service', endpoint: st.aiEndpoint ?? '', model: st.aiModel ?? '', embedModel: st.aiEmbedModel ?? '', ack: !!st.aiExternalAck };
      db.prepare('INSERT OR IGNORE INTO settings(key, value) VALUES(?, ?)').run('aiSources', JSON.stringify([src]));
      const key = db.prepare("SELECT value FROM settings WHERE key = 'secret:aiKey'").get() as { value: string } | undefined;
      if (key) db.prepare('INSERT OR IGNORE INTO settings(key, value) VALUES(?, ?)').run(`secret:ai:${id}:key`, key.value);
      if (st.ai !== 'off') st.aiActive = id;
    }
    for (const k of ['ai', 'aiEndpoint', 'aiModel', 'aiEmbedModel', 'aiExternalAck']) delete st[k];
    db.prepare("UPDATE settings SET value = ? WHERE key = 'settings'").run(JSON.stringify(st));
    db.prepare("DELETE FROM settings WHERE key = 'secret:aiKey'").run();
  },
  // 7: a photograph that has never been reviewed is counted as reviewed when it was added, and first comes up one interval later (not straight away).
  (db) => {
    const saved = getSetting<{ intervals?: string[] }>(db, 'settings', {});
    const days = INTERVAL_DAYS[saved.intervals?.[0] ?? '1 week'] ?? 7;
    db.prepare("UPDATE photos SET next_review_at = strftime('%Y-%m-%dT%H:%M:%fZ', added_at, ?) WHERE next_review_at = added_at AND NOT EXISTS (SELECT 1 FROM reviews r WHERE r.photo_id = photos.id)").run(`+${days} days`);
  },
  // 8: photographs taken out of Frames are remembered by their fingerprint, so a scan of the library does not import them again.
  (db) => {
    db.exec('CREATE TABLE IF NOT EXISTS removed (hash TEXT PRIMARY KEY, path TEXT NOT NULL, file TEXT NOT NULL, removed_at TEXT NOT NULL)');
  },
  // 9: a cloud photograph kept as a smaller copy remembers its original in the cloud (its name and size there), to fetch it again for an export.
  (db) => {
    addColumn(db, 'cloud_files', 'shrunk', 'INTEGER NOT NULL DEFAULT 0');
    addColumn(db, 'cloud_files', 'orig_size', 'INTEGER NOT NULL DEFAULT 0');
    addColumn(db, 'cloud_files', 'orig_w', 'INTEGER NOT NULL DEFAULT 0');
    addColumn(db, 'cloud_files', 'orig_h', 'INTEGER NOT NULL DEFAULT 0');
    addColumn(db, 'cloud_files', 'remote_name', "TEXT NOT NULL DEFAULT ''");
  },
  // 10: a composition can be marked printed (done and archived), with the day it was.
  (db) => {
    addColumn(db, 'collections', 'printed_at', 'TEXT');
  },
  // 11: a guest of a composition's share link can suggest another candidate in place of one of the chosen prints.
  (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS share_suggestions (
        id INTEGER PRIMARY KEY, share_id INTEGER NOT NULL REFERENCES shares(id) ON DELETE CASCADE,
        reviewer TEXT NOT NULL DEFAULT '', for_id INTEGER NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
        photo_id INTEGER NOT NULL REFERENCES photos(id) ON DELETE CASCADE, note TEXT, ts TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS share_suggestions_share ON share_suggestions(share_id);
    `);
  },
  // 12: a photoshoot can carry subjects and tags that apply to every photograph in it (alongside its place).
  (db) => {
    addColumn(db, 'shoots', 'shared', "TEXT NOT NULL DEFAULT '{}'");
  },
  // 13: a guest of a share link can leave a comment, on the whole link or on one photograph. Only the photographer sees them.
  (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS share_comments (
        id INTEGER PRIMARY KEY, share_id INTEGER NOT NULL REFERENCES shares(id) ON DELETE CASCADE,
        reviewer TEXT NOT NULL DEFAULT '', photo_id INTEGER REFERENCES photos(id) ON DELETE CASCADE, body TEXT NOT NULL, ts TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS share_comments_share ON share_comments(share_id);
    `);
  },
  // 14: a composition's layout: the prints on the wall, each with its own size, orientation, frame and place (null: derived from the older target).
  (db) => {
    addColumn(db, 'collections', 'layout', 'TEXT');
  },
  // 15: a guest of a share link can suggest a different layout (sizes, frames, more or fewer prints). Kept apart from the composition until the photographer applies it.
  (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS share_layouts (
        id INTEGER PRIMARY KEY, share_id INTEGER NOT NULL REFERENCES shares(id) ON DELETE CASCADE,
        reviewer TEXT NOT NULL DEFAULT '', layout TEXT NOT NULL, note TEXT, ts TEXT NOT NULL,
        UNIQUE (share_id, reviewer)
      );
    `);
  },
];

export function migrate(db: DB) {
  db.exec(SCHEMA);
  let v = Number(db.pragma('user_version', { simple: true })) || 0;
  // A database created before versioning is version 1.
  if (v < 1) v = 1;
  for (let i = v - 1; i < MIGRATIONS.length; i++) {
    db.transaction(() => { MIGRATIONS[i](db); db.pragma(`user_version = ${i + 2}`); })();
  }
}

/**
 * Every library and the server's own database use one key, kept with the data folder (or FRAMES_SECRET_KEY): `keyRoot` is that folder.
 * The key is attached to the database object, so code that only holds a person's database (or the proxy for it) can still read secrets.
 */
export function attachKey(db: DB, keyRoot: string): DB {
  Object.defineProperty(db, 'frameKey', { value: keyFor(keyRoot), enumerable: false });
  encryptAll(db);
  return db;
}
const keyOf = (db: DB): Buffer | undefined => (db as unknown as { frameKey?: Buffer }).frameKey;

/** Secrets saved before encryption existed are encrypted the next time the database is opened. */
function encryptAll(db: DB) {
  const key = keyOf(db);
  if (!key) return;
  const rows = db.prepare("SELECT key, value FROM settings WHERE key LIKE 'secret:%'").all() as { key: string; value: string }[];
  const upd = db.prepare('UPDATE settings SET value = ? WHERE key = ?');
  db.transaction(() => {
    for (const r of rows) {
      let v: unknown;
      try { v = JSON.parse(r.value); } catch { continue; }
      if (typeof v === 'string' && v && !isSealed(v)) upd.run(JSON.stringify(seal(key, v)), r.key);
    }
  })();
}

export function openDb(dataDir: string, keyRoot = dataDir): DB {
  fs.mkdirSync(dataDir, { recursive: true });
  const db = new Database(path.join(dataDir, 'frames.db'));
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  migrate(db);
  return attachKey(db, keyRoot);
}

export function getSetting<T>(db: DB, key: string, fallback: T): T {
  const r = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
  if (!r) return fallback;
  const v = JSON.parse(r.value);
  return (key.startsWith('secret:') ? openSecret(db, v) : v) as T; // a secret is stored encrypted
}
/** A stored secret as the text it is (decrypted); anything else as it is. */
export function openSecret(db: DB, v: unknown): unknown {
  const key = keyOf(db);
  return key && typeof v === 'string' ? unseal(key, v) : v;
}
export function setSetting(db: DB, key: string, value: unknown) {
  const k = keyOf(db);
  if (k && key.startsWith('secret:') && typeof value === 'string' && value && !isSealed(value)) value = seal(k, value);
  db.prepare('INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, JSON.stringify(value));
}
