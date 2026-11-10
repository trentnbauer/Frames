import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createSession, SESSION_COOKIE } from './auth.js';
import { mailer, saveSmtp, checkSmtp } from './email.js';
import { flushOutbox, queueMail, releaseTime, remindersFor } from './mailEvents.js';
import { setSetting, type DB } from './db.js';
import { resolveUser, updateUser, type Who } from './users.js';
import { cleanup, makeEnv, type Env } from './testutil.js';

/** Held email, reminders, invites and guest activity. Nothing reaches a real mail server. */
let env: Env, sys: DB, ctx: any, owner: any;
const sent: Record<string, any>[] = [];
mailer.make = () => ({ verify: async () => undefined, sendMail: async (m) => { sent.push(m); } });
const who = (sub: string, email: string, name: string): Who => ({ provider: 'g', sub, email, emailVerified: true, name });
const call = async (method: string, url: string, payload?: unknown, headers: Record<string, string> = {}) => {
  const r = await env.app.inject({ method: method as any, url, payload: payload as any, headers });
  const ct = String(r.headers['content-type'] ?? '');
  return { status: r.statusCode, body: ct.includes('json') ? r.json() : r.rawPayload.toString() };
};
let admin: Record<string, string>;

beforeAll(async () => {
  env = makeEnv();
  const frames = (env.app as any).frames;
  sys = frames.sys; ctx = frames;
  setSetting(sys, 'auth', { enabled: true, providers: [{ id: 'g', type: 'google', name: 'Google', clientId: 'x' }], allow: ['@x.test'], publicUrl: 'https://frames.example.com', testedBy: null });
  updateUser(sys, 1, { name: 'Owner Person' });
  resolveUser(sys, who('o', 'owner@x.test', 'Owner Person'), true);
  admin = { cookie: `${SESSION_COOKIE}=${createSession(sys, 1)}` };
  saveSmtp(sys, { host: 'smtp.test', from: 'frames@x.test' });
  await checkSmtp(sys);
  owner = ctx.tenants.owner();
});
afterAll(() => { env.app.close(); cleanup(env); });

describe('held and queued mail', () => {
  it('sends nothing for a kind the person has not turned on, and holds mail through quiet hours', async () => {
    const base = { type: 'guest' as const, baseUrl: 'https://frames.example.com', params: { subject: 'S', title: 'T', body: 'B', button_label: 'Go', button_url: 'https://frames.example.com' } };
    setSetting(owner.db, 'notifPrefs', { tz: 'UTC', quiet: { on: false } }); // not quiet: whatever time the test runs
    expect(queueMail(ctx, owner, 'summary', base)).toBe(false); // off by default
    expect(queueMail(ctx, owner, 'guest-suggestion', base)).toBe(true); // on by default
    setSetting(owner.db, 'notifPrefs', { tz: 'UTC', quiet: { on: true, from: '00:00', to: '23:59' }, email: { 'guest-suggestion': true } });
    const due = new Date((sys.prepare('SELECT due FROM email_outbox ORDER BY id DESC LIMIT 1').get() as { due: string }).due);
    expect(due.getTime()).toBeGreaterThanOrEqual(Date.now() - 1000);
    sent.length = 0;
    expect(await flushOutbox(ctx)).toBe(1); // the first one was due at once
    queueMail(ctx, owner, 'guest-suggestion', base);
    const held = new Date((sys.prepare('SELECT due FROM email_outbox ORDER BY id DESC LIMIT 1').get() as { due: string }).due);
    expect(held.getTime()).toBeGreaterThan(Date.now() + 60_000); // held until quiet hours end
    expect(await flushOutbox(ctx)).toBe(0);
    sys.prepare('DELETE FROM email_outbox').run();
    setSetting(owner.db, 'notifPrefs', { tz: 'UTC', quiet: { on: true, from: '22:00', to: '08:00' } });
    expect(releaseTime(owner.db, new Date('2026-11-10T12:00:00Z')).toISOString()).toBe('2026-11-10T12:00:00.000Z');
    expect(releaseTime(owner.db, new Date('2026-11-10T23:00:00Z')).toISOString()).toBe('2026-11-11T08:00:00.000Z');
  });
  it('sends a weekly review reminder only on Monday at 09:00 local, only when something is due, and only once', () => {
    setSetting(owner.db, 'notifPrefs', { tz: 'UTC', quiet: { on: false }, email: { 'review-due': true }, reviewReminder: 'weekly' });
    owner.db.prepare("INSERT OR IGNORE INTO shoots(id, name, imported_at) VALUES(1, 's', '2026-01-01')").run();
    owner.db.prepare("INSERT INTO photos(shoot_id, path, file, hash, title, w, h, file_type, size_bytes, added_at, next_review_at) VALUES(1, '/x/r.jpg', 'r.jpg', 'hr', 'r', 10, 10, 'JPG', 1, '2026-01-01T00:00:00Z', '2026-01-02T00:00:00Z')").run();
    sys.prepare('DELETE FROM email_outbox').run();
    const monday9 = new Date('2026-11-09T09:05:00Z'); // a Monday
    expect(remindersFor(ctx, owner, 'https://frames.example.com', new Date('2026-11-10T09:05:00Z'))).toEqual([]); // Tuesday
    expect(remindersFor(ctx, owner, 'https://frames.example.com', new Date('2026-11-09T08:05:00Z'))).toEqual([]); // not 09:00 yet
    expect(remindersFor(ctx, owner, 'https://frames.example.com', monday9)).toEqual(['reminder']);
    expect(remindersFor(ctx, owner, 'https://frames.example.com', monday9)).toEqual([]); // once
    expect((sys.prepare('SELECT COUNT(*) n FROM email_outbox').get() as { n: number }).n).toBe(1);
    owner.db.prepare('DELETE FROM photos').run();
    expect(remindersFor(ctx, owner, 'https://frames.example.com', new Date('2026-11-16T09:05:00Z'))).toEqual([]); // nothing due
  });
  it('sends the monthly summary on the 1st at 09:00 for those who opted in', () => {
    setSetting(owner.db, 'notifPrefs', { tz: 'UTC', quiet: { on: false }, email: { summary: true }, reviewReminder: 'off' });
    sys.prepare('DELETE FROM email_outbox').run();
    expect(remindersFor(ctx, owner, 'https://frames.example.com', new Date('2026-12-01T09:10:00Z'))).toEqual(['summary']);
    expect(remindersFor(ctx, owner, 'https://frames.example.com', new Date('2026-12-01T09:20:00Z'))).toEqual([]);
    sys.prepare('DELETE FROM email_outbox').run();
  });
});

