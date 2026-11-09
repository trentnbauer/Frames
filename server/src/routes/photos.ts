import type { FastifyInstance } from 'fastify';
import { COLOR_NAMES, hammingInts, hashInts, similarity, type Feat, type Swatch } from '../analysis.js';
import { suggestFilters, aiConfig, embedText, fromBlob, parseQuery } from '../ai.js';
import { cosine } from '../analysis.js';
import type { Ctx, Row } from '../ctx.js';
import { deleteSuggestions, removePhotos } from '../remove.js';
import { loadSettings } from '../settings.js';

const like = (s: string) => `%${s.replace(/[\\%_]/g, '\\$&')}%`;

type F = Feat & { id: number; shootId: number; parentId: number | null; w: number; h: number };

/** Everything needed to compare photos, loaded once per request. */
export function loadFeatures(x: Ctx, ids?: number[]): Map<number, F> {
  const rows = x.all(`SELECT id, shoot_id, parent_id, w, h, dhash, palette, brightness, embedding FROM photos${ids ? ` WHERE id IN (${ids.map(Number).join(',') || 'NULL'})` : ''}`);
  return new Map(rows.map((r) => [r.id, { id: r.id, shootId: r.shoot_id, parentId: r.parent_id, w: r.w, h: r.h, dhash: r.dhash, palette: (r.palette ? JSON.parse(r.palette) : []) as Swatch[], brightness: r.brightness, embedding: fromBlob(r.embedding) }]));
}

