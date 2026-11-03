import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import type { DB } from './db.js';

const KEEP = 7;

/**
 * A backup is a copy anyone with the file can read, so it must not carry keys or logins:
 * the AI key, OAuth client secrets, and sign-in sessions (restoring those would sign people back in).
 */
export function scrubCopy(file: string) {
  const c = new Database(file);
  try {
    c.prepare("DELETE FROM settings WHERE key LIKE 'secret:%'").run();
    c.prepare('DELETE FROM sessions').run();
    c.exec('VACUUM');
  } finally { c.close(); }
}

/** Checks the database file is sound. Logged at start-up so corruption is noticed early, not months later. */
export function integrity(db: DB): string {
  try { return String(db.pragma('integrity_check', { simple: true })); } catch (e) { return `check failed: ${(e as Error).message}`; }
}

/** One snapshot per day, the last seven kept. Uses SQLite's online backup, so it is safe while the app is running. */
export async function dailyBackup(db: DB, dataDir: string, now = new Date()): Promise<string | null> {
  const dir = path.join(dataDir, 'backups');
  fs.mkdirSync(dir, { recursive: true });
  const name = `auto-${now.toISOString().slice(0, 10)}.db`;
  const file = path.join(dir, name);
  if (fs.existsSync(file)) return null;
  await db.backup(file + '.partial');
  scrubCopy(file + '.partial');
  fs.renameSync(file + '.partial', file); // a half-written file is never mistaken for a backup
  for (const old of fs.readdirSync(dir).filter((n) => /^auto-\d{4}-\d{2}-\d{2}\.db$/.test(n)).sort().reverse().slice(KEEP)) fs.rmSync(path.join(dir, old), { force: true });
  return name;
}

/** Daily backups for every library that exists, and for the system database (people and sign-in settings). */
export function startAutoBackup(targets: () => { db: DB; dataDir: string }[]) {
  const run = () => { for (const t of targets()) dailyBackup(t.db, t.dataDir).catch((e) => console.error('Backup failed', e)); };
  setTimeout(run, 10_000).unref();
  setInterval(run, 6 * 3600_000).unref(); // checks every six hours, writes at most one per day
}
