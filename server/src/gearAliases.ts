import type { DB } from './db.js';
import { gearKey } from './gearBlacklist.js';
export function resolvePhotoAliases(db: DB, id: number) {
  const photo = db.prepare('SELECT camera,lens,raw_camera,raw_lens,gear_src FROM photos WHERE id=?').get(id) as
    Record<string, string> | undefined;
  if (!photo) return;
  for (const type of ['camera', 'lens'] as const) {
    const raw = photo[`raw_${type}`] || photo[type];
    if (!photo[`raw_${type}`] && raw && !photo.gear_src.split(',').includes(type))
      db.prepare(`UPDATE photos SET raw_${type}=? WHERE id=?`).run(raw, id);
    const match = db
      .prepare(
        "SELECT g.name FROM gear_aliases a JOIN gear_items g ON g.id=a.gear_id WHERE a.type=? AND a.key=? AND g.kind='own' AND g.type=?",
      )
      .get(type, gearKey(raw), type) as { name: string } | undefined;
    db.prepare(`UPDATE photos SET ${type}=? WHERE id=?`).run(match?.name ?? raw, id);
  }
}
