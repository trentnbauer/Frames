import fs from 'node:fs';
import crypto from 'node:crypto';
import { setSetting } from '../db.js';
import type { FastifyInstance } from 'fastify';
import type { Ctx, Row } from '../ctx.js';
import { pruneRecovery, recoveryDays, restoreRemoval, undoChange, journal, WorkflowError } from '../workflowCore.js';
import { hashFile, processPhoto } from '../ingest.js';
import { metadataBatch, metadataInput } from '../metadataBatch.js';
import { gearKey } from '../gearBlacklist.js';
import { syncGearTags } from '../gear.js';
export function registerWorkflow(app: FastifyInstance, x: Ctx) {
  const { db, all, one, num, notFound } = x;
  app.get('/api/recovery/settings', async () => ({ days: recoveryDays(db) }));
  app.put('/api/recovery/settings', async (req) => {
    const days = (req.body as Row).days;
    if (!Number.isInteger(days) || days < 1 || days > 365) throw new WorkflowError('Choose 1 to 365 recovery days.');
    setSetting(db, 'recoveryPrefs', { days });
    pruneRecovery(db);
    return { days };
  });
  app.get('/api/recovery', async () => {
    pruneRecovery(db);
    return all('SELECT id,title,file,removed_at, snapshot FROM photo_recovery ORDER BY id DESC LIMIT 500').map((row) => {
      const data = JSON.parse(row.snapshot);
      return {
        id: row.id,
        title: row.title,
        file: row.file,
        removedAt: row.removed_at,
        expiresAt: new Date(Date.parse(row.removed_at) + recoveryDays(db) * 86400000).toISOString(),
        originalAvailable: fs.existsSync(data.photo.path),
        reviews: data.children.reviews.length,
      };
    });
  });
  app.get('/api/recovery/:id/thumb', async (req, rep) => {
    pruneRecovery(db);
    const row = one('SELECT thumb FROM photo_recovery WHERE id=?', num((req.params as Row).id));
    if (!row?.thumb) return notFound(rep);
    return rep.header('Cache-Control', 'private, no-store').type('image/jpeg').send(row.thumb);
  });
  app.post('/api/recovery/:id/restore', async (req) => {
    const id = num((req.params as Row).id),
      entry = one('SELECT snapshot FROM photo_recovery WHERE id=?', id);
    if (!entry) throw new WorkflowError('This recovery entry expired or was already restored.', 410);
    const snapshot = JSON.parse(entry.snapshot);
    if (fs.existsSync(snapshot.photo.path)) {
      let current: string;
      try {
        current = await hashFile(snapshot.photo.path);
      } catch {
        // A directory, a mis-mounted source or a permission problem: leave the snapshot alone so it can be retried.
        throw new WorkflowError('The original file cannot be read right now. Check that its storage is connected, then try again.', 409);
      }
      if (current !== snapshot.photo.hash)
        throw new WorkflowError('The original file has changed. Recovery cannot attach old ratings to a different photograph.', 409);
    }
    const restored = restoreRemoval(db, id);
    const ready = restored.missing ? false : await processPhoto(db, x.cfg, restored.id, restored.path, { derivsOnly: true });
    syncGearTags(db, restored.id);
    return { id: restored.id, missing: restored.missing, previewReady: ready };
  });
  app.get('/api/changes', async () => {
    pruneRecovery(db);
    return all('SELECT id,label,created_at,undone_at FROM change_journal ORDER BY id DESC LIMIT 100').map((row) => ({
      id: row.id,
      label: row.label,
      createdAt: row.created_at,
      undoneAt: row.undone_at,
    }));
  });
  app.post('/api/changes/:id/undo', async (req) => {
    const result = undoChange(db, num((req.params as Row).id));
    for (const photo of all('SELECT id FROM photos')) syncGearTags(db, photo.id);
    return result;
  });
  app.post('/api/photos/bulk-preview', async (req) => metadataBatch(db, req.body as Row, false));
  app.post('/api/photos/bulk-apply', async (req) => metadataBatch(db, req.body as Row, true));
  app.get('/api/photos/bulk-jobs', async () =>
    all(
      'SELECT id,cursor,status,created_at createdAt,input,operation_id operationId FROM metadata_jobs WHERE created_at>? ORDER BY created_at DESC LIMIT 50',
      new Date(Date.now() - 30 * 86400000).toISOString(),
    ).map((row) => ({
      id: row.id,
      cursor: row.cursor,
      status: row.status,
      createdAt: row.createdAt,
      total: JSON.parse(row.input).ids.length,
      operationId: row.operationId,
    })),
  );
  app.post('/api/photos/bulk-jobs', async (req) => {
    const b = req.body as Row;
    if (!Array.isArray(b.ids) || !b.ids.length || b.ids.length > 10000) throw new WorkflowError('Choose up to 10,000 photographs.');
    for (let start = 0; start < b.ids.length; start += 500) metadataInput({ ...b, ids: b.ids.slice(start, start + 500) });
    if (!b.versions || typeof b.versions !== 'object' || Array.isArray(b.versions)) throw new WorkflowError('Preview the selection first.');
    const id = crypto.randomUUID(),
      input = {
        ids: [...new Set(b.ids)],
        patch: b.patch,
        fillBlanks: b.fillBlanks !== false,
        blankFields: b.blankFields,
        versions: b.versions,
      };
    db.prepare("INSERT INTO metadata_jobs(id,input,status,created_at)VALUES(?,?,'pending',?)").run(
      id,
      JSON.stringify(input),
      new Date().toISOString(),
    );
    return { id };
  });
  app.post('/api/photos/bulk-jobs/:job/advance', async (req) =>
    db.transaction(() => {
      const id = String((req.params as Row).job),
        job = one('SELECT * FROM metadata_jobs WHERE id=?', id);
      if (!job) throw new WorkflowError('Batch not found.', 404);
      if (Date.parse(job.created_at) < Date.now() - 30 * 86400000) throw new WorkflowError('This batch expired.', 410);
      if (job.operation_id && !one('SELECT 1 FROM change_journal WHERE id=? AND undone_at IS NULL', job.operation_id))
        throw new WorkflowError('This batch was undone or expired. Start a new preview.', 409);
      const input = JSON.parse(job.input),
        ids = input.ids.slice(job.cursor, job.cursor + 500);
      if (!ids.length) return { cursor: job.cursor, total: input.ids.length, status: 'complete', operationId: job.operation_id };
      const result = metadataBatch(db, { ...input, ids }, true);
      let operationId = job.operation_id ?? result.operationId;
      if (job.operation_id && result.operationId) {
        const previous = one('SELECT changes FROM change_journal WHERE id=?', job.operation_id)!,
          next = one('SELECT changes FROM change_journal WHERE id=?', result.operationId)!;
        db.prepare('UPDATE change_journal SET changes=?,label=? WHERE id=?').run(
          JSON.stringify([...JSON.parse(previous.changes), ...JSON.parse(next.changes)]),
          `Bulk edit ${input.ids.length} photographs`,
          job.operation_id,
        );
        db.prepare('DELETE FROM change_journal WHERE id=?').run(result.operationId);
      }
      const cursor = job.cursor + ids.length,
        status = cursor >= input.ids.length ? 'complete' : 'pending';
      db.prepare('UPDATE metadata_jobs SET cursor=?,status=?,operation_id=? WHERE id=?').run(cursor, status, operationId, id);
      return { cursor, total: input.ids.length, status, operationId };
    })(),
  );
  app.get('/api/gear/aliases', async () => ({
    aliases: all(
      'SELECT a.id,a.gear_id gearId,a.type,a.name,g.name canonical FROM gear_aliases a JOIN gear_items g ON g.id=a.gear_id ORDER BY a.id',
    ),
    owned: all("SELECT id,name,type FROM gear_items WHERE kind='own' AND type IN ('camera','lens') ORDER BY name"),
  }));
  app.post('/api/gear/aliases/preview', async (req, rep) => {
    const b = req.body as Row;
    if (typeof b.name !== 'string' || !b.name.trim() || b.name.length > 120) throw new WorkflowError('Enter a short metadata name.');
    const gear = one("SELECT * FROM gear_items WHERE id=? AND kind='own' AND type IN ('camera','lens')", num(b.gearId));
    if (!gear) return notFound(rep);
    const key = gearKey(b.name);
    const photos = all(`SELECT id,raw_${gear.type} raw,${gear.type} current FROM photos`);
    return { affected: photos.filter((photo) => gearKey(photo.raw || photo.current) === key).length };
  });
  app.post('/api/gear/aliases', async (req, rep) => {
    const b = req.body as Row;
    if (typeof b.name !== 'string' || !b.name.trim() || b.name.length > 120 || !gearKey(b.name))
      throw new WorkflowError('Enter a metadata name.');
    const gear = one("SELECT * FROM gear_items WHERE id=? AND kind='own' AND type IN ('camera','lens')", num(b.gearId));
    if (!gear) return notFound(rep);
    const names = [b.name.trim(), gear.name];
    for (const name of names) {
      const key = gearKey(name),
        old = one('SELECT gear_id FROM gear_aliases WHERE type=? AND key=?', gear.type, key);
      if (old && old.gear_id !== gear.id) throw new WorkflowError('That name already belongs to another owned item.', 409);
      if (one("SELECT 1 FROM gear_discoveries WHERE type=? AND key=? AND state='blacklisted'", gear.type, key))
        throw new WorkflowError('Remove this name from the blocklist before adding an alias.', 409);
    }
    return db.transaction(() => {
      const changes: Row[] = [];
      for (const name of names) {
        const result = db
          .prepare('INSERT OR IGNORE INTO gear_aliases(gear_id,type,name,key)VALUES(?,?,?,?)')
          .run(gear.id, gear.type, name, gearKey(name));
        if (result.changes) {
          const after = one('SELECT * FROM gear_aliases WHERE id=?', Number(result.lastInsertRowid));
          changes.push({ table: 'gear_aliases', id: after!.id, gearId: gear.id, identity: gear.created_at, before: null, after });
        }
      }
      for (const photo of all('SELECT id FROM photos')) syncGearTags(db, photo.id);
      return { ok: true, operationId: journal(db, 'Add gear aliases', changes) };
    })();
  });
  app.delete('/api/gear/aliases/:id', async (req) =>
    db.transaction(() => {
      const before = one('SELECT * FROM gear_aliases WHERE id=?', num((req.params as Row).id));
      if (!before) return { ok: true };
      const gear = one('SELECT * FROM gear_items WHERE id=?', before.gear_id)!;
      db.prepare('DELETE FROM gear_aliases WHERE id=?').run(before.id);
      for (const photo of all('SELECT id FROM photos')) syncGearTags(db, photo.id);
      return {
        ok: true,
        operationId: journal(db, 'Remove gear alias', [
          { table: 'gear_aliases', id: before.id, gearId: gear.id, identity: gear.created_at, before, after: null },
        ]),
      };
    })(),
  );
}
