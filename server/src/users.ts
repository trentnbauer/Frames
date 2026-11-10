import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { trimEnd, trimStart } from './text.js';
import { attachKey, getSetting, type DB } from './db.js';

/**
 * The system database: who the people are, their sign-in sessions, and instance-wide settings (sign-in providers, the
 * tunnel). Each person's photographs, reviews and collections live in their own database, see tenants.ts.
 */
export type Role = 'admin' | 'member' | 'guest';
export type User = { id: number; provider: string; sub: string; email: string; name: string; role: Role; folder: string; disabled: boolean; invited: boolean; created: string };
export type Who = { provider: string; sub: string; email: string; emailVerified: boolean; name: string };

/** The first user (id 1) is the owner: the existing library from before accounts existed belongs to them. */
export const OWNER_ID = 1;

const SYSTEM_SCHEMA = `
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT, provider TEXT NOT NULL, sub TEXT NOT NULL, email TEXT NOT NULL DEFAULT '', name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'member', folder TEXT NOT NULL DEFAULT '', disabled INTEGER NOT NULL DEFAULT 0, created TEXT NOT NULL, last_seen TEXT,
  UNIQUE (provider, sub)
);
CREATE UNIQUE INDEX IF NOT EXISTS users_folder ON users(folder) WHERE folder != '';
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created TEXT NOT NULL, expires TEXT NOT NULL, last_seen TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_expires ON sessions(expires);
-- More ways to sign in to the same person. The first is on the person's own row; these are the ones linked later.
CREATE TABLE IF NOT EXISTS identities (
  id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL, sub TEXT NOT NULL, email TEXT NOT NULL DEFAULT '', created TEXT NOT NULL, UNIQUE (provider, sub)
);
-- Share links a guest has opened while signed in: their "Shared with you" list. token names the owner, see routes/share.ts.
CREATE TABLE IF NOT EXISTS guest_links (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, token TEXT NOT NULL, label TEXT NOT NULL DEFAULT '', kind TEXT NOT NULL DEFAULT '', seen TEXT NOT NULL,
  PRIMARY KEY (user_id, token)
);
CREATE TABLE IF NOT EXISTS email_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, recipient TEXT NOT NULL, subject TEXT NOT NULL DEFAULT '', type TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL, error TEXT NOT NULL DEFAULT '', retry TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS email_codes (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL, hash TEXT NOT NULL, expires INTEGER NOT NULL, tries INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS email_codes_email ON email_codes(email);
CREATE TABLE IF NOT EXISTS community_ratings (
  id INTEGER PRIMARY KEY AUTOINCREMENT, owner INTEGER NOT NULL, photo INTEGER NOT NULL, reviewer INTEGER NOT NULL, rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  note TEXT, ts TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS community_ratings_photo ON community_ratings(owner, photo);
CREATE INDEX IF NOT EXISTS community_ratings_reviewer ON community_ratings(reviewer);
CREATE TABLE IF NOT EXISTS community_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT, owner INTEGER NOT NULL, photo INTEGER NOT NULL, reporter INTEGER NOT NULL, admin INTEGER NOT NULL DEFAULT 0,
  reason TEXT NOT NULL DEFAULT 'other', note TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'open', ts TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS community_reports_photo ON community_reports(owner, photo);
CREATE TABLE IF NOT EXISTS portfolio_hosts (host TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE);
`;

import { PASSKEY_SCHEMA } from './passkeys.js';
export function openSystemDb(dataDir: string): DB {
  fs.mkdirSync(dataDir, { recursive: true });
  const db = new Database(path.join(dataDir, 'system.db'));
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SYSTEM_SCHEMA);
  db.exec(PASSKEY_SCHEMA);
  ensureOwner(db);
  return attachKey(db, dataDir);
}

type Row = Record<string, any>;
const toUser = (r: Row): User => ({ id: r.id, provider: r.provider, sub: r.sub, email: r.email, name: r.name, role: r.role === 'admin' ? 'admin' : r.role === 'guest' ? 'guest' : 'member', folder: r.folder, disabled: !!r.disabled, invited: r.provider === 'invite', created: r.created });

/** Until someone signs in, the owner is a placeholder ('local'): the password, or no sign-in at all, is "the owner". */
export function ensureOwner(sys: DB): User {
  if (!sys.prepare('SELECT 1 FROM users WHERE id = ?').get(OWNER_ID)) {
    sys.prepare("INSERT INTO users(id, provider, sub, email, name, role, folder, created) VALUES(?, 'local', 'owner', '', 'Owner', 'admin', '', ?)").run(OWNER_ID, new Date().toISOString());
  }
  return getUser(sys, OWNER_ID)!;
}

