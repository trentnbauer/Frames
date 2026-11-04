import fs from 'node:fs';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { cleanAllow, isAllowed, loadAuth, saveAuth, sessionCookie } from '../auth.js';
import type { Ctx, Row } from '../ctx.js';
import type { DB } from '../db.js';
import { buildEnvFile, envConfigLoaded, snapshot } from '../envConfig.js';
import { AI_TYPES, aiType, applySource, BadSetting, isReady, loadSources, newSource, removeSourceKey, saveSources, setSourceKey, sourceKey, whyNotReady, type AiSource } from '../aisources.js';
import { ping } from '../ai.js';
import { scrubCopy, tarOf } from '../backup.js';
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
  x.tunnelRefresh?.();
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

  // ---------- AIs for everyone on this server ----------
  // Set up here once, they appear in everyone's list (read-only) and each person chooses whether to use one. Kept in the server's own database.
  const sharedDto = (s: AiSource) => ({ ...s, hasKey: !!sourceKey(sys, s.id), ready: isReady(s), why: whyNotReady(s) });
  const sharedList = () => ({ types: AI_TYPES, active: '', sources: loadSources(sys).map(sharedDto) });
  app.get('/api/admin/ai/sources', async () => sharedList());
  app.post('/api/admin/ai/sources', async (req, rep) => {
    const b = (req.body ?? {}) as Row;
    try {
      const src = newSource(String(b.type ?? ''), b);
      saveSources(sys, [...loadSources(sys), src]);
      if (typeof b.key === 'string' && b.key) setSourceKey(sys, src.id, b.key.slice(0, 500));
      return rep.code(201).send(sharedList());
    } catch (e) { if (e instanceof BadSetting) return rep.code(400).send({ error: e.message }); throw e; }
  });
  app.put('/api/admin/ai/sources/:id', async (req, rep) => {
    const list = loadSources(sys);
    const i = list.findIndex((s) => s.id === (req.params as Row).id);
    if (i < 0) return x.notFound(rep);
    const b = (req.body ?? {}) as Row;
    try { list[i] = applySource(list[i], b); } catch (e) { if (e instanceof BadSetting) return rep.code(400).send({ error: e.message }); throw e; }
    saveSources(sys, list);
    if (typeof b.key === 'string' && b.key) setSourceKey(sys, list[i].id, b.key.slice(0, 500));
    if (b.clearKey === true) setSourceKey(sys, list[i].id, '');
    return sharedList();
  });
  app.delete('/api/admin/ai/sources/:id', async (req, rep) => {
    const id = (req.params as Row).id;
    if (!loadSources(sys).some((s) => s.id === id)) return x.notFound(rep);
    saveSources(sys, loadSources(sys).filter((s) => s.id !== id));
    removeSourceKey(sys, id);
    return sharedList();
  });
  app.post('/api/admin/ai/sources/:id/test', async (req, rep) => {
    const src = loadSources(sys).find((s) => s.id === (req.params as Row).id);
    if (!src) return x.notFound(rep);
    if (!src.endpoint || !src.model) return rep.code(400).send({ ok: false, detail: whyNotReady(src) });
    const t = aiType(src.type)!;
    return ping({ protocol: t.protocol, local: t.local, name: src.name, endpoint: src.endpoint, model: src.model, embedModel: t.canEmbed ? src.embedModel : '', key: sourceKey(sys, src.id) });
  });

  // ---------- the whole server's backup ----------
  // The server's own database (people, sign-in, the tunnel) and every person's library database, as one archive. Keys, secrets and
  // sign-in sessions are taken out of every copy, as for a single library. Photographs are not in it: back those up as you already do.
  app.get('/api/admin/backup', async (_req, rep) => {
    const dir = path.join(x.tenants.owner().cfg.dataDir, 'backups');
    fs.mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().slice(0, 10), made: { name: string; file: string }[] = [];
    const snap = async (name: string, db: DB) => { const f = path.join(dir, `server-${Date.now()}-${made.length}.db`); await db.backup(f); scrubCopy(f); made.push({ name, file: f }); };
    await snap('system.db', sys);
    for (const t of x.tenants.all()) await snap(`library-${t.user.id}-${(t.user.folder || t.user.name || 'owner').replace(/[^A-Za-z0-9._-]/g, '_')}.db`, t.db);
    const cleanup = () => { for (const m of made) fs.rmSync(m.file, { force: true }); };
    rep.raw.on('close', cleanup);
    return rep.header('Content-Type', 'application/x-tar').header('Content-Disposition', `attachment; filename="frames-server-backup-${stamp}.tar"`).header('Cache-Control', 'no-store').send(tarOf(made));
  });
  app.get('/api/admin/backup/list', async () => {
    const out: { name: string; whose: string; bytes: number }[] = [];
    for (const t of x.tenants.all()) {
      const dir = path.join(t.cfg.dataDir, 'backups');
      if (!fs.existsSync(dir)) continue;
      for (const n of fs.readdirSync(dir).filter((f) => /^auto-\d{4}-\d{2}-\d{2}\.db$/.test(f))) out.push({ name: n, whose: t.user.name || t.user.email || `person ${t.user.id}`, bytes: fs.statSync(path.join(dir, n)).size });
    }
    return out.sort((a, b) => b.name.localeCompare(a.name));
  });

  // ---------- administrators ----------
  app.get('/api/admin/users', async () => ({ users: listUsers(sys).map(dto), signups: x.cfg.allowSignups !== false, libraryRoots: x.tenants.owner().cfg.libraryRoots ?? [] }));

  // The env file: every saved setting, secrets included, as one download for the stack. It is allowed only while ALLOW_ENV_EXPORT is
  // true, and the file it makes sets that to false, so once it is in use the secrets cannot be downloaded again.
  const envStatus = () => ({
    allowed: x.cfg.allowEnvExport !== false,
    loaded: envConfigLoaded(),
    settings: { system: Object.keys(snapshot(sys)).length, owner: Object.keys(snapshot(x.tenants.owner().db)).length },
    version: x.cfg.version ?? 'dev',
  });
  app.get('/api/admin/env', async () => envStatus());
  app.get('/api/admin/env/export', async (req, rep) => {
    if (x.cfg.allowEnvExport === false) return rep.code(403).send({ error: 'Export is switched off (ALLOW_ENV_EXPORT=false, which the exported file sets so the secrets cannot be downloaded again). Set it to true in your env file and restart Frames to export again.' });
    console.warn(`env file exported by administrator ${me(req).id}`);
    return rep.header('Content-Type', 'text/plain; charset=utf-8').header('Content-Disposition', 'attachment; filename="frames.env"').header('Cache-Control', 'no-store')
      .send(buildEnvFile(sys, x.tenants.owner().db, { version: x.cfg.version, date: new Date() }));
  });

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
