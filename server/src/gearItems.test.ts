import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { gearMarkdown } from './routes/gearitems.js';
import { api, cleanup, makeEnv, type Env } from './testutil.js';

let env: Env, A: ReturnType<typeof api>;
beforeAll(() => { env = makeEnv(); A = api(env); });
afterAll(() => { env.app.close(); cleanup(env); });

describe('gear and wishlist', () => {
  it('owns, wants, reorders, and moves a bought item to what you own', async () => {
    const x100 = (await A.post('/api/gear/items', { kind: 'own', name: 'Fujifilm X-T5', type: 'camera', year: 2022, system: 'Fujifilm X' })).body;
    expect(x100.system).toBe('Fujifilm X');
    const a = (await A.post('/api/gear/items', { kind: 'want', name: 'XF 90mm', type: 'lens', price: 1500, why: 'portraits' })).body;
    const b = (await A.post('/api/gear/items', { kind: 'want', name: 'Godox flash', type: 'light', price: 200 })).body;
    const c = (await A.post('/api/gear/items', { kind: 'want', name: 'Tripod', price: 300, front: true })).body;
    let r = (await A.get('/api/gear/items')).body;
    expect(r.want.map((g: any) => g.name)).toEqual(['Tripod', 'XF 90mm', 'Godox flash']);
    expect(r.totals).toEqual({ want: 2000, next: 300 });
    await A.put('/api/gear/order', { ids: [b.id, c.id, a.id] });
    r = (await A.get('/api/gear/items')).body;
    expect(r.want.map((g: any) => g.name)).toEqual(['Godox flash', 'Tripod', 'XF 90mm']);
    const bought = (await A.post(`/api/gear/items/${b.id}/bought`)).body;
    expect(bought.kind).toBe('own');
    r = (await A.get('/api/gear/items')).body;
    expect(r.own.map((g: any) => g.name)).toContain('Godox flash');
    expect(r.want).toHaveLength(2);
  });
  it('never guesses a system, and keeps the one you set on rename', async () => {
    const g = (await A.post('/api/gear/items', { kind: 'own', name: 'Pentax body', type: 'camera', system: 'Pentax 67' })).body;
    expect((await A.patch(`/api/gear/items/${g.id}`, { name: 'Pentax 67II' })).body.system).toBe('Pentax 67');
    expect((await A.patch(`/api/gear/items/${g.id}`, { name: 'Fujifilm X-T5' })).body.system).toBe('Pentax 67');
  });
  it('keeps a serial number', async () => {
    const g = (await A.post('/api/gear/items', { kind: 'own', name: 'Pentax 67', type: 'camera' })).body;
    expect(g.serial).toBe('');
    expect((await A.patch(`/api/gear/items/${g.id}`, { serial: ' 1234567 ' })).body.serial).toBe('1234567');
    expect((await A.get('/api/gear/items')).body.own.find((o: any) => o.id === g.id).serial).toBe('1234567');
  });
  it('checks what it is given', async () => {
    expect((await A.post('/api/gear/items', { name: '' })).status).toBe(400);
    expect((await A.post('/api/gear/items', { name: 'x', price: 'abc' })).status).toBe(400);
    expect((await A.post('/api/gear/items', { name: 'x', link: 'javascript:alert(1)' })).status).toBe(400);
    expect((await A.put('/api/gear/prefs', { arrange: 'sideways' })).status).toBe(400);
    expect((await A.put('/api/gear/order', { ids: ['a'] })).status).toBe(400);
  });
  it('syncs to the portfolio Gear page in the chosen arrangement, with want-to-buy last, and only when on', async () => {
    await A.put('/api/gear/prefs', { arrange: 'system', showWant: false });
    expect(gearMarkdown(env.db)).toContain('## Fujifilm X');
    expect(gearMarkdown(env.db)).not.toContain('Want to buy');
    await A.put('/api/gear/prefs', { showWant: true, arrange: 'type' });
    const md = gearMarkdown(env.db);
    expect(md.indexOf('## Want to buy')).toBeGreaterThan(-1);
    expect(md.indexOf('## Want to buy')).toBeGreaterThan(md.indexOf('## camera')); // after everything that is owned
    await A.put('/api/gear/prefs', { currency: '€' });
    expect((await A.get('/api/gear/items')).body.prefs.currency).toBe('€');
    await A.put('/api/gear/prefs', { currency: 'zzz' }); // refused
    expect((await A.get('/api/gear/items')).body.prefs.currency).toBe('€');
  });
});
