import type { DB } from './db.js';
import type { Row } from './ctx.js';
import { getSetting } from './db.js';
import { WorkflowError } from './workflowCore.js';
export function rememberWish(db: DB, before: Row, event: 'bought' | 'declined', after?: Row, date = new Date().toISOString()) {
  return Number(
    db
      .prepare('INSERT INTO wishlist_history(event,snapshot,owned_after,owned_id,estimated,paid,currency,date)VALUES(?,?,?,?,?,?,?,?)')
      .run(
        event,
        JSON.stringify(before),
        after ? JSON.stringify(after) : null,
        after?.id ?? null,
        before.price,
        after?.price ?? null,
        getSetting<{ currency?: string }>(db, 'gearPrefs', {}).currency ?? '$',
        date,
      ).lastInsertRowid,
  );
}
export function restoreWish(db: DB, id: number, undo: boolean) {
  return db.transaction(() => {
    const event = db.prepare('SELECT * FROM wishlist_history WHERE id=?').get(id) as Row | undefined;
    if (!event || event.restored_at) throw new WorkflowError('This decision was already restored or is unavailable.', 410);
    const old = JSON.parse(event.snapshot) as Row;
    if (undo && event.event === 'bought') {
      const owned = db.prepare('SELECT * FROM gear_items WHERE id=?').get(event.owned_id) as Row | undefined;
      if (
        !owned ||
        JSON.stringify(owned) !== event.owned_after ||
        db.prepare('SELECT 1 FROM gear_aliases WHERE gear_id=?').get(owned.id) ||
        db.prepare('SELECT 1 FROM photos WHERE camera=? OR lens=?').get(owned.name, owned.name)
      )
        throw new WorkflowError('Owned gear has changed or is used by photos. Restore the wish without removing the owned item.', 409);
      db.prepare('DELETE FROM gear_items WHERE id=?').run(owned.id);
    }
    const fields = ['name', 'type', 'system', 'serial', 'year', 'why', 'link', 'price'];
    const rank = (db.prepare("SELECT COALESCE(MAX(rank),0)+1 n FROM gear_items WHERE kind='want'").get() as Row).n;
    const restored = Number(
      db
        .prepare(`INSERT INTO gear_items(kind,${fields.join(',')},rank,created_at)VALUES('want',${fields.map(() => '?').join(',')},?,?)`)
        .run(...fields.map((key) => old[key] ?? (key === 'price' || key === 'year' ? null : '')), rank, new Date().toISOString())
        .lastInsertRowid,
    );
    db.prepare('UPDATE wishlist_history SET restored_at=? WHERE id=?').run(new Date().toISOString(), id);
    return { id: restored };
  })();
}
