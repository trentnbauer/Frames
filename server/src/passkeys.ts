import crypto from 'node:crypto';
import { generateAuthenticationOptions, generateRegistrationOptions, verifyAuthenticationResponse, verifyRegistrationResponse } from '@simplewebauthn/server';
import type { AuthenticationResponseJSON, AuthenticatorTransportFuture, RegistrationResponseJSON } from '@simplewebauthn/server';
import type { DB } from './db.js';

/**
 * Passkeys (WebAuthn): sign in with a fingerprint, a face or a device PIN, no password and no email code. The server stores only each passkey's
 * public key. A challenge is used once and kept for five minutes.
 */
export const PASSKEY_SCHEMA = `
CREATE TABLE IF NOT EXISTS passkeys (
  id TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, public_key BLOB NOT NULL,
  counter INTEGER NOT NULL DEFAULT 0, transports TEXT NOT NULL DEFAULT '', name TEXT NOT NULL DEFAULT '', created TEXT NOT NULL, last_used TEXT
);
CREATE INDEX IF NOT EXISTS passkeys_user ON passkeys(user_id);
`;

export type Passkey = { id: string; name: string; created: string; lastUsed: string | null };
const challenges = new Map<string, { challenge: string; userId: number | null; at: number }>();
const keep = (challenge: string, userId: number | null) => {
  const now = Date.now();
  for (const [k, c] of challenges) if (now - c.at > 300_000) challenges.delete(k);
  if (challenges.size > 2000) challenges.clear();
  const id = crypto.randomBytes(18).toString('base64url');
  challenges.set(id, { challenge, userId, at: now });
  return id;
};
const take = (id: unknown) => { const c = typeof id === 'string' ? challenges.get(id) : undefined; if (c) challenges.delete(id as string); return c && Date.now() - c.at <= 300_000 ? c : null; };

export const listPasskeys = (sys: DB, userId: number): Passkey[] =>
  (sys.prepare('SELECT id, name, created, last_used FROM passkeys WHERE user_id = ? ORDER BY created').all(userId) as { id: string; name: string; created: string; last_used: string | null }[]).map((r) => ({ id: r.id, name: r.name, created: r.created, lastUsed: r.last_used }));
/** Renames one of this person's passkeys. False when it is not theirs, or the name is blank. */
export const renamePasskey = (sys: DB, userId: number, id: string, name: string) => !!name.trim() && sys.prepare('UPDATE passkeys SET name = ? WHERE id = ? AND user_id = ?').run(name.trim().slice(0, 60), id, userId).changes > 0;
export const removePasskey = (sys: DB, userId: number, id: string) => sys.prepare('DELETE FROM passkeys WHERE id = ? AND user_id = ?').run(id, userId).changes > 0;
export const hasPasskeys = (sys: DB) => (sys.prepare('SELECT COUNT(*) n FROM passkeys').get() as { n: number }).n > 0;

type Where = { rpID: string; origin: string };
const trans = (s: string) => (s ? (s.split(',') as AuthenticatorTransportFuture[]) : undefined);

export async function registrationOptions(sys: DB, w: Where, user: { id: number; email: string; name: string }) {
  const existing = sys.prepare('SELECT id, transports FROM passkeys WHERE user_id = ?').all(user.id) as { id: string; transports: string }[];
  const options = await generateRegistrationOptions({
    rpName: 'Frames', rpID: w.rpID, userName: user.email || user.name || `user-${user.id}`, userDisplayName: user.name || user.email || 'You', userID: new TextEncoder().encode(String(user.id)),
    attestationType: 'none', authenticatorSelection: { residentKey: 'preferred', userVerification: 'required' },
    excludeCredentials: existing.map((e) => ({ id: e.id, transports: trans(e.transports) })),
  });
  return { options, cid: keep(options.challenge, user.id) };
}

export async function verifyRegistration(sys: DB, w: Where, userId: number, cid: unknown, response: RegistrationResponseJSON, name: string) {
  const c = take(cid);
  if (!c || c.userId !== userId) return { ok: false as const, error: 'That took too long. Try adding the passkey again.' };
  try {
    const v = await verifyRegistrationResponse({ response, expectedChallenge: c.challenge, expectedOrigin: w.origin, expectedRPID: w.rpID, requireUserVerification: true });
    if (!v.verified || !v.registrationInfo) return { ok: false as const, error: 'The passkey could not be checked.' };
    const { credential } = v.registrationInfo;
    sys.prepare('INSERT INTO passkeys(id, user_id, public_key, counter, transports, name, created) VALUES(?, ?, ?, ?, ?, ?, ?)')
      .run(credential.id, userId, Buffer.from(credential.publicKey), credential.counter, (credential.transports ?? []).join(','), name.trim().slice(0, 60) || 'This device', new Date().toISOString());
    sys.prepare('INSERT OR IGNORE INTO mfa_passkeys(passkey_id) VALUES(?)').run(credential.id);
    return { ok: true as const };
  } catch (e) { return { ok: false as const, error: `The passkey could not be added (${(e as Error).message}).` }; }
}

export async function authenticationOptions(w: Where, userId: number | null = null, sys?: DB) {
  const options = await generateAuthenticationOptions({ rpID: w.rpID, userVerification: userId !== null ? 'required' : 'preferred', ...(userId !== null && sys ? { allowCredentials: listPasskeys(sys, userId).map((key) => ({ id: key.id })) } : {}) });
  return { options, cid: keep(options.challenge, userId) };
}

/** The person whose passkey this is, or null. */
export async function verifyAuthentication(sys: DB, w: Where, cid: unknown, response: AuthenticationResponseJSON, expectedUserId?: number): Promise<{ userId: number; userVerified: boolean } | null> {
  const c = take(cid);
  if (!c || c.userId !== (expectedUserId ?? null) || typeof response?.id !== 'string' || response.id.length > 1024) return null;
  const row = sys.prepare('SELECT id, user_id, public_key, counter, transports FROM passkeys WHERE id = ?').get(response?.id) as { id: string; user_id: number; public_key: Buffer; counter: number; transports: string } | undefined;
  if (!row || (expectedUserId !== undefined && row.user_id !== expectedUserId)) return null;
  try {
    const v = await verifyAuthenticationResponse({
      response, expectedChallenge: c.challenge, expectedOrigin: w.origin, expectedRPID: w.rpID, requireUserVerification: expectedUserId !== undefined,
      credential: { id: row.id, publicKey: new Uint8Array(row.public_key), counter: row.counter, transports: trans(row.transports) },
    });
    if (!v.verified) return null;
    sys.prepare('UPDATE passkeys SET counter = ?, last_used = ? WHERE id = ?').run(v.authenticationInfo.newCounter, new Date().toISOString(), row.id);
    if (v.authenticationInfo.userVerified) sys.prepare('INSERT OR IGNORE INTO mfa_passkeys(passkey_id) VALUES(?)').run(row.id);
    return { userId: row.user_id, userVerified: v.authenticationInfo.userVerified };
  } catch { return null; }
}