export const getUser = (sys: DB, id: number): User | null => { const r = sys.prepare('SELECT * FROM users WHERE id = ?').get(id) as Row | undefined; return r ? toUser(r) : null; };
export const listUsers = (sys: DB): User[] => (sys.prepare('SELECT * FROM users ORDER BY id').all() as Row[]).map(toUser);
export const countAdmins = (sys: DB) => (sys.prepare("SELECT COUNT(*) n FROM users WHERE role = 'admin' AND disabled = 0").get() as { n: number }).n;

// ---------- the folder under the libraries mount ----------
const RESERVED = new Set(['users', 'cloud', 'originals', 'derivatives', 'backups', 'tmp', 'lost+found']);
export const validFolder = (f: string) => /^[a-z0-9][a-z0-9._-]{0,39}$/.test(f) && !RESERVED.has(f) && !f.endsWith('.');

/** A readable, safe folder name from an email or name, unique among everyone. */
export function uniqueFolder(sys: DB, email: string, name: string): string {
  let raw = (email.split('@')[0] || name || 'user').slice(0, 200).toLowerCase().normalize('NFKD').replace(/[^a-z0-9._-]+/g, '-').slice(0, 64);
  raw = trimEnd(trimStart(raw, '-._'), '-.').slice(0, 32);
  const base = validFolder(raw) ? raw : 'user';
  const taken = new Set((sys.prepare("SELECT folder FROM users WHERE folder != ''").all() as Row[]).map((r) => r.folder as string));
  let f = base, n = 2;
  while (taken.has(f) || !validFolder(f)) f = `${base}-${n++}`;
  return f;
}

// ---------- finding and creating people ----------
export function findByIdentity(sys: DB, provider: string, sub: string): User | null {
  const r = (sys.prepare('SELECT * FROM users WHERE provider = ? AND sub = ?').get(provider, sub)
    ?? sys.prepare('SELECT u.* FROM identities i JOIN users u ON u.id = i.user_id WHERE i.provider = ? AND i.sub = ?').get(provider, sub)) as Row | undefined;
  return r ? toUser(r) : null;
}

/** The account whose address this is (the one they started with, or one linked later), however they signed in before. */
export function findByEmail(sys: DB, email: string): User | null {
  const e = email.trim().toLowerCase();
  if (!e) return null;
  const r = (sys.prepare("SELECT * FROM users WHERE lower(email) = ? AND provider != 'local' ORDER BY id LIMIT 1").get(e)
    ?? sys.prepare('SELECT u.* FROM identities i JOIN users u ON u.id = i.user_id WHERE lower(i.email) = ? ORDER BY u.id LIMIT 1').get(e)) as Row | undefined;
  return r ? toUser(r) : null;
}

export type Linked = { id: number; provider: string; email: string; primary: boolean };
/** Every way this person can sign in: the one they started with, then any linked since. */
export function identitiesOf(sys: DB, userId: number): Linked[] {
  const u = getUser(sys, userId);
  if (!u) return [];
  const first: Linked[] = u.provider === 'local' || u.invited ? [] : [{ id: 0, provider: u.provider, email: u.email, primary: true }];
  return [...first, ...(sys.prepare('SELECT id, provider, email FROM identities WHERE user_id = ? ORDER BY id').all(userId) as Row[]).map((r) => ({ id: r.id as number, provider: r.provider as string, email: r.email as string, primary: false }))];
}

/**
 * Adds a way to sign in to a person. 'taken' when that account already belongs to someone else (it is never moved),
 * 'same' when it is already theirs. Signing in with it afterwards lands in this person's library.
 */
export function linkIdentity(sys: DB, userId: number, who: Who): 'ok' | 'same' | 'taken' {
  const owner = findByIdentity(sys, who.provider, who.sub);
  if (owner) return owner.id === userId ? 'same' : 'taken';
  sys.prepare('INSERT INTO identities(user_id, provider, sub, email, created) VALUES(?, ?, ?, ?, ?)').run(userId, who.provider, who.sub, who.email, new Date().toISOString());
  return 'ok';
}
/** Removes a linked way to sign in (never the one the person started with, so they cannot be locked out of their own library). */
export function unlinkIdentity(sys: DB, userId: number, identityId: number): boolean {
  return sys.prepare('DELETE FROM identities WHERE id = ? AND user_id = ?').run(identityId, userId).changes > 0;
}

