import fs from 'node:fs';
import path from 'node:path';
import type Database from 'better-sqlite3';

// Versioned migrations: each file in migrationsDir runs at most once, in
// filename order, tracked in schema_migrations. New schema changes get a new
// numbered file (e.g. 002_add_x.sql) rather than editing 001 or hand-rolling
// an ALTER TABLE check in application code.
export function runMigrations(db: Database.Database, migrationsDir: string) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  const applied = new Set((db.prepare('SELECT id FROM schema_migrations').all() as { id: string }[]).map((r) => r.id));

  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
    const tx = db.transaction(() => {
      db.exec(sql);
      db.prepare('INSERT INTO schema_migrations (id) VALUES (?)').run(file);
    });
    tx();
  }
}
