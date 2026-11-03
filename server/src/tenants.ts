import { AsyncLocalStorage } from 'node:async_hooks';
import fs from 'node:fs';
import path from 'node:path';
import { createAiWorker } from './ai.js';
import type { AuthConfig } from './auth.js';
import type { AppCfg } from './ctx.js';
import { getSetting, openDb, setSetting, type DB } from './db.js';
import { bindOwner, getUser, listUsers, OWNER_ID, type User } from './users.js';

/**
 * Every person has their own library: their own database, originals, previews, cloud copies, collections, share links
 * and settings, under data/users/<id>. The owner's data stays exactly where it always was (the data folder itself),
 * so upgrading moves nothing.
 *
 * Code throughout the server was written for one library, and asks a shared `db` and `cfg` for it. Those two are
 * proxies that answer from the person making the request (an AsyncLocalStorage set once per request, in app.ts),
 * so a person can only ever reach their own database. Background jobs run inside `run(tenant, ...)` the same way.
 */
export type ScanState = { running: boolean; done: number; total: number; startedAt: string | null; finishedAt: string | null; result: any; error: string | null };
export type Tenant = {
  user: User; db: DB; cfg: AppCfg;
  ai: ReturnType<typeof createAiWorker>;
  scan: ScanState;
  /** Per-person scratch state for route modules (for example a running rebuild). */
  bag: Map<string, any>;
};
export type Tenants = ReturnType<typeof createTenants>;

export const userDir = (base: AppCfg, id: number) => (id === OWNER_ID ? base.dataDir : path.join(base.dataDir, 'users', String(id)));

export function createTenants(sys: DB, base: AppCfg, ownerDb: DB) {
  const als = new AsyncLocalStorage<Tenant>();
  const open = new Map<number, Tenant>();
  const roots = () => base.libraryRoots ?? [];

  /** Folders other people read from, which the owner's scan must not wander into. */
  const othersFolders = () => listUsers(sys).filter((u) => u.id !== OWNER_ID && u.folder).flatMap((u) => roots().map((r) => path.join(r, u.folder)));
  Object.defineProperty(base, 'skip', { get: othersFolders, configurable: true, enumerable: true });

  function cfgFor(u: User): AppCfg {
    const dir = userDir(base, u.id);
    const cloud = path.join(dir, 'cloud');
    fs.mkdirSync(cloud, { recursive: true });
    if (u.id === OWNER_ID) {
      if (!base.libraries.includes(cloud)) base.libraries.push(cloud);
      return base;
    }
    fs.mkdirSync(path.join(dir, 'originals'), { recursive: true });
    return { ...base, dataDir: dir, libraries: [...roots().map((r) => path.join(r, u.folder)), path.join(dir, 'originals'), cloud], libraryRoots: [], skip: undefined, userId: u.id };
  }

  function get(id: number): Tenant | null {
    const hit = open.get(id);
    if (hit) { hit.user = getUser(sys, id) ?? hit.user; return hit.user.disabled ? null : hit; }
    const user = getUser(sys, id);
    if (!user || user.disabled || user.invited) return null;
    const cfg = cfgFor(user);
    const db = id === OWNER_ID ? ownerDb : openDb(userDir(base, id));
    const t: Tenant = { user, db, cfg, ai: createAiWorker(db, cfg), scan: { running: false, done: 0, total: 0, startedAt: null, finishedAt: null, result: null, error: null }, bag: new Map() };
    open.set(id, t);
    return t;
  }

  return {
    get,
    owner: () => get(OWNER_ID)!,
    /** Everyone with a library, for jobs that run for all of them (backups, scheduled syncs, analysis). */
    all: () => listUsers(sys).map((u) => get(u.id)).filter((t): t is Tenant => !!t),
    current: (): Tenant => { const t = als.getStore(); if (!t) throw new Error('No library is selected for this request'); return t; },
    currentOrNull: () => als.getStore() ?? null,
    run: <T>(t: Tenant, fn: () => T): T => als.run(t, fn),
    /** For a callback-style Fastify hook: everything after it runs as this person. */
    enter: (t: Tenant, done: () => void) => als.run(t, done),
    /** Closes a person's database and forgets them (used when their data is deleted). */
    forget: (id: number) => { const t = open.get(id); if (t && id !== OWNER_ID) { try { t.db.close(); } catch { /* already closed */ } } open.delete(id); },
    othersFolders,
  };
}

/** An object that answers every property from whoever is making the current request. */
export function tenantProxy<T extends object>(pick: () => T): T {
  return new Proxy({} as T, {
    get(_t, prop) { const o = pick() as any; const v = o[prop]; return typeof v === 'function' ? v.bind(o) : v; },
    set(_t, prop, value) { (pick() as any)[prop] = value; return true; },
    has(_t, prop) { return prop in pick(); },
    ownKeys() { return Reflect.ownKeys(pick()); },
    getOwnPropertyDescriptor(_t, prop) { const d = Object.getOwnPropertyDescriptor(pick(), prop); return d ? { ...d, configurable: true } : undefined; },
  });
}

/**
 * First start on an install from before accounts: the instance-wide settings (sign-in providers, tunnel and their
 * secrets) are copied into the system database, and if sign-in had been tested the owner is the person who tested it.
 * The library itself is not touched. Old sign-in sessions are not carried over, so everyone signs in once more.
 */
export function migrateLegacy(sys: DB, ownerDb: DB) {
  if (getSetting<boolean>(sys, 'legacyMigrated', false)) return;
  const rows = ownerDb.prepare("SELECT key, value FROM settings WHERE key IN ('auth', 'tunnel') OR key LIKE 'secret:oauth:%' OR key LIKE 'secret:cloudflare:%'").all() as { key: string; value: string }[];
  for (const r of rows) sys.prepare('INSERT OR IGNORE INTO settings(key, value) VALUES(?, ?)').run(r.key, r.value);
  const auth = getSetting<Partial<AuthConfig>>(sys, 'auth', {});
  if (auth.testedBy) bindOwner(sys, { ...auth.testedBy, emailVerified: true });
  const pf = getSetting<{ host?: string }>(ownerDb, 'portfolio', {});
  if (pf.host) sys.prepare('INSERT OR IGNORE INTO portfolio_hosts(host, user_id) VALUES(?, ?)').run(pf.host.toLowerCase(), OWNER_ID);
  setSetting(sys, 'legacyMigrated', true);
}
