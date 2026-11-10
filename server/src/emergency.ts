import crypto from 'node:crypto';
import type { Ctx } from './ctx.js';
import { eraseUserData } from './routes/admin.js';
import { listUsers } from './users.js';

/**
 * An emergency login for when nobody can sign in (a provider broke, a passkey was lost). Each time the server starts it makes
 * one temporary administrator and writes the username and password to the log, where only someone with access to the
 * container can read them. The password works once. If nobody signs in within five minutes the account is deleted, and
 * signing out deletes it too. Only a hash of the password is kept, and five wrong tries void it.
 */
export const EMERGENCY_PROVIDER = 'emergency';
export const EMERGENCY_MINUTES = 5;
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
const word = (n: number) => Array.from(crypto.randomBytes(n), (b) => ALPHABET[b % ALPHABET.length]).join('');
const hashOf = (s: string) => crypto.createHash('sha256').update(s).digest();

type Live = { userId: number; username: string; hash: Buffer; used: boolean; wrong: number; timer: NodeJS.Timeout };
let live: Live | null = null;

export const emergencyActive = () => !!live && !live.used;

/** Removes every emergency account (left over from before a restart, expired, or signed out of). */
export function removeEmergency(x: Ctx, userId?: number) {
  for (const u of listUsers(x.sys)) {
    if (u.provider !== EMERGENCY_PROVIDER || (userId !== undefined && u.id !== userId)) continue;
    try { eraseUserData(x, u.id); } catch (e) { console.error(`Could not remove the emergency account: ${e instanceof Error ? e.message : e}`); }
  }
  if (live && (userId === undefined || live.userId === userId)) { clearTimeout(live.timer); live = null; }
}

export function startEmergency(x: Ctx, log: (line: string) => void = console.log) {
  removeEmergency(x);
  const username = `emergency-${word(4)}`;
  const password = `${word(5)}-${word(5)}-${word(5)}-${word(5)}`;
  const id = Number(x.sys.prepare("INSERT INTO users(provider, sub, email, name, role, folder, created) VALUES(?, ?, '', 'Emergency admin', 'admin', '', ?)").run(EMERGENCY_PROVIDER, username, new Date().toISOString()).lastInsertRowid);
  const timer = setTimeout(() => {
    try { if (live && live.userId === id && !live.used) { removeEmergency(x, id); log('Emergency login expired unused and was deleted.'); } } catch { /* never let a timer end the server */ }
  }, EMERGENCY_MINUTES * 60_000);
  timer.unref();
  live = { userId: id, username, hash: hashOf(password), used: false, wrong: 0, timer };
  log(`EMERGENCY LOGIN (one use, valid for ${EMERGENCY_MINUTES} minutes, deleted when unused or signed out of): open /auth/emergency, username ${username} password ${password}`);
}

/** The administrator to sign in as, or why not. The password is spent the moment it is right. */
export function useEmergency(x: Ctx, username: unknown, password: unknown): { userId: number } | 'wrong' | 'none' {
  const l = live;
  if (!l || l.used) return 'none';
  const ok = typeof username === 'string' && typeof password === 'string' && username.length < 100 && password.length < 100
    && crypto.timingSafeEqual(hashOf(username), hashOf(l.username)) && crypto.timingSafeEqual(hashOf(password.trim().toLowerCase()), l.hash);
  if (!ok) {
    if (++l.wrong >= 5) { removeEmergency(x, l.userId); return 'none'; } // five wrong tries void it and delete the account
    return 'wrong';
  }
  l.used = true;
  clearTimeout(l.timer); // signed in: the account now lasts until sign-out (or the next start)
  return { userId: l.userId };
}