describe('invites and guests', () => {
  it('emails a new member their invitation when mail works, and says so', async () => {
    sent.length = 0;
    const r = await call('POST', '/api/admin/users', { email: 'new@x.test', note: 'Welcome aboard' }, admin);
    expect(r.status).toBe(201);
    expect(r.body.emailed).toBe(true);
    expect(sent[0].to).toBe('new@x.test');
    expect(String(sent[0].html)).toContain('Welcome aboard');
  });
  it('emails a share link without the PIN, logs each address, and tells the owner when a guest acts', async () => {
    const photos = (await call('GET', '/api/photos', undefined, admin)).body.photos;
    expect(photos).toHaveLength(0);
    owner.db.prepare("INSERT OR IGNORE INTO shoots(id, name, imported_at) VALUES(1, 's', '2026-01-01')").run();
    owner.db.prepare("INSERT INTO photos(id, shoot_id, path, file, hash, title, w, h, file_type, size_bytes, has_derivs, added_at) VALUES(7, 1, '/x/g.jpg', 'g.jpg', 'hg', 'g', 10, 10, 'JPG', 1, 1, '2026-01-01T00:00:00Z')").run();
    const c = (await call('POST', '/api/collections', { name: 'Kitchen wall', photoIds: [7] }, admin)).body;
    const s = (await call('POST', '/api/shares', { kind: 'collection', id: c.id, allowReview: true, pin: '2468' }, admin)).body;
    sent.length = 0;
    const inv = await call('POST', `/api/shares/${s.id}/invites`, { emails: ['mia@y.test', 'not an email', 'mia@y.test'], note: 'What do you think?' }, admin);
    expect(inv.body.results).toEqual([{ email: 'mia@y.test', ok: true, error: '' }]);
    expect(String(sent[0].html)).toContain(`/s/${s.token}`);
    expect(String(sent[0].html)).not.toContain('2468'); // the PIN travels separately
    expect((await call('GET', `/api/shares/${s.id}/invites`, undefined, admin)).body.invites[0]).toMatchObject({ email: 'mia@y.test', status: 'sent' });
    expect((await call('POST', `/api/shares/${s.id}/invites`, { emails: [] }, admin)).status).toBe(400);
    // A guest (past the PIN) rates a photo: the owner's bell says so.
    const gate = await env.app.inject({ url: `/api/s/${s.token}/gate` });
    const dev = ([] as string[]).concat(gate.headers['set-cookie'] ?? []).map((x) => x.split(';')[0]).join('; ');
    const pin = await env.app.inject({ method: 'POST', url: `/api/s/${s.token}/pin`, payload: { pin: '2468' }, headers: { cookie: dev } });
    const cookie = `${dev}; ${([] as string[]).concat(pin.headers['set-cookie'] ?? []).map((x) => x.split(';')[0]).join('; ')}`;
    const rate = await env.app.inject({ method: 'POST', url: `/api/s/${s.token}/review`, payload: { photoId: 7, rating: 5, reviewer: 'Mia' }, headers: { cookie } });
    expect(rate.statusCode).toBe(200);
    const bell = (await call('GET', '/api/notifications', undefined, admin)).body.items;
    expect(bell[0]).toMatchObject({ kind: 'guest-rating', text: 'Mia rated your photos', target: { screen: `/collections/${c.id}?guests=ratings` } });
  });
});
