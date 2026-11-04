import type { FastifyInstance } from 'fastify';
import { beginConnect, CloudError, clientOf, shrinkEnforced, finishConnect, isProvider, listFolders, loadCloud, loadClients, PROVIDERS, progressOf, removeConnection, saveCloud, saveClients, syncConnection, validFolderId } from '../cloud.js';
import { setSecret } from '../ai.js';
import type { Ctx, Row } from '../ctx.js';

/** Settings, Cloud sync: connect Google Drive / Dropbox / OneDrive, pick a folder, and copy its photographs in. */
export function registerCloud(app: FastifyInstance, x: Ctx) {
  const { db, cfg } = x;
  const redirect = (req: any) => `${x.baseUrl(req)}/api/cloud/callback`;
  const fail = (rep: any, e: unknown) => rep.code(e instanceof CloudError ? 400 : 500).send({ error: e instanceof CloudError ? e.message : 'Something went wrong. Check the server log.' });

  const dto = () => {
    const c = loadCloud(db);
    return {
      // Everyone sees which services can be connected; only an administrator sees (and edits) the app registration behind them.
      providers: PROVIDERS.map((p) => { const k = clientOf(cfg, db, p.id); return { ...p, configured: !!k.clientId, ...(x.tenant().user.role === 'admin' ? { clientId: k.clientId, hasSecret: !!k.secret } : {}) }; }),
      connections: c.connections, // holds no tokens: those are kept apart as secrets
      shrinkEnforced: shrinkEnforced(db), // an administrator requires smaller copies for everyone
      progress: { ...progressOf(cfg) },
    };
  };
  app.get('/api/cloud', async (req) => ({ ...dto(), redirectUri: redirect(req) }));

  // The app's own client id (and optional secret) from the provider's developer console. Write-only.
  app.put('/api/cloud/client/:provider', async (req, rep) => {
    const { provider } = req.params as Row;
    if (!isProvider(provider)) return x.notFound(rep);
    const b = (req.body ?? {}) as Row;
    const c = loadClients(x.sys);
    if (typeof b.clientId === 'string') {
      const id = b.clientId.trim();
      if (id.length > 300) return rep.code(400).send({ error: 'That client ID is too long.' });
      c[provider] = { clientId: id };
    }
    if (typeof b.clientSecret === 'string' && b.clientSecret.trim()) {
      if (b.clientSecret.length > 500) return rep.code(400).send({ error: 'That secret is too long.' });
      setSecret(x.sys, `cloud:client:${provider}`, b.clientSecret.trim());
    }
    if (b.clearSecret === true) setSecret(x.sys, `cloud:client:${provider}`, '');
    saveClients(x.sys, c);
    return dto();
  });

  // Step 1: send the browser to the provider's consent page. Step 2 is the callback below.
  app.post('/api/cloud/connect/:provider', async (req, rep) => {
    const { provider } = req.params as Row;
    if (!isProvider(provider)) return x.notFound(rep);
    try { return { url: beginConnect(db, cfg, provider, redirect(req)) }; } catch (e) { return fail(rep, e); }
  });
  app.get('/api/cloud/callback', async (req, rep) => {
    const q = req.query as Row;
    const back = (m: string) => rep.redirect(`/settings?cloud=${encodeURIComponent(m)}`);
    if (typeof q.error === 'string') return back('The provider did not grant access.');
    if (typeof q.code !== 'string' || typeof q.state !== 'string') return back('The sign-in did not complete.');
    try { await finishConnect(db, cfg, q.code, q.state, redirect(req)); return back('connected'); } catch (e) { return back(e instanceof CloudError ? e.message : 'The sign-in failed.'); }
  });

  const conn = (req: any) => loadCloud(db).connections.find((c) => c.id === (req.params as Row).id);

  app.get('/api/cloud/:id/folders', async (req, rep) => {
    const c = conn(req);
    if (!c) return x.notFound(rep);
    const parent = (req.query as Row).parent;
    try { return await listFolders(db, cfg, c, typeof parent === 'string' && parent !== '' ? parent : null); } catch (e) { return fail(rep, e); }
  });

  app.put('/api/cloud/:id', async (req, rep) => {
    const all = loadCloud(db);
    const c = all.connections.find((k) => k.id === (req.params as Row).id);
    if (!c) return x.notFound(rep);
    const b = (req.body ?? {}) as Row;
    if (b.folders !== undefined) {
      // Several folders: each with its subfolders. "Everything in this account" is the root folder, on its own.
      if (!Array.isArray(b.folders) || b.folders.length > 50) return rep.code(400).send({ error: 'Choose up to 50 folders.' });
      const list: { id: string; name: string }[] = [];
      for (const f of b.folders as Row[]) {
        if (!f || typeof f.id !== 'string' || !validFolderId(c.provider, f.id)) return rep.code(400).send({ error: 'Not a folder.' });
        if (!list.some((x) => x.id === f.id)) list.push({ id: f.id, name: typeof f.name === 'string' ? f.name.slice(0, 300) : '' });
      }
      c.folders = list; c.folderId = list[0]?.id ?? null; c.folderName = list[0]?.name ?? '';
      if (list.length === 0) c.enabled = false; // nothing to keep up to date
    }
    if (b.folderId !== undefined) {
      if (typeof b.folderId !== 'string' || !validFolderId(c.provider, b.folderId)) return rep.code(400).send({ error: 'Not a folder.' });
      c.folderId = b.folderId;
      c.folderName = typeof b.folderName === 'string' ? b.folderName.slice(0, 200) : '';
      c.folders = [{ id: c.folderId, name: c.folderName }]; // the older way of choosing one folder
    }
    if (b.intervalMin !== undefined) {
      const n = Number(b.intervalMin);
      if (!Number.isInteger(n) || (n !== 0 && (n < 15 || n > 10080))) return rep.code(400).send({ error: 'Choose off, or every 15 minutes to every week.' });
      c.intervalMin = n;
    }
    if (b.enabled !== undefined) {
      if (b.enabled === true && (!(c.folders ?? []).length || c.needsReconnect)) return rep.code(400).send({ error: c.needsReconnect ? 'Reconnect the account first.' : 'Choose a folder first.' });
      c.enabled = !!b.enabled;
    }
    if (b.shrink !== undefined) c.shrink = b.shrink === true;
    saveCloud(db, all);
    return dto();
  });

  app.delete('/api/cloud/:id', async (req, rep) => {
    if (!conn(req)) return x.notFound(rep);
    removeConnection(db, (req.params as Row).id);
    return dto();
  });

  // Copy now. Runs in the background; the page polls GET /api/cloud for progress. ?wait=1 holds the request (scripts, tests).
  const run = async (id: string) => {
    const r = await syncConnection(db, cfg, id);
    if (r.downloaded > 0 && !x.scanning()) void x.startScan().catch(() => {});
    return r;
  };
  app.post('/api/cloud/:id/sync', async (req, rep) => {
    const c = conn(req);
    if (!c) return x.notFound(rep);
    if (c.folderId === null) return rep.code(400).send({ error: 'Choose a folder first.' });
    if (progressOf(cfg).running) return rep.code(409).send({ error: 'A cloud sync is already running.' });
    const p = run(c.id);
    if ((req.query as Row).wait === '1') { try { return await p; } catch (e) { return fail(rep, e); } }
    p.catch(() => {});
    return rep.code(202).send({ started: true });
  });

  // Scheduled syncs: once a minute, for each person, whichever of their connections are due.
  setInterval(() => {
    let people: ReturnType<typeof x.tenants.all> = [];
    try { people = x.tenants.all(); } catch (e) { console.error('Scheduled cloud sync could not list people', e); }
    for (const t of people) {
      try {
        x.tenants.run(t, () => {
          if (progressOf(cfg).running) return;
          const now = Date.now();
          const due = loadCloud(db).connections.find((c) => c.enabled && !c.needsReconnect && c.folderId !== null && c.intervalMin > 0 && (!c.lastSync || now - Date.parse(c.lastSync) >= c.intervalMin * 60_000));
          if (due) run(due.id).catch(() => {});
        });
      } catch (e) { console.error(`Scheduled cloud sync could not run for person ${t.user.id}`, e); } // one person's problem never stops the others
    }
  }, 60_000).unref();
}
