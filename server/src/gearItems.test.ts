import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { gearMarkdown, systemOf } from './routes/gearitems.js';
import { api, cleanup, makeEnv, type Env } from './testutil.js';

let env: Env, A: ReturnType<typeof api>;
beforeAll(() => { env = makeEnv(); A = api(env); });
afterAll(() => { env.app.close(); cleanup(env); });

describe('gear and wishlist', () => {
  it('works out a camera system or lens mount from a name', () => {
    expect(systemOf('Fujifilm X-T5')).toBe('Fujifilm X');
    expect(systemOf('XF35mmF1.4 R')).toBe('Fujifilm X');
    expect(systemOf('Sony A7 IV')).toBe('Sony E');
    expect(systemOf('Canon EOS R6')).toBe('Canon RF');
    expect(systemOf('Nikon Z 6')).toBe('Nikon Z');
    expect(systemOf('Leica M6')).toBe('Leica M');
    expect(systemOf('Mystery box')).toBe('');
  });
  it('owns, wants, reorders, and moves a bought item to what you own', async () => {
    const x100 = (await A.post('/api/gear/items', { kind: 'own', name: 'Fujifilm X-T5', type: 'camera', year: 2022 })).body;
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
