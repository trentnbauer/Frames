import { MFA_SCHEMA } from './mfa.js';
import { madeWithin } from './policy.js';
import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import Database from 'better-sqlite3';
import type { DB } from './db.js';
import { scrubCopy, tarOf } from './backup.js';
import type { AppCfg } from './ctx.js';
import { loadCloudDest, loadS3, syncAll } from './backupS3.js';

/**
 * The whole-server backup: one archive holding the people (system.db) and every library's database. It leaves out the server's own settings
 * (sign-in providers, the tunnel, shared AIs, keys): those belong in the env file, and a restore keeps the ones the server has now.
 * Photographs are not in it.
 *
 * Restoring is done in two steps because the databases are open while Frames runs: the archive is checked and put aside, and the
 * next start replaces the databases before anything opens them (applyPendingRestore).
 */
export const PENDING = 'restore-pending';
const PART = /^(system|library-\d+-[A-Za-z0-9._-]{0,80})\.db$/;
const label = (s: string) => s.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 80);

export type Parts = { name: string; file: string }[];
type Source = { sys: DB; tenants: { all(): { user: { id: number; folder: string; name: string }; db: DB }[]; owner?: () => { cfg: AppCfg } } };

/** Copies of every database, scrubbed, in a scratch directory. The caller removes them. */
export async function serverParts(src: Source, scratch: string): Promise<Parts> {
  fs.mkdirSync(scratch, { recursive: true });
  const made: Parts = [];
  const snap = async (name: string, db: DB, system: boolean) => { const f = path.join(scratch, `server-${Date.now()}-${made.length}.db`); await db.backup(f); scrubCopy(f, system); made.push({ name, file: f }); };
  await snap('system.db', src.sys, true);
  for (const t of src.tenants.all()) await snap(`library-${t.user.id}-${label(t.user.folder || t.user.name || 'owner')}.db`, t.db, false);
  return made;
}

/** One archive on disk, written to a temporary name first so a half-written one is never mistaken for a backup. */
export async function writeServerArchive(src: Source, dir: string, now = new Date(), pol: { everyDays: number; keep: number } = { everyDays: 1, keep: 7 }): Promise<string | null> {
  fs.mkdirSync(dir, { recursive: true });
  const name = `frames-server-backup-${now.toISOString().slice(0, 10)}.tar`;
  const file = path.join(dir, name);
  if (fs.existsSync(file)) return null;
  if (pol.everyDays > 1 && madeWithin(fs.readdirSync(dir).filter((n) => /^frames-server-backup-\d{4}-\d{2}-\d{2}\.tar$/.test(n)).map((n) => fs.statSync(path.join(dir, n))), pol.everyDays, now.getTime())) return null;
  const parts = await serverParts(src, path.join(dir, '.scratch'));
  try { await pipeline(tarOf(parts), fs.createWriteStream(file + '.partial')); fs.renameSync(file + '.partial', file); }
  finally { for (const p of parts) fs.rmSync(p.file, { force: true }); fs.rmSync(file + '.partial', { force: true }); fs.rmSync(path.join(dir, '.scratch'), { recursive: true, force: true }); }
  for (const old of fs.readdirSync(dir).filter((n) => /^frames-server-backup-\d{4}-\d{2}-\d{2}\.tar$/.test(n)).sort().reverse().slice(pol.keep)) fs.rmSync(path.join(dir, old), { force: true });
  return name;
}

export function startServerBackup(src: () => Source, dir: string, policy?: () => { auto: boolean; everyDays: number; keep: number }) {
  let told = false;
  const run = () => {
    const s = src();
    const pol = policy?.();
    (pol && !pol.auto ? Promise.resolve(null) : writeServerArchive(s, dir, new Date(), pol)).then(() => (loadS3(s.sys) || loadCloudDest(s.sys) ? syncAll(s.sys, s.tenants.owner?.().cfg, dir).then(() => undefined) : undefined)).catch((e: NodeJS.ErrnoException) => {
      if (e.code === 'EACCES' || e.code === 'EROFS') {
        if (!told) console.error(`Server backup cannot write to ${dir} (${e.code}). Frames runs as an unprivileged user (uid ${process.getuid?.() ?? '?'}): give it that folder (chown it to that user, for a bind mount or a volume that something else created), or point BACKUP_DIR somewhere it can write.`);
        told = true;
      } else console.error('Server backup failed', e);
    });
  };
  setTimeout(run, 30_000).unref();
  setInterval(run, 6 * 3600_000).unref(); // checks every six hours, writes at most one a day
}

