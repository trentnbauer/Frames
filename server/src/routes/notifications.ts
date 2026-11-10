import { policyOf } from '../policy.js';
import type { FastifyInstance } from 'fastify';
import { getSetting, setSetting } from '../db.js';
import type { Ctx, Row } from '../ctx.js';
import { DEFAULT_PREFS, EMAILABLE, KINDS, prefsOf, prune, type NotifPrefs } from '../notifications.js';

const RELEASES_URL = 'https://api.github.com/repos/trentnbauer/Frames/releases?per_page=10';

export type Release = { name: string; date: string; url: string; items: string[] };

/** Release notes as short bullets: the lines that start with - or *, else the first few lines. */
export function releaseItems(body: string): string[] {
  const lines = body.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const bullets = lines.filter((l) => /^[-*]\s+/.test(l)).map((l) => l.replace(/^[-*]\s+/, ''));
  return (bullets.length ? bullets : lines.filter((l) => !l.startsWith('#'))).slice(0, 8).map((l) => l.slice(0, 200));
}

export function registerNotifications(app: FastifyInstance, x: Ctx) {
  const { db, all, num } = x;
  const dto = (r: Row) => ({ id: r.id, kind: r.kind, text: r.text, createdAt: r.created_at, read: !!r.read, target: { screen: r.screen, anchor: r.anchor || undefined } });

  app.get('/api/notifications', async () => {
    prune(db);
    const items = all('SELECT * FROM notifications ORDER BY created_at DESC, id DESC LIMIT 50').map(dto);
    return { items, unread: items.filter((i) => !i.read).length };
  });
  app.post('/api/notifications/read', async (req, rep) => {
    const b = (req.body ?? {}) as Row;
    if (b.all === true) db.prepare('UPDATE notifications SET read = 1').run();
    else if (Number.isInteger(b.id)) db.prepare('UPDATE notifications SET read = 1 WHERE id = ?').run(num(b.id));
    else return rep.code(400).send({ error: 'Send an id, or all: true.' });
    return { ok: true };
  });

  app.get('/api/notifications/prefs', async () => ({ prefs: prefsOf(db), kinds: KINDS, emailable: EMAILABLE }));
  app.put('/api/notifications/prefs', async (req, rep) => {
    const b = (req.body ?? {}) as Row;
    const cur = prefsOf(db);
    const next: NotifPrefs = { ...cur };
    const flags = (v: unknown, allowed: readonly string[]) => (v && typeof v === 'object' ? Object.fromEntries(Object.entries(v as Row).filter(([k, val]) => allowed.includes(k) && typeof val === 'boolean')) : {});
    if (b.bell !== undefined) next.bell = { ...cur.bell, ...flags(b.bell, KINDS) } as Record<string, boolean>;
    if (b.email !== undefined) next.email = { ...cur.email, ...flags(b.email, EMAILABLE) } as Record<string, boolean>;
    if (b.quiet !== undefined) {
      const q = b.quiet as Row;
      const hm = (v: unknown, d: string) => (typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : d);
      next.quiet = { on: typeof q.on === 'boolean' ? q.on : cur.quiet.on, from: hm(q.from, cur.quiet.from), to: hm(q.to, cur.quiet.to) };
    }
    if (b.tz !== undefined) {
      try { new Intl.DateTimeFormat('en-GB', { timeZone: String(b.tz) }); next.tz = String(b.tz); } catch { return rep.code(400).send({ error: 'That time zone is not known.' }); }
    }
    if (b.reviewReminder !== undefined) {
      if (!['off', 'daily', 'weekly'].includes(String(b.reviewReminder))) return rep.code(400).send({ error: 'Choose Off, Daily or Weekly.' });
      next.reviewReminder = b.reviewReminder as NotifPrefs['reviewReminder'];
    }
    setSetting(db, 'notifPrefs', next);
    return { prefs: prefsOf(db), kinds: KINDS, emailable: EMAILABLE };
  });

  // The update pop-up for administrators: the server asks GitHub (so a browser behind a firewall still works, and GitHub's limits
  // are shared) and keeps the last good answer to fall back on.
  let cache: { at: number; list: Release[]; channel: string } | null = null;
  app.get('/api/releases', async (req) => {
    const current = x.cfg.version ?? 'dev';
    const channel = policyOf(x.sys).updateChannel;
    if (!cache || cache.channel !== channel || Date.now() - cache.at > 3_600_000) {
      try {
        const r = await fetch(RELEASES_URL, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Frames' }, signal: AbortSignal.timeout(8000) });
        if (!r.ok) throw new Error(String(r.status));
        const data = (await r.json()) as Row[];
        const list = data.filter((d) => !d.draft && (channel === 'beta' || !d.prerelease) && /^https:\/\//.test(String(d.html_url))).map((d) => ({ name: String(d.name || d.tag_name).slice(0, 100), tag: String(d.tag_name), date: String(d.published_at ?? '').slice(0, 10), url: String(d.html_url), items: releaseItems(String(d.body ?? '')) }));
        cache = { at: Date.now(), list, channel };
        setSetting(x.sys, 'releasesCache', list);
      } catch {
        if (!cache || cache.channel !== channel) cache = { channel, at: Date.now() - 3_000_000, list: getSetting<(Release & { tag: string })[]>(x.sys, 'releasesCache', []) }; // try again in ~10 minutes; show the last known list meanwhile
      }
    }
    const list = (cache?.list ?? []) as (Release & { tag: string })[];
    const cur = current.replace(/^v/, '');
    const idx = list.findIndex((r) => r.tag.replace(/^v/, '') === cur);
    const newer = current === 'dev' ? [] : idx >= 0 ? list.slice(0, idx) : list.slice(0, 3); // a version GitHub does not list: show the latest few
    void req;
    return { current, releases: newer.map(({ tag: _t, ...r }) => r), all: list.map(({ tag: _t, ...r }) => r), source: cache && cache.list.length ? 'GitHub Releases' : 'none' };
  });

  void DEFAULT_PREFS;
}
