import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { getSecret, setSecret } from './ai.js';
import type { AppCfg } from './ctx.js';
import { getSetting, setSetting, type DB } from './db.js';
import { hashFile, IMAGE_EXT } from './ingest.js';
import sharp from 'sharp';
import type { Readable as ReadableStream } from 'node:stream';

/**
 * Cloud sync: copy photographs from a Google Drive, Dropbox or OneDrive folder into Frames' own `cloud` folder, which is
 * then scanned like any other library. One way only and read-only on the provider's side (the tokens ask for read access).
 * Nothing is ever deleted locally, and a file already downloaded is never overwritten, so originals stay as first received.
 * Each person registers their own OAuth app with the provider (a self-hosted app has no shared client), and Frames only
 * keeps the client id/secret and the refresh token, as write-only secrets that are left out of backups.
 */

export type ProviderId = 'google' | 'dropbox' | 'onedrive';
export const PROVIDERS: { id: ProviderId; label: string; console: string }[] = [
  { id: 'google', label: 'Google Drive', console: 'https://console.cloud.google.com/apis/credentials' },
  { id: 'dropbox', label: 'Dropbox', console: 'https://www.dropbox.com/developers/apps' },
  { id: 'onedrive', label: 'OneDrive', console: 'https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade' },
];
export const isProvider = (v: unknown): v is ProviderId => PROVIDERS.some((p) => p.id === v);

export type Conn = {
  id: string; provider: ProviderId; account: string;
  /** The folders to copy from (each with its subfolders). `folderId` and `folderName` are the first of them, kept for older settings. */
  folders?: { id: string; name: string }[];
  folderId: string | null; folderName: string; intervalMin: number; enabled: boolean;
  lastSync: string | null; lastResult: SyncResult | null; needsReconnect: boolean;
  /** Keep only a smaller copy of each photograph in Frames (JPEG, quality 80, the same pixels). The original stays in the cloud and is fetched when it is exported. */
  shrink?: boolean;
};
export type SyncResult = { downloaded: number; skipped: number; changedRemotely: number; errors: string[]; error: string | null; bytes: number;
  /** Photographs made smaller this time, and the space that freed. */
  shrunk?: number; freed?: number };
type CloudCfg = { clients: Partial<Record<ProviderId, { clientId: string }>>; connections: Conn[] };

/** A connection from before several folders could be chosen has one: it becomes the list's only entry. */
export const foldersOf = (c: Pick<Conn, 'folders' | 'folderId' | 'folderName'>): { id: string; name: string }[] => c.folders ?? (c.folderId === null ? [] : [{ id: c.folderId, name: c.folderName }]);
export const loadCloud = (db: DB): CloudCfg => {
  const c = { clients: {}, connections: [], ...getSetting<Partial<CloudCfg>>(db, 'cloud', {}) } as CloudCfg;
  c.connections = c.connections.map((k) => { const f = foldersOf(k); return { ...k, folders: f, folderId: f[0]?.id ?? null, folderName: f[0]?.name ?? '' }; });
  return c;
};
export const saveCloud = (db: DB, c: CloudCfg) => setSetting(db, 'cloud', c);
/**
 * The app registration (client ID and secret from the service's developer console) belongs to the whole server: an administrator
 * enters it once, in the system database, and each person only connects their own account. Registrations saved before that, in a
 * person's own library, are still honoured until an administrator enters one.
 */
export const loadClients = (sys: DB): Partial<Record<ProviderId, { clientId: string }>> => getSetting(sys, 'cloudClients', {});
export const saveClients = (sys: DB, c: Partial<Record<ProviderId, { clientId: string }>>) => setSetting(sys, 'cloudClients', c);
export function clientOf(cfg: AppCfg, db: DB, p: ProviderId): { clientId: string; secret: string } {
  const sys = cfg.sys;
  const id = sys ? loadClients(sys)[p]?.clientId ?? '' : '';
  if (sys && id) return { clientId: id, secret: getSecret(sys, `cloud:client:${p}`) };
  return { clientId: loadCloud(db).clients[p]?.clientId ?? '', secret: clientSecret(db, p) };
}
export const clientSecret = (db: DB, p: ProviderId) => getSecret(db, `cloud:client:${p}`);
export const setClientSecret = (db: DB, p: ProviderId, v: string) => setSecret(db, `cloud:client:${p}`, v);
type Tokens = { access: string; exp: number; refresh: string };
const loadTokens = (db: DB, id: string): Tokens | null => { try { return JSON.parse(getSecret(db, `cloud:tok:${id}`)); } catch { return null; } };
const saveTokens = (db: DB, id: string, t: Tokens | null) => setSecret(db, `cloud:tok:${id}`, t ? JSON.stringify(t) : '');

