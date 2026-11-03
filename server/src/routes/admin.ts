import fs from 'node:fs';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { cleanAllow, isAllowed, loadAuth, saveAuth, sessionCookie } from '../auth.js';
import type { Ctx, Row } from '../ctx.js';
import type { DB } from '../db.js';
import { userDir } from '../tenants.js';
import { countAdmins, deleteUserRow, getUser, invite, listUsers, OWNER_ID, updateUser, validFolder, type User } from '../users.js';

/**
 * Administrators: see and manage the people. And anyone: delete their own data.
 * Nothing here opens a person's photographs. An administrator sees names, emails, roles and how much space each uses.
 */

/** What a library takes up inside the data volume. For the owner, whose data sits in the data folder itself, only their own parts count. */
const OWNER_PARTS = ['frames.db', 'frames.db-wal', 'frames.db-shm', 'originals', 'derivatives', 'cloud', 'backups'];
function sizeOf(p: string, budget = { files: 200_000 }): number {
  let n = 0;
  let st: fs.Stats;
  try { st = fs.lstatSync(p); } catch { return 0; }
  if (st.isFile()) return st.size;
  if (!st.isDirectory() || budget.files-- <= 0) return 0;
  for (const e of fs.readdirSync(p)) n += sizeOf(path.join(p, e), budget);
  return n;
}
export const usedBytes = (dataDir: string, id: number) => (id === OWNER_ID ? OWNER_PARTS.reduce((a, f) => a + sizeOf(path.join(dataDir, f)), 0) : sizeOf(userDir({ dataDir } as any, id)));

/**
 * Deletes a person's data held by Frames: their database, uploaded and cloud-copied photographs, previews, backups,
 * share links, settings and saved connections. Photographs in a read-only library folder are not Frames' to delete.
 * A member's account goes too. The owner's account stays (it is the instance's first administrator) but their library is emptied.
 */
export function eraseUserData(x: Ctx, id: number) {
  const base = x.tenants.owner().cfg; // the base config: its dataDir is the data folder
  if (id === OWNER_ID) {
    const t = x.tenants.get(OWNER_ID)!;
    const db: DB = t.db;
    const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all() as { name: string }[]).map((r) => r.name);
    db.pragma('foreign_keys = OFF');
    db.transaction(() => { for (const n of tables) db.prepare(`DELETE FROM "${n}"`).run(); })();
    db.pragma('foreign_keys = ON');
    db.exec('VACUUM');
    for (const d of ['originals', 'derivatives', 'cloud', 'backups']) fs.rmSync(path.join(base.dataDir, d), { recursive: true, force: true });
    fs.mkdirSync(path.join(base.dataDir, 'cloud'), { recursive: true });
    return;
  }
  x.tenants.forget(id);
  fs.rmSync(userDir(base, id), { recursive: true, force: true });
  deleteUserRow(x.sys, id); // their sessions and portfolio hostname go with it
}

