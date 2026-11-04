import type { FastifyInstance } from 'fastify';
import { loadCloud } from '../cloud.js';
import type { Ctx, Row } from '../ctx.js';

/** One thing for the person to do: a kind, how many photographs it covers, and the first few of them. */
export type TodoItem = { key: string; title: string; detail: string; count: number; photoIds: number[]; /** Every photograph in the item (newest first), so the photograph page can step through them. */ ids?: number[]; link?: string };

const SAMPLE = 24;

/**
 * Everything that is waiting on the person: photographs with no subject or tag, AI suggestions to approve,
 * colours not read yet, and a cloud account that needs reconnecting. Nothing here changes anything.
 */
export function registerTodo(app: FastifyInstance, x: Ctx) {
  const { db, all } = x;

  const todo = (): TodoItem[] => {
    const items: TodoItem[] = [];
    const ids = (sql: string): number[] => (all(sql) as Row[]).map((r) => r.id as number);
    const add = (key: string, title: string, detail: string, list: number[], link?: string) => {
      if (list.length) items.push({ key, title, detail, count: list.length, photoIds: list.slice(0, SAMPLE), ids: list.slice(0, 2000), link });
    };

    // AI suggestions waiting for a yes or no: suggested tags and subjects, and a suggested description.
    const pendingTags = new Set(ids("SELECT DISTINCT p.id FROM photos p JOIN tags t ON t.photo_id = p.id WHERE p.missing = 0 AND t.source = 'ai' AND t.accepted = 0 ORDER BY p.id DESC"));
    const pendingDesc = (all("SELECT id, ai_json FROM photos WHERE missing = 0 AND ai_status = 'done' AND description = '' AND ai_json LIKE '%description%' ORDER BY id DESC") as Row[])
      .filter((r) => { try { const a = JSON.parse(r.ai_json as string); return !!a.description && !a.descriptionRejected; } catch { return false; } })
      .map((r) => r.id as number);
    add('ai-tags', 'Approve the AI’s suggested tags and subjects', 'The AI suggested these. Nothing is kept until you accept it.', [...pendingTags]);
    add('ai-description', 'Approve the AI’s suggested descriptions', 'A suggested description is shown on the photograph’s page until you accept or reject it.', pendingDesc);

    // Photographs with nothing set yet (newest first, so what was just brought in comes first).
    add('subjects', 'Add a subject', 'No subject yet, so these do not show up when you filter the library or a composition by subject.',
      ids("SELECT p.id FROM photos p WHERE p.missing = 0 AND NOT EXISTS (SELECT 1 FROM tags t WHERE t.photo_id = p.id AND t.kind = 'subject' AND t.accepted = 1) ORDER BY p.id DESC"));
    add('tags', 'Add a tag', 'No tags yet.',
      ids("SELECT p.id FROM photos p WHERE p.missing = 0 AND NOT EXISTS (SELECT 1 FROM tags t WHERE t.photo_id = p.id AND t.kind = 'tag' AND t.accepted = 1) ORDER BY p.id DESC"));
    add('colours', 'Colours not read yet', 'The dominant colours are read from the preview, so these cannot be found by colour yet. A scan fills them in.',
      ids("SELECT p.id FROM photos p WHERE p.missing = 0 AND (p.palette IS NULL OR p.palette = '' OR p.palette = '[]') ORDER BY p.id DESC"));

    const stuck = loadCloud(db).connections.filter((c) => c.needsReconnect);
    if (stuck.length) items.push({ key: 'cloud', title: 'Reconnect a cloud account', detail: `${stuck.map((c) => c.account || c.provider).join(', ')} stopped syncing and needs to be reconnected.`, count: stuck.length, photoIds: [], link: '/settings?section=cloud' });
    return items;
  };

  // Accepts every AI suggestion of one kind. Only what the AI suggested and is still waiting: nothing a person added or rejected.
  app.post('/api/todo/accept-ai', async (req, rep) => {
    const kind = ((req.body ?? {}) as Row).kind;
    if (kind === 'tags') {
      const r = db.prepare("UPDATE tags SET accepted = 1 WHERE source = 'ai' AND accepted = 0 AND photo_id IN (SELECT id FROM photos WHERE missing = 0)").run();
      return { accepted: r.changes };
    }
    if (kind === 'description') {
      let n = 0;
      for (const r of all("SELECT id, ai_json FROM photos WHERE missing = 0 AND ai_status = 'done' AND description = '' AND ai_json LIKE '%description%'") as Row[]) {
        try {
          const a = JSON.parse(r.ai_json as string);
          if (a.description && !a.descriptionRejected) { db.prepare("UPDATE photos SET description = ?, desc_source = 'user' WHERE id = ?").run(String(a.description).slice(0, 2000), r.id); n++; }
        } catch { /* an unreadable suggestion is left alone */ }
      }
      return { accepted: n };
    }
    return rep.code(400).send({ error: 'kind must be tags or description' });
  });

  app.get('/api/todo', async () => {
    const items = todo();
    return { total: items.reduce((n, i) => n + i.count, 0), kinds: items.length, items };
  });
}
