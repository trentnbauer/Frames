import type { FastifyInstance } from 'fastify';
import { loadCloud } from '../cloud.js';
import { getSetting, setSetting } from '../db.js';
import { displayNameOf } from './profile.js';
import type { Ctx, Row } from '../ctx.js';
import { loadSettings } from '../settings.js';
import { deleteSuggestions } from '../remove.js';

/** One thing for the person to do: a kind, how many photographs it covers, and the first few of them. */
export type TodoItem = { key: string; title: string; detail: string; count: number; photoIds: number[]; /** Every photograph in the item (newest first), so the photograph page can step through them. */ ids?: number[]; link?: string };

const SAMPLE = 24;

/**
 * Everything that is waiting on the person: photographs with no subject or tag, AI suggestions to approve,
 * colours not read yet, and a cloud account that needs reconnecting. Nothing here changes anything.
 */
export function registerTodo(app: FastifyInstance, x: Ctx) {
  const { db, all, one, num } = x;

  /**
   * What each photograph still needs, for the one-at-a-time view: its subjects and tags (a suggestion to approve, or none yet), its place,
   * and its description (an AI one to approve; a missing one is only asked for on a photograph that is on the list for something else, so
   * a library full of undescribed photographs does not become a to-do list of thousands). Newest first.
   */
  type Need = { tags: boolean; place: boolean; desc: boolean };
  const needs = (): { id: number; need: Need }[] => {
    const on = new Set(loadSettings(db).todoReasons);
    const rows = all(`SELECT p.id, p.place, p.description, p.ai_json, p.ai_status,
      EXISTS (SELECT 1 FROM tags t WHERE t.photo_id = p.id AND t.source = 'ai' AND t.accepted = 0) AS pend,
      EXISTS (SELECT 1 FROM tags t WHERE t.photo_id = p.id AND t.kind = 'subject' AND t.accepted = 1) AS hasSubject,
      EXISTS (SELECT 1 FROM tags t WHERE t.photo_id = p.id AND t.kind = 'tag' AND t.accepted = 1 AND t.source <> 'gear') AS hasTag
      FROM photos p WHERE p.missing = 0 ORDER BY p.id DESC`) as Row[];
    const out: { id: number; need: Need }[] = [];
    for (const r of rows) {
      const tags = (!!r.pend && (on.has('subjects') || on.has('tags'))) || (on.has('subjects') && !r.hasSubject) || (on.has('tags') && !r.hasTag);
      const place = on.has('location') && !String(r.place ?? '').trim();
      let aiDesc = false;
      if (r.description === '' && r.ai_status === 'done' && r.ai_json) { try { const a = JSON.parse(r.ai_json as string); aiDesc = !!a.description && !a.descriptionRejected; } catch { /* unreadable */ } }
      const desc = on.has('description') && (aiDesc || ((tags || place) && r.description === ''));
      if (tags || place || desc) out.push({ id: r.id as number, need: { tags, place, desc } });
    }
    return out;
  };

  const todo = (): TodoItem[] => {
    const st = loadSettings(db);
    const on = new Set(st.todoReasons);
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
    if (on.has('subjects') || on.has('tags')) add('ai-tags', 'Approve the AI’s suggested tags and subjects', 'The AI suggested these. Nothing is kept until you accept it.', [...pendingTags]);
    if (on.has('description')) add('ai-description', 'Approve the AI’s suggested descriptions', 'A suggested description is shown on the photograph’s page until you accept or reject it.', pendingDesc);

    // Photographs with nothing set yet (newest first, so what was just brought in comes first).
    if (on.has('subjects')) add('subjects', 'Add a subject', 'No subject yet, so these do not show up when you filter the library or a composition by subject.',
      ids("SELECT p.id FROM photos p WHERE p.missing = 0 AND NOT EXISTS (SELECT 1 FROM tags t WHERE t.photo_id = p.id AND t.kind = 'subject' AND t.accepted = 1) ORDER BY p.id DESC"));
    if (on.has('tags')) add('tags', 'Add a tag', 'No tags yet.',
      ids("SELECT p.id FROM photos p WHERE p.missing = 0 AND NOT EXISTS (SELECT 1 FROM tags t WHERE t.photo_id = p.id AND t.kind = 'tag' AND t.accepted = 1 AND t.source <> 'gear') ORDER BY p.id DESC"));
    if (on.has('location')) add('place', 'Name the place', 'No place yet, so these cannot be found by location.',
      ids("SELECT p.id FROM photos p WHERE p.missing = 0 AND TRIM(p.place) = '' ORDER BY p.id DESC"));
    add('colours', 'Colours not read yet', 'The dominant colours are read from the preview, so these cannot be found by colour yet. A scan fills them in.',
      ids("SELECT p.id FROM photos p WHERE p.missing = 0 AND (p.palette IS NULL OR p.palette = '' OR p.palette = '[]') ORDER BY p.id DESC"));

    // Opt-in reasons (Settings, To do).
    if (on.has('camera')) add('camera', 'Add the camera', 'No camera is recorded for these.', ids("SELECT p.id FROM photos p WHERE p.missing = 0 AND TRIM(p.camera) = '' ORDER BY p.id DESC"));
    if (on.has('time')) add('time', 'Add the date and time', 'No capture time is recorded for these.', ids('SELECT p.id FROM photos p WHERE p.missing = 0 AND p.captured_at IS NULL ORDER BY p.id DESC'));
    if (on.has('composition')) add('composition', 'Not in a composition yet', 'These are not part of any composition.', ids('SELECT p.id FROM photos p WHERE p.missing = 0 AND NOT EXISTS (SELECT 1 FROM collection_photos c WHERE c.photo_id = p.id) ORDER BY p.id DESC'));
    for (const [k, field, title] of [['light', 'lighting', 'Describe the light'], ['mood', 'mood', 'Describe the mood']] as const) {
      if (on.has(k)) add(k, title, `The AI’s analysis has no ${k} note for these.`, ids(`SELECT p.id FROM photos p WHERE p.missing = 0 AND p.ai_status = 'done' AND COALESCE(json_extract(p.ai_json, '$.${field}'), '') = '' ORDER BY p.id DESC`));
    }
    // Poorly reviewed photographs, when the person has a line set (Settings, Reviews).
    add('delete', 'Take poorly reviewed photographs out of Frames', `Their average, after all ${st.sessions} sessions, is below ${st.deleteBelow}. Nothing is removed until you confirm. Files in your library folders are never touched.`, deleteSuggestions(db, st.sessions, st.deleteBelow, 2000).map((r) => r.id));

    const stuck = loadCloud(db).connections.filter((c) => c.needsReconnect);
    if (stuck.length) items.push({ key: 'cloud', title: 'Reconnect a cloud account', detail: `${stuck.map((c) => c.account || c.provider).join(', ')} stopped syncing and needs to be reconnected.`, count: stuck.length, photoIds: [], link: '/settings?section=cloud' });
    return items;
  };

  /**
   * The getting-started checklist on the home page. A finished step stays on the list, ticked, for a few page loads and then goes
   * for good (how many loads it has been done for is kept per person).
   */
  const SHOW_DONE_LOADS = 3;
  app.get('/api/getting-started', async () => {
    const n = (sql: string) => (one(sql) as Row).n as number > 0;
    const steps: { key: string; title: string; detail: string; link: string; done: boolean }[] = [
      { key: 'library', title: 'Bring in some photographs', detail: 'Sync a library folder or cloud account, or upload files.', link: '/shoots', done: n('SELECT COUNT(*) n FROM photos') },
      { key: 'photoshoot', title: 'Create your first photoshoot', detail: 'A day or a roll of film. Importing photographs makes one for you.', link: '/shoots', done: n('SELECT COUNT(*) n FROM shoots') },
      { key: 'review', title: 'Rate your first photographs', detail: 'A short review session: the opinion that settles is yours.', link: '/review', done: n('SELECT COUNT(*) n FROM reviews') },
      { key: 'composition', title: 'Create your first composition', detail: 'Pick photographs that belong together and plan the prints.', link: '/collections', done: n('SELECT COUNT(*) n FROM collections') },
      { key: 'profile', title: 'Fill out your profile', detail: 'Your name, shown on your portfolio and share links.', link: '/settings?section=profile', done: !!displayNameOf(db) },
    ];
    const seen = getSetting<Record<string, number>>(db, 'gettingStarted', {});
    const next: Record<string, number> = { ...seen };
    const shown = steps.filter((st) => {
      if (!st.done) return true;
      next[st.key] = (seen[st.key] ?? 0) + 1;
      return next[st.key] <= SHOW_DONE_LOADS;
    });
    if (JSON.stringify(next) !== JSON.stringify(seen)) setSetting(db, 'gettingStarted', next);
    return { steps: shown };
  });

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
    // "Things" are counted per photograph (its tags, its place, its description each once), the way the one-at-a-time view counts them, plus accounts to reconnect.
    const things = needs().reduce((n, p) => n + (p.need.tags ? 1 : 0) + (p.need.place ? 1 : 0) + (p.need.desc ? 1 : 0), 0) + (items.find((i) => i.key === 'cloud')?.count ?? 0) + (items.find((i) => i.key === 'delete')?.count ?? 0);
    return { total: things, kinds: items.length, items };
  });

  // The one-at-a-time list: each photograph that needs something, and what.
  app.get('/api/todo/walk', async () => {
    const list = needs().slice(0, 2000);
    const info = (id: number) => one('SELECT p.id, p.title, p.w, p.h, sh.name AS shoot, sh.place AS shootPlace FROM photos p JOIN shoots sh ON sh.id = p.shoot_id WHERE p.id = ?', id) as Row;
    const photos = list.map((n) => { const p = info(n.id); return { id: n.id, title: p.title as string, ar: p.w && p.h ? (p.w as number) / (p.h as number) : 1.5, shoot: p.shoot as string, shootPlace: p.shootPlace as string, need: n.need }; });
    return { photos, things: photos.reduce((n, p) => n + (p.need.tags ? 1 : 0) + (p.need.place ? 1 : 0) + (p.need.desc ? 1 : 0), 0) };
  });

  // "Re-check with AI": look at this photograph now and say what is new.
  app.post('/api/photos/:id/recheck', async (req, rep) => {
    const id = num((req.params as Row).id);
    if (!one('SELECT 1 x FROM photos WHERE id = ? AND missing = 0', id)) return rep.code(404).send({ error: 'Not found' });
    return x.ai.analyse(id);
  });

}
