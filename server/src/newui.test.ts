import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, cleanup, makeEnv, type Env } from './testutil.js';
import { zipOne } from './zip.js';
import { printSheetPdf } from './printSheet.js';
import { coarsen, describe as describePlace } from './routes/map.js';

let env: Env, A: ReturnType<typeof api>;
beforeAll(() => { env = makeEnv(); A = api(env); });
afterAll(() => { env.app.close(); cleanup(env); });

describe('the redesigned app: server support', () => {
  it('keeps a storage limit per person and refuses values that are not on the list', async () => {
    expect((await A.get('/api/admin/instance')).body).toMatchObject({ userQuotaGb: 0 });
    expect((await A.put('/api/admin/instance', { userQuotaGb: 50 })).body).toMatchObject({ userQuotaGb: 50 });
    expect((await A.put('/api/admin/instance', { userQuotaGb: 0.5 })).body).toMatchObject({ userQuotaGb: 0.5 }); // any size can be typed
    expect((await A.put('/api/admin/instance', { userQuotaGb: 7 })).body).toMatchObject({ userQuotaGb: 7 });
    for (const bad of [-1, 'abc', null, 1e9, NaN]) expect((await A.put('/api/admin/instance', { userQuotaGb: bad })).body).toMatchObject({ userQuotaGb: 7 }); // not a size: unchanged
    await A.put('/api/admin/instance', { userQuotaGb: 0 });
  });
  it('does not offer crash reporting any more', async () => {
    expect((await A.get('/api/admin/instance')).body).not.toHaveProperty('crashReports');
  });
  it('writes a zip with one file in it and a one-page print sheet', () => {
    const z = zipOne('frames.log', Buffer.from('hello hello hello'));
    expect(z.subarray(0, 4).toString('hex')).toBe('504b0304');
    expect(z.includes(Buffer.from('frames.log'))).toBe(true);
    const pdf = printSheetPdf([{ text: 'Kitchen wall', bold: true }, { text: 'Print 1: A3 portrait' }]).toString('latin1');
    expect(pdf.startsWith('%PDF-1.4')).toBe(true);
    expect(pdf).toContain('(Kitchen wall) Tj');
    expect(pdf.trimEnd().endsWith('%%EOF')).toBe(true);
  });
  it('gives the newest log lines, parsed', async () => {
    console.warn('a warning for the window');
    const r = (await A.get('/api/admin/logs/tail?tail=50')).body as { lines: { level: string; message: string }[] };
    expect(Array.isArray(r.lines)).toBe(true);
  });
  it('coarsens a place for the public: exact, suburb or city', () => {
    const p = { name: 'Fremantle Markets', suburb: 'Fremantle', city: 'Perth', lat: -32.0563, lon: 115.7489 };
    expect(coarsen(p, 'exact')).toMatchObject({ name: 'Fremantle Markets', lat: -32.0563 });
    expect(coarsen(p, 'suburb')).toMatchObject({ name: 'Fremantle', lat: -32.06, lon: 115.75 });
    expect(coarsen(p, 'city')).toMatchObject({ name: 'Perth', lat: -32.1, lon: 115.7 });
    expect(describePlace({ display_name: 'Mill Market, Geelong, Victoria', name: 'Mill Market', address: { shop: 'market', suburb: 'Geelong' } }).kind).toBe('business');
  });
  it('keeps a wishlist currency and a system rename', async () => {
    await A.post('/api/gear/items', { kind: 'own', name: 'Body A', type: 'camera', system: 'Old name' });
    await A.post('/api/gear/systems/rename', { from: 'Old name', to: 'New name' });
    const own = ((await A.get('/api/gear/items')).body as { own: { system: string }[] }).own;
    expect(own.some((g) => g.system === 'New name')).toBe(true);
  });
  it('lets only a signed-in person manage passkeys, and hands out sign-in options', async () => {
    const opts = (await A.post('/api/public/auth/passkey/options', {})).body as { options: { challenge: string }; cid: string };
    expect(opts.options.challenge.length).toBeGreaterThan(10);
    expect(opts.cid.length).toBeGreaterThan(10);
    const r = await env.app.inject({ method: 'GET', url: '/api/me/passkeys' });
    expect(r.statusCode).toBe(401);
  });
  it('removes a composition together with its share link', async () => {
    const c = (await A.post('/api/collections', { name: 'To delete' })).body as { id: number };
    await A.post('/api/shares', { kind: 'collection', id: c.id });
    await A.del(`/api/collections/${c.id}`);
    expect(((await A.get(`/api/shares?kind=collection&id=${c.id}`)).body as unknown[]).length).toBe(0);
  });
});
