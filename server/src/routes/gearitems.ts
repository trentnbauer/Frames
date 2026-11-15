import { blacklistGear, blacklistedGear, foundGear, syncGearDiscoveries, unblacklistGear } from '../gearDiscoveries.js';
import type { FastifyInstance } from 'fastify';
import { getSetting, setSetting, type DB } from '../db.js';
import type { Ctx, Row } from '../ctx.js';

/**
 * Gear & wishlist: what you own, and what you want to buy next (ranked). It is the single source for cameras and lenses; the camera and
 * lens names found in your photographs' EXIF are suggested ("Found in your photos"). It syncs to the portfolio's Gear page.
 */
export const TYPES = ['camera', 'lens', 'film', 'light', 'app', 'other'] as const;
export type GearType = (typeof TYPES)[number];
export const ARRANGE = ['system', 'type', 'used', 'era'] as const;
export const CURRENCIES = ['$', '€', '£', '¥', '₹', 'kr', 'CHF'] as const;
export type Prefs = { showWant: boolean; arrange: (typeof ARRANGE)[number]; intro?: string; systems?: string[]; currency?: string };

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');
const clean = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** The text of the portfolio's Gear page, in the person's chosen arrangement. "Most used" falls back to type there. */
export function gearMarkdown(db: DB): string {
  const prefs = getSetting<Prefs>(db, 'gearPrefs', { showWant: false, arrange: 'system' });
  const own = db.prepare("SELECT * FROM gear_items WHERE kind = 'own' ORDER BY name").all() as Row[];
  const want = db.prepare("SELECT * FROM gear_items WHERE kind = 'want' ORDER BY rank, id").all() as Row[];
  const group = prefs.arrange === 'era' ? (g: Row) => (g.year ? `${Math.floor(g.year / 10) * 10}s` : 'Undated') : prefs.arrange === 'system' ? (g: Row) => g.system || 'Other' : (g: Row) => g.type;
  const by = new Map<string, Row[]>();
  for (const g of own) (by.get(group(g)) ?? by.set(group(g), []).get(group(g))!).push(g);
  const out: string[] = ['# My gear', ''];
  for (const [h, items] of [...by.entries()].sort()) out.push(`## ${h}`, '', ...items.map((g) => `- ${g.name}${g.year ? ` (${g.year})` : ''}`), '');
  // Want to buy comes last, after everything that is owned.
  if (prefs.showWant && want.length) { out.push('## Want to buy', '', ...want.slice(0, 6).map((g, i) => `${i + 1}. ${g.name}${g.why ? ` — ${g.why}` : ''}`), ''); }
  return out.length > 2 ? out.join('\n').trim() : '# My gear\n\nNothing listed yet.';
}

