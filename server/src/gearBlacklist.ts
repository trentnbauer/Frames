import type { DB } from './db.js';

/** The same exact-model matching used by discovery and the blacklist tag UI. */
export const gearKey = (name: string) => name.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

/** Clear blocked camera/lens values from Frames records; original files and other metadata stay untouched. */
export function clearBlacklistedPhotoGear(db: DB, id?: number): number[] {
  const blocked = new Set((db.prepare("SELECT type, key FROM gear_discoveries WHERE state = 'blacklisted'").all() as { type: string; key: string }[]).map((g) => `${g.type}:${g.key}`));
  if (!blocked.size) return [];
  const rows = db.prepare(`SELECT id, camera, lens, gear_src FROM photos${id === undefined ? " WHERE camera != '' OR lens != ''" : ' WHERE id = ?'}`).all(...(id === undefined ? [] : [id])) as { id: number; camera: string; lens: string; gear_src: string }[];
  const changed: number[] = [];
  db.transaction(() => {
    for (const row of rows) {
      const src = new Set(row.gear_src.split(',').filter(Boolean));
      let touched = false;
      for (const type of ['camera', 'lens'] as const) if (row[type] && blocked.has(`${type}:${gearKey(row[type].trim().slice(0, 120))}`)) { row[type] = ''; src.delete(type); touched = true; }
      if (!touched) continue;
      db.prepare('UPDATE photos SET camera = ?, lens = ?, gear_src = ? WHERE id = ?').run(row.camera, row.lens, [...src].join(','), row.id);
      changed.push(row.id);
    }
  })();
  return changed;
}