export class CloudError extends Error {
  constructor(message: string, public reconnect = false) { super(message); }
}

// ---------- endpoints (only the test setup may change them) ----------
const REAL = {
  google: { auth: 'https://accounts.google.com/o/oauth2/v2/auth', token: 'https://oauth2.googleapis.com/token', api: 'https://www.googleapis.com/drive/v3', upload: 'https://www.googleapis.com/upload/drive/v3' },
  dropbox: { auth: 'https://www.dropbox.com/oauth2/authorize', token: 'https://api.dropboxapi.com/oauth2/token', api: 'https://api.dropboxapi.com/2', content: 'https://content.dropboxapi.com/2' },
  onedrive: { auth: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize', token: 'https://login.microsoftonline.com/common/oauth2/v2.0/token', api: 'https://graph.microsoft.com/v1.0', content: '' },
};
export const urls = (cfg: AppCfg, p: ProviderId): { auth: string; token: string; api: string; content: string; upload: string } => (cfg.cloudBase
  ? { auth: `${cfg.cloudBase}/${p}/auth`, token: `${cfg.cloudBase}/${p}/token`, api: `${cfg.cloudBase}/${p}/api`, content: `${cfg.cloudBase}/${p}/content`, upload: `${cfg.cloudBase}/${p}/upload` }
  : { content: '', upload: '', ...REAL[p] });

const SCOPE: Record<ProviderId, string> = {
  google: 'https://www.googleapis.com/auth/drive.readonly',
  dropbox: 'files.metadata.read files.content.read account_info.read',
  onedrive: 'Files.Read offline_access User.Read',
};
const EXTRA: Record<ProviderId, Record<string, string>> = {
  // Always show the account chooser, so a second account of the same service can be picked even when the browser is signed in to the first.
  google: { access_type: 'offline', prompt: 'select_account consent' },
  dropbox: { token_access_type: 'offline', force_reauthentication: 'true' },
  onedrive: { prompt: 'select_account' },
};

// ---------- sign-in with the provider (authorization code + PKCE) ----------
const pending = new Map<string, { provider: ProviderId; verifier: string; exp: number; dir: string; purpose?: 'backup' }>();
/** What a sign-in in progress is for: reading photographs (the default) or an administrator's backup connection. */
export const pendingPurpose = (state: string) => pending.get(state)?.purpose;
/** Write access, only for the administrator's backup connection: a folder Frames makes, and its files. */
const BACKUP_SCOPE: Record<ProviderId, string> = {
  google: 'https://www.googleapis.com/auth/drive.file',
  dropbox: 'files.metadata.read files.metadata.write files.content.read files.content.write account_info.read',
  onedrive: 'Files.ReadWrite offline_access User.Read',
};
const b64u = (b: Buffer) => b.toString('base64url');

export function beginConnect(db: DB, cfg: AppCfg, provider: ProviderId, redirectUri: string, purpose?: 'backup'): string {
  const clientId = clientOf(cfg, db, provider).clientId;
  if (!clientId) throw new CloudError(`${PROVIDERS.find((p) => p.id === provider)!.label} is not set up on this server yet. An administrator enters its client ID under Settings, Cloud storage providers.`);
  for (const [k, v] of pending) if (v.exp < Date.now()) pending.delete(k);
  const state = b64u(crypto.randomBytes(24));
  const verifier = b64u(crypto.randomBytes(32));
  pending.set(state, { provider, verifier, exp: Date.now() + 10 * 60_000, dir: cfg.dataDir, purpose });
  const q = new URLSearchParams({
    response_type: 'code', client_id: clientId, redirect_uri: redirectUri, scope: purpose === 'backup' ? BACKUP_SCOPE[provider] : SCOPE[provider], state,
    code_challenge: b64u(crypto.createHash('sha256').update(verifier).digest()), code_challenge_method: 'S256', ...EXTRA[provider],
  });
  return `${urls(cfg, provider).auth}?${q}`;
}

async function tokenCall(db: DB, cfg: AppCfg, provider: ProviderId, body: Record<string, string>): Promise<{ access_token: string; expires_in?: number; refresh_token?: string }> {
  const { clientId, secret } = clientOf(cfg, db, provider);
  const form = new URLSearchParams({ client_id: clientId, ...(secret ? { client_secret: secret } : {}), ...body });
  const r = await fetch(urls(cfg, provider).token, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }, body: form, signal: AbortSignal.timeout(30_000) });
  const j = (await r.json().catch(() => ({}))) as any;
  if (!r.ok || !j.access_token) {
    const dead = j.error === 'invalid_grant' || r.status === 400 || r.status === 401;
    throw new CloudError(dead ? 'The provider refused the sign-in. Reconnect the account.' : `The provider answered ${r.status}.`, dead);
  }
  return j;
}