export const archivesIn = (dir: string): { name: string; bytes: number; at: string }[] => {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((n) => /^frames-server-backup-[\w.-]{1,40}\.tar$/.test(n)).map((n) => { const s = fs.statSync(path.join(dir, n)); return { name: n, bytes: s.size, at: s.mtime.toISOString() }; }).sort((a, b) => b.name.localeCompare(a.name));
};

/** Reads the files out of a ustar archive. Only plain files with the names a backup uses are accepted; anything else is an error. */
export function readTar(file: string): { name: string; data: Buffer }[] {
  const buf = fs.readFileSync(file);
  const out: { name: string; data: Buffer }[] = [];
  for (let at = 0; at + 512 <= buf.length;) {
    const h = buf.subarray(at, at + 512);
    if (h.every((b) => b === 0)) break;
    const name = h.toString('utf8', 0, 100).replace(/\0.*$/, '');
    const size = parseInt(h.toString('ascii', 124, 135).trim() || '0', 8);
    const type = String.fromCharCode(h[156] || 48);
    if (!Number.isFinite(size) || size < 0 || at + 512 + size > buf.length) throw new Error('That file is not a Frames backup (it is cut short).');
    if (type !== '0') throw new Error('That file is not a Frames backup (it holds something other than databases).');
    if (!PART.test(name)) throw new Error(`That file is not a Frames backup (unexpected file “${name.slice(0, 40)}”).`);
    out.push({ name, data: buf.subarray(at + 512, at + 512 + size) });
    at += 512 + Math.ceil(size / 512) * 512;
  }
  return out;
}

/** Checks an archive and puts it aside for the next start. Throws a plain message if it cannot be used. */
export function stageRestore(archive: string, dataDir: string): { parts: string[]; people: number } {
  const files = readTar(archive);
  if (!files.some((f) => f.name === 'system.db')) throw new Error('That backup has no people in it (no system.db), so it is not a whole-server backup.');
  const dir = path.join(dataDir, PENDING);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  let people = 0;
  try {
    for (const f of files) {
      const p = path.join(dir, f.name);
      fs.writeFileSync(p, f.data);
      const c = new Database(p, { readonly: true });
      try {
        if (String(c.pragma('integrity_check', { simple: true })) !== 'ok') throw new Error(`${f.name} is damaged.`);
        const has = (t: string) => !!c.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(t);
        if (f.name === 'system.db') { if (!has('users')) throw new Error('system.db is not a Frames people database.'); people = (c.prepare('SELECT COUNT(*) n FROM users').get() as { n: number }).n; }
        else if (!has('photos')) throw new Error(`${f.name} is not a Frames library.`);
      } finally { c.close(); }
    }
  } catch (e) { fs.rmSync(dir, { recursive: true, force: true }); throw e instanceof Error && !/SQLITE|file is not a database/i.test(e.message) ? e : new Error('That file is not a Frames backup (a database in it cannot be read).'); }
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ at: new Date().toISOString(), parts: files.map((f) => f.name) }));
  return { parts: files.map((f) => f.name), people };
}

export const pendingRestore = (dataDir: string): { at: string; parts: string[] } | null => {
  try { return JSON.parse(fs.readFileSync(path.join(dataDir, PENDING, 'manifest.json'), 'utf8')); } catch { return null; }
};
export const cancelRestore = (dataDir: string) => fs.rmSync(path.join(dataDir, PENDING), { recursive: true, force: true });

