import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import AdmZip from 'adm-zip';
import type { Express } from 'express';
import { createTestApp, tinyJpeg } from '../test/helpers.js';

// supertest doesn't buffer unrecognized content-types (application/zip) into
// res.body by default — needs an explicit binary parser.
function getZip(app: Express, url: string) {
  return request(app)
    .get(url)
    .buffer(true)
    .parse((res, callback) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => callback(null, Buffer.concat(chunks)));
    });
}

describe('backup routes', () => {
  let app: Express;
  let cleanup: () => void;
  let dataDir: string;

  beforeAll(async () => {
    ({ app, cleanup } = await createTestApp());
    dataDir = process.env.DATA_DIR!;

    const jpeg = await tinyJpeg(70);
    await request(app).post('/api/photos/upload').attach('photos', jpeg, 'backup-me.jpg');
  });

  afterAll(() => cleanup());

  it('exports a zip containing frames.db and the photos directory', async () => {
    const res = await getZip(app, '/api/backup/export');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/zip');

    const buffer = res.body as Buffer;
    const zip = new AdmZip(buffer);
    const entries = zip.getEntries().map((e) => e.entryName);

    expect(entries).toContain('frames.db');
    expect(entries.some((e) => e.startsWith('photos/originals/'))).toBe(true);
  });

  it('rejects an import with no file', async () => {
    const res = await request(app).post('/api/backup/import');
    expect(res.status).toBe(400);
  });

  it('rejects an import that is not a valid Frames backup', async () => {
    const bogusZipPath = path.join(os.tmpdir(), `bogus-${Date.now()}.zip`);
    const zip = new AdmZip();
    zip.addFile('not-a-backup.txt', Buffer.from('nope'));
    zip.writeZip(bogusZipPath);

    const res = await request(app).post('/api/backup/import').attach('backup', bogusZipPath);
    expect(res.status).toBe(400);
    fs.rmSync(bogusZipPath, { force: true });

    // Rejected import must not have touched the live data directory.
    expect(fs.existsSync(path.join(dataDir, 'frames.db'))).toBe(true);
  });

  it('restores from a real export: swaps in the new data, moves the old dir aside', async () => {
    const exportRes = await getZip(app, '/api/backup/export');
    const exportedZipPath = path.join(os.tmpdir(), `export-${Date.now()}.zip`);
    fs.writeFileSync(exportedZipPath, exportRes.body as Buffer);

    const before = fs.readdirSync(path.dirname(dataDir));
    const importRes = await request(app).post('/api/backup/import').attach('backup', exportedZipPath);
    fs.rmSync(exportedZipPath, { force: true });

    expect(importRes.status).toBe(200);
    expect(importRes.body.ok).toBe(true);

    // The old DATA_DIR got renamed aside (never deleted), not overwritten in place.
    const after = fs.readdirSync(path.dirname(dataDir));
    const newBackupDirs = after.filter((d) => !before.includes(d));
    expect(newBackupDirs.some((d) => d.includes('.backup-'))).toBe(true);

    // The restored frames.db is a real, openable database with our photo in it
    // (verified via a fresh connection — the app's own `db` handle is
    // intentionally left pointing at the pre-restore file until a real
    // process restart, per the documented restart-to-apply design).
    const Database = (await import('better-sqlite3')).default;
    const restored = new Database(path.join(dataDir, 'frames.db'), { readonly: true });
    const row = restored.prepare('SELECT filename FROM photos WHERE filename = ?').get('backup-me.jpg');
    restored.close();
    expect(row).toBeTruthy();

    expect(fs.existsSync(path.join(dataDir, 'photos', 'originals'))).toBe(true);
  });
});