export function registerAdmin(app: FastifyInstance, x: Ctx) {
  const { sys } = x;
  const me = (req: any) => req.authUser as User;

  const dto = (u: User) => {
    const t = x.tenants.get(u.id);
    return {
      id: u.id, name: u.name, email: u.email, provider: u.invited ? '' : u.provider, role: u.role, folder: u.folder, disabled: u.disabled, invited: u.invited, created: u.created,
      photos: t ? (t.db.prepare('SELECT COUNT(*) n FROM photos').get() as { n: number }).n : 0,
      bytes: t ? usedBytes(x.tenants.owner().cfg.dataDir, u.id) : 0,
    };
  };

  // ---------- administrators ----------
  app.get('/api/admin/users', async () => ({ users: listUsers(sys).map(dto), signups: x.cfg.allowSignups !== false, libraryRoots: x.tenants.owner().cfg.libraryRoots ?? [] }));

  // Add someone before they ever sign in. They are also put on the allow-list, which is what lets an account in at all.
  app.post('/api/admin/users', async (req, rep) => {
    const b = (req.body ?? {}) as Row;
    const email = String(b.email ?? '').trim().toLowerCase();
    if (!/^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/.test(email)) return rep.code(400).send({ error: 'Enter a valid email address.' });
    if (listUsers(sys).some((u) => u.email.toLowerCase() === email)) return rep.code(409).send({ error: 'That person already has an account.' });
    const u = invite(sys, email, b.role === 'admin' ? 'admin' : 'member');
    const conf = loadAuth(sys);
    if (!isAllowed({ provider: '', sub: '', email, emailVerified: true }, conf.allow)) saveAuth(sys, { ...conf, allow: cleanAllow([...conf.allow, email]) });
    return rep.code(201).send(dto(u));
  });

  app.patch('/api/admin/users/:id', async (req, rep) => {
    const id = x.num((req.params as Row).id);
    const u = getUser(sys, id);
    if (!u) return x.notFound(rep);
    const b = (req.body ?? {}) as Row;
    const bad = (error: string) => rep.code(400).send({ error });
    if (b.role !== undefined) {
      if (b.role !== 'admin' && b.role !== 'member') return bad('Role must be admin or member.');
      if (u.role === 'admin' && b.role === 'member' && countAdmins(sys) <= 1) return bad('There must be at least one administrator.');
    }
    if (b.disabled === true) {
      if (id === me(req).id) return bad('You cannot switch off your own account.');
      if (u.role === 'admin' && countAdmins(sys) <= 1) return bad('There must be at least one administrator.');
    }
    if (b.folder !== undefined) {
      const f = String(b.folder).trim();
      if (id === OWNER_ID) return bad('The owner’s library is the libraries mount itself, so it has no folder of its own.');
      if (!validFolder(f)) return bad('A folder name uses lowercase letters, numbers, dots, dashes and underscores, and starts with a letter or number.');
      if (listUsers(sys).some((o) => o.id !== id && o.folder === f)) return bad('Someone else already uses that folder.');
    }
    updateUser(sys, id, {
      ...(b.role ? { role: b.role } : {}), ...(typeof b.disabled === 'boolean' ? { disabled: b.disabled } : {}),
      ...(b.folder !== undefined ? { folder: String(b.folder).trim() } : {}), ...(typeof b.name === 'string' ? { name: b.name.trim().slice(0, 100) } : {}),
    });
    if (b.folder !== undefined) x.tenants.forget(id); // its library list is built from the folder: rebuild it on the next request
    return dto(getUser(sys, id)!);
  });

  // An administrator deleting someone's data on request (or a person who has left). Needs the confirmation word.
  app.delete('/api/admin/users/:id/data', async (req, rep) => {
    const id = x.num((req.params as Row).id);
    const u = getUser(sys, id);
    if (!u) return x.notFound(rep);
    if (((req.body ?? {}) as Row).confirm !== 'delete') return rep.code(400).send({ error: 'Send {"confirm": "delete"} to confirm.' });
    if (u.role === 'admin' && id !== OWNER_ID && countAdmins(sys) <= 1) return rep.code(400).send({ error: 'There must be at least one administrator.' });
    console.warn(`data deleted for user ${id} by administrator ${me(req).id}`);
    eraseUserData(x, id);
    return { ok: true, accountRemoved: id !== OWNER_ID };
  });

  // ---------- anyone: their own data ----------
  app.delete('/api/me/data', async (req, rep) => {
    const u = me(req);
    if (((req.body ?? {}) as Row).confirm !== 'delete') return rep.code(400).send({ error: 'Send {"confirm": "delete"} to confirm.' });
    if (u.role === 'admin' && u.id !== OWNER_ID && countAdmins(sys) <= 1) return rep.code(400).send({ error: 'You are the only administrator. Make someone else an administrator first.' });
    console.warn(`data deleted for user ${u.id} by themselves`);
    eraseUserData(x, u.id);
    if (u.id !== OWNER_ID) rep.header('Set-Cookie', sessionCookie(null, x.baseUrl(req).startsWith('https://')));
    return { ok: true, accountRemoved: u.id !== OWNER_ID };
  });
}
