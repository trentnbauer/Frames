import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { markup } from './privacy.js';
import { api, cleanup, makeEnv, type Env } from './testutil.js';

/** The privacy page and the terms: Frames' own text, the administrator's replacement, and what anyone can read. */
let env: Env, A: ReturnType<typeof api>;
beforeAll(() => { env = makeEnv(); A = api(env); });
afterAll(() => { env.app.close(); cleanup(env); });

const page = async () => (await env.app.inject({ method: 'GET', url: '/privacy' })).body;
const terms = async () => (await env.app.inject({ method: 'GET', url: '/api/public/auth/terms' })).json().sections as { h: string; p: string }[];

describe('policies', () => {
  it('shows Frames’ own terms and privacy text, which match the app, until they are replaced', async () => {
    expect((await terms()).map((s) => s.h)).toContain('Sharing and guests');
    const html = await page();
    expect(html).toContain('Emailed codes and passkeys');
    expect(html).toContain('Guest accounts');
    const p = (await A.get('/api/admin/policies')).body;
    expect(p.terms.custom).toBe(false);
    expect(p.privacy.custom).toBe(false);
    expect(p.privacy.defaults.length).toBeGreaterThan(3);
  });
  it('lets an administrator replace either one, and put Frames’ text back with an empty list', async () => {
    expect((await A.put('/api/admin/policies/terms', { sections: [{ h: 'House rules', p: 'Be kind.\n\n- No spam' }] })).body).toEqual({ custom: true });
    expect(await terms()).toEqual([{ h: 'House rules', p: 'Be kind.\n\n- No spam' }]);
    expect((await A.put('/api/admin/policies/privacy', { sections: [{ h: 'Ours', p: 'We keep **little**.' }] })).body).toEqual({ custom: true });
    const html = await page();
    expect(html).toContain('<h2>Ours</h2><p>We keep <strong>little</strong>.</p>');
    expect(html).not.toContain('Emailed codes and passkeys');
    await A.put('/api/admin/policies/terms', { sections: [] });
    await A.put('/api/admin/policies/privacy', { sections: [] });
    expect((await terms()).length).toBeGreaterThan(3);
    expect(await page()).toContain('Emailed codes and passkeys');
  });
  it('refuses what is not a list of sections, and never lets text become markup', async () => {
    expect((await A.put('/api/admin/policies/terms', { sections: 'nope' })).status).toBe(400);
    expect((await A.put('/api/admin/policies/terms', { sections: [{ h: 1, p: 2 }] })).status).toBe(400);
    expect((await A.put('/api/admin/policies/other', { sections: [] })).status).toBe(404);
    expect(markup('<script>alert(1)</script>')).toBe('<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>');
  });
});
