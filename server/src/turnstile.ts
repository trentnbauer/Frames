import crypto from 'node:crypto';
import type { FastifyRequest } from 'fastify';
import { getSecret, setSecret } from './ai.js';
import { getSetting, setSetting, type DB } from './db.js';
import { envBool } from './env.js';

/**
 * Cloudflare Turnstile: a check that a person, not a script, is at the other end. It can guard the sign-in page and the share links.
 * It is a second line behind sign-in and the unguessable link, never a replacement for them, so it fails open when Cloudflare cannot
 * be reached or the secret key is wrong (a typing mistake must not lock everyone out) and TURNSTILE_DISABLE=true switches it off.
 */
export type TurnstileCfg = { enabled: boolean; siteKey: string; signin: boolean; shares: boolean };
const DEFAULTS: TurnstileCfg = { enabled: false, siteKey: '', signin: true, shares: true };
export const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
export const COOKIE = 'frames_human';
const HOURS = 12;

export const loadTurnstile = (sys: DB): TurnstileCfg => ({ ...DEFAULTS, ...getSetting<Partial<TurnstileCfg>>(sys, 'turnstile', {}) });
export const hasSecret = (sys: DB) => !!getSecret(sys, 'turnstile');
export const saveTurnstile = (sys: DB, c: Partial<TurnstileCfg> & { secret?: string }) => {
  const cur = loadTurnstile(sys);
  setSetting(sys, 'turnstile', {
    enabled: typeof c.enabled === 'boolean' ? c.enabled : cur.enabled, signin: typeof c.signin === 'boolean' ? c.signin : cur.signin, shares: typeof c.shares === 'boolean' ? c.shares : cur.shares,
    siteKey: typeof c.siteKey === 'string' ? c.siteKey.trim().slice(0, 100) : cur.siteKey,
  });
  if (typeof c.secret === 'string' && c.secret.trim()) setSecret(sys, 'turnstile', c.secret.trim().slice(0, 200));
};

/** What the pages need, or null when the check is off (switched off, not set up, or locked off by TURNSTILE_DISABLE). */
export function active(sys: DB, where: 'signin' | 'shares'): { siteKey: string } | null {
  if (envBool('TURNSTILE_DISABLE', false)) return null;
  const c = loadTurnstile(sys);
  return c.enabled && c.siteKey && hasSecret(sys) && c[where] ? { siteKey: c.siteKey } : null;
}
export const anyActive = (sys: DB) => !!(active(sys, 'signin') || active(sys, 'shares'));

/** Asks Cloudflare whether a token is good. 'down' covers a Cloudflare that cannot be reached and a secret key it does not accept. */
export async function verifyToken(sys: DB, token: unknown, ip: string, url = VERIFY_URL): Promise<'ok' | 'bad' | 'down'> {
  if (typeof token !== 'string' || !token || token.length > 2048) return 'bad';
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ secret: getSecret(sys, 'turnstile'), response: token, remoteip: ip }), signal: AbortSignal.timeout(8000), redirect: 'error' });
    if (!r.ok) return 'down';
    const j = (await r.json()) as { success?: boolean; 'error-codes'?: string[] };
    if (j.success) return 'ok';
    if ((j['error-codes'] ?? []).some((e) => e === 'invalid-input-secret' || e === 'missing-input-secret' || e === 'internal-error')) { console.warn('Turnstile: Cloudflare does not accept the secret key; letting people through until it is fixed.'); return 'down'; }
    return 'bad';
  } catch { return 'down'; }
}

// A person who passed the check keeps a signed cookie for a while, so it is not asked again for every request. The key is the secret itself.
const sign = (sys: DB, exp: number) => crypto.createHmac('sha256', getSecret(sys, 'turnstile') || 'x').update(String(exp)).digest('base64url');
export const humanCookie = (sys: DB, secure: boolean) => { const exp = Date.now() + HOURS * 3600_000; return `${COOKIE}=${exp}.${sign(sys, exp)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${HOURS * 3600}${secure ? '; Secure' : ''}`; };
export function isHuman(sys: DB, req: FastifyRequest): boolean {
  const raw = /(?:^|;\s*)frames_human=([^;]+)/.exec(String(req.headers.cookie ?? ''))?.[1];
  const [exp, sig] = (raw ?? '').split('.');
  if (!exp || !sig || !(Number(exp) > Date.now())) return false;
  const want = sign(sys, Number(exp));
  return sig.length === want.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want));
}
