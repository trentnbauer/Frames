import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { handOver } from './auth.js';
import { setSetting } from './db.js';
import { cleanup, makeEnv, type Env } from './testutil.js';

/** Cloudflare Turnstile on the sign-in page and share links, against a stand-in for Cloudflare's check. */
let env: Env, srv: http.Server, url: string, answer: { success: boolean; codes?: string[]; down?: boolean };
const posts: URLSearchParams[] = [];
let token: string;
const call = async (method: string, path: string, payload?: unknown, headers: Record<string, string> = {}) => {
  const r = await env.app.inject({ method: method as any, url: path, payload: payload as any, headers });
  return { status: r.statusCode, body: String(r.headers['content-type'] ?? '').includes('json') ? r.json() : r.body, headers: r.headers };
};
const cookieOf = (r: { headers: Record<string, any> }) => String(([] as string[]).concat(r.headers['set-cookie'] ?? []).find((c) => c.startsWith('frames_human=')) ?? '').split(';')[0];

beforeAll(async () => {
  srv = http.createServer((req, res) => {
    let b = ''; req.on('data', (c) => (b += c));
    req.on('end', () => {
      const f = new URLSearchParams(b); posts.push(f);
      if (answer.down) { res.statusCode = 502; return res.end('bad gateway'); }
      const good = f.get('response') === 'good';
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(answer.codes ? { success: false, 'error-codes': answer.codes } : { success: good }));
    });
  });
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
  url = `http://127.0.0.1:${(srv.address() as AddressInfo).port}/siteverify`;
  env = makeEnv({ turnstileUrl: url });
  const c = (await call('POST', '/api/collections', { name: 'Guarded' })).body;
  token = (await call('POST', '/api/shares', { kind: 'collection', id: c.id, allowReview: true })).body.token;
});
afterAll(() => { env.app.close(); srv.close(); cleanup(env); });

describe('Turnstile settings', () => {
  it('start off, never give the secret back, and cannot be switched on without both keys', async () => {
    answer = { success: true };
    expect((await call('GET', '/api/admin/turnstile')).body).toMatchObject({ enabled: false, hasSecret: false, siteKey: '' });
    expect((await call('PUT', '/api/admin/turnstile', { enabled: true })).status).toBe(400);
    expect((await call('PUT', '/api/admin/turnstile', { enabled: true, siteKey: 'site' })).status).toBe(400); // no secret yet
    expect((await call('PUT', '/api/admin/turnstile', { siteKey: 7 })).status).toBe(400);
    const r = await call('PUT', '/api/admin/turnstile', { enabled: true, siteKey: ' site-key ', secret: 'the-secret-value' });
    expect(r.body).toMatchObject({ enabled: true, siteKey: 'site-key', hasSecret: true, signin: true, shares: true });
    expect(JSON.stringify(r.body)).not.toContain('the-secret-value');
  });
});

describe('share links', () => {
  it('ask for the check before anything is shown, and then remember it', async () => {
    const g = await call('GET', `/api/s/${token}`);
    expect(g.status).toBe(403);
    expect(g.body.challenge).toEqual({ siteKey: 'site-key' });
    expect((await call('GET', `/api/s/${token}/photos/1/thumb`)).status).toBe(403); // pictures and actions too
    expect((await call('POST', `/api/s/${token}/comment`, { body: 'hi' })).status).toBe(403);
    expect((await call('POST', `/api/s/${token}/human`, { token: 'wrong' })).status).toBe(400);
    expect((await call('POST', `/api/s/${token}/human`, {})).status).toBe(400);
    const ok = await call('POST', `/api/s/${token}/human`, { token: 'good' });
    expect(ok.status).toBe(200);
    expect(posts[posts.length - 1].get('secret')).toBe('the-secret-value'); // Cloudflare is given the secret, with the answer
    const cookie = cookieOf(ok);
    expect(cookie).toMatch(/^frames_human=\d+\./);
    expect(String(ok.headers['set-cookie'])).toMatch(/HttpOnly/);
    expect((await call('GET', `/api/s/${token}`, undefined, { cookie })).status).toBe(200);
    expect((await call('GET', `/api/s/${token}`, undefined, { cookie: cookie.slice(0, -2) + 'xx' })).status).toBe(403); // a changed cookie is no good
    expect((await call('GET', `/api/s/${token}`, undefined, { cookie: 'frames_human=1.abc' })).status).toBe(403);
  });
  it('are open again when the check is switched off for them, or by the environment', async () => {
    await call('PUT', '/api/admin/turnstile', { shares: false });
    expect((await call('GET', `/api/s/${token}`)).status).toBe(200);
    await call('PUT', '/api/admin/turnstile', { shares: true });
    expect((await call('GET', `/api/s/${token}`)).status).toBe(403);
    process.env.TURNSTILE_DISABLE = 'true';
    try { expect((await call('GET', `/api/s/${token}`)).status).toBe(200); } finally { delete process.env.TURNSTILE_DISABLE; }
  });
  it('do not lock anyone out when Cloudflare cannot be reached or does not accept the secret key', async () => {
    answer = { success: false, down: true };
    expect((await call('POST', `/api/s/${token}/human`, { token: 'anything' })).status).toBe(200);
    answer = { success: false, codes: ['invalid-input-secret'] };
    expect((await call('POST', `/api/s/${token}/human`, { token: 'anything' })).status).toBe(200);
    answer = { success: false, codes: ['invalid-input-response'] }; // a plain failed check is still a failure
    expect((await call('POST', `/api/s/${token}/human`, { token: 'anything' })).status).toBe(400);
    answer = { success: true };
  });
  it('load Cloudflare’s script only while the check is on', async () => {
    expect(String((await call('GET', `/api/s/${token}`)).headers['content-security-policy'])).toContain('https://challenges.cloudflare.com');
    await call('PUT', '/api/admin/turnstile', { enabled: false });
    expect(String((await call('GET', `/api/s/${token}`)).headers['content-security-policy'])).not.toContain('challenges.cloudflare.com');
    await call('PUT', '/api/admin/turnstile', { enabled: true });
  });
});

