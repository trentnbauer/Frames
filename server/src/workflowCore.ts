import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { getSetting, type DB } from './db.js';
import type { Row } from './ctx.js';
export class WorkflowError extends Error {
  constructor(
    message: string,
    public statusCode = 400,
  ) {
    super(message);
  }
}
export const photoFields = [
  'title',
  'title_user',
  'description',
  'desc_source',
  'camera',
  'lens',
  'raw_camera',
  'raw_lens',
  'film',
  'medium',
  'place',
  'place_address',
  'place_kind',
  'place_precision',
  'lat',
  'lon',
  'date_edit',
  'iso',
  'aperture',
  'shutter',
  'focal_mm',
  'focal35',
  'exposure',
  'user_fields',
  'gear_src',
  'gear_sig',
  'archived',
  'next_review_at',
];
export const gearFields = ['name', 'type', 'system', 'serial', 'year', 'why', 'link', 'price'];
export const valuesOf = (row: Row, fields: string[]) => Object.fromEntries(fields.map((field) => [field, row[field] ?? null]));
export const photoVersion = (row: Row, tags: Row[]) =>
  crypto
    .createHash('sha256')
    .update(JSON.stringify([valuesOf(row, photoFields), tags]))
    .digest('hex');
export const photoTags = (db: DB, id: number) => db.prepare('SELECT * FROM tags WHERE photo_id = ? ORDER BY name').all(id) as Row[];
export function journal(db: DB, label: string, changes: Row[]) {
  if (!changes.length) return null;
  return Number(
    db
      .prepare('INSERT INTO change_journal(label, changes, created_at) VALUES(?,?,?)')
      .run(label, JSON.stringify(changes), new Date().toISOString()).lastInsertRowid,
  );
}
export function photoChange(before: Row, after: Row, beforeTags: Row[], afterTags: Row[]) {
  const keys = photoFields.filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]));
  if (!keys.length && JSON.stringify(beforeTags) === JSON.stringify(afterTags)) return null;
  return {
    table: 'photos',
    id: before.id,
    identity: before.hash,
    before: valuesOf(before, keys),
    after: valuesOf(after, keys),
    beforeTags,
    afterTags,
  };
}
export function undoChange(db: DB, id: number) {
  return db.transaction(() => {
    const event = db.prepare('SELECT * FROM change_journal WHERE id = ?').get(id) as Row | undefined;
    if (!event || event.undone_at || Date.parse(event.created_at) < Date.now() - 30 * 86400000)
      throw new WorkflowError('This change is no longer available to undo.', 410);
    const changes = JSON.parse(event.changes) as Row[];
    for (const change of changes) {
      if (change.table === 'gear_aliases') {
        const expected = change.after,
          stored = db.prepare('SELECT * FROM gear_aliases WHERE id=?').get(change.id) as Row | undefined;
        const gear = db.prepare("SELECT * FROM gear_items WHERE id=? AND kind='own'").get(change.gearId) as Row | undefined;
        if (!gear || gear.created_at !== change.identity || JSON.stringify(stored ?? null) !== JSON.stringify(expected))
          throw new WorkflowError('The alias or owned equipment changed after this action.', 409);
        if (
          change.before &&
          db.prepare('SELECT 1 FROM gear_aliases WHERE type=? AND key=? AND id!=?').get(change.before.type, change.before.key, change.id)
        )
          throw new WorkflowError('Another alias now uses this name.', 409);
        continue;
      }
      const table = change.table === 'photos' ? 'photos' : change.table === 'gear_items' ? 'gear_items' : '';
      if (!table) throw new WorkflowError('Unsupported change.', 409);
      const current = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(change.id) as Row | undefined;
      if (
        !current ||
        (table === 'photos' ? current.hash : current.created_at) !== change.identity ||
        Object.keys(change.after).some((key) => JSON.stringify(current[key] ?? null) !== JSON.stringify(change.after[key]))
      )
        throw new WorkflowError('This item changed after that action. Undo would overwrite newer edits.', 409);
      if (change.afterTags && JSON.stringify(photoTags(db, change.id)) !== JSON.stringify(change.afterTags))
        throw new WorkflowError('Tags changed after that action. Keep the newer edits or undo them first.', 409);
    }
    for (const change of changes) {
      if (change.table === 'gear_aliases') {
        if (change.before) {
          const r = change.before;
          db.prepare('INSERT INTO gear_aliases(id,gear_id,type,name,key)VALUES(?,?,?,?,?)').run(r.id, r.gear_id, r.type, r.name, r.key);
        } else db.prepare('DELETE FROM gear_aliases WHERE id=?').run(change.id);
        continue;
      }
      const fields = Object.keys(change.before).filter((key) => (change.table === 'photos' ? photoFields : gearFields).includes(key));
      if (fields.length)
        db.prepare(`UPDATE ${change.table} SET ${fields.map((key) => `${key} = ?`).join(',')} WHERE id = ?`).run(
          ...fields.map((key) => change.before[key]),
          change.id,
        );
      if (change.beforeTags) {
        db.prepare('DELETE FROM tags WHERE photo_id = ?').run(change.id);
        for (const tag of change.beforeTags) insertRow(db, 'tags', tag);
      }
    }
    db.prepare('UPDATE change_journal SET undone_at = ? WHERE id = ?').run(new Date().toISOString(), id);
    return { undone: changes.length };
  })();
}
const snapshotTables = ['tags', 'reviews', 'portfolio_marks', 'removal_kept'];
export const recoveryDays = (db: DB) => getSetting<{ days: number }>(db, 'recoveryPrefs', { days: 30 }).days;
export function pruneRecovery(db: DB) {
  const recoveryCutoff = new Date(Date.now() - recoveryDays(db) * 86400000).toISOString();
  const cutoff = new Date(Date.now() - 30 * 86400000).toISOString();
  db.prepare('DELETE FROM photo_recovery WHERE removed_at < ?').run(recoveryCutoff);
  db.prepare('DELETE FROM change_journal WHERE created_at < ?').run(cutoff);
  db.prepare('DELETE FROM metadata_jobs WHERE created_at < ?').run(cutoff);
}
export function captureRemoval(db: DB, id: number, dataDir: string) {
  const photo = db.prepare('SELECT * FROM photos WHERE id = ?').get(id) as Row | undefined;
  if (!photo) return;
  const shoot = db.prepare('SELECT * FROM shoots WHERE id = ?').get(photo.shoot_id);
  const children = Object.fromEntries(
    snapshotTables.map((table) => [table, db.prepare(`SELECT * FROM ${table} WHERE photo_id = ?`).all(id)]),
  );
  const preview = path.join(dataDir, 'derivatives', String(id), 'thumb.jpg');
  const parentHash = photo.parent_id
    ? (db.prepare('SELECT hash FROM photos WHERE id=?').get(photo.parent_id) as Row | undefined)?.hash
    : null;
  db.prepare('INSERT INTO photo_recovery(title, file, removed_at, snapshot, thumb) VALUES(?,?,?,?,?)').run(
    photo.title,
    photo.file,
    new Date().toISOString(),
    JSON.stringify({ photo, shoot, children, parentHash }),
    fs.existsSync(preview) ? fs.readFileSync(preview) : null,
  );
}
const allowedTables = ['photos', 'shoots', ...snapshotTables];
export function insertRow(db: DB, table: string, row: Row) {
  if (!allowedTables.includes(table)) throw new Error('Invalid recovery table');
  const columns = new Set((db.prepare(`PRAGMA table_info(${table})`).all() as Row[]).map((column) => column.name));
  const fields = Object.keys(row).filter((key) => columns.has(key));
  return db
    .prepare(`INSERT INTO ${table}(${fields.join(',')}) VALUES(${fields.map(() => '?').join(',')})`)
    .run(...fields.map((key) => row[key]));
}
export function restoreRemoval(db: DB, id: number) {
  return db.transaction(() => {
    pruneRecovery(db);
    const entry = db.prepare('SELECT * FROM photo_recovery WHERE id = ?').get(id) as Row | undefined;
    if (!entry) throw new WorkflowError('This recovery entry expired or was already restored.', 410);
    const snapshot = JSON.parse(entry.snapshot, (_key, value) =>
      value?.type === 'Buffer' && Array.isArray(value.data) ? Buffer.from(value.data) : value,
    );
    const photo: Row = snapshot.photo,
      shoot: Row = snapshot.shoot;
    if (db.prepare('SELECT 1 FROM photos WHERE path = ? OR hash = ?').get(photo.path, photo.hash))
      throw new WorkflowError('This photograph is already in your library.', 409);
    const existingShoot = db.prepare('SELECT * FROM shoots WHERE id = ?').get(shoot.id) as Row | undefined;
    if (existingShoot && (existingShoot.imported_at !== shoot.imported_at || existingShoot.name !== shoot.name)) {
      delete shoot.id;
      photo.shoot_id = Number(insertRow(db, 'shoots', shoot).lastInsertRowid);
    } else if (!existingShoot) insertRow(db, 'shoots', shoot);
    if (db.prepare('SELECT 1 FROM photos WHERE id = ?').get(photo.id)) delete photo.id;
    if (
      photo.parent_id &&
      (db.prepare('SELECT hash FROM photos WHERE id = ?').get(photo.parent_id) as Row | undefined)?.hash !== snapshot.parentHash
    )
      photo.parent_id = null;
    photo.missing = fs.existsSync(photo.path) ? 0 : 1;
    photo.has_derivs = 0;
    const photoId = Number(insertRow(db, 'photos', photo).lastInsertRowid);
    for (const table of snapshotTables)
      for (const row of snapshot.children[table] ?? []) {
        const child = { ...row, photo_id: photoId };
        if (table === 'reviews') delete child.id;
        insertRow(db, table, child);
      }
    const ratings = db.prepare('SELECT COUNT(*) n, COALESCE(SUM(rating),0) total FROM reviews WHERE photo_id=?').get(photoId) as Row;
    db.prepare('INSERT OR REPLACE INTO removal_kept(photo_id,review_count,rating_sum) VALUES(?,?,?)').run(
      photoId,
      ratings.n,
      ratings.total,
    );
    db.prepare('DELETE FROM removed WHERE hash = ?').run(photo.hash);
    db.prepare('DELETE FROM photo_recovery WHERE id = ?').run(id);
    return { id: photoId, path: photo.path as string, missing: !!photo.missing };
  })();
}
