import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

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

export function openDb(dataDir: string): DB {
  fs.mkdirSync(dataDir, { recursive: true });
  const db = new Database(path.join(dataDir, 'frames.db'));
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  migrate(db);
  return db;
}

export function getSetting<T>(db: DB, key: string, fallback: T): T {
  const r = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
  return r ? (JSON.parse(r.value) as T) : fallback;
}
export function setSetting(db: DB, key: string, value: unknown) {
  db.prepare('INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, JSON.stringify(value));
}
