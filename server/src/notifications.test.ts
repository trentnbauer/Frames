import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cleanup, makeEnv, type Env } from './testutil.js';
import { inQuietHours, notify, prefsOf, prune } from './notifications.js';
import { releaseItems } from './routes/notifications.js';

let env: Env;
const call = async (method: string, url: string, payload?: unknown) => {
  const r = await env.app.inject({ method: method as any, url, payload: payload as any });
  return { status: r.statusCode, body: r.json() };
};
beforeAll(() => { env = makeEnv(); });
afterAll(() => { env.app.close(); cleanup(env); });

describe('notifications', () => {
  it('lists, marks read, and deep-links by target', async () => {
    notify(env.db, 'guest-suggestion', 'Mia suggested 3 changes', { screen: '/collections/4?guests=suggestions' });
    notify(env.db, 'idea', 'A new idea', { screen: '/', anchor: 'ideas' });
    const r = await call('GET', '/api/notifications');
    expect(r.body.unread).toBe(2);
    expect(r.body.items[0].target).toEqual({ screen: '/', anchor: 'ideas' });
    expect((await call('POST', '/api/notifications/read', { id: r.body.items[0].id })).status).toBe(200);
    expect((await call('GET', '/api/notifications')).body.unread).toBe(1);
    expect((await call('POST', '/api/notifications/read', { all: true })).status).toBe(200);
    expect((await call('GET', '/api/notifications')).body.unread).toBe(0);
    expect((await call('POST', '/api/notifications/read', {})).status).toBe(400);
  });
  it('tells the same event once, and honours a kind turned off', async () => {
    expect(notify(env.db, 'cloud-sync', 'Batch needs a name', { screen: '/' }, 'batch-1')).toBeGreaterThan(0);
    expect(notify(env.db, 'cloud-sync', 'Batch needs a name', { screen: '/' }, 'batch-1')).toBe(0);
    await call('PUT', '/api/notifications/prefs', { bell: { idea: false } });
    expect(notify(env.db, 'idea', 'Another', { screen: '/' })).toBe(0);
  });
  it('validates preferences', async () => {
    expect((await call('PUT', '/api/notifications/prefs', { tz: 'Not/AZone' })).status).toBe(400);
    expect((await call('PUT', '/api/notifications/prefs', { reviewReminder: 'hourly' })).status).toBe(400);
    const ok = await call('PUT', '/api/notifications/prefs', { tz: 'Australia/Perth', quiet: { on: true, from: '23:00', to: '07:00' }, reviewReminder: 'daily' });
    expect(ok.body.prefs).toMatchObject({ tz: 'Australia/Perth', reviewReminder: 'daily', quiet: { from: '23:00', to: '07:00' } });
  });
  it('keeps at most 200, dropping the oldest read ones first, and ages them out', () => {
    for (let i = 0; i < 230; i++) { const id = notify(env.db, 'summary', `n${i}`, { screen: '/' }, `r${i}`); if (i < 150) env.db.prepare('UPDATE notifications SET read = 1 WHERE id = ?').run(id); }
    prune(env.db);
    expect((env.db.prepare('SELECT COUNT(*) c FROM notifications').get() as { c: number }).c).toBeLessThanOrEqual(200);
    expect((env.db.prepare('SELECT COUNT(*) c FROM notifications WHERE read = 0').get() as { c: number }).c).toBeGreaterThan(70); // unread survive
    env.db.prepare('UPDATE notifications SET created_at = ? WHERE read = 1').run(new Date(Date.now() - 91 * 86_400_000).toISOString());
    prune(env.db);
    expect((env.db.prepare('SELECT COUNT(*) c FROM notifications WHERE read = 1').get() as { c: number }).c).toBe(0);
  });
  it('knows quiet hours across midnight, in the person’s time zone', () => {
    const p = { ...prefsOf(env.db), tz: 'UTC', quiet: { on: true, from: '22:00', to: '08:00' } };
    expect(inQuietHours(p, new Date('2026-11-10T23:30:00Z'))).toBe(true);
    expect(inQuietHours(p, new Date('2026-11-10T07:59:00Z'))).toBe(true);
    expect(inQuietHours(p, new Date('2026-11-10T12:00:00Z'))).toBe(false);
    expect(inQuietHours({ ...p, quiet: { ...p.quiet, on: false } }, new Date('2026-11-10T23:30:00Z'))).toBe(false);
  });
  it('turns release notes into short bullets', () => {
    expect(releaseItems('## What changed\n- Added A\n- Fixed B\nplain')).toEqual(['Added A', 'Fixed B']);
    expect(releaseItems('Just a line')).toEqual(['Just a line']);
  });
});

it('clears read and unread notifications beyond the first page without repeating the same event', async () => {
  const e = makeEnv();
  try {
    for (let i = 0; i < 55; i++) notify(e.db, 'idea', `Idea ${i}`, { screen: '/' }, `clear-test-${i}`);
    e.db.prepare('UPDATE notifications SET read = 1 WHERE id = (SELECT MIN(id) FROM notifications)').run();
    const request = (method: 'GET' | 'DELETE') => e.app.inject({ method, url: '/api/notifications' });
    expect((await request('GET')).json().items).toHaveLength(50);
    expect((await request('DELETE')).json()).toEqual({ ok: true, cleared: 55 });
    expect((await request('GET')).json()).toEqual({ items: [], unread: 0 });
    expect((await request('DELETE')).json()).toEqual({ ok: true, cleared: 0 });
    expect(notify(e.db, 'idea', 'Repeated event', { screen: '/' }, 'clear-test-0')).toBe(0);
    notify(e.db, 'idea', 'A new event', { screen: '/' }, 'clear-test-new');
    expect((await request('GET')).json()).toMatchObject({ items: [{ text: 'A new event' }], unread: 1 });
  } finally { await e.app.close(); cleanup(e); }
});

it('clears only the signed-in person’s notifications', async () => {
  const { createSession, loadAuth, saveAuth } = await import('./auth.js');
  const { invite, resolveUser } = await import('./users.js');
  const e = makeEnv();
  try {
    const { sys, tenants } = (e.app as any).frames;
    saveAuth(sys, { ...loadAuth(sys), enabled: true, providers: [{ id: 'example', type: 'google', name: 'Example', clientId: 'browser' }] });
    invite(sys, 'member@example.test');
    const person = resolveUser(sys, { provider: 'example', sub: 'member', email: 'member@example.test', emailVerified: true, name: 'Member' }, true)!;
    notify(e.db, 'idea', 'Owner event', { screen: '/' });
    notify(tenants.get(person.id).db, 'idea', 'Member event', { screen: '/' });
    const owner = { cookie: `frames_session=${createSession(sys, 1)}` }, member = { cookie: `frames_session=${createSession(sys, person.id)}` };
    expect((await e.app.inject({ method: 'DELETE', url: '/api/notifications', headers: member })).json().cleared).toBe(1);
    expect((await e.app.inject({ url: '/api/notifications', headers: member })).json().items).toEqual([]);
    expect((await e.app.inject({ url: '/api/notifications', headers: owner })).json().items[0].text).toBe('Owner event');
    expect((await e.app.inject({ method: 'DELETE', url: '/api/notifications' })).statusCode).toBe(401);
  } finally { await e.app.close(); cleanup(e); }
});
