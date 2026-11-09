import fs from 'node:fs';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { cleanAllow, isAllowed, loadAuth, saveAuth, sessionAgeMs, sessionCookie } from '../auth.js';
import type { Ctx, Row } from '../ctx.js';
import { getSetting, setSetting, type DB } from '../db.js';
import { buildEnvFile, envConfigLoaded, snapshot } from '../envConfig.js';
import { AI_TYPES, aiType, applySource, BadSetting, isReady, loadSources, newSource, removeSourceKey, saveSources, setSourceKey, sourceKey, whyNotReady, type AiSource } from '../aisources.js';
import { ping } from '../ai.js';
import { pipeline } from 'node:stream/promises';
import { hasSecret, loadTurnstile, saveTurnstile } from '../turnstile.js';
import { envBool } from '../env.js';
import { tarOf } from '../backup.js';
import { archivesIn, cancelRestore, pendingRestore, serverParts, stageRestore } from '../serverBackup.js';
import { userDir } from '../tenants.js';
import { countAdmins, deleteUserRow, getUser, invite, listUsers, OWNER_ID, signupsOn, updateUser, validFolder, type User } from '../users.js';

/**
 * Administrators: see and manage the people. And anyone: delete their own data.
 * Nothing here opens a person's photographs. An administrator sees names, emails, roles and how much space each uses.
 */

