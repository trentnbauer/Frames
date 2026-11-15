import fs from 'node:fs';
import type { Ctx } from './ctx.js';
import { backgroundOf, backgroundFile } from './routes/background.js';
import { WorkflowError } from './workflowCore.js';
export function saveVersion(x: Ctx, id: number, name: string) {
  const row = x.one('SELECT * FROM collections WHERE id=?', id);
  if (!row) throw new WorkflowError('Composition not found.', 404);
  if (!name.trim() || name.length > 100) throw new WorkflowError('Give this arrangement a short name.');
  if (Number(x.one('SELECT COUNT(*) n FROM collection_versions WHERE collection_id=?', id)!.n) >= 50)
    throw new WorkflowError('Keep up to 50 arrangements per composition.');
  if (x.one('SELECT 1 FROM collection_versions WHERE collection_id=? AND name=?', id, name.trim()))
    throw new WorkflowError('That arrangement name exists.', 409);
  const data = x.collectionDto(row),
    file = backgroundFile(x.cfg.dataDir, id),
    background = fs.existsSync(file) ? fs.readFileSync(file) : null;
  return x.db.transaction(() => {
    const versionId = Number(
      x.db
        .prepare('INSERT INTO collection_versions(collection_id,name,snapshot,background,created_at)VALUES(?,?,?,?,?)')
        .run(
          id,
          name.trim(),
          JSON.stringify({
            layout: data.layout,
            target: data.target,
            photoIds: data.photoIds,
            chosenIds: data.chosenIds,
            background: backgroundOf(x.db, id),
          }),
          background,
          new Date().toISOString(),
        ).lastInsertRowid,
    );
    for (const photoId of data.photoIds) x.db.prepare('INSERT INTO version_photos(version_id,photo_id)VALUES(?,?)').run(versionId, photoId);
    return versionId;
  })();
}
export function versionSnapshot(x: Ctx, id: number, collectionId: number) {
  const row = x.one('SELECT * FROM collection_versions WHERE id=? AND collection_id=?', id, collectionId);
  if (!row) throw new WorkflowError('This saved arrangement is unavailable.', 404);
  const data = JSON.parse(row.snapshot);
  const members = new Set(x.all('SELECT photo_id FROM version_photos WHERE version_id=?', id).map((item) => item.photo_id));
  if (data.photoIds.some((photoId: number) => !members.has(photoId)))
    throw new WorkflowError('A photograph in this arrangement was removed. Restore or update the arrangement before using it.', 409);
  return { row, data };
}
