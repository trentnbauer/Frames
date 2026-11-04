import type { FastifyInstance } from 'fastify';
import { dominantHue, hamming, similarity } from '../analysis.js';
import { getSetting, setSetting } from '../db.js';
import { loadSettings } from '../settings.js';
import { checkTarget, type Target } from '../target.js';
import type { Ctx, Row } from '../ctx.js';
import { loadFeatures } from './photos.js';

const avgOf = (r: number[]) => (r.length ? r.reduce((a, b) => a + b, 0) / r.length : 0);
const DAY = 86_400_000;

type Rv = { rating: number; date: string };

export function registerInsights(app: FastifyInstance, x: Ctx) {
  const { db, num, one, all } = x;

  const reviewsByPhoto = () => {
    const m = new Map<number, Rv[]>();
    for (const r of all('SELECT photo_id, rating, date FROM reviews ORDER BY photo_id, session, id')) (m.get(r.photo_id) ?? m.set(r.photo_id, []).get(r.photo_id)!).push(r as Rv);
    return m;
  };
  const featuresOf = () => {
    // Words that describe a photo: its accepted tags and subjects, and its main colours.
    const m = new Map<number, string[]>();
    for (const t of all('SELECT photo_id, name, kind FROM tags WHERE accepted = 1')) (m.get(t.photo_id) ?? m.set(t.photo_id, []).get(t.photo_id)!).push(`${t.kind}:${t.name}`);
    for (const p of all("SELECT id, colors FROM photos WHERE colors != ''")) for (const c of String(p.colors).trim().split(' ')) (m.get(p.id) ?? m.set(p.id, []).get(p.id)!).push(`colour:${c}`);
    return m;
  };

  /**
   * What the photographer seems to like: for each tag, subject or colour, how well photos with it have been rated,
   * nudged by what they accepted ("more like this", "start a collection") and rejected ("not for me") in recommendations.
   */
  function preferenceProfile(rv: Map<number, Rv[]>, feats: Map<number, string[]>) {
    const acc = new Map<string, { sum: number; n: number }>();
    const add = (f: string, v: number) => { const e = acc.get(f) ?? acc.set(f, { sum: 0, n: 0 }).get(f)!; e.sum += v; e.n++; };
    for (const [id, rs] of rv) for (const f of feats.get(id) ?? []) add(f, (avgOf(rs.map((r) => r.rating)) - 3) / 2);
    for (const fb of all('SELECT photo_id, verdict FROM feedback')) for (const f of feats.get(fb.photo_id) ?? []) add(f, fb.verdict === 'accept' ? 1.2 : -1.2);
    const w = new Map<string, number>();
    for (const [f, e] of acc) w.set(f, (e.sum / e.n) * Math.min(1, e.n / 3)); // few examples count for less
    return w;
  }
  const scoreOf = (w: Map<string, number>, fs: string[] | undefined) => (fs?.length ? fs.reduce((s, f) => s + (w.get(f) ?? 0), 0) / fs.length : 0);

  const recommendations = () => {
    const settings = loadSettings(db);
    const rv = reviewsByPhoto();
    const feats = featuresOf();
    const prof = preferenceProfile(rv, feats);
    const rejected = new Set(all("SELECT kind || ':' || photo_id k FROM feedback WHERE verdict = 'reject'").map((r) => r.k as string));
    const ok = (kind: string, id: number) => !rejected.has(`${kind}:${id}`);
    const inColl = new Set(all('SELECT DISTINCT photo_id FROM collection_photos').map((r) => r.photo_id as number));
    const photos = all('SELECT * FROM photos WHERE parent_id IS NULL AND missing = 0');
    const byId = new Map(photos.map((p) => [p.id as number, p]));
    const agg = x.ratingAgg();
    const dto = (p: Row, extra: Record<string, unknown> = {}) => ({ ...x.photoDto(p, false, agg), ...extra });
    const rank = (a: Row, b: Row) => scoreOf(prof, feats.get(b.id)) - scoreOf(prof, feats.get(a.id));
    const rated = photos.map((p) => ({ p, rs: rv.get(p.id) ?? [] }));
    const now = Date.now();

    const growing = rated.filter(({ p, rs }) => rs.length >= 3 && rs[rs.length - 1].rating - rs[0].rating >= 1 && ok('growing', p.id)).sort((a, b) => rank(a.p, b.p)).slice(0, 12)
      .map(({ p, rs }) => dto(p, { from: rs[0].rating, to: rs[rs.length - 1].rating }));
    const quiet = rated.filter(({ p, rs }) => rs.length >= Math.min(4, settings.sessions) && avgOf(rs.map((r) => r.rating)) >= 4.5 && !inColl.has(p.id) && ok('quiet', p.id)).sort((a, b) => rank(a.p, b.p)).slice(0, 12).map(({ p }) => dto(p));
    const lastSeen = (rs: Rv[]) => new Date(rs[rs.length - 1].date).getTime();
    const forgotten = rated.filter(({ p, rs }) => rs.length > 0 && ok('forgotten', p.id) && ((rs[0].rating >= 4 && lastSeen(rs) < now - 365 * DAY) || (!inColl.has(p.id) && rs.length >= 2 && avgOf(rs.map((r) => r.rating)) >= 4 && lastSeen(rs) < now - 180 * DAY))).sort((a, b) => rank(a.p, b.p)).slice(0, 14).map(({ p }) => dto(p));
    const archive = settings.archiveSuggest ? rated.filter(({ p, rs }) => rs.length >= 4 && avgOf(rs.map((r) => r.rating)) < 2 && ok('archive', p.id)).slice(0, 12).map(({ p }) => dto(p)) : [];

    // Seeds: the photographs rated highest. Everything below is "more like these".
    const seeds = rated.filter(({ rs }) => rs.length > 0 && avgOf(rs.map((r) => r.rating)) >= 4).sort((a, b) => avgOf(b.rs.map((r) => r.rating)) - avgOf(a.rs.map((r) => r.rating))).slice(0, 6).map(({ p }) => p);
    const f = loadFeatures(x);
    const liked = (id: number) => { const rs = rv.get(id); return !!rs && avgOf(rs.map((r) => r.rating)) >= 4; };
    const similar = seeds.map((seed) => {
      const sf = f.get(seed.id)!;
      const near = photos.filter((p) => p.id !== seed.id && !liked(p.id) && ok('similar', p.id) && f.has(p.id))
        .map((p) => ({ p, s: similarity(sf, f.get(p.id)!) + 0.1 * scoreOf(prof, feats.get(p.id)) })).sort((a, b) => b.s - a.s).slice(0, 6).filter((r) => r.s > 0.55);
      return { seed: dto(seed), photos: near.map((r) => dto(r.p, { similarity: Math.round(r.s * 100) / 100 })) };
    }).filter((b) => b.photos.length);

    // Complementary: from a different photoshoot, colours that sit well beside the seed's (neighbouring or opposite on the wheel), similar light.
    const complementary = seeds.map((seed) => {
      const sf = f.get(seed.id)!;
      const sh = dominantHue(sf.palette);
      if (sh === null) return null;
      const found = photos.filter((p) => p.shoot_id !== seed.shoot_id && ok('complementary', p.id) && f.has(p.id)).map((p) => {
        const pf = f.get(p.id)!;
        const h = dominantHue(pf.palette);
        if (h === null || Math.abs((pf.brightness ?? 0.5) - (sf.brightness ?? 0.5)) > 0.25) return null;
        const d = Math.min(Math.abs(h - sh), 360 - Math.abs(h - sh));
        const kind = d <= 40 ? 'Neighbouring colours' : d >= 150 ? 'Opposite colours' : null;
        return kind ? { p, kind, s: -d + 100 * scoreOf(prof, feats.get(p.id)) } : null;
      }).filter((r): r is { p: Row; kind: string; s: number } => !!r).sort((a, b) => b.s - a.s).slice(0, 5);
      return found.length ? { seed: dto(seed), reason: found[0].kind, photos: found.map((r) => dto(r.p)) } : null;
    }).filter(Boolean);

    return { growing, quiet, forgotten, archive, similar, complementary, together: togetherSets(photos, f, feats, prof, rv, dto), aiAssisted: [...f.values()].some((v) => v.embedding) };
  };
  app.get('/api/recommendations', async () => recommendations());

  /** Groups of well-liked photographs from at least two photoshoots that belong together by look and subject. */
  function togetherSets(photos: Row[], f: ReturnType<typeof loadFeatures>, feats: Map<number, string[]>, prof: Map<string, number>, rv: Map<number, Rv[]>, dto: (p: Row) => Record<string, any>) {
    const pool = photos.filter((p) => f.has(p.id) && (!rv.get(p.id) || avgOf(rv.get(p.id)!.map((r) => r.rating)) >= 3.5)).sort((a, b) => scoreOf(prof, feats.get(b.id)) - scoreOf(prof, feats.get(a.id))).slice(0, 400);
    const parent = new Map(pool.map((p) => [p.id as number, p.id as number]));
    const find = (a: number): number => { let r = a; while (parent.get(r) !== r) r = parent.get(r)!; return r; };
    for (let i = 0; i < pool.length; i++) for (let j = i + 1; j < pool.length; j++) {
      if (similarity(f.get(pool[i].id)!, f.get(pool[j].id)!) >= 0.78) parent.set(find(pool[i].id), find(pool[j].id));
    }
    const groups = new Map<number, Row[]>();
    for (const p of pool) { const r = find(p.id); groups.set(r, [...(groups.get(r) ?? []), p]); }
    const rejected = new Set(all("SELECT photo_id FROM feedback WHERE kind = 'together' AND verdict = 'reject'").map((r) => r.photo_id as number));
    return [...groups.values()].filter((g) => g.length >= 3 && new Set(g.map((p) => p.shoot_id)).size >= 2 && !g.some((p) => rejected.has(p.id))).slice(0, 6).map((g) => {
      const counts = new Map<string, number>();
      for (const p of g) for (const t of feats.get(p.id) ?? []) counts.set(t, (counts.get(t) ?? 0) + 1);
      const shared = [...counts].filter(([, n]) => n >= Math.ceil(g.length / 2)).sort((a, b) => b[1] - a[1]).map(([t]) => t.split(':')[1]);
      const ai = g.some((p) => f.get(p.id)?.embedding);
      return {
        name: shared.length ? shared.slice(0, 2).map((s) => s[0].toUpperCase() + s.slice(1)).join(' and ') : 'Untitled set',
        reason: `${shared.length ? `Shared: ${shared.slice(0, 3).join(', ')}. ` : ''}From ${new Set(g.map((p) => p.shoot_id)).size} photoshoots.`,
        aiAssisted: ai, photoIds: g.slice(0, 12).map((p) => p.id as number), photos: g.slice(0, 6).map(dto),
      };
    });
  }
  // Collection suggestions share the engine: sets of photographs that belong together.
  app.get('/api/collections/suggestions', async () => recommendations().together);

  /** Accepting ("more like this", "start a collection") and rejecting ("not for me") both teach the profile above. */
  app.post('/api/recommendations/feedback', async (req, rep) => {
    const b = (req.body ?? {}) as Row;
    const verdict = b.verdict === 'accept' ? 'accept' : b.verdict === 'reject' ? 'reject' : null;
    if (!verdict) return rep.code(400).send({ error: 'verdict must be accept or reject' });
    const kind = String(b.kind ?? '').slice(0, 20);
    for (const id of (Array.isArray(b.photoIds) ? b.photoIds : []).slice(0, 200)) db.prepare('INSERT INTO feedback(kind, photo_id, verdict, ts) VALUES(?, ?, ?, ?)').run(kind, num(id), verdict, new Date().toISOString());
    return { ok: true };
  });
  // Older clients.
  app.post('/api/recommendations/dismiss', async (req) => {
    const b = (req.body ?? {}) as Row;
    for (const id of Array.isArray(b.photoIds) ? b.photoIds : []) db.prepare("INSERT INTO feedback(kind, photo_id, verdict, ts) VALUES(?, ?, 'reject', ?)").run(String(b.kind).slice(0, 20), num(id), new Date().toISOString());
    return { ok: true };
  });

  // ---------- collection insights ----------
  // Ranking for one composition: what you rated, what guests rated through its share links, and a blend of the two.
  const GUEST_WEIGHT_KEY = 'guestWeight';
  const guestWeight = () => Math.min(60, Math.max(0, Math.round(Number(getSetting<number>(db, GUEST_WEIGHT_KEY, 35)) || 0)));
  app.put('/api/collections/guest-weight', async (req, rep) => {
    const w = ((req.body ?? {}) as Row).weight;
    if (typeof w !== 'number' || !Number.isFinite(w) || w < 0 || w > 60) return rep.code(400).send({ error: 'The guests’ share must be between 0 and 60 percent.' });
    setSetting(db, GUEST_WEIGHT_KEY, Math.round(w));
    return { weight: guestWeight() };
  });
  app.get('/api/collections/:id/ranking', async (req, rep) => {
    const id = num((req.params as Row).id);
    if (!one('SELECT 1 x FROM collections WHERE id = ?', id)) return rep.code(404).send({ error: 'Not found' });
    const w = guestWeight() / 100;
    const mine = new Map(all('SELECT r.photo_id, AVG(r.rating) a, COUNT(*) n FROM reviews r JOIN collection_photos cp ON cp.photo_id = r.photo_id WHERE cp.collection_id = ? GROUP BY r.photo_id', id).map((r) => [r.photo_id as number, r]));
    const guest = new Map(all("SELECT sr.photo_id, AVG(sr.rating) a, COUNT(DISTINCT sr.reviewer) n FROM share_reviews sr JOIN shares s ON s.id = sr.share_id WHERE s.kind = 'collection' AND s.target_id = ? GROUP BY sr.photo_id", id).map((r) => [r.photo_id as number, r]));
    const guests = (one("SELECT COUNT(DISTINCT sr.reviewer) n FROM share_reviews sr JOIN shares s ON s.id = sr.share_id WHERE s.kind = 'collection' AND s.target_id = ?", id) as Row).n as number;
    const items = (all('SELECT photo_id FROM collection_photos WHERE collection_id = ?', id)).map((r) => {
      const m = mine.get(r.photo_id), g = guest.get(r.photo_id);
      const a = m ? (m.a as number) : null, b = g ? (g.a as number) : null;
      // Only what exists counts: with no guest rating the score is yours, with no rating of yours it is the guests'.
      const score = a !== null && b !== null ? a * (1 - w) + b * w : a ?? b ?? 0;
      return { id: r.photo_id as number, mine: a, mineN: m ? (m.n as number) : 0, guest: b, guestN: g ? (g.n as number) : 0, score };
    }).sort((x, y) => y.score - x.score || x.id - y.id);
    return { weight: guestWeight(), guests, items };
  });
  app.get('/api/collections/:id/insights', async (req, rep) => {
    const c = one('SELECT * FROM collections WHERE id = ?', num((req.params as Row).id));
    if (!c) return x.notFound(rep);
    const target: Target | null = c.target ? JSON.parse(c.target) : null;
    const memberIds = all('SELECT photo_id FROM collection_photos WHERE collection_id = ? ORDER BY pos', c.id).map((r) => r.photo_id as number);
    const members = new Set(memberIds);
    const f = loadFeatures(x);
    const agg = x.ratingAgg();
    const dto = (id: number, extra: Record<string, unknown> = {}) => ({ ...x.photoDto(one('SELECT * FROM photos WHERE id = ?', id)!, false, agg), ...extra });

    // Repetitive: photographs in the collection that look almost the same.
    const parent = new Map(memberIds.map((i) => [i, i]));
    const find = (a: number): number => { let r = a; while (parent.get(r) !== r) r = parent.get(r)!; return r; };
    for (let i = 0; i < memberIds.length; i++) for (let j = i + 1; j < memberIds.length; j++) {
      const a = f.get(memberIds[i]), b = f.get(memberIds[j]);
      if (a && b && ((a.dhash && b.dhash && hamming(a.dhash, b.dhash) <= 10) || similarity(a, b) >= 0.85)) parent.set(find(a.id), find(b.id));
    }
    const rep_ = new Map<number, number[]>();
    for (const i of memberIds) rep_.set(find(i), [...(rep_.get(find(i)) ?? []), i]);
    const repetitive = [...rep_.values()].filter((g) => g.length > 1).map((ids) => ({ photoIds: ids }));
    const repetitiveIds = new Set(repetitive.flatMap((g) => g.photoIds));

    // Alternatives: for a photo that fails the target, or repeats another, a similar photo from the library that does the job.
    const others = [...f.values()].filter((o) => !members.has(o.id));
    const alternatives = memberIds.map((id) => {
      const me = f.get(id);
      if (!me) return null;
      const fails = !!checkTarget(me, target).problem;
      if (!fails && !repetitiveIds.has(id)) return null;
      const cands = others.filter((o) => !checkTarget(o, target).problem).map((o) => ({ o, s: similarity(me, o) })).filter((r) => r.s >= 0.7).sort((a, b) => b.s - a.s).slice(0, 3);
      return cands.length ? { forId: id, reason: fails ? 'Does not meet the target' : 'Looks like another photo here', candidates: cands.map((r) => dto(r.o.id, { similarity: Math.round(r.s * 100) / 100 })) } : null;
    }).filter(Boolean);

    // Complementary: photographs not in the collection that sit well with what is, preferring other photoshoots.
    const complementary = memberIds.length ? others.filter((o) => !o.parentId).map((o) => {
      const sims = memberIds.map((m) => (f.get(m) ? similarity(f.get(m)!, o) : 0)).sort((a, b) => b - a);
      const s = avgOf(sims.slice(0, 3));
      const memberShoots = new Set(memberIds.map((m) => f.get(m)?.shootId));
      return { o, s: s + (memberShoots.has(o.shootId) ? 0 : 0.03) };
    }).filter((r) => r.s >= 0.6).sort((a, b) => b.s - a.s).slice(0, 8).map((r) => dto(r.o.id, { similarity: Math.round(r.s * 100) / 100 })) : [];

    return { repetitive, alternatives, complementary, aiAssisted: memberIds.some((m) => f.get(m)?.embedding) };
  });

  // ---------- statistics ----------
  app.get('/api/stats', async () => {
    const p = one('SELECT COUNT(*) n, COALESCE(SUM(size_bytes), 0) bytes FROM photos') as Row;
    const sessions = loadSettings(db).sessions;
    const complete = (one('SELECT COUNT(*) n FROM (SELECT photo_id FROM reviews GROUP BY photo_id HAVING COUNT(*) >= ?)', sessions) as Row).n;
    const dist = [1, 2, 3, 4, 5].map((v) => ({ value: v, n: (one('SELECT COUNT(*) n FROM reviews WHERE rating = ?', v) as Row).n }));
    const avg = (one('SELECT AVG(rating) a FROM reviews') as Row).a ?? 0;
    const perShoot = all('SELECT s.id, s.name, COUNT(p.id) n FROM shoots s LEFT JOIN photos p ON p.shoot_id = s.id GROUP BY s.id ORDER BY s.imported_at DESC');
    const inCollections = (one('SELECT COUNT(DISTINCT photo_id) n FROM collection_photos') as Row).n;
    const agg = x.ratingAgg();
    const top = all('SELECT p.* FROM photos p JOIN reviews r ON r.photo_id = p.id GROUP BY p.id ORDER BY AVG(r.rating) DESC, COUNT(r.id) DESC LIMIT 10').map((r) => x.photoDto(r, false, agg));
    const dist_ = (kind: string) => all('SELECT name, COUNT(*) n FROM tags WHERE accepted = 1 AND kind = ? GROUP BY name ORDER BY n DESC, name LIMIT 12', kind);
    return {
      photos: p.n, bytes: p.bytes, completePct: p.n ? Math.round((complete / p.n) * 100) : 0, avgRating: avg, inCollections, dist, perShoot, top,
      subjects: dist_('subject'), tags: dist_('tag'),
      // How the average rating moves over time, and how it differs from first session to last.
      trend: all("SELECT substr(date, 1, 7) month, ROUND(AVG(rating), 2) avg, COUNT(*) n FROM reviews GROUP BY month ORDER BY month"),
      bySession: all('SELECT session, ROUND(AVG(rating), 2) avg, COUNT(*) n FROM reviews GROUP BY session ORDER BY session'),
    };
  });
}
