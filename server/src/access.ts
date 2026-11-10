import type { FastifyRequest } from 'fastify';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { getSetting, type DB } from './db.js';
import { isPortfolioPath } from './portfolio.js';
import { isPublicPath } from './routes/share.js';

/**
 * Cloudflare Access in front of the whole app, for a single person who uses no sign-in inside Frames.
 *
 * Access is the login: Cloudflare asks for an email one-time code at the edge and only then forwards the request, with a
 * signed token (Cf-Access-Jwt-Assertion). Frames checks that token itself instead of trusting the network, so if the
 * Access application were ever deleted or misconfigured the app stays closed rather than open to the internet.
 *
 * Share links (/s/), the portfolio (/portfolio/) and the few files they need are public by design. They are exactly the
 * paths Access is told to bypass, and the only ones this gate lets through without a token.
 */

/** What Cloudflare Access is told to leave public, written as it wants them (path prefixes with a * wildcard). */
export const PUBLIC_DESTINATIONS = ['/s/*', '/api/s/*', '/assets/*', '/icon.svg', '/theme.js', '/portfolio', '/portfolio/*', '/privacy', '/signin', '/signup', '/terms', '/api/public/auth/*'];

export type AccessState = { appHost: string; aud: string; authDomain: string; emails: string[] };
export const ACCESS_KEY = 'accessState';
export const loadAccess = (sys: DB): AccessState | null => getSetting<AccessState | null>(sys, ACCESS_KEY, null);

/** Is this address one of the public ones (no login needed)? Same list as PUBLIC_DESTINATIONS, as the server knows it. */
export const isPublicDestination = (url: string) => isPublicPath(url) || isPortfolioPath(url);

const keys = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

export function createAccessGate(sys: DB, certsBase?: string) {
  /** The address of the app's own host that the gate protects, or '' when no gate is configured. */
  const host = (req: FastifyRequest) => String(req.hostname ?? '').toLowerCase();
  return {
    /** True when this request is for the Access-protected host. */
    applies(req: FastifyRequest): boolean {
      const s = loadAccess(sys);
      return !!s && host(req) === s.appHost && !isPublicDestination(req.url);
    },
    /** 'ok' with a valid Access token for an allowed email; otherwise why not. Fails closed. */
    async check(req: FastifyRequest): Promise<'ok' | 'deny'> {
      const s = loadAccess(sys);
      if (!s || !s.aud || !s.authDomain) return 'deny'; // set up, but not finished: stay closed
      const token = String(req.headers['cf-access-jwt-assertion'] ?? '');
      if (!token) return 'deny';
      try {
        const base = certsBase ?? `https://${s.authDomain}`;
        let jwks = keys.get(base);
        if (!jwks) { jwks = createRemoteJWKSet(new URL(`${base}/cdn-cgi/access/certs`)); keys.set(base, jwks); }
        const { payload } = await jwtVerify(token, jwks, { issuer: `https://${s.authDomain}`, audience: s.aud });
        const email = String(payload.email ?? '').toLowerCase();
        return email && s.emails.includes(email) ? 'ok' : 'deny';
      } catch { return 'deny'; }
    },
  };
}