/**
 * Finishes an administrator's backup sign-in. The one connection is kept in the server's own database (id 'backup'); signing in again
 * replaces it. Returns who it is, for the page to show.
 */
export async function finishBackupConnect(sys: DB, cfg: AppCfg, code: string, state: string, redirectUri: string): Promise<{ provider: ProviderId; account: string }> {
  const p = pending.get(state);
  pending.delete(state);
  if (!p || p.purpose !== 'backup' || p.exp < Date.now() || p.dir !== cfg.dataDir) throw new CloudError('That sign-in expired. Start again.');
  const t = await tokenCall(sys, cfg, p.provider, { grant_type: 'authorization_code', code, redirect_uri: redirectUri, code_verifier: p.verifier });
  if (!t.refresh_token) throw new CloudError('The provider did not allow lasting access. Remove Frames from the account’s connected apps and try again.');
  saveTokens(sys, BACKUP_CONN, { access: t.access_token, exp: Date.now() + (t.expires_in ?? 3600) * 1000, refresh: t.refresh_token });
  let account = '';
  try { account = await adapters[p.provider].who(http(sys, cfg, { id: BACKUP_CONN, provider: p.provider } as Conn), urls(cfg, p.provider)); } catch { /* the name is only a label */ }
  return { provider: p.provider, account };
}
export const BACKUP_CONN = 'backup';
/** A signed request for the backup connection: token fetched and renewed as for any connection. */
export const backupHttp = (sys: DB, cfg: AppCfg, provider: ProviderId): Http => http(sys, cfg, { id: BACKUP_CONN, provider } as Conn);
export const dropBackupTokens = (sys: DB) => saveTokens(sys, BACKUP_CONN, null);

/** Finishes the sign-in: swaps the code for tokens and stores a new connection. Returns its id. */
export async function finishConnect(db: DB, cfg: AppCfg, code: string, state: string, redirectUri: string): Promise<Conn> {
  const p = pending.get(state);
  pending.delete(state); // single use
  if (!p || p.exp < Date.now() || p.dir !== cfg.dataDir) throw new CloudError('That sign-in expired. Start again.');
  const t = await tokenCall(db, cfg, p.provider, { grant_type: 'authorization_code', code, redirect_uri: redirectUri, code_verifier: p.verifier });
  if (!t.refresh_token) throw new CloudError('The provider did not allow lasting access. Remove Frames from the account’s connected apps and try again.');
  const id = crypto.randomBytes(4).toString('hex');
  const tokens = { access: t.access_token, exp: Date.now() + (t.expires_in ?? 3600) * 1000, refresh: t.refresh_token };
  saveTokens(db, id, tokens);
  const conn: Conn = { id, provider: p.provider, account: '', folderId: null, folderName: '', intervalMin: 0, enabled: false, lastSync: null, lastResult: null, needsReconnect: false };
  try { conn.account = await adapters[p.provider].who(http(db, cfg, conn), urls(cfg, p.provider)); } catch { /* the name is only a label */ }
  const c = loadCloud(db);
  // The same account again (to reconnect it, or by accident) renews the connection it already has instead of adding a second copy.
  const same = conn.account ? c.connections.find((x) => x.provider === conn.provider && x.account.toLowerCase() === conn.account.toLowerCase()) : undefined;
  if (same) {
    saveTokens(db, same.id, tokens);
    saveTokens(db, id, null);
    same.needsReconnect = false;
    saveCloud(db, c);
    return same;
  }
  c.connections.push(conn);
  saveCloud(db, c);
  return conn;
}

