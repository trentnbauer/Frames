import fs from 'node:fs';
import path from 'node:path';
import { getSecret, setSecret } from './ai.js';
import { getSetting, setSetting, type DB } from './db.js';
import type { AppCfg } from './ctx.js';
import { dropBackupTokens, isProvider, type ProviderId } from './cloud.js';
import { cloudStore, type Store } from './cloudBackup.js';
import { cleanConfig, s3Delete, s3Get, s3List, s3Put, type S3Config } from './s3.js';
import { archivesIn, writeServerArchive } from './serverBackup.js';

/**
 * Copying the daily whole-server archive to S3 (or an S3-compatible service: MinIO, Backblaze B2, Wasabi). The settings are the
 * administrator's and live in the server's own database; the secret key is write-only (stored as a secret, never sent back, left out
 * of backups). Only the archives Frames itself makes are copied or removed there, the last seven, as on disk.
 */
const KEEP = 7;
const NAME = /^frames-server-backup-\d{4}-\d{2}-\d{2}\.tar$/;
type Stored = Omit<S3Config, 'secretAccessKey'>;
export type Status = { at: string; ok: boolean; message: string };

export const isArchiveName = (n: string) => NAME.test(n);
export const loadS3 = (sys: DB): S3Config | null => {
  const s = getSetting<Stored | null>(sys, 'backupS3', null);
  const secret = getSecret(sys, 'backupS3');
  return s && secret ? { ...s, secretAccessKey: secret } : null;
};
export const s3State = (sys: DB) => {
  const s = getSetting<Stored | null>(sys, 'backupS3', null);
  return { configured: !!loadS3(sys), endpoint: s?.endpoint ?? '', region: s?.region ?? '', bucket: s?.bucket ?? '', prefix: s?.prefix ?? '', accessKeyId: s?.accessKeyId ?? '', hasSecret: !!getSecret(sys, 'backupS3'), status: getSetting<Status | null>(sys, 'backupS3Status', null) };
};

/** Checks and saves. A blank secret key keeps the one saved. Throws a plain message for anything not usable. */
export function saveS3(sys: DB, raw: Record<string, unknown>) {
  const given = typeof raw.secretAccessKey === 'string' ? raw.secretAccessKey.trim().slice(0, 200) : '';
  const c = cleanConfig(raw, given || getSecret(sys, 'backupS3'));
  const { secretAccessKey, ...rest } = c;
  setSetting(sys, 'backupS3', rest);
  setSecret(sys, 'backupS3', secretAccessKey);
}
export function removeS3(sys: DB) {
  sys.prepare("DELETE FROM settings WHERE key IN ('backupS3', 'secret:backupS3', 'backupS3Status')").run();
}

const s3Store = (c: S3Config): Store => ({ put: (n, d) => s3Put(c, n, d), list: () => s3List(c), get: (n) => s3Get(c, n), del: (n) => s3Delete(c, n) });

/** The administrator's Dropbox, Google Drive or OneDrive backup connection, if one is made. */
export type CloudDest = { provider: ProviderId; account: string };
export const loadCloudDest = (sys: DB): CloudDest | null => { const d = getSetting<CloudDest | null>(sys, 'backupCloud', null); return d && isProvider(d.provider) ? d : null; };
export const saveCloudDest = (sys: DB, d: CloudDest) => setSetting(sys, 'backupCloud', d);
export function removeCloudDest(sys: DB) { sys.prepare("DELETE FROM settings WHERE key IN ('backupCloud', 'backupCloudStatus')").run(); dropBackupTokens(sys); }
export const cloudState = (sys: DB) => ({ connected: !!loadCloudDest(sys), provider: loadCloudDest(sys)?.provider ?? '', account: loadCloudDest(sys)?.account ?? '', status: getSetting<Status | null>(sys, 'backupCloudStatus', null) });

const note = (sys: DB, key: string, ok: boolean, message: string) => setSetting(sys, key, { at: new Date().toISOString(), ok, message } satisfies Status);

/** Uploads every local archive the destination does not have yet, and trims it to the newest seven. Records how it went. */
async function syncStore(sys: DB, statusKey: string, store: Store, dir: string): Promise<{ uploaded: string[] }> {
  try {
    const have = new Set((await store.list()).map((o) => o.name));
    const uploaded: string[] = [];
    for (const a of archivesIn(dir).filter((x) => NAME.test(x.name)).slice(0, KEEP)) {
      if (have.has(a.name)) continue;
      await store.put(a.name, fs.readFileSync(path.join(dir, a.name))); // shortcut: whole archive in memory, fine for databases; stream if archives reach gigabytes
      uploaded.push(a.name); have.add(a.name);
    }
    for (const old of [...have].filter((n) => NAME.test(n)).sort().reverse().slice(KEEP)) await store.del(old);
    note(sys, statusKey, true, uploaded.length ? `Uploaded ${uploaded.join(', ')}.` : 'Up to date.');
    return { uploaded };
  } catch (e) {
    note(sys, statusKey, false, (e as Error).message);
    throw e;
  }
}

export function syncS3(sys: DB, dir: string) {
  const c = loadS3(sys);
  if (!c) throw new Error('Set up S3 first.');
  return syncStore(sys, 'backupS3Status', s3Store(c), dir);
}
export function syncCloud(sys: DB, cfg: AppCfg, dir: string) {
  const d = loadCloudDest(sys);
  if (!d) throw new Error('Connect a cloud account for backups first.');
  return syncStore(sys, 'backupCloudStatus', cloudStore(sys, cfg, d.provider), dir);
}
/** What is at a destination, and one archive from it, for restore. */
export const storeOf = (sys: DB, cfg: AppCfg, which: 's3' | 'cloud'): Store | null => {
  if (which === 's3') { const c = loadS3(sys); return c ? s3Store(c) : null; }
  const d = loadCloudDest(sys);
  return d ? cloudStore(sys, cfg, d.provider) : null;
};

/** After the daily write: copy to every destination that is set up. One failing never stops the other. */
export async function syncAll(sys: DB, cfg: AppCfg | undefined, dir: string) {
  const out: { uploaded: string[]; errors: string[] } = { uploaded: [], errors: [] };
  if (loadS3(sys)) await syncS3(sys, dir).then((r) => out.uploaded.push(...r.uploaded), (e) => out.errors.push(`S3: ${(e as Error).message}`));
  if (cfg && loadCloudDest(sys)) await syncCloud(sys, cfg, dir).then((r) => out.uploaded.push(...r.uploaded), (e) => out.errors.push(`Cloud: ${(e as Error).message}`));
  return out;
}

/** Makes today's archive if there is none, then copies it to every destination. For the button; the daily timer calls syncAll after its own write. */
export async function backupNow(src: Parameters<typeof writeServerArchive>[0], cfg: AppCfg, dir: string) {
  await writeServerArchive(src, dir);
  return syncAll(src.sys, cfg, dir);
}
