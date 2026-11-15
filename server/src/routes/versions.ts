import fs from 'node:fs';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { Ctx, Row } from '../ctx.js';
import { saveVersion, versionSnapshot } from '../compositionVersions.js';
import { WorkflowError } from '../workflowCore.js';
import { chosenOf, parseLayout } from '../layout.js';
import { setSetting } from '../db.js';
import { backgroundFile } from './background.js';
import { printSheetPdf, type SheetLine } from '../printSheet.js';
export function registerVersions(app: FastifyInstance, x: Ctx) {
  const { db, all, one, num, notFound } = x;
  app.get('/api/collections/:id/versions', async (req, rep) => {
    const id = num((req.params as Row).id);
    if (!one('SELECT 1 FROM collections WHERE id=?', id)) return notFound(rep);
    return all(
      'SELECT v.id,v.name,v.snapshot,v.created_at,(SELECT COUNT(*) FROM shares sh WHERE sh.version_id=v.id) links FROM collection_versions v WHERE collection_id=? ORDER BY id DESC',
      id,
    ).map((row) => ({
      id: row.id,
      name: row.name,
      createdAt: row.created_at,
      links: row.links,
      available:
        Number(one('SELECT COUNT(*) n FROM version_photos WHERE version_id=?', row.id)!.n) === JSON.parse(row.snapshot).photoIds.length,
      ...JSON.parse(row.snapshot),
    }));
  });
  app.post('/api/collections/:id/versions', async (req) => {
    const id = num((req.params as Row).id),
      b = req.body as Row;
    if (typeof b.name !== 'string') throw new WorkflowError('Give the arrangement a name.');
    return { id: saveVersion(x, id, b.name) };
  });
  app.patch('/api/collections/:id/versions/:vid', async (req, rep) => {
    const q = req.params as Row,
      id = num(q.id),
      vid = num(q.vid),
      b = req.body as Row;
    if (!one('SELECT 1 FROM collection_versions WHERE id=? AND collection_id=?', vid, id)) return notFound(rep);
    if (typeof b.name !== 'string' || !b.name.trim() || b.name.length > 100) throw new WorkflowError('Give the arrangement a short name.');
    if (one('SELECT 1 FROM collection_versions WHERE collection_id=? AND name=? AND id!=?', id, b.name.trim(), vid))
      throw new WorkflowError('That name exists.', 409);
    db.prepare('UPDATE collection_versions SET name=? WHERE id=?').run(b.name.trim(), vid);
    return { ok: true };
  });
  app.delete('/api/collections/:id/versions/:vid', async (req) => {
    const q = req.params as Row;
    if (one('SELECT 1 FROM shares WHERE version_id=?', num(q.vid)))
      throw new WorkflowError('Choose another arrangement for links using this version before deleting it.', 409);
    return { removed: db.prepare('DELETE FROM collection_versions WHERE id=? AND collection_id=?').run(num(q.vid), num(q.id)).changes };
  });
  app.get('/api/collections/:id/versions/:vid/background', async (req, rep) => {
    const q = req.params as Row,
      row = one('SELECT background FROM collection_versions WHERE id=? AND collection_id=?', num(q.vid), num(q.id));
    if (!row?.background) return notFound(rep);
    return rep.type('image/jpeg').header('Cache-Control', 'private,no-store').send(row.background);
  });
  app.post('/api/collections/:id/versions/:vid/apply', async (req) => {
    const q = req.params as Row,
      id = num(q.id),
      vid = num(q.vid),
      current = one('SELECT * FROM collections WHERE id=?', id);
    if (!current) throw new WorkflowError('Composition not found.', 404);
    if (current.stage === 'done') throw new WorkflowError('Choose Progress or Review before changing a Done composition.', 409);
    const { row, data } = versionSnapshot(x, vid, id);
    const members = new Set(data.photoIds as number[]),
      layout = parseLayout(data.layout, members);
    if (!layout) throw new WorkflowError('The saved layout is invalid.', 409);
    const file = backgroundFile(x.cfg.dataDir, id),
      previous = fs.existsSync(file) ? fs.readFileSync(file) : null;
    const staging = file + '.arrangement-new';
    let replaced = false;
    try {
      const result = db.transaction(() => {
        const backup = saveVersion(x, id, `Before ${row.name.slice(0, 50)} ${new Date().toISOString()}`);
        db.prepare("UPDATE shares SET version_id=? WHERE kind='collection' AND target_id=? AND version_id IS NULL").run(backup, id);
        let pos = Number(one('SELECT COALESCE(MAX(pos),0)+1 n FROM collection_photos WHERE collection_id=?', id)!.n);
        for (const photoId of data.photoIds)
          db.prepare('INSERT OR IGNORE INTO collection_photos(collection_id,photo_id,pos,chosen)VALUES(?,?,?,0)').run(id, photoId, pos++);
        db.prepare('UPDATE collection_photos SET chosen=0 WHERE collection_id=?').run(id);
        for (const [order, photoId] of chosenOf(layout).entries())
          db.prepare('UPDATE collection_photos SET chosen=1,pos=? WHERE collection_id=? AND photo_id=?').run(order, id, photoId);
        db.prepare("UPDATE collections SET layout=?,target=?,stage='progress',printed_at=NULL WHERE id=?").run(
          JSON.stringify(layout),
          data.target ? JSON.stringify(data.target) : null,
          id,
        );
        if (data.background && row.background) {
          fs.mkdirSync(path.dirname(file), { recursive: true });
          fs.writeFileSync(staging, row.background);
          fs.renameSync(staging, file);
          replaced = true;
          setSetting(db, `background:${id}`, { ...data.background, v: Date.now() });
        } else {
          fs.rmSync(file, { force: true });
          replaced = true;
          db.prepare('DELETE FROM settings WHERE key=?').run(`background:${id}`);
        }
        return { ok: true, backupVersionId: backup };
      })();
      return result;
    } catch (error) {
      if (replaced) {
        if (previous) {
          fs.writeFileSync(staging, previous);
          fs.renameSync(staging, file);
        } else fs.rmSync(file, { force: true });
      }
      throw error;
    } finally {
      fs.rmSync(staging, { force: true });
    }
  });
  app.get('/api/collections/:id/versions/:vid/photos/:pid/original', async (req, rep) => {
    const q = req.params as Row,
      { data } = versionSnapshot(x, num(q.vid), num(q.id));
    const pid = num(q.pid);
    if (!chosenOf(data.layout).includes(pid)) return notFound(rep);
    const query = req.query as Row;
    return rep
      .header('Cache-Control', 'private,no-store')
      .redirect(`/api/photos/${pid}/original?n=${num(query.n, 1)}&pad=${num(query.pad, 1)}`);
  });
  app.get('/api/collections/:id/versions/:vid/print-sheet', async (req, rep) => {
    const q = req.params as Row,
      id = num(q.id),
      { row, data } = versionSnapshot(x, num(q.vid), id),
      collection = one('SELECT name FROM collections WHERE id=?', id)!;
    const lines: SheetLine[] = [{ text: `${collection.name} — ${row.name}`, size: 20, bold: true }];
    for (const [order, print] of data.layout.prints.entries()) {
      const frame = print.frame ? `${print.frame.color} ${print.frame.size} frame, ${print.frame.mat} mat` : 'unframed';
      lines.push({
        text: `Print ${order + 1}: ${print.size} ${print.orientation}${print.stack ? ' (two stacked)' : ''} - ${frame}`,
        bold: true,
      });
      lines.push({
        text: `Position ${print.x}, ${print.y} mm${print.crop ? `; crop ${print.crop.zoom}x, shift ${print.crop.shiftX}, ${print.crop.shiftY}` : ''}`,
      });
      for (const photoId of [print.photoId, print.stack ? print.photoId2 : null])
        if (photoId) {
          const photo = one('SELECT title,file,w,h FROM photos WHERE id=?', photoId);
          lines.push({ text: photo ? `${photo.title || photo.file} (${photo.w} x ${photo.h} px)` : 'Photograph unavailable' });
        }
    }
    return rep
      .type('application/pdf')
      .header('Cache-Control', 'private,no-store')
      .header('Content-Disposition', 'attachment; filename="arrangement-print-sheet.pdf"')
      .send(printSheetPdf(lines));
  });
}
