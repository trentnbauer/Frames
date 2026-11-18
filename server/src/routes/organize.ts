import type { FastifyInstance } from 'fastify';
import type { Ctx, Row } from '../ctx.js';
import { DUE_REVIEW_SQL } from '../reviewEligibility.js';
import { loadSettings } from '../settings.js';
import { journal, photoChange, photoTags, WorkflowError } from '../workflowCore.js';
const filters = new Set([
  'q',
  'shoot',
  'missing',
  'tag',
  'colour',
  'rating',
  'from',
  'to',
  'camera',
  'lens',
  'film',
  'file',
  'place',
  'gps',
  'shape',
  'light',
  'contrast',
  'exclude',
  'time',
  'review',
  'similarTo',
  'season',
  'near',
  'group',
  'order',
  'variants',
  'semantic',
]);
export function savedFilter(value: unknown) {
  if (typeof value !== 'string' || value.length > 4000) throw new WorkflowError('The filter definition is too long.');
  const out = new URLSearchParams();
  for (const [key, item] of new URLSearchParams(value)) {
    if (!filters.has(key) || item.length > 1000) throw new WorkflowError('Unsupported saved filter.');
    out.set(key, item);
  }
  out.sort();
  return out.toString();
}
export function registerOrganize(app: FastifyInstance, x: Ctx) {
  const { db, all, one, num, notFound } = x;
  app.get('/api/views', async () => all('SELECT id,name,filters FROM saved_views ORDER BY name').map((row) => ({ ...row, version: 1 })));
  app.post('/api/views', async (req, rep) => {
    const b = req.body as Row;
    if (typeof b.name !== 'string' || !b.name.trim() || b.name.length > 100) throw new WorkflowError('Give this view a name.');
    const value = savedFilter(b.filters);
    if (one('SELECT 1 FROM saved_views WHERE name=?', b.name.trim())) throw new WorkflowError('That view name already exists.', 409);
    const id = Number(
      db.prepare('INSERT INTO saved_views(name,filters,created_at)VALUES(?,?,?)').run(b.name.trim(), value, new Date().toISOString())
        .lastInsertRowid,
    );
    return { id, name: b.name.trim(), filters: value };
  });
  app.patch('/api/views/:id', async (req, rep) => {
    const id = num((req.params as Row).id),
      b = req.body as Row,
      view = one('SELECT * FROM saved_views WHERE id=?', id);
    if (!view) return notFound(rep);
    if (b.name !== undefined && (typeof b.name !== 'string' || !b.name.trim() || b.name.length > 100))
      throw new WorkflowError('Give this view a short name.');
    const name = b.name?.trim() ?? view.name;
    if (one('SELECT 1 FROM saved_views WHERE name=? AND id!=?', name, id)) throw new WorkflowError('That view name already exists.', 409);
    db.prepare('UPDATE saved_views SET name=?,filters=? WHERE id=?').run(
      name,
      b.filters === undefined ? view.filters : savedFilter(b.filters),
      id,
    );
    return { ok: true };
  });
  app.delete('/api/views/:id', async (req) => ({
    removed: db.prepare('DELETE FROM saved_views WHERE id=?').run(num((req.params as Row).id)).changes,
  }));
  app.get('/api/review/schedule', async (req) => {
    const q = req.query as Row,
      status = String(q.status ?? 'due');
    if (!['due', 'upcoming', 'complete', 'excluded'].includes(status)) throw new WorkflowError('Choose a review state.');
    const offset = Math.max(0, Math.min(10000000, num(q.offset)));
    const now = new Date().toISOString(),
      sessions = loadSettings(db).sessions;
    const predicates: Record<string, [string, unknown[]]> = {
      due: [DUE_REVIEW_SQL, [now]],
      upcoming: ['p.archived=0 AND p.missing=0 AND p.next_review_at>?', [now]],
      complete: [
        'p.archived=0 AND p.missing=0 AND p.next_review_at IS NULL AND (SELECT COUNT(*) FROM reviews r WHERE r.photo_id=p.id)>=?',
        [sessions],
      ],
      excluded: ['p.archived=1 OR p.missing=1', []],
    };
    const counts = Object.fromEntries(
      Object.entries(predicates).map(([key, [sql, args]]) => [key, one(`SELECT COUNT(*) n FROM photos p WHERE ${sql}`, ...args)!.n]),
    );
    const [where, args] = predicates[status];
    return {
      status,offset,
      counts,
      sessions,
      intervals: loadSettings(db).intervals,
      photos: all(
        `SELECT p.id,p.title,p.file,p.next_review_at due,p.missing,p.archived,s.name shoot,(SELECT COUNT(*) FROM reviews r WHERE r.photo_id=p.id) reviews FROM photos p JOIN shoots s ON s.id=p.shoot_id WHERE ${where} ORDER BY p.next_review_at,p.id LIMIT 100 OFFSET ?`,
        ...args,
        offset,
      ),
    };
  });
  app.post('/api/review/reschedule', async (req) => {
    const b = req.body as Row;
    if (
      !Array.isArray(b.ids) ||
      !b.ids.length ||
      b.ids.length > 500 ||
      b.ids.some((id: unknown) => !Number.isSafeInteger(id) || Number(id) < 1)
    )
      throw new WorkflowError('Choose 1 to 500 photos.');
    if (typeof b.due !== 'string' || b.due.length > 40 || Number.isNaN(Date.parse(b.due))) throw new WorkflowError('Choose a valid date.');
    const due = new Date(b.due).toISOString();
    return db.transaction(() => {
      const changes: Row[] = [];
      for (const id of new Set(b.ids as number[])) {
        const before = one('SELECT * FROM photos WHERE id=? AND missing=0 AND archived=0', id);
        if (!before) continue;
        const tags = photoTags(db, id);
        db.prepare('UPDATE photos SET next_review_at=? WHERE id=?').run(due, id);
        const change = photoChange(before, one('SELECT * FROM photos WHERE id=?', id)!, tags, tags);
        if (change) changes.push(change);
      }
      return { changed: changes.length, operationId: journal(db, 'Change review schedule', changes) };
    })();
  });
}
