import type { FastifyInstance } from 'fastify';
import { getSetting, setSetting } from '../db.js';
import type { Ctx, Row } from '../ctx.js';

const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
/** "9 Nov 2026": the default name of a shoot made today. */
export const fmtDay = (d: Date) => `${d.getUTCDate()} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()]} ${d.getUTCFullYear()}`;

/** Home: sync batches that still need a name, and splitting a shoot by the day its photographs were taken. */
export function registerHome(app: FastifyInstance, x: Ctx) {
  const { db, all, one, num, notFound } = x;
  // Any change to a composition (its photographs, name, layout) stamps it, so pickers can list the ones worked on most recently.
  app.addHook('onSend', (req, rep, payload, next) => {
    const m = req.method !== 'GET' && rep.statusCode < 400 ? /^\/api\/collections\/(\d+)(\/|\?|$)/.exec(req.url) : null;
    if (m) { try { db.prepare('UPDATE collections SET updated_at = ? WHERE id = ?').run(new Date().toISOString(), Number(m[1])); } catch { /* the response is already decided */ } }
    next(null, payload);
  });
  const done = () => new Set(getSetting<number[]>(db, 'batchesDone', []));
  const keepDone = (s: Set<number>) => setSetting(db, 'batchesDone', [...s].slice(-500));

  /** The day a photograph was taken (its own date, or the day it came in), as YYYY-MM-DD. */
  const dayOf = (p: Row) => String(p.captured_at || p.added_at || '').slice(0, 10) || 'unknown';

  // Shoots that came in by a sync and still carry their automatic date name. The page shows them only when a cloud service is set up.
  app.get('/api/home/batches', async () => {
    const d = done();
    const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const rows = all("SELECT * FROM shoots WHERE source LIKE 'Library sync%' AND imported_at > ? ORDER BY imported_at DESC LIMIT 12", since);
    const batches = rows.map((s) => {
      const photos = all('SELECT captured_at, added_at FROM photos WHERE shoot_id = ? AND missing = 0 ORDER BY id LIMIT 5000', s.id);
      const days = new Set(photos.map(dayOf));
      const covers = all('SELECT id FROM photos WHERE shoot_id = ? AND missing = 0 ORDER BY id LIMIT 2', s.id).map((p) => p.id as number);
      return { id: s.id as number, name: s.name as string, count: photos.length, days: days.size, importedAt: s.imported_at as string, covers, done: d.has(s.id as number) };
    }).filter((b) => b.count > 0);
    return { batches, left: batches.filter((b) => !b.done).length };
  });
  app.post('/api/home/batches/:id/done', async (req, rep) => {
    const id = num((req.params as Row).id);
    if (!one('SELECT 1 x FROM shoots WHERE id = ?', id)) return notFound(rep);
    const s = done();
    if (((req.body ?? {}) as Row).on === false) s.delete(id); else s.add(id);
    keepDone(s);
    return { ok: true };
  });

  // One shoot becomes one per day. A blank name keeps the shoot's own; each new name is "<name> · Fri".
  app.post('/api/shoots/:id/split-by-day', async (req, rep) => {
    const id = num((req.params as Row).id);
    const s = one('SELECT * FROM shoots WHERE id = ?', id);
    if (!s) return notFound(rep);
    const base = String(((req.body ?? {}) as Row).name ?? '').trim().slice(0, 100) || String(s.name);
    const photos = all('SELECT id, captured_at, added_at FROM photos WHERE shoot_id = ? AND missing = 0 ORDER BY COALESCE(captured_at, added_at), id', id);
    const byDay = new Map<string, number[]>();
    for (const p of photos) (byDay.get(dayOf(p)) ?? byDay.set(dayOf(p), []).get(dayOf(p))!).push(p.id as number);
    if (byDay.size < 2) return rep.code(400).send({ error: 'These photographs are all from one day.' });
    const made: number[] = [];
    db.transaction(() => {
      let first = true;
      for (const [day, ids] of byDay) {
        const t = new Date(`${day}T12:00:00Z`);
        const label = `${base} · ${Number.isNaN(+t) ? day : DAY[t.getUTCDay()]}`;
        let target = id;
        if (first) { db.prepare('UPDATE shoots SET name = ? WHERE id = ?').run(label.slice(0, 120), id); first = false; }
        else {
          target = Number(db.prepare('INSERT INTO shoots(name, source, place, description, imported_at) VALUES(?, ?, ?, ?, ?)').run(label.slice(0, 120), s.source, s.place, '', s.imported_at).lastInsertRowid);
          db.prepare(`UPDATE photos SET shoot_id = ? WHERE id IN (${ids.map(() => '?').join(',')})`).run(target, ...ids);
        }
        made.push(target);
      }
    })();
    return { shootIds: made, shoots: made.map((m) => x.shootDto(one('SELECT * FROM shoots WHERE id = ?', m)!)) };
  });
}