async function accessToken(db: DB, cfg: AppCfg, conn: Conn): Promise<string> {
  const t = loadTokens(db, conn.id);
  if (!t) throw new CloudError('Not connected. Reconnect the account.', true);
  if (t.exp - 60_000 > Date.now()) return t.access;
  const r = await tokenCall(db, cfg, conn.provider, { grant_type: 'refresh_token', refresh_token: t.refresh });
  saveTokens(db, conn.id, { access: r.access_token, exp: Date.now() + (r.expires_in ?? 3600) * 1000, refresh: r.refresh_token || t.refresh });
  return r.access_token;
}

// ---------- talking to each provider ----------
export type Http = (url: string, init?: RequestInit & { timeout?: number }) => Promise<Response>;
const snippet = async (r: Response) => (await r.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 160);

function http(db: DB, cfg: AppCfg, conn: Conn): Http {
  return async (url, init = {}) => {
    const token = await accessToken(db, cfg, conn);
    const r = await fetch(url, { ...init, headers: { ...(init.headers as Record<string, string>), Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(init.timeout ?? 60_000) });
    if (!r.ok) {
      if (r.status === 401) throw new CloudError('The provider no longer accepts this account. Reconnect it.', true);
      throw new CloudError(`${new URL(url).host} answered ${r.status}: ${await snippet(r)}`);
    }
    return r;
  };
}

export type Entry = { id: string; name: string; folder: boolean; size: number; version: string };
type Adapter = {
  root: string;
  validId: (id: string) => boolean;
  who: (h: Http, u: ReturnType<typeof urls>) => Promise<string>;
  list: (h: Http, u: ReturnType<typeof urls>, folderId: string) => Promise<Entry[]>;
  download: (h: Http, u: ReturnType<typeof urls>, e: Entry) => Promise<Response>;
};
const json = async (r: Response) => (await r.json()) as any;

const adapters: Record<ProviderId, Adapter> = {
  google: {
    root: 'root',
    validId: (id) => /^[\w-]{1,100}$/.test(id),
    who: async (h, u) => (await json(await h(`${u.api}/about?fields=user(emailAddress)`))).user?.emailAddress ?? '',
    async list(h, u, folderId) {
      const out: Entry[] = [];
      let page = '';
      do {
        const q = new URLSearchParams({ q: `'${folderId}' in parents and trashed=false`, fields: 'nextPageToken,files(id,name,mimeType,size,md5Checksum,modifiedTime)', pageSize: '1000', ...(page ? { pageToken: page } : {}) });
        const j = await json(await h(`${u.api}/files?${q}`));
        for (const f of j.files ?? []) out.push({ id: f.id, name: f.name, folder: f.mimeType === 'application/vnd.google-apps.folder', size: Number(f.size) || 0, version: f.md5Checksum || f.modifiedTime || '' });
        page = j.nextPageToken ?? '';
      } while (page);
      return out;
    },
    download: (h, u, e) => h(`${u.api}/files/${encodeURIComponent(e.id)}?alt=media`, { timeout: 15 * 60_000 }),
  },
  dropbox: {
    root: '',
    validId: (id) => id === '' || /^id:[\w-]{1,100}$/.test(id),
    who: async (h, u) => { const j = await json(await h(`${u.api}/users/get_current_account`, { method: 'POST' })); return j.email ?? ''; },
    async list(h, u, folderId) {
      const out: Entry[] = [];
      let r = await h(`${u.api}/files/list_folder`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: folderId, limit: 2000 }) });
      for (;;) {
        const j = await json(r);
        for (const f of j.entries ?? []) out.push({ id: f.id, name: f.name, folder: f['.tag'] === 'folder', size: Number(f.size) || 0, version: f.content_hash || f.rev || '' });
        if (!j.has_more) break;
        r = await h(`${u.api}/files/list_folder/continue`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cursor: j.cursor }) });
      }
      return out;
    },
    download: (h, u, e) => h(`${u.content}/files/download`, { method: 'POST', headers: { 'Dropbox-API-Arg': JSON.stringify({ path: e.id }) }, timeout: 15 * 60_000 }),
  },
  onedrive: {
    root: 'root',
    validId: (id) => /^[\w!-]{1,200}$/.test(id),
    who: async (h, u) => { const j = await json(await h(`${u.api}/me?$select=userPrincipalName,mail`)); return j.mail || j.userPrincipalName || ''; },
    async list(h, u, folderId) {
      const out: Entry[] = [];
      let next: string | null = `${u.api}/me/drive/items/${encodeURIComponent(folderId)}/children?$top=200&$select=id,name,size,folder,file,lastModifiedDateTime`;
      while (next) {
        const j = await json(await h(next));
        for (const f of j.value ?? []) out.push({ id: f.id, name: f.name, folder: !!f.folder, size: Number(f.size) || 0, version: f.file?.hashes?.sha1Hash || f.file?.hashes?.quickXorHash || f.lastModifiedDateTime || '' });
        const link: string | undefined = j['@odata.nextLink'];
        // Only ever follow a link that stays on the provider's own API: the bearer token goes with it.
        next = link && link.startsWith(u.api + '/') ? link : null;
      }
      return out;
    },
    download: (h, u, e) => h(`${u.api}/me/drive/items/${encodeURIComponent(e.id)}/content`, { timeout: 15 * 60_000 }),
  },
};

