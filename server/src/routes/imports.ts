import type { FastifyInstance } from 'fastify';
import type { Ctx, Row } from '../ctx.js';
import { retryImport } from '../ingest.js';
import { WorkflowError } from '../workflowCore.js';
export function registerImports(app: FastifyInstance, x: Ctx) {
  const { db, all, one, num, notFound } = x;
  const list = () => {
    if (!x.scanning() && !x.bag('importRetry', () => ({ busy: false })).busy)
      db.prepare("UPDATE import_runs SET status='interrupted' WHERE status='running'").run();
    return all(
      'SELECT r.*,(SELECT COUNT(*) FROM import_files f WHERE f.run_id=r.id) files FROM import_runs r ORDER BY started_at DESC LIMIT 100',
    );
  };
  app.get('/api/imports', async () =>
    list().map((row) => ({
      id: row.id,
      source: row.source,
      status: row.status,
      startedAt: row.started_at,
      finishedAt: row.finished_at,
      files: row.files,
    })),
  );
  app.get('/api/imports/:id', async (req, rep) => {
    const id = String((req.params as Row).id),
      run = one('SELECT * FROM import_runs WHERE id=?', id);
    if (!run) return notFound(rep);
    const files = all(
      'SELECT f.*,p.camera,p.lens,p.raw_camera,p.raw_lens,p.ai_status FROM import_files f LEFT JOIN photos p ON p.id=f.photo_id WHERE f.run_id=? ORDER BY f.id LIMIT 2000',
      id,
    );
    const counts = Object.fromEntries(
      all('SELECT status,COUNT(*) n FROM import_files WHERE run_id=? GROUP BY status', id).map((row) => [row.status, row.n]),
    );
    const stats = one(
      `SELECT
      COUNT(CASE WHEN f.status='ready' AND (p.camera='' OR p.lens='') THEN 1 END) missingDetails,
      COUNT(CASE WHEN f.status='ready' AND ((p.raw_camera!='' AND p.camera='') OR (p.raw_lens!='' AND p.lens='')) THEN 1 END) blacklistCleared,
      COUNT(CASE WHEN f.status='ready' AND COALESCE(p.ai_status,'')!='done' THEN 1 END) aiQueued
      FROM import_files f JOIN photos p ON p.id=f.photo_id WHERE f.run_id=?`,
      id,
    )!;
    return {
      id,
      source: run.source,
      status: run.status,
      counts,
      missingDetails: stats.missingDetails,
      blacklistCleared: stats.blacklistCleared,
      aiQueued: stats.aiQueued,
      files: files.map((file) => ({
        id: file.id,
        file: file.file,
        status: file.status,
        photoId: file.photo_id,
        error: file.error,
        retryable: ['failed', 'pending', 'processing'].includes(file.status),
      })),
    };
  });
  app.post('/api/imports/:id/retry', async (req, rep) => {
    const id = String((req.params as Row).id),
      b = (req.body ?? {}) as Row;
    if (!one('SELECT 1 FROM import_runs WHERE id=?', id)) return notFound(rep);
    if (b.fileId !== undefined && !Number.isSafeInteger(b.fileId)) throw new WorkflowError('Choose a file.');
    if (x.scanning()) throw new WorkflowError('Wait for the current library scan to finish.', 409);
    const lock = x.bag('importRetry', () => ({ busy: false }));
    if (lock.busy) throw new WorkflowError('A retry is already running.', 409);
    const files = all(
      `SELECT * FROM import_files WHERE run_id=? AND status IN ('failed','pending','processing')${b.fileId === undefined ? '' : ' AND id=?'} LIMIT 500`,
      id,
      ...(b.fileId === undefined ? [] : [b.fileId]),
    );
    let retried = 0,
      failed = 0;
    lock.busy = true;
    try {
      for (const file of files) {
        try {
          const photoId = await retryImport(db, x.cfg, file.path, file.photo_id);
          db.prepare("UPDATE import_files SET status='ready',photo_id=?,error='' WHERE id=?").run(photoId, file.id);
          retried++;
        } catch {
          db.prepare("UPDATE import_files SET status='failed',error='The file is unavailable or could not be decoded' WHERE id=?").run(
            file.id,
          );
          failed++;
        }
      }
      db.prepare("UPDATE import_runs SET status='complete',finished_at=? WHERE id=?").run(new Date().toISOString(), id);
      return { retried, failed };
    } finally {
      lock.busy = false;
    }
  });
}
