import fs from 'node:fs';
import path from 'node:path';
import { getSecret, setSecret } from './ai.js';
import { getSetting, setSetting, type DB } from './db.js';
import { cleanConfig, s3Delete, s3List, s3Put, type S3Config } from './s3.js';
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

const note = (sys: DB, ok: boolean, message: string) => setSetting(sys, 'backupS3Status', { at: new Date().toISOString(), ok, message } satisfies Status);

/** Uploads every local archive the bucket does not have yet, and trims the bucket to the newest seven. Records how it went. */
export async function syncS3(sys: DB, dir: string): Promise<{ uploaded: string[] }> {
  const c = loadS3(sys);
  if (!c) throw new Error('Set up S3 first.');
  try {
    const have = new Set((await s3List(c)).map((o) => o.name));
    const uploaded: string[] = [];
    for (const a of archivesIn(dir).filter((x) => NAME.test(x.name)).slice(0, KEEP)) {
      if (have.has(a.name)) continue;
      await s3Put(c, a.name, fs.readFileSync(path.join(dir, a.name))); // shortcut: whole archive in memory, fine for databases; stream if archives reach gigabytes
      uploaded.push(a.name); have.add(a.name);
    }
    for (const old of [...have].filter((n) => NAME.test(n)).sort().reverse().slice(KEEP)) await s3Delete(c, old);
    note(sys, true, uploaded.length ? `Uploaded ${uploaded.join(', ')}.` : 'Up to date.');
    return { uploaded };
  } catch (e) {
    note(sys, false, (e as Error).message);
    throw e;
  }
}

/** Makes today's archive if there is none, then syncs. For the button; the daily timer calls syncS3 after its own write. */
export async function backupNow(src: Parameters<typeof writeServerArchive>[0], dir: string) {
  await writeServerArchive(src, dir);
  return syncS3(src.sys, dir);
}