/** Subfolders of a folder, for the folder picker. */
export async function listFolders(db: DB, cfg: AppCfg, conn: Conn, parent: string | null): Promise<{ id: string; name: string }[]> {
  const a = adapters[conn.provider];
  const id = parent ?? a.root;
  if (!a.validId(id)) throw new CloudError('Not a folder.');
  const es = await a.list(http(db, cfg, conn), urls(cfg, conn.provider), id);
  return es.filter((e) => e.folder).map((e) => ({ id: e.id, name: e.name })).sort((x, y) => x.name.localeCompare(y.name));
}
export const validFolderId = (provider: ProviderId, id: string) => adapters[provider].validId(id);

// ---------- the sync ----------
const MAX_FILE = (Number(process.env.CLOUD_MAX_FILE_MB) || 1024) * 1024 * 1024;
const MAX_SIDECAR = 5 * 1024 * 1024;
const MAX_DEPTH = 25;
const MAX_ENTRIES = 200_000;
const ALLOWED = new Set([...IMAGE_EXT, '.xmp']);

/** One path piece from a provider, made safe to use as a file name on disk. */
export function safeName(n: string): string {
  const s = n.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/^\.+/, '_').trim().slice(0, 200);
  return s || '_';
}

// ---------- smaller copies ----------
/** The administrator can require smaller copies for everyone (Settings, Photo folders); otherwise it is each connection's own choice. */
export const shrinkEnforced = (db: DB): boolean => {
  const sys = (db as unknown as { sys?: DB }).sys;
  if (!sys) return false;
  const i = getSetting<{ shrinkCopies?: string; cloudOnly?: boolean }>(sys, 'instance', {});
  return i.shrinkCopies === 'always' || !!i.cloudOnly; // keeping originals in the cloud means only smaller copies are kept here
};

/**
 * The administrator can require originals to live in cloud storage (Settings, Storage, Photo folders): nothing can be uploaded to
 * Frames, and cloud photographs are kept only as smaller copies. Photographs already here are not touched.
 */
export const cloudOnlyOriginals = (db: DB): boolean => {
  const sys = (db as unknown as { sys?: DB }).sys;
  return !!sys && !!getSetting<{ cloudOnly?: boolean }>(sys, 'instance', {}).cloudOnly;
};

const SHRINKABLE = new Set(['.jpg', '.jpeg', '.png', '.tif', '.tiff']);
export const SHRINK_QUALITY = 80;