/** What a library takes up inside the data volume. For the owner, whose data sits in the data folder itself, only their own parts count. */
const OWNER_PARTS = ['frames.db', 'frames.db-wal', 'frames.db-shm', 'originals', 'derivatives', 'cloud', 'backups', 'backgrounds'];
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
    for (const d of ['originals', 'derivatives', 'cloud', 'backups', 'backgrounds']) fs.rmSync(path.join(base.dataDir, d), { recursive: true, force: true });
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

  // ---------- choices that apply to the whole server ----------
  type Instance = { allowOriginals?: boolean; shrinkCopies?: 'choice' | 'always'; cloudOnly?: boolean; defaultRole?: 'member' | 'guest'; signups?: boolean };
  const instance = () => { const i = getSetting<Instance>(sys, 'instance', {}); return { allowOriginals: !!i.allowOriginals, cloudOnly: !!i.cloudOnly, shrinkCopies: i.shrinkCopies === 'always' ? 'always' as const : 'choice' as const, defaultRole: i.defaultRole === 'guest' ? 'guest' as const : 'member' as const, signups: signupsOn(sys, x.cfg.allowSignups !== false), signupsLocked: x.cfg.allowSignups === false }; };
  app.get('/api/admin/instance', async () => instance());
  app.put('/api/admin/instance', async (req) => {
    const b = (req.body ?? {}) as Row;
    const cur = getSetting<Instance>(sys, 'instance', {});
    setSetting(sys, 'instance', { ...cur, ...(typeof b.allowOriginals === 'boolean' ? { allowOriginals: b.allowOriginals } : {}), ...(typeof b.cloudOnly === 'boolean' ? { cloudOnly: b.cloudOnly } : {}), ...(b.shrinkCopies === 'always' || b.shrinkCopies === 'choice' ? { shrinkCopies: b.shrinkCopies } : {}), ...(b.defaultRole === 'guest' || b.defaultRole === 'member' ? { defaultRole: b.defaultRole } : {}), ...(typeof b.signups === 'boolean' ? { signups: b.signups } : {}) });
    return instance();
  });

  // ---------- the whole server's backup ----------
  // The server's own database (people, sign-in, the tunnel) and every person's library database, as one archive. Keys, secrets and
  // sign-in sessions are taken out of every copy, as for a single library. Photographs are not in it: back those up as you already do.
  const backupDir = () => x.cfg.backupDir ?? path.join(x.tenants.owner().cfg.dataDir, 'backups', 'server');
  app.get('/api/admin/backup', async (_req, rep) => {
    const stamp = new Date().toISOString().slice(0, 10);
    const made = await serverParts({ sys, tenants: x.tenants as any }, path.join(x.tenants.owner().cfg.dataDir, 'backups'));
    rep.raw.on('close', () => { for (const m of made) fs.rmSync(m.file, { force: true }); });
    return rep.header('Content-Type', 'application/x-tar').header('Content-Disposition', `attachment; filename="frames-server-backup-${stamp}.tar"`).header('Cache-Control', 'no-store').send(tarOf(made));
  });
  // Restore: the archive is checked and put aside; it is applied when Frames next starts (see serverBackup.ts). The photographs are not touched.
  const dataDirOf = () => x.tenants.owner().cfg.dataDir;
  const stage = (rep: any, file: string) => {
    try { const r = stageRestore(file, dataDirOf()); return { staged: true, ...r }; } catch (e) { return rep.code(400).send({ error: (e as Error).message }); }
  };
  app.get('/api/admin/restore', async () => ({ dir: backupDir(), archives: archivesIn(backupDir()), pending: pendingRestore(dataDirOf()), canRestart: !!(app as any).frames.restart }));
  app.post('/api/admin/restore', async (req, rep) => {
    const name = String(((req.body ?? {}) as Row).name ?? '');
    if (!archivesIn(backupDir()).some((a) => a.name === name)) return x.notFound(rep);
    return stage(rep, path.join(backupDir(), name));
  });
  app.post('/api/admin/restore/upload', async (req, rep) => {
    let part: any;
    try { part = await (req as any).file?.(); } catch { part = null; } // not a file upload at all
    if (!part) return rep.code(400).send({ error: 'Choose a backup file.' });
    const tmp = path.join(dataDirOf(), `upload-${Date.now()}.tar`);
    try { await pipeline(part.file, fs.createWriteStream(tmp)); return stage(rep, tmp); } finally { fs.rmSync(tmp, { force: true }); }
  });
  app.delete('/api/admin/restore', async () => { cancelRestore(dataDirOf()); return { ok: true }; });
  app.post('/api/admin/restart', async (_req, rep) => {
    const restart = (app as any).frames.restart as (() => void) | undefined;
    if (!restart) return rep.code(409).send({ error: 'This server cannot restart itself. Restart it yourself and the restore is applied.' });
    setImmediate(restart);
    return { ok: true };
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

  // Cloudflare Turnstile for the sign-in page and share links. The secret key is write-only: it is never sent back, only whether one is set.
  const turnstile = () => { const c = loadTurnstile(sys); return { enabled: c.enabled, siteKey: c.siteKey, signin: c.signin, shares: c.shares, hasSecret: hasSecret(sys), disabledByEnv: envBool('TURNSTILE_DISABLE', false) }; };
  app.get('/api/admin/turnstile', async () => turnstile());
  app.put('/api/admin/turnstile', async (req, rep) => {
    const b = (req.body ?? {}) as Row;
    for (const k of ['siteKey', 'secret']) if (b[k] !== undefined && typeof b[k] !== 'string') return rep.code(400).send({ error: 'Keys must be text.' });
    const next = { ...loadTurnstile(sys), ...(typeof b.siteKey === 'string' ? { siteKey: b.siteKey.trim() } : {}), ...(typeof b.enabled === 'boolean' ? { enabled: b.enabled } : {}) };
    // Switching it on needs both keys: a check with no way to pass would lock everyone out.
    if (next.enabled && (!next.siteKey || !(hasSecret(sys) || (typeof b.secret === 'string' && b.secret.trim())))) return rep.code(400).send({ error: 'Enter the site key and the secret key from Cloudflare first.' });
    saveTurnstile(sys, { enabled: typeof b.enabled === 'boolean' ? b.enabled : undefined, siteKey: typeof b.siteKey === 'string' ? b.siteKey : undefined, signin: typeof b.signin === 'boolean' ? b.signin : undefined, shares: typeof b.shares === 'boolean' ? b.shares : undefined, secret: typeof b.secret === 'string' ? b.secret : undefined });
    return turnstile();
  });

  // ---------- administrators ----------
  app.get('/api/admin/users', async () => ({ users: listUsers(sys).map(dto), signups: signupsOn(sys, x.cfg.allowSignups !== false), libraryRoots: x.tenants.owner().cfg.libraryRoots ?? [] }));

  // The env file: every saved setting, secrets included, as one download for the stack. It is allowed only while ALLOW_ENV_EXPORT is
  // true, and the file it makes sets that to false, so once it is in use the secrets cannot be downloaded again.
  // Off by default, and an administrator's own switch (Settings, Env file). Turning it on needs a sign-in made in the last few minutes, so
  // someone at an unattended screen cannot switch it on. ALLOW_ENV_EXPORT=false (which the file sets) locks it off whatever the switch says.
  const FRESH_SIGN_IN_MS = 5 * 60_000;
  const envExportOn = () => !!getSetting<{ envExport?: boolean }>(sys, 'instance', {}).envExport;
  const envStatus = () => ({
    allowed: x.cfg.allowEnvExport !== false && envExportOn(),
    enabled: envExportOn(),
    lockedByEnv: x.cfg.allowEnvExport === false,
    loaded: envConfigLoaded(),
    settings: { system: Object.keys(snapshot(sys)).length, owner: 0 }, // only the server's settings are written to the file
    version: x.cfg.version ?? 'dev',
  });
  app.get('/api/admin/env', async () => envStatus());
  app.put('/api/admin/env/export-enabled', async (req, rep) => {
    const on = ((req.body ?? {}) as Row).on;
    if (typeof on !== 'boolean') return rep.code(400).send({ error: 'on must be true or false' });
    if (on) {
      if (x.cfg.allowEnvExport === false) return rep.code(403).send({ error: 'Export is locked off by ALLOW_ENV_EXPORT=false in this stack\'s environment (the exported file sets it). Set it to true there and restart to export again.' });
      // Signed in as a person: it must be a sign-in from the last few minutes. With a shared password, or no sign-in at all, there is no one to ask again.
      const age = (req as any).authVia === 'session' ? sessionAgeMs(sys, req) : 0;
      if (age === null || age > FRESH_SIGN_IN_MS) return rep.code(401).send({ error: 'Sign in again to turn on the env file export.', reauth: true });
      console.warn(`env file export switched on by administrator ${me(req).id}`);
    }
    setSetting(sys, 'instance', { ...getSetting<Record<string, unknown>>(sys, 'instance', {}), envExport: on });
    return envStatus();
  });
  // What the saved settings would write to the file, against what this container was actually started with. Names and verdicts only:
  // a value, a secret above all, is never sent.
  app.get('/api/admin/env/compare', async () => {
    const pairs: [string, string][] = [];
    buildEnvFile(sys, x.tenants.owner().db, { pairs });
    const env = process.env;
    // A secret is never sent, in either column: only whether it is set. Anything that might hold one is treated as one (and the whole-config variables, which hold every secret).
    const secret = (k: string) => /KEY|SECRET|TOKEN|PASSWORD|AUD|CREDENTIAL|PRIVATE/i.test(k) || /^FRAMES_CONFIG_/.test(k);
    const show = (name: string, v: string | undefined) => (v === undefined || secret(name) ? undefined : v.length > 160 ? `${v.slice(0, 157)}…` : v);
    type Row = { name: string; secret: boolean; status: 'same' | 'differs' | 'app only' | 'env only'; env?: string; app?: string };
    const rows: Row[] = pairs.filter(([k]) => k !== 'ALLOW_ENV_EXPORT').map(([name, text]) => {
      const status = env[name] === undefined ? 'app only' as const : env[name] === text ? 'same' as const : 'differs' as const;
      return { name, secret: secret(name), status, env: show(name, env[name]), app: status === 'same' ? undefined : show(name, text) }; // the app's value is shown only where it is not the same
    });
    const known = new Set(pairs.map(([k]) => k));
    for (const name of Object.keys(env).filter((k) => /^(SHARED_AI|AI|AUTH)_\d+_[A-Z0-9_]+$|^CLOUD_(GOOGLE|DROPBOX|ONEDRIVE)_(CLIENT_ID|CLIENT_SECRET)$|^FRAMES_(SYSTEM|OWNER)__|^FRAMES_CONFIG_/.test(k) && !known.has(k)).sort()) {
      rows.push({ name, secret: secret(name), status: 'env only', env: show(name, env[name]) });
    }
    return { rows, counts: { same: rows.filter((r) => r.status === 'same').length, differs: rows.filter((r) => r.status === 'differs').length, appOnly: rows.filter((r) => r.status === 'app only').length, envOnly: rows.filter((r) => r.status === 'env only').length } };
  });
  app.get('/api/admin/env/export', async (req, rep) => {
    if (!envExportOn() && x.cfg.allowEnvExport !== false) return rep.code(403).send({ error: 'Export is switched off. Turn it on in Settings, Env file (you will be asked to sign in again).' });
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
    const u = invite(sys, email, b.role === 'admin' ? 'admin' : b.role === 'guest' ? 'guest' : 'member');
    const conf = loadAuth(sys);
    const already = isAllowed({ provider: '', sub: '', email, emailVerified: true }, conf.allow);
    if (!already) saveAuth(sys, { ...conf, allow: cleanAllow([...conf.allow, email]) });
    return rep.code(201).send({ ...dto(u), allowedList: already ? 'already' : 'added' }); // whether they had to be put on the allowed list
  });

  app.patch('/api/admin/users/:id', async (req, rep) => {
    const id = x.num((req.params as Row).id);
    const u = getUser(sys, id);
    if (!u) return x.notFound(rep);
    const b = (req.body ?? {}) as Row;
    const bad = (error: string) => rep.code(400).send({ error });
    if (b.role !== undefined) {
      if (b.role !== 'admin' && b.role !== 'member' && b.role !== 'guest') return bad('Role must be admin, member or guest.');
      if (u.role === 'admin' && b.role !== 'admin' && countAdmins(sys) <= 1) return bad('There must be at least one administrator.');
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