const where = (dataDir: string, name: string): string => {
  if (name === 'system.db') return path.join(dataDir, 'system.db');
  const id = Number(/^library-(\d+)-/.exec(name)?.[1]);
  return id === 1 ? path.join(dataDir, 'frames.db') : path.join(dataDir, 'users', String(id), 'frames.db');
};

/**
 * Run at start-up, before any database is opened. The databases being replaced are kept (backups/before-restore-<time>), the restored
 * people database keeps this server's current settings, and the pending copy is removed. Never throws: a failure leaves things as they were.
 */
export function applyPendingRestore(dataDir: string): string | null {
  const m = pendingRestore(dataDir);
  if (!m) return null;
  const pend = path.join(dataDir, PENDING);
  const keep = path.join(dataDir, 'backups', `before-restore-${new Date().toISOString().replace(/[:.]/g, '-')}`);
  const moved: { from: string; to: string }[] = [];
  try {
    fs.mkdirSync(keep, { recursive: true });
    for (const name of m.parts) {
      if (!PART.test(name)) continue;
      const dest = where(dataDir, name);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      for (const suffix of ['', '-wal', '-shm']) {
        if (!fs.existsSync(dest + suffix)) continue;
        const to = path.join(keep, `${path.relative(dataDir, dest).replace(/[\\/]/g, '_')}${suffix}`);
        fs.renameSync(dest + suffix, to); moved.push({ from: dest + suffix, to });
      }
      fs.copyFileSync(path.join(pend, name), dest);
      if (name === 'system.db') keepSettings(dest, path.join(keep, 'system.db'));
      else forgetPreviews(dest);
    }
    fs.rmSync(pend, { recursive: true, force: true });
    return keep;
  } catch (e) {
    console.error('RESTORE FAILED, putting the earlier databases back:', (e as Error).message);
    for (const x of moved.reverse()) { try { fs.rmSync(x.from, { force: true }); fs.renameSync(x.to, x.from); } catch { /* best effort */ } }
    fs.rmSync(pend, { recursive: true, force: true });
    return null;
  }
}

/** The restored people database takes this server's current settings (sign-in providers, the tunnel, shared AIs), not the backup's, which has none. */
function keepSettings(restored: string, old: string) {
  if (!fs.existsSync(old)) return;
  const c = new Database(restored);
  try {
    c.exec(`ATTACH DATABASE '${old.replace(/'/g, "''")}' AS old`);
    c.exec("DELETE FROM settings; INSERT INTO settings SELECT key, value FROM old.settings WHERE key NOT LIKE 'secret:totp:%'; DELETE FROM sessions;");
    c.exec(MFA_SCHEMA);
    c.exec('DELETE FROM mfa_sessions; DELETE FROM mfa_recovery; DELETE FROM mfa_totp;');
    // Personal factors belong to a live identity, never just a reused numeric user ID in an old backup.
    if (c.prepare("SELECT 1 FROM old.sqlite_master WHERE type = 'table' AND name = 'mfa_totp'").get()) {
      c.exec(`INSERT INTO mfa_totp SELECT m.* FROM old.mfa_totp m JOIN old.users o ON o.id = m.user_id
        JOIN users u ON u.id = o.id AND u.provider = o.provider AND u.sub = o.sub AND u.email = o.email WHERE m.enabled = 1;
        INSERT INTO mfa_recovery SELECT r.* FROM old.mfa_recovery r JOIN mfa_totp m ON m.user_id = r.user_id;
        INSERT INTO settings SELECT s.* FROM old.settings s JOIN mfa_totp m ON s.key = 'secret:totp:' || m.user_id;`);
    }
  } finally { c.close(); }
}

/**
 * The previews on disk were made for the database that has just been replaced, under its photograph numbers, and a restored database can
 * number its photographs differently. They are removed and the photographs marked for rebuilding, so no number can show another picture.
 */
function forgetPreviews(libraryDb: string) {
  fs.rmSync(path.join(path.dirname(libraryDb), 'derivatives'), { recursive: true, force: true });
  const c = new Database(libraryDb);
  try { c.prepare('UPDATE photos SET has_derivs = 0, dhash = NULL').run(); } finally { c.close(); }
}