/**
 * A smaller copy of a photograph: JPEG at quality 80 with the same pixels and the camera data kept. Not done when it would save little
 * (an already small file), or for RAW and other files that cannot be shown as a JPEG without losing what makes them RAW.
 */
async function shrinkFile(file: string): Promise<{ file: string; before: number; after: number; w: number; h: number } | null> {
  const ext = path.extname(file).toLowerCase();
  if (!SHRINKABLE.has(ext)) return null;
  const before = fs.statSync(file).size;
  const tmp = `${file}.shrinking`; // not an image extension, so a scan never sees it
  try {
    const meta = await sharp(file, { failOn: 'none' }).metadata();
    let img = sharp(file, { failOn: 'none' });
    if (ext === '.png') img = img.flatten({ background: '#ffffff' });
    await img.jpeg({ quality: SHRINK_QUALITY, mozjpeg: true }).withMetadata().toFile(tmp);
    const after = fs.statSync(tmp).size;
    if (after >= before * 0.9) { fs.rmSync(tmp, { force: true }); return null; }
    const out = ext === '.jpg' || ext === '.jpeg' ? file : file.slice(0, -ext.length) + '.jpg';
    if (out !== file) fs.rmSync(file, { force: true });
    fs.renameSync(tmp, out);
    return { file: out, before, after, w: meta.width ?? 0, h: meta.height ?? 0 };
  } catch { fs.rmSync(tmp, { force: true }); return null; }
}

/** Make a photograph that Frames already knows about smaller, and keep its record in step with the new file. */
async function shrinkKnown(db: DB, file: string): Promise<{ file: string; before: number; after: number } | null> {
  const s = await shrinkFile(file);
  if (!s) return null;
  const hash = await hashFile(s.file);
  db.prepare("UPDATE photos SET path = ?, file = ?, size_bytes = ?, mtime = ?, hash = ?, file_type = CASE WHEN file_type IN ('PNG', 'TIF', 'TIFF') THEN 'JPG' ELSE file_type END WHERE path = ?")
    .run(s.file, path.basename(s.file), s.after, Math.floor(fs.statSync(s.file).mtimeMs), hash, file);
  return { file: s.file, before: s.before, after: s.after };
}

export type Original = { stream: ReadableStream; size: number; name: string };
/**
 * The full-size original of a photograph Frames holds only a smaller copy of: fetched from the cloud account it came from, now. Null when the
 * photograph is not one of those (use the file Frames has). Throws a CloudError, in plain words, when the original cannot be fetched.
 */
export async function remoteOriginal(db: DB, cfg: AppCfg, file: string): Promise<Original | null> {
  const rel = path.relative(path.join(cfg.dataDir, 'cloud'), file);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return null;
  const [connId, ...rest] = rel.split(path.sep);
  const row = db.prepare('SELECT remote_id, version, orig_size, remote_name FROM cloud_files WHERE conn_id = ? AND rel = ? AND shrunk = 1').get(connId, rest.join('/')) as { remote_id: string; version: string; orig_size: number; remote_name: string } | undefined;
  if (!row) return null;
  const conn = loadCloud(db).connections.find((c) => c.id === connId);
  if (!conn) throw new CloudError('This photograph is kept as a smaller copy and its original is in a cloud account that has been disconnected. Connect that account again to get the original.');
  if (conn.needsReconnect) throw new CloudError(`The original is in your ${PROVIDERS.find((p) => p.id === conn.provider)?.label ?? 'cloud'} account, which needs to be reconnected (Settings, Cloud sync).`);
  let r: Response;
  try { r = await adapters[conn.provider].download(http(db, cfg, conn), urls(cfg, conn.provider), { id: row.remote_id, name: row.remote_name, folder: false, size: row.orig_size, version: row.version }); }
  catch (e) { throw new CloudError(`The original could not be fetched from ${conn.account || 'the cloud account'}: ${msg(e)}`); }
  if (!r.body) throw new CloudError('The cloud account sent an empty answer.');
  return { stream: Readable.fromWeb(r.body as any) as unknown as ReadableStream, size: row.orig_size || Number(r.headers.get('content-length')) || 0, name: row.remote_name || path.basename(file) };
}

