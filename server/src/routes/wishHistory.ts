import type { FastifyInstance } from 'fastify';
import type { Ctx, Row } from '../ctx.js';
import { restoreWish } from '../wishHistory.js';
import { WorkflowError } from '../workflowCore.js';
export function registerWishHistory(app: FastifyInstance, x: Ctx) {
  const { db, all, one, num, notFound } = x;
  app.get('/api/gear/history', async (req) => {
    const kind = String((req.query as Row).kind ?? 'bought');
    if (!['bought', 'declined'].includes(kind)) throw new WorkflowError('Choose bought or declined.');
    return {
      kind,
      counts: Object.fromEntries(all('SELECT event,COUNT(*) n FROM wishlist_history GROUP BY event').map((row) => [row.event, row.n])),
      entries: all('SELECT * FROM wishlist_history WHERE event=? ORDER BY date DESC,id DESC LIMIT 200', kind).map((row) => {
        const snapshot = JSON.parse(row.snapshot);
        return {
          id: row.id,
          name: snapshot.name,
          link: snapshot.link,
          estimated: row.estimated,
          paid: row.paid,
          currency: row.currency,
          date: row.date,
          note: row.note,
          restored: !!row.restored_at,
        };
      }),
    };
  });
  app.post('/api/gear/history/:id/restore', async (req) => restoreWish(db, num((req.params as Row).id), false));
  app.post('/api/gear/history/:id/undo', async (req) => restoreWish(db, num((req.params as Row).id), true));
  app.patch('/api/gear/history/:id', async (req, rep) => {
    const id = num((req.params as Row).id),
      b = req.body as Row,
      event = one('SELECT * FROM wishlist_history WHERE id=?', id);
    if (!event) return notFound(rep);
    if (event.event !== 'bought') throw new WorkflowError('Only purchase details can be edited.');
    const paid = b.paid === undefined ? event.paid : b.paid;
    if (paid !== null && (typeof paid !== 'number' || !Number.isFinite(paid) || paid < 0 || paid >= 1e8))
      throw new WorkflowError('Choose a valid paid amount.');
    const date = b.date ?? event.date;
    if (typeof date !== 'string' || date.length > 40 || Number.isNaN(Date.parse(date)))
      throw new WorkflowError('Choose a valid purchase date.');
    if (b.note !== undefined && (typeof b.note !== 'string' || b.note.length > 1000)) throw new WorkflowError('Use a short purchase note.');
    db.prepare('UPDATE wishlist_history SET paid=?,date=?,note=? WHERE id=?').run(
      paid,
      new Date(date).toISOString(),
      b.note ?? event.note,
      id,
    );
    return { ok: true };
  });
}
