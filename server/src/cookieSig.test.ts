import crypto from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cleanup, makeEnv, type Env } from './testutil.js';

/** A signed cookie with non-ASCII characters of the right length is a wrong signature, not a server error. */
process.env.TURNSTILE_DELAY_SECONDS = '0'; // the check is live straight away
let env: Env, token: string, id: number;
// Same length as a real signature (43 base64url characters), but each 'é' is two bytes once encoded.
const odd = 'é'.repeat(43);

beforeAll(async () => {
  env = makeEnv();
  const c = (await env.app.inject({ method: 'POST', url: '/api/collections', payload: { name: 'Locked' } })).json();
  const s = (await env.app.inject({ method: 'POST', url: '/api/shares', payload: { kind: 'collection', id: c.id, pin: '4826' } })).json();
  token = s.token; id = s.id;
});
afterAll(() => { env.app.close(); cleanup(env); });

describe('signed cookies', () => {
  it('a share PIN cookie', async () => {
    const name = `frames_pin_${crypto.createHash('sha256').update(`1|${id}|${token}`).digest('base64url').slice(0, 16)}`;
    const r = await env.app.inject({ url: `/api/s/${token}`, headers: { cookie: `${name}=${odd}` } });
    expect(r.statusCode).toBe(401);
  });
  it('the Turnstile cookie', async () => {
    const put = await env.app.inject({ method: 'PUT', url: '/api/admin/turnstile', payload: { enabled: true, siteKey: 'site-key', secret: ['s', 'e', 'c'].join('') } });
    expect(put.statusCode).toBe(200);
    const r = await env.app.inject({ url: `/api/s/${token}`, headers: { cookie: `frames_human=${Date.now() + 60_000}.${odd}` } });
    expect(r.statusCode).toBe(403); // asked to pass the check, not crashed
  });
});