/** The portfolio's Gear page as data: want-to-buy first (only when switched on), then what is owned in the chosen arrangement ("Most used" falls back to type). */
export function gearJson(db: DB) {
  const prefs = getSetting<Prefs>(db, 'gearPrefs', { showWant: false, arrange: 'system' });
  const own = db.prepare("SELECT * FROM gear_items WHERE kind = 'own' ORDER BY name COLLATE NOCASE").all() as Row[];
  const want = (db.prepare("SELECT * FROM gear_items WHERE kind = 'want' ORDER BY rank, id").all() as Row[]).slice(0, 6);
  const TYPE: Record<string, string> = { camera: 'Cameras', lens: 'Lenses', film: 'Film', light: 'Light & meter', app: 'Apps', other: 'Other' };
  const key = prefs.arrange === 'era' ? (g: Row) => (g.year ? `${Math.floor(g.year / 10) * 10}s` : 'Undated') : prefs.arrange === 'system' ? (g: Row) => g.system || 'Other' : (g: Row) => TYPE[g.type] ?? 'Other';
  const by = new Map<string, Row[]>();
  for (const g of own) (by.get(key(g)) ?? by.set(key(g), []).get(key(g))!).push(g);
  const groups = [...by.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([title, items]) => ({ title, count: items.length, items: items.sort((a, b) => Number(b.type === 'camera') - Number(a.type === 'camera')).map((g) => ({ name: g.name, note: g.year ? String(g.year) : '', tag: TYPE[g.type] ?? '' })) }));
  return { currency: prefs.currency ?? '$', intro: prefs.intro ?? '', showWant: prefs.showWant && want.length > 0, want: want.map((w, i) => ({ n: i + 1, name: w.name, price: w.price === null ? '' : String(Math.round(w.price)), url: /^https?:\/\//.test(w.link) ? w.link : '' })), groups, empty: own.length === 0 && want.length === 0 };
}

export function registerGearItems(app: FastifyInstance, x: Ctx) {
  const { db, all, one, num, notFound } = x;
  const prefs = (): Prefs => ({ showWant: false, arrange: 'system', ...getSetting<Partial<Prefs>>(db, 'gearPrefs', {}) });
  const dto = (r: Row) => ({ id: r.id, kind: r.kind, name: r.name, type: r.type, system: r.system, serial: r.serial, year: r.year, why: r.why, link: r.link, price: r.price, rank: r.rank, boughtAt: r.bought_at });

  const rememberSystems = (...names: string[]) => {
    const current = prefs();
    current.systems = [...new Set([...(current.systems ?? []), ...names.filter(Boolean)])];
    setSetting(db, 'gearPrefs', current);
  };
  const validPriority = (priority: unknown, kind: string, extra = 0) => priority === undefined || kind === 'want' && Number.isInteger(priority) && Number(priority) >= 1 && Number(priority) <= Number(one("SELECT COUNT(*) n FROM gear_items WHERE kind = 'want'")!.n) + extra;
  const prioritize = (id: number, priority: number) => {
    const ids = all("SELECT id FROM gear_items WHERE kind = 'want' AND id != ? ORDER BY rank, id", id).map((item) => item.id);
    ids.splice(priority - 1, 0, id);
    const update = db.prepare("UPDATE gear_items SET rank = ? WHERE id = ? AND kind = 'want'");
    ids.forEach((value, index) => update.run(index + 1, value));
  };
  /** Once, on first use: the camera and lens the person had set as defaults become gear they own. */
  const migrate = () => {
    if (getSetting<boolean>(db, 'gearMigrated', false)) return false;
    setSetting(db, 'gearMigrated', true);
    const g = (getSetting<{ gear?: { camera?: string; lens?: string } }>(db, 'settings', {}).gear ?? {}) as { camera?: string; lens?: string };
    let n = 0;
    for (const [name, type] of [[g.camera, 'camera'], [g.lens, 'lens']] as const) if (name && !one('SELECT 1 x FROM gear_items WHERE kind = ? AND replace(lower(name), \' \', \'\') = ?', 'own', name.toLowerCase().replace(/ /g, ''))) { add('own', name, type); n++; }
    return n > 0;
  };
  const add = (kind: 'own' | 'want', name: string, type: GearType, extra: Row = {}) => {
    if (kind === 'own' && extra.system) rememberSystems(extra.system);
    const rank = kind === 'want' ? (extra.front ? ((one("SELECT MIN(rank) m FROM gear_items WHERE kind = 'want'") as Row).m ?? 1) - 1 : ((one("SELECT MAX(rank) m FROM gear_items WHERE kind = 'want'") as Row).m ?? 0) + 1) : 0;
    return Number(db.prepare('INSERT INTO gear_items(kind, name, type, system, year, why, link, price, rank, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)')
      .run(kind, name.slice(0, 120), type, extra.system ?? '', extra.year ?? null, clean(extra.why, 200), clean(extra.link, 300), extra.price ?? null, rank, new Date().toISOString()).lastInsertRowid);
  };

  app.get('/api/gear/items', async () => {
    const moved = migrate();
    const own = all("SELECT * FROM gear_items WHERE kind = 'own' ORDER BY name COLLATE NOCASE").map(dto);
    const want = all("SELECT * FROM gear_items WHERE kind = 'want' ORDER BY rank, id").map(dto);
    // Use counts from EXIF: how many photographs name this camera or lens.
    const used = new Map<string, number>();
    for (const col of ['camera', 'lens']) for (const r of all(`SELECT ${col} n, COUNT(*) c FROM photos WHERE ${col} != '' AND missing = 0 GROUP BY ${col}`)) used.set(norm(String(r.n)), (used.get(norm(String(r.n))) ?? 0) + (r.c as number));
    syncGearDiscoveries(db);
    const found = foundGear(db).slice(0, 40);
    return { own: own.map((g) => ({ ...g, used: used.get(norm(String(g.name))) ?? 0 })), want, found, blacklisted: blacklistedGear(db), prefs: prefs(), movedFromSettings: moved, totals: { want: want.reduce((a, g) => a + (g.price ?? 0), 0), next: want[0]?.price ?? null } };
  });
  app.post('/api/gear/blacklist', async (req, rep) => {
    const name = clean(((req.body ?? {}) as Row).name, 120);
    if (!blacklistGear(db, name)) return rep.code(400).send({ error: 'Enter a camera or lens name.' });
    return { items: blacklistedGear(db) };
  });
  app.delete('/api/gear/blacklist/:id', async (req, rep) => {
    if (!unblacklistGear(db, num((req.params as Row).id))) return notFound(rep);
    return { items: blacklistedGear(db) };
  });
  app.post('/api/gear/items', async (req, rep) => {
    const b = (req.body ?? {}) as Row;
    const name = clean(b.name, 120);
    if (!name) return rep.code(400).send({ error: 'Give it a name.' });
    const kind = b.kind === 'want' ? 'want' : 'own';
    if (!validPriority(b.priority, kind, 1)) return rep.code(400).send({ error: 'Choose a valid wishlist priority.' });
    const type = (TYPES as readonly string[]).includes(b.type) ? (b.type as GearType) : 'other';
    const price = b.price === undefined || b.price === null || b.price === '' ? null : Number(b.price);
    if (price !== null && !(price >= 0 && price < 1e8)) return rep.code(400).send({ error: 'The price must be a number.' });
    if (b.link && !/^https?:\/\//i.test(String(b.link))) return rep.code(400).send({ error: 'A link starts with https://' });
    const id = db.transaction(() => { const added = add(kind, name, type, { system: typeof b.system === 'string' && b.system.trim() ? b.system.trim().slice(0, 60) : undefined, year: Number.isInteger(b.year) ? b.year : null, why: b.why, link: b.link, price, front: b.front === true }); if (b.priority !== undefined) prioritize(added, b.priority); return added; })();
    syncGearDiscoveries(db);
    return dto(one('SELECT * FROM gear_items WHERE id = ?', id)!);
  });
  app.patch('/api/gear/items/:id', async (req, rep) => {
    const id = num((req.params as Row).id);
    const current = one('SELECT * FROM gear_items WHERE id = ?', id);
    if (!current) return notFound(rep);
    const b = (req.body ?? {}) as Row;
    if (!validPriority(b.priority, current.kind)) return rep.code(400).send({ error: 'Choose a valid wishlist priority.' });
    const sets: string[] = [], args: unknown[] = [];
    const set = (col: string, v: unknown) => { sets.push(`${col} = ?`); args.push(v); };
    if (typeof b.name === 'string' && b.name.trim()) { set('name', b.name.trim().slice(0, 120)); }
    if ((TYPES as readonly string[]).includes(b.type)) set('type', b.type);
    if (typeof b.serial === 'string') set('serial', b.serial.trim().slice(0, 60));
    if (typeof b.system === 'string') set('system', b.system.trim().slice(0, 60));
    if (b.year !== undefined) { const y = b.year === null || b.year === '' ? null : Number(b.year); if (y !== null && !(Number.isInteger(y) && y > 1800 && y < 2200)) return rep.code(400).send({ error: 'The year must be a number like 2019.' }); set('year', y); }
    if (typeof b.why === 'string') set('why', b.why.trim().slice(0, 200));
    if (b.link !== undefined) { const l = clean(b.link, 300); if (l && !/^https?:\/\//i.test(l)) return rep.code(400).send({ error: 'A link starts with https://' }); set('link', l); }
    if (b.price !== undefined) { const p = b.price === null || b.price === '' ? null : Number(b.price); if (p !== null && !(p >= 0 && p < 1e8)) return rep.code(400).send({ error: 'The price must be a number.' }); set('price', p); }
    if (sets.length || b.priority !== undefined) db.transaction(() => { const old = one('SELECT kind, system FROM gear_items WHERE id = ?', id)!; if (old.kind === 'own' && typeof b.system === 'string') rememberSystems(old.system, b.system.trim().slice(0, 60)); if (sets.length) db.prepare(`UPDATE gear_items SET ${sets.join(', ')} WHERE id = ?`).run(...args, id); if (b.priority !== undefined) prioritize(id, b.priority); })();
    return dto(one('SELECT * FROM gear_items WHERE id = ?', id)!);
  });
  app.delete('/api/gear/items/:id', async (req) => ({ removed: db.prepare('DELETE FROM gear_items WHERE id = ?').run(num((req.params as Row).id)).changes }));
  app.post('/api/gear/systems', async (req, rep) => {
    const name = clean(((req.body ?? {}) as Row).name, 60);
    if (!name) return rep.code(400).send({ error: 'Give the system a name.' });
    const existing = [...(prefs().systems ?? []), ...all("SELECT DISTINCT system FROM gear_items WHERE kind = 'own'").map((item) => item.system)];
    if (existing.includes(name)) return rep.code(409).send({ error: 'That system already exists.' });
    rememberSystems(name);
    return { name };
  });
  // Empty is a real unassigned system, rather than the display label “Other”.
  app.post('/api/gear/systems/rename', async (req, rep) => {
    const b = (req.body ?? {}) as Row;
    const from = clean(b.from, 60), to = clean(b.to, 60);
    if (typeof b.from !== 'string' || !to) return rep.code(400).send({ error: 'Give the system a name.' });
    return db.transaction(() => {
      const renamed = db.prepare("UPDATE gear_items SET system = ? WHERE kind = 'own' AND system = ?").run(to, from).changes;
      const current = prefs();
      current.systems = [...new Set([...(current.systems ?? []).filter((name) => name !== from), to])];
      setSetting(db, 'gearPrefs', current);
      return { renamed };
    })();
  });
  // "Bought it": the wished-for item becomes something you own.
  app.post('/api/gear/items/:id/bought', async (req, rep) => {
    const id = num((req.params as Row).id);
    if (!one("SELECT 1 x FROM gear_items WHERE id = ? AND kind = 'want'", id)) return notFound(rep);
    db.prepare("UPDATE gear_items SET kind = 'own', rank = 0, bought_at = ?, year = COALESCE(year, ?) WHERE id = ?").run(new Date().toISOString(), new Date().getFullYear(), id);
    return dto(one('SELECT * FROM gear_items WHERE id = ?', id)!);
  });
  // The wishlist order: a list of ids, #1 first.
  app.put('/api/gear/order', async (req, rep) => {
    const ids = ((req.body ?? {}) as Row).ids;
    if (!Array.isArray(ids) || ids.some((i) => !Number.isInteger(i))) return rep.code(400).send({ error: 'Send the ids in order.' });
    db.transaction(() => ids.forEach((id: number, i: number) => db.prepare("UPDATE gear_items SET rank = ? WHERE id = ? AND kind = 'want'").run(i + 1, id)))();
    return { ok: true };
  });
  app.put('/api/gear/prefs', async (req, rep) => {
    const b = (req.body ?? {}) as Row;
    const next = prefs();
    if (typeof b.showWant === 'boolean') next.showWant = b.showWant;
    if (typeof b.intro === 'string') next.intro = b.intro.trim().slice(0, 300);
    if (b.currency !== undefined) { if (!(CURRENCIES as readonly string[]).includes(b.currency)) return rep.code(400).send({ error: 'Choose one of $ € £ ¥ ₹ kr CHF.' }); next.currency = b.currency; }
    if (b.arrange !== undefined) { if (!(ARRANGE as readonly string[]).includes(b.arrange)) return rep.code(400).send({ error: 'Choose system, type, most used or era.' }); next.arrange = b.arrange; }
    setSetting(db, 'gearPrefs', next);
    return next;
  });
}