const haversineKm = (a: number, b: number, c: number, d: number) => {
  const r = Math.PI / 180, dLat = (c - a) * r, dLon = (d - b) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin(dLon / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
};

export function registerPhotos(app: FastifyInstance, x: Ctx) {
  const { db, cfg, num, one, all, notFound } = x;

  // ---------- list, search and filter ----------
  app.get('/api/photos', async (req) => {
    const q = req.query as Row;
    const where: string[] = [];
    const args: unknown[] = [];
    // Archived only means "left out of review". It never hides a photograph from browsing or search.
    if (q.shoot) { where.push('p.shoot_id = ?'); args.push(num(q.shoot)); }
    for (const s of String(q.subject ?? '').split(',').map((v) => v.trim().toLowerCase()).filter(Boolean)) {
      where.push("EXISTS (SELECT 1 FROM tags t WHERE t.photo_id = p.id AND t.name = ? AND t.kind = 'subject' AND t.accepted = 1)"); args.push(s);
    }
    // ?missing=subject or ?missing=tag: photographs with none yet.
    for (const k of String(q.missing ?? '').split(',')) {
      if (k === 'subject' || k === 'tag') where.push(`NOT EXISTS (SELECT 1 FROM tags t WHERE t.photo_id = p.id AND t.kind = '${k}' AND t.accepted = 1)`);
    }
    for (const s of String(q.tag ?? '').split(',').map((v) => v.trim().toLowerCase()).filter(Boolean)) {
      where.push('EXISTS (SELECT 1 FROM tags t WHERE t.photo_id = p.id AND t.name = ? AND t.accepted = 1)'); args.push(s);
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(q.from ?? ''))) { where.push('substr(COALESCE(p.captured_at, p.added_at), 1, 10) >= ?'); args.push(q.from); }
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(q.to ?? ''))) { where.push('substr(COALESCE(p.captured_at, p.added_at), 1, 10) <= ?'); args.push(q.to); }
    if (q.place) {
      const w = String(q.place).toLowerCase();
      where.push("(lower(p.place) LIKE ? ESCAPE '\\' OR EXISTS (SELECT 1 FROM shoots s WHERE s.id = p.shoot_id AND lower(s.place) LIKE ? ESCAPE '\\'))"); args.push(like(w), like(w));
    }
    if (q.gps === '1') where.push('p.lat IS NOT NULL AND p.lon IS NOT NULL');
    let near: { lat: number; lon: number; km: number } | null = null;
    const nm = /^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?),(\d+(?:\.\d+)?)$/.exec(String(q.near ?? ''));
    if (nm) {
      near = { lat: +nm[1], lon: +nm[2], km: Math.min(20000, +nm[3]) };
      const dLat = near.km / 111;
      where.push('p.lat BETWEEN ? AND ?'); args.push(near.lat - dLat, near.lat + dLat);
    }
    for (const c of String(q.colour ?? '').split(',').map((v) => v.trim().toLowerCase()).filter((v) => (COLOR_NAMES as readonly string[]).includes(v))) {
      where.push("p.colors LIKE ?"); args.push(`% ${c} %`);
    }
    if (q.rating) {
      const avg = '(SELECT AVG(r.rating) FROM reviews r WHERE r.photo_id = p.id)';
      where.push(String(q.rating) === '4+' ? `${avg} >= 4` : String(q.rating) === '3+' ? `${avg} >= 3` : `${avg} < 3`);
    }
    // "No people": leave out photos with that tag or subject, or mentioning it in their title or description.
    for (const e of String(q.exclude ?? '').split(',').map((v) => v.trim().toLowerCase()).filter(Boolean)) {
      where.push("NOT EXISTS (SELECT 1 FROM tags t WHERE t.photo_id = p.id AND t.accepted = 1 AND t.name = ?) AND lower(p.title) NOT LIKE ? ESCAPE '\\' AND lower(p.description) NOT LIKE ? ESCAPE '\\'");
      args.push(e, like(e), like(e));
    }
    // Time of day, from the capture time ("05:00-08:00"). Photos without a capture time never match.
    const tm = /^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/.exec(String(q.time ?? ''));
    if (tm) {
      const p2 = (v: string) => v.padStart(2, '0');
      where.push("p.captured_at IS NOT NULL AND substr(p.captured_at, 12, 5) BETWEEN ? AND ?");
      args.push(`${p2(tm[1])}:${tm[2]}`, `${p2(tm[3])}:${tm[4]}`);
    }
    // Composition and light, from the picture itself (no AI needed): its shape, how bright it is, how contrasty.
    const shape = String(q.shape ?? '');
    if (shape === 'portrait') where.push('p.h > p.w'); else if (shape === 'landscape') where.push('p.w > p.h'); else if (shape === 'square') where.push('p.w > 0 AND ABS(p.w - p.h) * 1.0 / p.w < 0.05');
    const light = String(q.light ?? '');
    if (light === 'dark') where.push('p.brightness < 0.35'); else if (light === 'mid') where.push('p.brightness BETWEEN 0.35 AND 0.65'); else if (light === 'bright') where.push('p.brightness > 0.65');
    const contrast = String(q.contrast ?? '');
    if (contrast === 'low') where.push('p.contrast < 0.15'); else if (contrast === 'medium') where.push('p.contrast BETWEEN 0.15 AND 0.28'); else if (contrast === 'high') where.push('p.contrast > 0.28');
    if (q.variants === 'hide') where.push('p.parent_id IS NULL');
    if (q.review === 'excluded') where.push('p.archived = 1');

    const cfgAi = aiConfig(db);
    const semantic = q.semantic === '1' && !!cfgAi && !!q.q;
    if (!semantic) {
      for (const w of String(q.q ?? '').toLowerCase().split(/\s+/).filter(Boolean)) {
        where.push(`(lower(p.file) LIKE ? ESCAPE '\\' OR lower(p.title) LIKE ? ESCAPE '\\' OR lower(p.camera) LIKE ? ESCAPE '\\' OR lower(p.lens) LIKE ? ESCAPE '\\' OR lower(p.exposure) LIKE ? ESCAPE '\\' OR lower(p.place) LIKE ? ESCAPE '\\' OR lower(p.description) LIKE ? ESCAPE '\\' OR lower(p.file_type) = ? OR (p.ai_status = 'done' AND lower(p.ai_json) LIKE ? ESCAPE '\\') OR EXISTS (SELECT 1 FROM tags t WHERE t.photo_id = p.id AND t.accepted = 1 AND lower(t.name) LIKE ? ESCAPE '\\'))`);
        args.push(like(w), like(w), like(w), like(w), like(w), like(w), like(w), w, like(w), like(w));
      }
    }
    const order = q.order === 'oldest' ? 'ASC' : 'DESC';
    const limit = Math.min(20000, Math.max(1, Math.round(num(q.limit, 5000))));
    const offset = Math.min(1_000_000_000, Math.max(0, Math.round(num(q.offset, 0)))); // SQLite takes a whole number here, so a huge value must not reach it as a float
    const needsRank = !!q.similarTo || semantic;
    let rows = all(`SELECT p.* FROM photos p ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY COALESCE(p.captured_at, p.added_at) ${order}, p.id ${order}${needsRank ? '' : ' LIMIT ? OFFSET ?'}`, ...args, ...(needsRank ? [] : [limit, offset]));
    if (near) rows = rows.filter((r) => r.lon !== null && haversineKm(near!.lat, near!.lon, r.lat, r.lon) <= near!.km);

    let semanticUsed = false;
    const scores = new Map<number, number>();
    if (q.similarTo) {
      const f = loadFeatures(x);
      const seed = f.get(num(q.similarTo));
      if (seed) {
        for (const r of rows) { const o = f.get(r.id); if (o && o.id !== seed.id) scores.set(r.id, similarity(seed, o)); }
        rows = rows.filter((r) => scores.has(r.id)).sort((a, b) => scores.get(b.id)! - scores.get(a.id)!);
      }
    } else if (semantic) {
      try {
        const qv = await embedText(cfgAi!, String(q.q));
        const f = loadFeatures(x, rows.map((r) => r.id));
        for (const r of rows) { const e = f.get(r.id)?.embedding; if (e && e.length === qv.length) scores.set(r.id, cosine(qv, e)); }
        rows = rows.filter((r) => scores.has(r.id)).sort((a, b) => scores.get(b.id)! - scores.get(a.id)!);
        semanticUsed = true;
      } catch { /* provider down: fall through to plain text below */ }
      if (!semanticUsed) {
        const words = String(q.q).toLowerCase().split(/\s+/).filter(Boolean);
        rows = rows.filter((r) => words.every((w) => `${r.file} ${r.title} ${r.description} ${r.place}`.toLowerCase().includes(w)));
      }
    }
    const count = rows.length;
    if (needsRank) rows = rows.slice(offset, offset + Math.min(limit, 200));
    const agg = x.ratingAgg();
    const photos = rows.map((r) => ({ ...x.photoDto(r, false, agg), ...(scores.has(r.id) ? { similarity: Math.round(scores.get(r.id)! * 100) / 100 } : {}) }));
    return { total: (one('SELECT COUNT(*) n FROM photos') as Row).n, count: needsRank ? count : photos.length, photos, semantic: semanticUsed };
  });

  /** "fog over water, early morning, no people" into chips the user can remove. Needs AI; without it, returns the text as-is. */
  app.post('/api/search/parse', async (req) => {
    const c = aiConfig(db);
    const text = String(((req.body ?? {}) as Row).q ?? '').slice(0, 300);
    const parsed = c && text ? await parseQuery(c, text) : null;
    return { ai: !!c, parsed };
  });

  /** "Find subjects, tags and colours for a composition from its name": the model picks from names the library already has. Without AI: { ai: false }. */
  app.post('/api/ai/suggest-filters', async (req, rep) => {
    const c = aiConfig(db);
    if (!c) return { ai: false, picks: null };
    const name = String(((req.body ?? {}) as Row).name ?? '').trim().slice(0, 120);
    if (!name) return rep.code(400).send({ error: 'Give the composition a name first' });
    const vocab = (kind: string) => all("SELECT name FROM tags WHERE kind = ? AND accepted = 1 GROUP BY name ORDER BY COUNT(*) DESC, name LIMIT 300", kind).map((r) => r.name as string);
    const picks = await suggestFilters(c, name, { subjects: vocab('subject'), tags: vocab('tag'), colours: [...COLOR_NAMES] });
    return { ai: true, picks };
  });

  /** Two photos side by side, with how alike they are. */
  app.get('/api/compare', async (req, rep) => {
    const q = req.query as Row;
    const a = one('SELECT * FROM photos WHERE id = ?', num(q.a)), b = one('SELECT * FROM photos WHERE id = ?', num(q.b));
    if (!a || !b) return notFound(rep);
    const f = loadFeatures(x, [a.id, b.id]);
    return { a: x.photoDto(a, true), b: x.photoDto(b, true), similarity: Math.round(similarity(f.get(a.id)!, f.get(b.id)!) * 100) / 100 };
  });

  // ---------- one photo ----------
  app.get('/api/photos/:id', async (req, rep) => {
    const p = one('SELECT * FROM photos WHERE id = ?', num((req.params as Row).id));
    return p ? x.photoDto(p, true) : notFound(rep);
  });

  // ---------- taking photographs out of Frames ----------
  // Files in library folders are never touched; only Frames' own copies (uploads, cloud copies) go. A scan does not bring them back.
  app.get('/api/photos/delete-suggestions', async () => {
    const st = loadSettings(db);
    return { below: st.deleteBelow, sessions: st.sessions, photos: deleteSuggestions(db, st.sessions, st.deleteBelow) };
  });
  app.post('/api/photos/remove', async (req, rep) => {
    const ids = ((req.body ?? {}) as Row).ids;
    if (!Array.isArray(ids) || ids.length === 0 || ids.length > 500 || !ids.every((n) => Number.isInteger(n))) return rep.code(400).send({ error: 'Send up to 500 photograph ids.' });
    return removePhotos(db, cfg, ids as number[]);
  });
  app.delete('/api/photos/:id', async (req, rep) => {
    const id = num((req.params as Row).id);
    if (!one('SELECT 1 x FROM photos WHERE id = ?', id)) return notFound(rep);
    return removePhotos(db, cfg, [id]);
  });
  app.get('/api/removed', async () => ({ count: (one('SELECT COUNT(*) n FROM removed') as Row).n as number }));
  // Forget what was taken out: the next scan imports again whatever files are still in the library folders.
  app.post('/api/removed/restore', async () => { const n = db.prepare('DELETE FROM removed').run().changes; return { cleared: n }; });

  app.patch('/api/photos/:id', async (req, rep) => {
    const id = num((req.params as Row).id);
    const p = one('SELECT * FROM photos WHERE id = ?', id);
    if (!p) return notFound(rep);
    const b = (req.body ?? {}) as Row;
    const set = (sql: string, ...a: unknown[]) => db.prepare(sql).run(...a);
    if (typeof b.title === 'string' && b.title.trim()) { set('UPDATE photos SET title = ?, title_user = 1 WHERE id = ?', b.title.trim().slice(0, 200), id); set("DELETE FROM xmp_conflicts WHERE photo_id = ? AND field = 'title'", id); }
    if (typeof b.description === 'string') {
      const d = b.description.trim().slice(0, 2000);
      set('UPDATE photos SET description = ?, desc_source = ? WHERE id = ?', d, d ? 'user' : '', id);
      set("DELETE FROM xmp_conflicts WHERE photo_id = ? AND field = 'description'", id);
    }
    if (typeof b.place === 'string') set('UPDATE photos SET place = ? WHERE id = ?', b.place.trim().slice(0, 120), id);
    // A pin on the map: both numbers, or null for both to clear it.
    const mark = (field: string) => { const cur = new Set(String(p.user_fields ?? '').split(',').filter(Boolean)); cur.add(field); set('UPDATE photos SET user_fields = ? WHERE id = ?', [...cur].join(','), id); };
    if (b.lat === null && b.lon === null) { set('UPDATE photos SET lat = NULL, lon = NULL WHERE id = ?', id); mark('latlon'); }
    else if (b.lat !== undefined || b.lon !== undefined) {
      if (typeof b.lat !== 'number' || typeof b.lon !== 'number' || !Number.isFinite(b.lat) || !Number.isFinite(b.lon) || Math.abs(b.lat) > 90 || Math.abs(b.lon) > 180) return rep.code(400).send({ error: 'A pin needs a latitude between -90 and 90 and a longitude between -180 and 180' });
      set('UPDATE photos SET lat = ?, lon = ? WHERE id = ?', Math.round(b.lat * 1e6) / 1e6, Math.round(b.lon * 1e6) / 1e6, id);
      mark('latlon');
    }
    if (typeof b.archived === 'boolean') set('UPDATE photos SET archived = ? WHERE id = ?', b.archived ? 1 : 0, id);
    if (b.reviewAgain === true) set('UPDATE photos SET next_review_at = ? WHERE id = ?', new Date().toISOString(), id);
    if (b.shootId !== undefined) {
      if (!one('SELECT 1 x FROM shoots WHERE id = ?', num(b.shootId))) return rep.code(400).send({ error: 'That photoshoot does not exist' });
      set('UPDATE photos SET shoot_id = ? WHERE id = ?', num(b.shootId), id);
    }
    if (b.parentId !== undefined) {
      if (b.parentId === null) set('UPDATE photos SET parent_id = NULL WHERE id = ?', id);
      else if (!makeVariants(num(b.parentId), [id])) return rep.code(400).send({ error: 'That photo cannot be its own variant' });
    }
    // The AI's description is a suggestion until the user accepts it; rejecting it hides it and keeps it from coming back.
    if (b.acceptAiDescription === true && p.ai_json) {
      const a = JSON.parse(p.ai_json);
      if (a.description) set("UPDATE photos SET description = ?, desc_source = 'user' WHERE id = ?", String(a.description).slice(0, 2000), id);
    }
    if (b.rejectAiDescription === true && p.ai_json) set('UPDATE photos SET ai_json = ? WHERE id = ?', JSON.stringify({ ...JSON.parse(p.ai_json), descriptionRejected: true }), id);
    if (b.reanalyse === true) set('UPDATE photos SET ai_status = NULL, ai_attempts = 0 WHERE id = ?', id);
    return x.photoDto(one('SELECT * FROM photos WHERE id = ?', id)!, true);
  });

  /** Makes `childIds` variants (edits, crops) of `parentId`. Variants stay ordinary photos. Returns false if it would make a loop. */
  function makeVariants(parentId: number, childIds: number[]): boolean {
    const parent = one('SELECT id, parent_id FROM photos WHERE id = ?', parentId);
    if (!parent) return false;
    const root = parent.parent_id ?? parent.id; // a variant of a variant is a variant of the original
    for (const c of childIds) {
      if (c === root) return false;
      db.prepare('UPDATE photos SET parent_id = ? WHERE id = ?').run(root, c);
      db.prepare('UPDATE photos SET parent_id = ? WHERE parent_id = ?').run(root, c); // its own variants move up with it
    }
    return true;
  }

  // ---------- tags and subjects ----------
  // One photo. Body: { name, kind?: 'tag'|'subject', action?: 'add'|'accept'|'reject'|'remove' }.
  // Old clients send { remove: true } or { accepted: false }; both still work.
  app.put('/api/photos/:id/tags', async (req, rep) => {
    const id = num((req.params as Row).id);
    if (!one('SELECT 1 x FROM photos WHERE id = ?', id)) return notFound(rep);
    const b = (req.body ?? {}) as Row;
    const name = String(b.name ?? '').trim().toLowerCase().slice(0, 60);
    if (!name) return rep.code(400).send({ error: 'name required' });
    const kind = b.kind === 'subject' ? 'subject' : 'tag';
    const action = b.action ?? (b.remove ? 'remove' : b.accepted === false ? 'reject' : 'add');
    const existing = one('SELECT source, kind FROM tags WHERE photo_id = ? AND name = ?', id, name);
    if (action === 'remove') db.prepare('DELETE FROM tags WHERE photo_id = ? AND name = ?').run(id, name);
    else if (action === 'reject') {
      // A rejected AI suggestion is kept (hidden) so the AI does not suggest it again. A tag the user added is simply removed.
      if (existing?.source === 'ai') db.prepare('UPDATE tags SET accepted = -1 WHERE photo_id = ? AND name = ?').run(id, name);
      else db.prepare('DELETE FROM tags WHERE photo_id = ? AND name = ?').run(id, name);
    } else db.prepare("INSERT INTO tags(photo_id, name, source, accepted, kind) VALUES(?, ?, 'user', 1, ?) ON CONFLICT(photo_id, name) DO UPDATE SET accepted = 1").run(id, name, existing?.kind ?? kind);
    return x.tagsOf(id);
  });

  // Every place in use (photographs and photoshoots), so a place can be offered like a tag when searching or typing.
  app.get('/api/places', async () => all(`SELECT name, SUM(n) n FROM (
      SELECT TRIM(place) name, COUNT(*) n FROM photos WHERE missing = 0 AND TRIM(place) <> '' GROUP BY TRIM(place)
      UNION ALL SELECT TRIM(place), 0 FROM shoots WHERE TRIM(place) <> '') GROUP BY name ORDER BY n DESC, name`));

  // The whole vocabulary: every tag and subject in use, plus ones created ahead of time.
  app.get('/api/tags', async (req) => {
    const kind = (req.query as Row).kind;
    const rows = all(`SELECT name, kind, SUM(n) n FROM (
        SELECT name, kind, COUNT(*) n FROM tags WHERE accepted = 1 GROUP BY name, kind
        UNION ALL SELECT name, kind, 0 FROM vocab) GROUP BY name, kind ORDER BY n DESC, name`);
    return kind === 'tag' || kind === 'subject' ? rows.filter((r) => r.kind === kind) : rows;
  });
  app.post('/api/tags', async (req, rep) => {
    const b = (req.body ?? {}) as Row;
    const name = String(b.name ?? '').trim().toLowerCase().slice(0, 60);
    if (!name) return rep.code(400).send({ error: 'name required' });
    db.prepare('INSERT OR IGNORE INTO vocab(name, kind) VALUES(?, ?)').run(name, b.kind === 'subject' ? 'subject' : 'tag');
    return { ok: true };
  });
  // Renaming to a name that already exists merges the two.
  app.patch('/api/tags/:kind/:name', async (req, rep) => {
    const { kind, name } = req.params as Row;
    const to = String(((req.body ?? {}) as Row).name ?? '').trim().toLowerCase().slice(0, 60);
    if (!to || (kind !== 'tag' && kind !== 'subject')) return rep.code(400).send({ error: 'name required' });
    db.transaction(() => {
      db.prepare('UPDATE OR IGNORE tags SET name = ? WHERE name = ? AND kind = ?').run(to, String(name).toLowerCase(), kind);
      db.prepare('DELETE FROM tags WHERE name = ? AND kind = ?').run(String(name).toLowerCase(), kind); // rows that collided with an existing one
      db.prepare('INSERT OR IGNORE INTO vocab(name, kind) SELECT ?, ? WHERE EXISTS (SELECT 1 FROM vocab WHERE name = ? AND kind = ?)').run(to, kind, String(name).toLowerCase(), kind);
      db.prepare('DELETE FROM vocab WHERE name = ? AND kind = ?').run(String(name).toLowerCase(), kind);
    })();
    return { ok: true };
  });
  app.delete('/api/tags/:kind/:name', async (req) => {
    const { kind, name } = req.params as Row;
    db.prepare('DELETE FROM tags WHERE name = ? AND kind = ?').run(String(name).toLowerCase(), kind);
    db.prepare('DELETE FROM vocab WHERE name = ? AND kind = ?').run(String(name).toLowerCase(), kind);
    return { ok: true };
  });

  // ---------- similar photos, near-duplicates, variants ----------
  app.get('/api/photos/:id/similar', async (req, rep) => {
    const id = num((req.params as Row).id);
    const seed = one('SELECT id FROM photos WHERE id = ?', id);
    if (!seed) return notFound(rep);
    const f = loadFeatures(x);
    const s = f.get(id)!;
    const limit = Math.min(60, Math.max(1, Math.round(num((req.query as Row).limit, 12))));
    const scored = [...f.values()].filter((o) => o.id !== id && o.parentId !== id && o.id !== s.parentId).map((o) => ({ id: o.id, s: similarity(s, o) })).sort((a, b) => b.s - a.s).slice(0, limit);
    const agg = x.ratingAgg();
    return scored.map((r) => ({ ...x.photoDto(one('SELECT * FROM photos WHERE id = ?', r.id)!, false, agg), similarity: Math.round(r.s * 100) / 100 }));
  });

  const NEAR = 8; // of 64 bits. Different crops and edits of the same frame land well inside this; different scenes do not.
  app.get('/api/duplicates', async () => {
    const f = [...loadFeatures(x).values()].filter((o) => o.dhash);
    const ints = new Map(f.map((o) => [o.id, hashInts(o.dhash!)]));
    const ignored = new Set(all('SELECT a, b FROM dup_ignored').map((r) => `${r.a}-${r.b}`));
    const parent = new Map<number, number>();
    const find = (a: number): number => { let r = a; while (parent.has(r) && parent.get(r) !== r) r = parent.get(r)!; return r; };
    for (const o of f) parent.set(o.id, o.id);
    for (let i = 0; i < f.length; i++) {
      for (let j = i + 1; j < f.length; j++) {
        const a = f[i], b = f[j];
        if (a.parentId === b.id || b.parentId === a.id || (a.parentId && a.parentId === b.parentId)) continue; // already linked as variants
        if (ignored.has(`${Math.min(a.id, b.id)}-${Math.max(a.id, b.id)}`)) continue;
        if (hammingInts(ints.get(a.id)!, ints.get(b.id)!) <= NEAR) parent.set(find(a.id), find(b.id));
      }
    }
    const groups = new Map<number, number[]>();
    for (const o of f) { const r = find(o.id); groups.set(r, [...(groups.get(r) ?? []), o.id]); }
    const agg = x.ratingAgg();
    return [...groups.values()].filter((g) => g.length > 1).map((ids) => {
      const photos = ids.map((id) => one('SELECT * FROM photos WHERE id = ?', id)!);
      // The best candidate for "original" is the largest in pixels.
      photos.sort((a, b) => b.w * b.h - a.w * a.h || a.id - b.id);
      return { suggestedParentId: photos[0].id, photos: photos.map((p) => x.photoDto(p, false, agg)) };
    });
  });
  app.post('/api/duplicates/ignore', async (req) => {
    const ids = (((req.body ?? {}) as Row).photoIds as number[] | undefined ?? []).map(Number).filter(Number.isFinite);
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) db.prepare('INSERT OR IGNORE INTO dup_ignored(a, b) VALUES(?, ?)').run(Math.min(ids[i], ids[j]), Math.max(ids[i], ids[j]));
    return { ok: true };
  });
  app.post('/api/duplicates/variants', async (req, rep) => {
    const b = (req.body ?? {}) as Row;
    const children = ((b.childIds as number[]) ?? []).map(Number).filter(Number.isFinite);
    if (!makeVariants(num(b.parentId), children)) return rep.code(400).send({ error: 'Cannot link those photos' });
    return { ok: true };
  });
}
