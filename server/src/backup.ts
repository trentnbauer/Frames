import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import Database from 'better-sqlite3';
import type { DB } from './db.js';
import { madeWithin } from './policy.js';

const KEEP = 7;

/** A tar archive of files, streamed one after the other (ustar, names up to 100 characters). Enough for a handful of database copies. */
export function tarOf(files: { name: string; file: string }[]): Readable {
  async function* gen() {
    for (const f of files) {
      const size = fs.statSync(f.file).size;
      const h = Buffer.alloc(512);
      h.write(f.name.slice(0, 100), 0, 'utf8');
      h.write('0000644\0', 100); h.write('0000000\0', 108); h.write('0000000\0', 116);
      h.write(size.toString(8).padStart(11, '0') + '\0', 124);
      h.write(Math.floor(fs.statSync(f.file).mtimeMs / 1000).toString(8).padStart(11, '0') + '\0', 136);
      h.write('        ', 148); h.write('0', 156); h.write('ustar\0' + '00', 257);
      h.write(h.reduce((a, b) => a + b, 0).toString(8).padStart(6, '0') + '\0 ', 148);
      yield h;
      for await (const chunk of fs.createReadStream(f.file)) yield chunk as Buffer;
      if (size % 512) yield Buffer.alloc(512 - (size % 512));
    }
    yield Buffer.alloc(1024);
  }
  return Readable.from(gen());
}

/**
 * A backup is a copy anyone with the file can read, so it must not carry keys or logins:
 * the AI key, OAuth client secrets, and sign-in sessions (restoring those would sign people back in).
 */
export function scrubCopy(file: string, system = false) {
  const c = new Database(file);
  try {
    c.prepare("DELETE FROM settings WHERE key LIKE 'secret:%'").run();
    c.prepare('DELETE FROM sessions').run();
    // The server's own settings (sign-in providers, the tunnel, shared AIs, the privacy page) are env data, not user data: they are not in a backup.
    if (system) c.prepare('DELETE FROM settings').run();
    c.exec('VACUUM');
  } finally { c.close(); }
}

/** Checks the database file is sound. Logged at start-up so corruption is noticed early, not months later. */
export function integrity(db: DB): string {
  try { return String(db.pragma('integrity_check', { simple: true })); } catch (e) { return `check failed: ${(e as Error).message}`; }
}

/** One snapshot per day, the last seven kept. Uses SQLite's online backup, so it is safe while the app is running. */
export async function dailyBackup(db: DB, dataDir: string, now = new Date(), system = false, pol: { auto: boolean; everyDays: number; keep: number } = { auto: true, everyDays: 1, keep: KEEP }): Promise<string | null> {
  if (!pol.auto) return null;
  const dir = path.join(dataDir, 'backups');
  fs.mkdirSync(dir, { recursive: true });
  const name = `auto-${now.toISOString().slice(0, 10)}.db`;
  const file = path.join(dir, name);
  if (fs.existsSync(file)) return null;
  if (pol.everyDays > 1 && madeWithin(fs.readdirSync(dir).filter((n) => /^auto-\d{4}-\d{2}-\d{2}\.db$/.test(n)).map((n) => fs.statSync(path.join(dir, n))), pol.everyDays, now.getTime())) return null;
  await db.backup(file + '.partial');
  scrubCopy(file + '.partial', system);
  fs.renameSync(file + '.partial', file); // a half-written file is never mistaken for a backup
  for (const old of fs.readdirSync(dir).filter((n) => /^auto-\d{4}-\d{2}-\d{2}\.db$/.test(n)).sort().reverse().slice(pol.keep)) fs.rmSync(path.join(dir, old), { force: true });
  return name;
}

/** Daily backups for every library that exists, and for the system database (people and sign-in settings). */
export function startAutoBackup(targets: () => { db: DB; dataDir: string; system?: boolean }[], policy?: () => { auto: boolean; everyDays: number; keep: number }) {
  const run = () => {
    try { for (const t of targets()) dailyBackup(t.db, t.dataDir, new Date(), t.system, policy?.()).catch((e) => console.error('Backup failed', e)); } catch (e) { console.error('Backup could not start', e); }
  };
  setTimeout(run, 10_000).unref();
  setInterval(run, 6 * 3600_000).unref(); // checks every six hours, writes at most one per day
}
