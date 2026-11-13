import crypto from 'node:crypto';
import { getSecret, setSecret } from './ai.js';
import { getSetting, setSetting, type DB } from './db.js';
import type { User } from './users.js';

export const MFA_SCHEMA = `
CREATE TABLE IF NOT EXISTS mfa_totp (
 user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 enabled INTEGER NOT NULL DEFAULT 0, last_step INTEGER NOT NULL DEFAULT -1,
 pending_session TEXT NOT NULL DEFAULT '', pending_until INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS mfa_sessions (
 session_id TEXT PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE, verified_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS mfa_passkeys (
 passkey_id TEXT PRIMARY KEY REFERENCES passkeys(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS mfa_recovery (
 user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, hash TEXT NOT NULL,
 PRIMARY KEY(user_id, hash)
);
`;
export type MfaPolicy = 'off' | 'admins' | 'members';
export const mfaPolicy = (sys: DB): MfaPolicy => { const value = getSetting<unknown>(sys, 'mfaPolicy', 'off'); return value === 'admins' || value === 'members' ? value : 'off'; };
export const policyApplies = (sys: DB, user: User) => user.role !== 'guest' && user.provider !== 'emergency' && (mfaPolicy(sys) === 'members' || (mfaPolicy(sys) === 'admins' && user.role === 'admin'));
export const hasTotp = (sys: DB, userId: number) => !!sys.prepare('SELECT 1 FROM mfa_totp WHERE user_id = ? AND enabled = 1').get(userId);
export const verifiedPasskeys = (sys: DB, userId: number) => (sys.prepare('SELECT COUNT(*) n FROM passkeys p JOIN mfa_passkeys m ON m.passkey_id = p.id WHERE p.user_id = ?').get(userId) as { n: number }).n;
export const hasFactor = (sys: DB, userId: number) => hasTotp(sys, userId) || verifiedPasskeys(sys, userId) > 0;
export const mfaRequired = (sys: DB, user: User) => user.role !== 'guest' && user.provider !== 'emergency' && (policyApplies(sys, user) || hasTotp(sys, user.id));
export const factorVerified = (sys: DB, sessionId: string | null) => !!sessionId && !!sys.prepare('SELECT 1 FROM mfa_sessions WHERE session_id = ?').get(sessionId);
export const markFactor = (sys: DB, sessionId: string) => sys.prepare('INSERT OR REPLACE INTO mfa_sessions(session_id, verified_at) VALUES(?, ?)').run(sessionId, Date.now());
export function mfaStatus(sys: DB, user: User, sessionId: string | null) {
  return { policy: mfaPolicy(sys), required: mfaRequired(sys, user), verified: factorVerified(sys, sessionId), totp: hasTotp(sys, user.id), enrolled: hasFactor(sys, user.id), verifiedPasskeys: verifiedPasskeys(sys, user.id), passkeys: (sys.prepare('SELECT COUNT(*) n FROM passkeys WHERE user_id = ?').get(user.id) as { n: number }).n };
}

const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function base32(bytes: Buffer): string {
  let value = 0, bits = 0, result = '';
  for (const byte of bytes) { value = (value << 8) | byte; bits += 8; while (bits >= 5) { result += alphabet[(value >>> (bits - 5)) & 31]; bits -= 5; } }
  if (bits) result += alphabet[(value << (5 - bits)) & 31];
  return result;
}
function unbase32(text: string): Buffer {
  let value = 0, bits = 0; const bytes: number[] = [];
  for (const char of text) { value = (value << 5) | alphabet.indexOf(char); bits += 5; if (bits >= 8) { bytes.push((value >>> (bits - 8)) & 255); bits -= 8; } }
  return Buffer.from(bytes);
}
/** RFC 6238: six digits, SHA-1, a 30-second time step. */
export function totpCode(secret: string, step = Math.floor(Date.now() / 30_000)): string {
  const counter = Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(step));
  const digest = crypto.createHmac('sha1', unbase32(secret)).update(counter).digest();
  const offset = digest[digest.length - 1] & 15;
  return ((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).toString().padStart(6, '0');
}
const hash = (code: string) => crypto.createHash('sha256').update(code).digest('hex');
function checkedStep(secret: string, code: unknown, last: number): number | null {
  if (!/^[A-Z2-7]{32}$/.test(secret) || typeof code !== 'string' || !/^\d{6}$/.test(code)) return null;
  const now = Math.floor(Date.now() / 30_000);
  for (const step of [now, now - 1, now + 1]) if (step > last && step >= 0 && crypto.timingSafeEqual(Buffer.from(totpCode(secret, step)), Buffer.from(code))) return step;
  return null;
}
export function beginTotp(sys: DB, user: User, sessionId: string) {
  if (hasTotp(sys, user.id)) throw new Error('An authenticator is already set up.');
  const secret = base32(crypto.randomBytes(20));
  setSecret(sys, `totp:${user.id}`, secret);
  sys.prepare('INSERT OR REPLACE INTO mfa_totp(user_id, pending_session, pending_until) VALUES(?, ?, ?)').run(user.id, sessionId, Date.now() + 600_000);
  return { secret, uri: `otpauth://totp/${encodeURIComponent(`Frames:${user.email || user.name}`)}?secret=${secret}&issuer=Frames&algorithm=SHA1&digits=6&period=30` };
}
export function confirmTotp(sys: DB, userId: number, sessionId: string, code: unknown): string[] | null {
  return sys.transaction(() => {
    const pending = sys.prepare('SELECT pending_session, pending_until FROM mfa_totp WHERE user_id = ? AND enabled = 0').get(userId) as { pending_session: string; pending_until: number } | undefined;
    if (!pending || pending.pending_session !== sessionId || pending.pending_until < Date.now()) return null;
    const step = checkedStep(getSecret(sys, `totp:${userId}`), code, -1); if (step === null) return null;
    sys.prepare("UPDATE mfa_totp SET enabled = 1, last_step = ?, pending_session = '', pending_until = 0 WHERE user_id = ?").run(step, userId);
    sys.prepare('DELETE FROM mfa_recovery WHERE user_id = ?').run(userId);
    const codes = Array.from({ length: 8 }, () => crypto.randomBytes(8).toString('hex'));
    for (const code of codes) sys.prepare('INSERT INTO mfa_recovery(user_id, hash) VALUES(?, ?)').run(userId, hash(code));
    markFactor(sys, sessionId);
    return codes;
  })();
}
export function verifyTotp(sys: DB, userId: number, code: unknown): boolean {
  return sys.transaction(() => {
    if (!hasTotp(sys, userId)) return false;
    if (typeof code === 'string' && /^[a-f0-9]{16}$/i.test(code)) return sys.prepare('DELETE FROM mfa_recovery WHERE user_id = ? AND hash = ?').run(userId, hash(code.toLowerCase())).changes === 1;
    const row = sys.prepare('SELECT last_step FROM mfa_totp WHERE user_id = ?').get(userId) as { last_step: number };
    const step = checkedStep(getSecret(sys, `totp:${userId}`), code, row.last_step); if (step === null) return false;
    sys.prepare('UPDATE mfa_totp SET last_step = ? WHERE user_id = ?').run(step, userId); return true;
  })();
}
export function removeTotp(sys: DB, userId: number) {
  sys.prepare('DELETE FROM mfa_totp WHERE user_id = ?').run(userId);
  sys.prepare('DELETE FROM mfa_recovery WHERE user_id = ?').run(userId);
  setSecret(sys, `totp:${userId}`, '');
}
export const setMfaPolicy = (sys: DB, policy: MfaPolicy) => setSetting(sys, 'mfaPolicy', policy);
