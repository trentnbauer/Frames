import type { AppCfg } from './ctx.js';
import { backupHttp, CloudError, urls, type ProviderId } from './cloud.js';
import type { DB } from './db.js';

/**
 * Putting the daily server archive in a Dropbox, Google Drive or OneDrive account: one folder, "Frames backups", that Frames makes
 * and keeps to itself. It uses the administrator's own backup connection (its own sign-in, with write access to that folder; the
 * connections people use to read photographs never get write access). Four operations, one store per provider.
 */
export type Store = {
  put(name: string, data: Buffer): Promise<void>;
  list(): Promise<{ name: string; bytes: number; at: string }[]>;
  get(name: string): Promise<Buffer>;
  del(name: string): Promise<void>;
};
export const FOLDER = 'Frames backups';
const gone = (e: unknown) => e instanceof CloudError && /answered (404|409)\b/.test(e.message); // the folder is not there yet
const bytesOf = async (r: Response) => Buffer.from(await r.arrayBuffer());
const jsonOf = async (r: Response) => (await r.json()) as any;
const enc = encodeURIComponent;

export function cloudStore(sys: DB, cfg: AppCfg, provider: ProviderId): Store {
  const h = backupHttp(sys, cfg, provider);
  const u = urls(cfg, provider);

  if (provider === 'dropbox') {
    const path = (n: string) => `/${FOLDER}/${n}`;
    return {
      // shortcut: one request, which Dropbox allows up to 150 MB; an archive past that needs an upload session, so it is refused plainly.
      async put(name, data) {
        if (data.length > 140 * 1024 * 1024) throw new CloudError('This backup is over 140 MB, more than Dropbox takes in one go here. Use S3 for archives this big.');
        await h(`${u.content}/files/upload`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream', 'Dropbox-API-Arg': JSON.stringify({ path: path(name), mode: 'overwrite', mute: true }) }, body: new Uint8Array(data), timeout: 15 * 60_000 });
      },
      async list() {
        try {
          const j = await jsonOf(await h(`${u.api}/files/list_folder`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: `/${FOLDER}`, limit: 2000 }) }));
          return (j.entries ?? []).filter((e: any) => e['.tag'] === 'file').map((e: any) => ({ name: String(e.name), bytes: Number(e.size) || 0, at: String(e.server_modified ?? '') }));
        } catch (e) { if (gone(e)) return []; throw e; }
      },
      get: async (name) => bytesOf(await h(`${u.content}/files/download`, { method: 'POST', headers: { 'Dropbox-API-Arg': JSON.stringify({ path: path(name) }) }, timeout: 15 * 60_000 })),
      async del(name) { await h(`${u.api}/files/delete_v2`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: path(name) }) }); },
    };
  }

  if (provider === 'google') {
    // With the drive.file permission Frames sees only what it made itself, so the folder it finds is its own.
    const folder = async (create: boolean): Promise<string | null> => {
      const q = new URLSearchParams({ q: `name='${FOLDER}' and mimeType='application/vnd.google-apps.folder' and trashed=false`, fields: 'files(id)' });
      const found = (await jsonOf(await h(`${u.api}/files?${q}`))).files?.[0]?.id as string | undefined;
      if (found || !create) return found ?? null;
      return (await jsonOf(await h(`${u.api}/files?fields=id`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: FOLDER, mimeType: 'application/vnd.google-apps.folder' }) }))).id;
    };
    const find = async (name: string) => {
      const f = await folder(false);
      if (!f) return null;
      const q = new URLSearchParams({ q: `'${f}' in parents and name='${name.replace(/['\\]/g, '')}' and trashed=false`, fields: 'files(id)' });
      return ((await jsonOf(await h(`${u.api}/files?${q}`))).files?.[0]?.id as string | undefined) ?? null;
    };
    return {
      async put(name, data) {
        const parent = (await folder(true))!;
        const start = await h(`${u.upload}/files?uploadType=resumable&fields=id`, { method: 'POST', headers: { 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': 'application/x-tar' }, body: JSON.stringify({ name, parents: [parent] }) });
        const to = start.headers.get('location');
        if (!to) throw new CloudError('Google Drive did not accept the upload.');
        await h(to, { method: 'PUT', headers: { 'Content-Type': 'application/x-tar' }, body: new Uint8Array(data), timeout: 15 * 60_000 });
      },
      async list() {
        const f = await folder(false);
        if (!f) return [];
        const q = new URLSearchParams({ q: `'${f}' in parents and trashed=false`, fields: 'files(name,size,modifiedTime)', pageSize: '1000' });
        return ((await jsonOf(await h(`${u.api}/files?${q}`))).files ?? []).map((e: any) => ({ name: String(e.name), bytes: Number(e.size) || 0, at: String(e.modifiedTime ?? '') }));
      },
      async get(name) { const id = await find(name); if (!id) throw new CloudError('That backup is not in Google Drive.'); return bytesOf(await h(`${u.api}/files/${enc(id)}?alt=media`, { timeout: 15 * 60_000 })); },
      async del(name) { const id = await find(name); if (id) await h(`${u.api}/files/${enc(id)}`, { method: 'DELETE' }); },
    };
  }

  // OneDrive: a session uploads the file in pieces (the simple upload stops at 4 MB). The session address is already authorised, so no token goes with it.
  const item = (n: string) => `${u.api}/me/drive/root:/${enc(FOLDER)}/${enc(n)}`;
  const CHUNK = 327_680 * 10; // a multiple of 320 KiB, as the service requires
  return {
    async put(name, data) {
      const s = await jsonOf(await h(`${item(name)}:/createUploadSession`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ item: { '@microsoft.graph.conflictBehavior': 'replace' } }) }));
      const url = String(s.uploadUrl ?? '');
      if (!(cfg.cloudBase ? url.startsWith(cfg.cloudBase) : url.startsWith('https://'))) throw new CloudError('OneDrive did not accept the upload.');
      for (let at = 0; at < data.length; at += CHUNK) {
        const part = data.subarray(at, Math.min(at + CHUNK, data.length));
        const r = await fetch(url, { method: 'PUT', headers: { 'Content-Length': String(part.length), 'Content-Range': `bytes ${at}-${at + part.length - 1}/${data.length}` }, body: new Uint8Array(part), signal: AbortSignal.timeout(15 * 60_000) });
        if (!r.ok) throw new CloudError(`OneDrive answered ${r.status} while uploading.`);
      }
    },
    async list() {
      try {
        const j = await jsonOf(await h(`${u.api}/me/drive/root:/${enc(FOLDER)}:/children?$select=name,size,lastModifiedDateTime,file&$top=200`));
        return (j.value ?? []).filter((e: any) => e.file).map((e: any) => ({ name: String(e.name), bytes: Number(e.size) || 0, at: String(e.lastModifiedDateTime ?? '') }));
      } catch (e) { if (gone(e)) return []; throw e; }
    },
    get: async (name) => bytesOf(await h(`${item(name)}:/content`, { timeout: 15 * 60_000 })),
    async del(name) { await h(item(name), { method: 'DELETE' }); },
  };
}