describe('the sign-in page', () => {
  it('shows the check, and a provider cannot be started without its answer', async () => {
    setSetting((env.app as any).frames.sys, 'auth', { enabled: true, providers: [{ id: 'g', type: 'google', name: 'Google', clientId: 'x' }], allow: ['a@x.test'], publicUrl: '', testedBy: null });
    const page = (await call('GET', '/auth/signin?returnTo=%2Fs%2FAAAAAAAAAAAAAAAAAAAAAA&guest=1')).body as string;
    expect(page).toContain('class="cf-turnstile"');
    expect(page).toContain('data-sitekey="site-key"');
    expect(page).toContain('formaction="/auth/login/g"');
    expect(page).toContain('name="guest" value="1"');
    expect(page).toContain('name="returnTo"');
    const bare = await call('GET', '/auth/login/g');
    expect(bare.status).toBe(302);
    expect(String(bare.headers.location)).toMatch(/^\/auth\/signin\?e=/);
    const kept = await call('GET', '/auth/login/g?guest=1&returnTo=%2Fs%2FAAAAAAAAAAAAAAAAAAAAAA');
    expect(String(kept.headers.location)).toContain('returnTo=%2Fs%2FAAAAAAAAAAAAAAAAAAAAAA');
    const wrong = await call('GET', '/auth/login/g?cf-turnstile-response=wrong');
    expect(String(wrong.headers.location)).toMatch(/^\/auth\/signin/);
    const good = await call('GET', '/auth/login/g?cf-turnstile-response=good');
    expect(String(good.headers.location ?? '')).not.toMatch(/^\/auth\/signin/); // past the check (the provider itself is not reachable here)
    // A form started this request, so it must not be answered with a redirect off the site (the page's form-action policy refuses that and the button does nothing).
    expect(good.status === 302 && /^https?:\/\//.test(String(good.headers.location))).toBe(false);
    const withCookie = await call('POST', `/api/s/${token}/human`, { token: 'good' });
    const viaCookie = await call('GET', '/auth/login/g', undefined, { cookie: cookieOf(withCookie) }); // having passed on a share link is enough
    expect(String(viaCookie.headers.location ?? '')).not.toMatch(/^\/auth\/signin/);
    const test = await call('GET', '/auth/login/g?test=1'); // the administrator's own test sign-in is exempt
    expect(String(test.headers.location ?? '')).not.toMatch(/^\/auth\/signin/);
  });
  it('is the plain page when the check is off for sign-in', async () => {
    (env.app as any).frames.sys.prepare("UPDATE settings SET value = json_set(value, '$.signin', json('false')) WHERE key = 'turnstile'").run();
    const page = (await call('GET', '/auth/signin')).body as string;
    expect(page).not.toContain('cf-turnstile');
    expect(page).toContain('href="/auth/login/g"');
  });
});

describe('handing the browser on to the sign-in provider', () => {
  it('is a page that moves on by itself, with the address safely escaped', () => {
    const page = handOver('https://accounts.example.com/auth?a=1&state="x"<b>');
    expect(page).toContain('http-equiv="refresh" content="0;url=https://accounts.example.com/auth?a=1&amp;state=&quot;x&quot;&lt;b&gt;"');
    expect(page).toContain('href="https://accounts.example.com/auth?a=1&amp;state=&quot;x&quot;&lt;b&gt;"'); // and a link for a browser that does not follow it
    expect(page).not.toContain('<b>');
  });
});
