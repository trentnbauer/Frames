import crypto from 'node:crypto';
import path from 'node:path';
import type { DB } from './db.js';
export function startImport(db: DB, files: string[], source = 'Library import') {
  if (!files.length) return null;
  const id = crypto.randomUUID();
  db.transaction(() => {
    db.prepare('INSERT INTO import_runs(id,source,status,started_at)VALUES(?,?,?,?)').run(id, source, 'running', new Date().toISOString());
    const insert = db.prepare("INSERT INTO import_files(run_id,path,file,status)VALUES(?,?,?,'pending')");
    for (const file of files) insert.run(id, file, path.basename(file));
  })();
  return id;
}
export function importOutcome(db: DB, run: string | null, file: string, status: string, photoId: number | null = null, error = '') {
  if (run)
    db.prepare('UPDATE import_files SET status=?,photo_id=?,error=? WHERE run_id=? AND path=?').run(status, photoId, error, run, file);
}
export function finishImport(db: DB, run: string | null) {
  if (run) db.prepare("UPDATE import_runs SET status='complete',finished_at=? WHERE id=?").run(new Date().toISOString(), run);
}
export function uploadSummary(db: DB, saved: string[], rejected: { file: string; reason: string }[]) {
  if (!saved.length && !rejected.length) return;
  const id = crypto.randomUUID();
  db.transaction(() => {
    db.prepare("INSERT INTO import_runs(id,source,status,started_at,finished_at)VALUES(?,'Upload transfer','complete',?,?)").run(
      id,
      new Date().toISOString(),
      new Date().toISOString(),
    );
    for (const file of saved) db.prepare("INSERT INTO import_files(run_id,path,file,status)VALUES(?,?,?,'staged')").run(id, file, file);
    for (const [i, file] of rejected.entries())
      db.prepare("INSERT INTO import_files(run_id,path,file,status,error)VALUES(?,?,?,'upload-failed',?)").run(
        id,
        `rejected-${i}`,
        file.file,
        file.reason,
      );
  })();
  return id;
}