export type Progress = { running: boolean; connId: string | null; downloaded: number; current: string };
const progresses = new Map<string, Progress>();
/** What a person's sync is doing right now (one sync at a time per person). */
export const progressOf = (cfg: AppCfg): Progress => { let p = progresses.get(cfg.dataDir); if (!p) { p = { running: false, connId: null, downloaded: 0, current: '' }; progresses.set(cfg.dataDir, p); } return p; };

export async function syncConnection(db: DB, cfg: AppCfg, id: string): Promise<SyncResult> {
  const c0 = loadCloud(db).connections.find((c) => c.id === id);
  if (!c0) throw new CloudError('No such connection.');
  if (foldersOf(c0).length === 0) throw new CloudError('Choose at least one folder to sync first.');
  const progress = progressOf(cfg);
  if (progress.running) throw new CloudError('A cloud sync is already running.');
  Object.assign(progress, { running: true, connId: id, downloaded: 0, current: '' });
  const res: SyncResult = { downloaded: 0, skipped: 0, changedRemotely: 0, errors: [], error: null, bytes: 0 };
  const dest = path.join(cfg.dataDir, 'cloud', id);
  const tmpDir = path.join(cfg.dataDir, 'tmp');
  fs.mkdirSync(dest, { recursive: true });
  fs.mkdirSync(tmpDir, { recursive: true });
  const a = adapters[c0.provider];
  const u = urls(cfg, c0.provider);
  const h = http(db, cfg, c0);
  const shrinkOn = !!c0.shrink || shrinkEnforced(db);
  const known = db.prepare('SELECT version, rel, shrunk FROM cloud_files WHERE conn_id = ? AND remote_id = ?');
  const taken = db.prepare('SELECT remote_id FROM cloud_files WHERE conn_id = ? AND rel = ?');
  const add = db.prepare('INSERT INTO cloud_files (conn_id, remote_id, rel, version, size, synced, shrunk, orig_size, orig_w, orig_h, remote_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  const shrinkRow = db.prepare('UPDATE cloud_files SET rel = ?, shrunk = 1, orig_size = ?, orig_w = ?, orig_h = ?, remote_name = ?, size = ? WHERE conn_id = ? AND remote_id = ?');
  try {
    const seen = new Set<string>();
    const queue: { id: string; rel: string[]; depth: number }[] = foldersOf(c0).map((f) => ({ id: f.id, rel: [] as string[], depth: 0 })); // each chosen folder, with everything inside it
    let entries = 0;
    while (queue.length) {
      const f = queue.shift()!;
      if (seen.has(f.id) || f.depth > MAX_DEPTH) continue;
      seen.add(f.id);
      let list: Entry[];
      try { list = await a.list(h, u, f.id); } catch (e) { if (e instanceof CloudError && e.reconnect) throw e; res.errors.push(`${f.rel.join('/') || 'top folder'}: ${msg(e)}`); continue; }
      for (const e of list) {
        if (++entries > MAX_ENTRIES) throw new CloudError('That folder holds too many items.');
        if (e.folder) { queue.push({ id: e.id, rel: [...f.rel, safeName(e.name)], depth: f.depth + 1 }); continue; }
        if (!ALLOWED.has(path.extname(e.name).toLowerCase())) continue;
        const prior = known.get(id, e.id) as { version: string; rel: string; shrunk: number } | undefined;
        if (prior) {
          if (prior.version !== e.version) { res.changedRemotely++; continue; }
          // Still the same in the cloud, so this is the moment it is safe to keep only a smaller copy here.
          if (shrinkOn && !prior.shrunk) {
            const local = path.join(dest, ...prior.rel.split('/'));
            if (fs.existsSync(local) && path.resolve(local).startsWith(dest + path.sep)) {
              try {
                const meta = await sharp(local, { failOn: 'none' }).metadata().catch(() => null);
                const done = await shrinkKnown(db, local);
                if (done) {
                  shrinkRow.run(path.relative(dest, done.file).split(path.sep).join('/'), done.before, meta?.width ?? 0, meta?.height ?? 0, e.name, done.after, id, e.id);
                  res.shrunk = (res.shrunk ?? 0) + 1; res.freed = (res.freed ?? 0) + (done.before - done.after);
                  progress.current = e.name;
                  continue;
                }
              } catch (err) { res.errors.push(`${e.name}: could not make a smaller copy (${msg(err)})`); }
            }
          }
          res.skipped++; continue;
        }
        if (path.extname(e.name).toLowerCase() === '.xmp' && e.size > MAX_SIDECAR) { res.errors.push(`${e.name}: a metadata file larger than ${MAX_SIDECAR / 1048576} MB`); continue; }
        if (e.size > MAX_FILE) { res.errors.push(`${e.name}: larger than the ${MAX_FILE / 1048576} MB limit`); continue; }
        let name = safeName(e.name);
        let rel = [...f.rel, name].join('/');
        if (taken.get(id, rel)) { const x = path.extname(name); name = `${name.slice(0, name.length - x.length)} (${e.id.replace(/\W/g, '').slice(-6)})${x}`; rel = [...f.rel, name].join('/'); }
        const target = path.join(dest, ...rel.split('/'));
        if (!path.resolve(target).startsWith(dest + path.sep)) { res.errors.push(`${e.name}: unsafe name`); continue; }
        progress.current = e.name;
        const part = path.join(tmpDir, `cloud-${crypto.randomBytes(6).toString('hex')}.part`);
        try {
          const r = await a.download(h, u, e);
          if (!r.body) throw new CloudError('empty answer');
          await pipeline(Readable.fromWeb(r.body as any), fs.createWriteStream(part));
          const got = fs.statSync(part).size;
          if (e.size && got !== e.size) throw new CloudError(`incomplete download (${got} of ${e.size} bytes)`);
          fs.mkdirSync(path.dirname(target), { recursive: true });
          fs.renameSync(part, target);
          // Asked to keep only smaller copies: make it now, before Frames ever sees the full-size file, and remember what the original was.
          let finalRel = rel, shrunk = 0, ow = 0, oh = 0, keptSize = got;
          if (shrinkOn) {
            const meta = await sharp(target, { failOn: 'none' }).metadata().catch(() => null);
            const sh = await shrinkFile(target);
            if (sh) { finalRel = path.relative(dest, sh.file).split(path.sep).join('/'); shrunk = 1; ow = meta?.width ?? sh.w; oh = meta?.height ?? sh.h; keptSize = sh.after; res.shrunk = (res.shrunk ?? 0) + 1; res.freed = (res.freed ?? 0) + (sh.before - sh.after); }
          }
          add.run(id, e.id, finalRel, e.version, keptSize, new Date().toISOString(), shrunk, got, ow, oh, e.name);
          res.downloaded++; res.bytes += got; progress.downloaded = res.downloaded;
        } catch (err) {
          fs.rmSync(part, { force: true });
          if (err instanceof CloudError && err.reconnect) throw err;
          res.errors.push(`${e.name}: ${msg(err)}`);
        }
      }
    }
  } catch (e) {
    res.error = msg(e);
    if (e instanceof CloudError && e.reconnect) markReconnect(db, id);
  } finally {
    res.errors = res.errors.slice(0, 20);
    const cfgNow = loadCloud(db);
    const c = cfgNow.connections.find((x) => x.id === id);
    if (c) { c.lastSync = new Date().toISOString(); c.lastResult = res; saveCloud(db, cfgNow); }
    Object.assign(progress, { running: false, connId: null, current: '' });
  }
  return res;
}
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 240);
function markReconnect(db: DB, id: string) {
  const c = loadCloud(db);
  const x = c.connections.find((k) => k.id === id);
  if (x) { x.needsReconnect = true; x.enabled = false; saveCloud(db, c); }
}

export function removeConnection(db: DB, id: string) {
  const c = loadCloud(db);
  c.connections = c.connections.filter((x) => x.id !== id);
  saveCloud(db, c);
  saveTokens(db, id, null);
  db.prepare('DELETE FROM cloud_files WHERE conn_id = ? AND shrunk = 0').run(id); // the photos already downloaded stay. Smaller copies keep their record: it is how their original is found again
}
