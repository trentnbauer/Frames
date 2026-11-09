import { getSetting, type DB } from './db.js';

/**
 * Default camera details. A person can set defaults for every new photograph (Settings), and a photoshoot can have its own, which win
 * over the person's. A default only ever fills a blank: what the file says, and anything typed by hand, is never replaced.
 * `gear_src` on a photograph lists which of its details came from a default, so a default that changes or is removed is followed, while
 * a value the file or the person supplied later takes over for good.
 */
export const GEAR_FIELDS = ['camera', 'lens', 'medium', 'film'] as const;
export type GearField = (typeof GEAR_FIELDS)[number];
export type Gear = Record<GearField, string>;
export const NO_GEAR: Gear = { camera: '', lens: '', medium: '', film: '' };

/** Checks gear from the network: only the four known details, as short text, and film only goes with film. */
export function cleanGear(raw: unknown): Gear {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const t = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const medium = r.medium === 'film' || r.medium === 'digital' ? r.medium : '';
  return { camera: t(r.camera, 120), lens: t(r.lens, 120), medium, film: medium === 'film' ? t(r.film, 60) : '' };
}
export const parseGear = (s: unknown): Gear => { try { return cleanGear(JSON.parse(String(s || '{}'))); } catch { return { ...NO_GEAR }; } };

const list = (s: unknown) => String(s ?? '').split(',').filter(Boolean);

/**
 * Fills in a photograph's blank camera details from defaults. `personal` includes the person's own defaults (for photographs as they
 * come in); a photoshoot being changed passes false, so earlier photographs are never touched by a personal default.
 */
export function applyGear(db: DB, photoId: number, personal: boolean) {
  const p = db.prepare('SELECT shoot_id, camera, lens, medium, film, user_fields, gear_src FROM photos WHERE id = ?').get(photoId) as Record<string, string | number> | undefined;
  if (!p) return;
  const shoot = parseGear((db.prepare('SELECT gear FROM shoots WHERE id = ?').get(p.shoot_id) as { gear: string } | undefined)?.gear);
  const mine = getSetting<{ gear?: unknown }>(db, 'settings', {}).gear;
  const own = personal ? cleanGear(mine) : { ...NO_GEAR };
  const hand = new Set(list(p.user_fields));
  const src = new Set(list(p.gear_src));
  const was = Object.fromEntries(GEAR_FIELDS.map((f) => [f, String(p[f] ?? '')])) as Gear;
  const val: Gear = { ...was };
  for (const f of GEAR_FIELDS) {
    if (hand.has(f)) { src.delete(f); continue; }
    const want = shoot[f] || own[f];
    if (want && (!was[f] || src.has(f))) { val[f] = want; src.add(f); }
    else if (!want && src.has(f)) { val[f] = ''; src.delete(f); } // the default it came from is gone
  }
  if (val.medium !== 'film' && src.has('film')) { val.film = ''; src.delete('film'); } // a film stock only goes with film
  const changed = GEAR_FIELDS.filter((f) => val[f] !== was[f]);
  const next = [...src].join(',');
  if (changed.length || next !== String(p.gear_src ?? '')) db.prepare(`UPDATE photos SET ${[...changed.map((f) => `${f} = ?`), 'gear_src = ?'].join(', ')} WHERE id = ?`).run(...changed.map((f) => val[f]), next, photoId);
  syncGearTags(db, photoId);
}

/** A photoshoot's defaults changed: its photographs follow (the person's own defaults are not applied to photographs already here). */
export function applyShootGear(db: DB, shootId: number) {
  for (const r of db.prepare('SELECT id FROM photos WHERE shoot_id = ?').all(shootId) as { id: number }[]) applyGear(db, r.id, false);
}

/** Wide angle, regular or telephoto, from a focal length in 35mm terms (a 35mm-equivalent from the file where it has one, else the lens's own, which is right for a full-frame camera). */
export const lensKind = (mm: number | null | undefined): string => (!mm || mm <= 0 ? '' : mm <= 35 ? 'wide angle' : mm <= 70 ? 'regular' : 'telephoto');

/**
 * The camera, lens, film stock and field of view as tags (source "gear"), so they can be searched and used in compositions
 * ("Sunsets on Kodak Gold", "Cars on telephoto"). Tags that no longer match are taken away; one a person removed is not put back
 * unless its detail changes. Run whenever the details can have changed.
 */
export function syncGearTags(db: DB, photoId: number) {
  const p = db.prepare('SELECT camera, lens, medium, film, focal_mm, focal35, gear_sig FROM photos WHERE id = ?').get(photoId) as { camera: string; lens: string; medium: string; film: string; focal_mm: number | null; focal35: number | null; gear_sig: string } | undefined;
  if (!p) return;
  const tag = (s: string) => s.trim().toLowerCase().slice(0, 60);
  const want = [...new Set([p.camera, p.lens, p.medium, p.medium === 'film' ? p.film : '', lensKind(p.focal35 ?? p.focal_mm)].map(tag).filter(Boolean))];
  const was: string[] = (() => { try { return JSON.parse(p.gear_sig || '[]'); } catch { return []; } })();
  if (JSON.stringify(want) === JSON.stringify(was)) return;
  db.transaction(() => {
    for (const old of was.filter((n) => !want.includes(n))) db.prepare("DELETE FROM tags WHERE photo_id = ? AND name = ? AND source = 'gear'").run(photoId, old);
    for (const n of want.filter((n) => !was.includes(n))) db.prepare("INSERT OR IGNORE INTO tags(photo_id, name, source, accepted, kind) VALUES(?, ?, 'gear', 1, 'tag')").run(photoId, n);
    db.prepare('UPDATE photos SET gear_sig = ? WHERE id = ?').run(JSON.stringify(want), photoId);
  })();
}