/** An administrator can add someone by email before they ever sign in. Their first verified sign-in with that address claims it. */
export function invite(sys: DB, email: string, role: Role = 'member'): User {
  const e = email.trim().toLowerCase();
  const id = Number(sys.prepare("INSERT INTO users(provider, sub, email, name, role, folder, created) VALUES('invite', ?, ?, ?, ?, ?, ?)").run(e, e, e, role, uniqueFolder(sys, e, ''), new Date().toISOString()).lastInsertRowid);
  return getUser(sys, id)!;
}

/**
 * Who is this person? An existing account, an invitation for their verified email, or (if sign-ups are on) a new account.
 * Returns null when they may not have one. Names and email are kept up to date from the provider.
 */
/** May someone without an account make one? ALLOW_SIGNUPS=false switches it off for good; otherwise the administrator's tick box (Settings, Sign-in & access) decides, on by default. */
export const signupsOn = (sys: DB, envAllows: boolean): boolean => envAllows && getSetting<{ signups?: boolean }>(sys, 'instance', {}).signups !== false;

export function resolveUser(sys: DB, who: Who, allowSignups: boolean, guestOnly = false): User | null {
  const now = new Date().toISOString();
  let u = findByIdentity(sys, who.provider, who.sub);
  if (!u && who.emailVerified && who.email) {
    const inv = sys.prepare("SELECT * FROM users WHERE provider = 'invite' AND sub = ?").get(who.email.toLowerCase()) as Row | undefined;
    if (inv) {
      sys.prepare('UPDATE users SET provider = ?, sub = ? WHERE id = ?').run(who.provider, who.sub, inv.id);
      u = getUser(sys, inv.id);
    }
  }
  if (!u) {
    // The first person to sign in becomes the administrator (the owner of the library that already exists); everyone after gets the default role (a member unless the administrator chose guest).
    if (!guestOnly && bindOwner(sys, who)) u = getUser(sys, OWNER_ID); // a share-link visitor never becomes the owner
  }
  if (!u) {
    // Switching off new accounts is about accounts with a library. A guest account (made from a share link, with no library) is still allowed, so guests can always sign in.
    if (!allowSignups && !guestOnly) return null;
    const id = Number(sys.prepare("INSERT INTO users(provider, sub, email, name, role, folder, created) VALUES(?, ?, ?, ?, ?, ?, ?)").run(who.provider, who.sub, who.email, who.name, guestOnly || getSetting<{ defaultRole?: string }>(sys, 'instance', {}).defaultRole === 'guest' ? 'guest' : 'member', uniqueFolder(sys, who.email, who.name), now).lastInsertRowid);
    u = getUser(sys, id);
  }
  if (!u || u.disabled) return null;
  sys.prepare('UPDATE users SET email = ?, name = ?, last_seen = ? WHERE id = ?').run(who.email || u.email, who.name || u.name, now, u.id);
  return getUser(sys, u.id);
}

/** The owner placeholder becomes a real account when the owner does the test sign-in from Settings. Returns whether it did. */
export function bindOwner(sys: DB, who: Who): boolean {
  const o = getUser(sys, OWNER_ID);
  if (!o || o.provider !== 'local') return false;
  if (findByIdentity(sys, who.provider, who.sub)) return false; // that account already exists as someone else
  sys.prepare('UPDATE users SET provider = ?, sub = ?, email = ?, name = ? WHERE id = ?').run(who.provider, who.sub, who.email, who.name || o.name, OWNER_ID);
  return true;
}

export function updateUser(sys: DB, id: number, patch: Partial<Pick<User, 'role' | 'folder' | 'disabled' | 'name'>>) {
  if (patch.role) sys.prepare('UPDATE users SET role = ? WHERE id = ?').run(patch.role, id);
  if (patch.folder !== undefined) sys.prepare('UPDATE users SET folder = ? WHERE id = ?').run(patch.folder, id);
  if (patch.disabled !== undefined) { sys.prepare('UPDATE users SET disabled = ? WHERE id = ?').run(patch.disabled ? 1 : 0, id); if (patch.disabled) sys.prepare('DELETE FROM sessions WHERE user_id = ?').run(id); }
  if (patch.name !== undefined) sys.prepare('UPDATE users SET name = ? WHERE id = ?').run(patch.name, id);
}
export const deleteUserRow = (sys: DB, id: number) => { sys.prepare('DELETE FROM users WHERE id = ?').run(id); };
