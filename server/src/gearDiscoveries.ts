import { purgeBlacklistedGear } from './gear.js';
import { gearKey } from './gearBlacklist.js';
export { gearKey } from './gearBlacklist.js';
import { getSetting, type DB } from './db.js';
import { notify } from './notifications.js';

type GearType = 'camera' | 'lens';
type Found = { name: string; type: GearType; count: number };
const clean = (name: string) => name.trim().slice(0, 120);
const ownedKeys = (db: DB) => {
  const keys = new Set((db.prepare("SELECT name, type FROM gear_items WHERE kind = 'own' AND type IN ('camera', 'lens')").all() as { name: string; type: string }[]).map((g) => `${g.type}:${gearKey(g.name)}`));
  const defaults = getSetting<{ gear?: { camera?: string; lens?: string } }>(db, 'settings', {}).gear;
  for (const type of ['camera', 'lens'] as const) if (defaults?.[type]) keys.add(`${type}:${gearKey(defaults[type])}`);
  return keys;
};
// EXIF often repeats the make (for example “NIKON CORPORATION NIKON D850”).
// Match a complete owned model suffix, never a model prefix such as EOS R versus EOS R5.
const isOwned = (owned: Set<string>, type: GearType, key: string) => owned.has(`${type}:${key}`) || [...owned].some((entry) => {
  const prefix = `${type}:`, model = entry.slice(prefix.length);
  return entry.startsWith(prefix) && model.length >= 6 && key.endsWith(model);
});
const clearDiscovery = (db: DB, id: number) => db.prepare("UPDATE notifications SET read = 1, cleared_at = ? WHERE kind = 'gear-found' AND ref = ? AND cleared_at IS NULL").run(new Date().toISOString(), String(id));

/** One durable discovery per piece, independent of notification retention or dismissal. */
function discover(db: DB, type: GearType, raw: string, owned: Set<string>) {
  const name = clean(raw), key = gearKey(name);
  if (!key) return;
  if (isOwned(owned, type, key)) {
    const old = db.prepare("SELECT id FROM gear_discoveries WHERE type = ? AND key = ? AND state = 'new'").get(type, key) as { id: number } | undefined;
    if (old) { db.prepare("UPDATE gear_discoveries SET state = 'added' WHERE id = ?").run(old.id); clearDiscovery(db, old.id); }
    return;
  }
  const inserted = db.prepare('INSERT OR IGNORE INTO gear_discoveries(type, name, key) VALUES(?, ?, ?)').run(type, name, key);
  if (inserted.changes) notify(db, 'gear-found', `Found ${type === 'camera' ? 'camera' : 'lens'}: ${name}`, { screen: '/gear' }, String(inserted.lastInsertRowid));
}
export function discoverPhotoGear(db: DB, id: number) {
  const photo = db.prepare('SELECT camera, lens FROM photos WHERE id = ? AND missing = 0').get(id) as { camera: string; lens: string } | undefined;
  if (!photo) return;
  const own = ownedKeys(db);
  db.transaction(() => { for (const type of ['camera', 'lens'] as const) discover(db, type, photo[type] || '', own); })();
}
export function foundGear(db: DB): Found[] {
  const own = ownedKeys(db);
  const blocked = new Set((db.prepare("SELECT type, key FROM gear_discoveries WHERE state = 'blacklisted'").all() as { type: string; key: string }[]).map((g) => `${g.type}:${g.key}`));
  const found = new Map<string, Found>();
  for (const type of ['camera', 'lens'] as const) {
    const rows = db.prepare(`SELECT ${type} name, COUNT(*) count FROM photos WHERE ${type} != '' AND missing = 0 GROUP BY ${type}`).all() as { name: string; count: number }[];
    for (const row of rows) {
      const name = clean(row.name), key = `${type}:${gearKey(name)}`;
      if (!gearKey(name) || isOwned(own, type, gearKey(name)) || blocked.has(key)) continue;
      const old = found.get(key);
      if (old) old.count += row.count; else found.set(key, { name, type, count: row.count });
    }
  }
  return [...found.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}
/** Also catches pre-existing libraries or metadata changed outside a scan. */
export function syncGearDiscoveries(db: DB) {
  const own = ownedKeys(db);
  db.transaction(() => {
    for (const row of db.prepare("SELECT id, name, type, key FROM gear_discoveries WHERE state = 'new'").all() as { id: number; name: string; type: GearType; key: string }[]) {
      if (isOwned(own, row.type, row.key)) discover(db, row.type, row.name, own);
    }
    for (const g of foundGear(db)) discover(db, g.type, g.name, own);
  })();
}
export function discoveryForNotification(db: DB, ref: string) {
  return db.prepare('SELECT id, type, name, state FROM gear_discoveries WHERE id = ?').get(ref) as { id: number; type: GearType; name: string; state: string } | undefined;
}
export function resolveGearDiscovery(db: DB, id: number, action: 'add' | 'blacklist') {
  return db.transaction(() => {
    const gear = db.prepare('SELECT * FROM gear_discoveries WHERE id = ?').get(id) as { id: number; type: GearType; name: string; key: string; state: string } | undefined;
    if (!gear) return false;
    if (gear.state === 'new') {
      if (action === 'add' && !isOwned(ownedKeys(db), gear.type, gear.key)) db.prepare("INSERT INTO gear_items(kind, name, type, created_at) VALUES('own', ?, ?, ?)").run(gear.name, gear.type, new Date().toISOString());
      db.prepare('UPDATE gear_discoveries SET state = ? WHERE id = ?').run(action === 'add' ? 'added' : 'blacklisted', id);
    }
    if (action === 'blacklist') purgeBlacklistedGear(db);
    clearDiscovery(db, id);
    return true;
  })();
}

export function blacklistedGear(db: DB) {
  return (db.prepare("SELECT MIN(id) id, MIN(name) name, GROUP_CONCAT(type) types FROM gear_discoveries WHERE state = 'blacklisted' GROUP BY key ORDER BY name COLLATE NOCASE").all() as { id: number; name: string; types: string }[]).map((g) => ({ ...g, types: g.types.split(',') }));
}
export function blacklistGear(db: DB, raw: string) {
  const name = clean(raw), key = gearKey(name);
  if (!key) return false;
  db.transaction(() => {
    for (const type of ['camera', 'lens'] as const) {
      db.prepare("INSERT INTO gear_discoveries(type, name, key, state) VALUES(?, ?, ?, 'blacklisted') ON CONFLICT(type, key) DO UPDATE SET state = 'blacklisted'").run(type, name, key);
      const row = db.prepare('SELECT id FROM gear_discoveries WHERE type = ? AND key = ?').get(type, key) as { id: number };
      clearDiscovery(db, row.id);
    }
    purgeBlacklistedGear(db);
  })();
  return true;
}
export function unblacklistGear(db: DB, id: number) {
  const row = db.prepare("SELECT key FROM gear_discoveries WHERE id = ? AND state = 'blacklisted'").get(id) as { key: string } | undefined;
  if (!row) return false;
  db.prepare("UPDATE gear_discoveries SET state = 'new' WHERE key = ? AND state = 'blacklisted'").run(row.key);
  return true;
}
