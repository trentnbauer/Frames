import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import archiver from 'archiver';
import AdmZip from 'adm-zip';
import multer from 'multer';
import db, { DATA_DIR, DB_PATH, PHOTOS_DIR } from '../db.js';
import { moveAcrossDevices } from '../lib/moveAcrossDevices.js';

export const backupRouter = Router();

// Full DATA_DIR export: a consistent DB snapshot (better-sqlite3's online
// backup API, safe under WAL even with concurrent writes) plus every
// original/thumb/display file, zipped. Meant to be restorable on a fresh
// install via /import below — the whole point is "move this to another
// machine" or "recover after wiping the volume", not per-idea sharing
// (that's what idea export already does).
backupRouter.get('/export', async (_req, res) => {
  const tmpDbPath = path.join(os.tmpdir(), `frames-backup-${Date.now()}.db`);
  await db.backup(tmpDbPath);

  const zipName = `frames-backup-${new Date().toISOString().slice(0, 10)}.zip`;
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${zipName}"`);

  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.on('error', (err) => {
    // Streaming failures happen mid-response (can't just res.status().json()
    // here) — log and tear down the connection instead of throwing, which
    // would otherwise be an uncaught exception that crashes the whole
    // process (every other in-flight request too) rather than just this one.
    console.error('Backup export failed:', err);
    res.destroy(err);
  });
  archive.on('end', () => fs.rm(tmpDbPath, { force: true }, () => {}));
  archive.pipe(res);

  archive.file(tmpDbPath, { name: 'frames.db' });
  archive.directory(PHOTOS_DIR, 'photos');

  await archive.finalize();
});

const upload = multer({ dest: os.tmpdir(), limits: { fileSize: 20 * 1024 * 1024 * 1024 } });

// Destructive: replaces the entire library. The current DATA_DIR is moved
// aside (never deleted) so a bad restore is recoverable with shell access,
// then the process exits — the container's restart policy (or tsx watch in
// dev) brings it back up fresh against the new data, which sidesteps
// needing to hot-swap the open better-sqlite3 handle mid-process.
backupRouter.post('/import', upload.single('backup'), async (req, res) => {
  const file = req.file;
  if (!file) return res.status(400).json({ error: 'No backup file uploaded' });

  const extractDir = path.join(os.tmpdir(), `frames-restore-${Date.now()}`);

  try {
    const zip = new AdmZip(file.path);
    zip.extractAllTo(extractDir, true);

    const extractedDb = path.join(extractDir, 'frames.db');
    const extractedPhotos = path.join(extractDir, 'photos');

    if (!fs.existsSync(extractedDb) || !fs.existsSync(extractedPhotos)) {
      throw new Error('Not a valid Frames backup — missing frames.db or photos/');
    }

    // Sanity-check it's really a Frames DB before committing to the swap.
    const Database = (await import('better-sqlite3')).default;
    const check = new Database(extractedDb, { readonly: true });
    const hasPhotosTable = check
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='photos'")
      .get();
    check.close();
    if (!hasPhotosTable) throw new Error('Not a valid Frames backup — frames.db has no photos table');

    const backupAsideDir = `${DATA_DIR}.backup-${Date.now()}`;
    fs.renameSync(DATA_DIR, backupAsideDir);
    fs.mkdirSync(DATA_DIR, { recursive: true });
    moveAcrossDevices(extractedDb, DB_PATH);
    moveAcrossDevices(extractedPhotos, path.join(DATA_DIR, 'photos'));

    res.json({ ok: true, message: 'Restored. The server is restarting — reload in a few seconds.' });
    // Vitest sets this in every worker process; skip the exit so tests can
    // verify the file swap without killing the test runner.
    if (!process.env.VITEST) setTimeout(() => process.exit(0), 500);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Import failed' });
  } finally {
    fs.rm(file.path, { force: true }, () => {});
    fs.rm(extractDir, { recursive: true, force: true }, () => {});
  }
});
