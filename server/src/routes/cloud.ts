import type { FastifyInstance } from 'fastify';
import { beginConnect, CloudError, clientSecret, finishConnect, isProvider, listFolders, loadCloud, PROVIDERS, progressOf, removeConnection, saveCloud, setClientSecret, syncConnection, validFolderId } from '../cloud.js';
import type { Ctx, Row } from '../ctx.js';

/** Settings, Cloud sync: connect Google Drive / Dropbox / OneDrive, pick a folder, and copy its photographs in. */
export function registerCloud(app: FastifyInstance, x: Ctx) {
  const { db, cfg } = x;
  const redirect = (req: any) => `${x.baseUrl(req)}/api/cloud/callback`;
  const fail = (rep: any, e: unknown) => rep.code(e instanceof CloudError ? 400 : 500).send({ error: e instanceof CloudError ? e.message : 'Something went wrong. Check the server log.' });

  const dto = () => {
    const c = loadCloud(db);
    return {
      providers: PROVIDERS.map((p) => ({ ...p, clientId: c.clients[p.id]?.clientId ?? '', hasSecret: !!clientSecret(db, p.id) })),
      connections: c.connections, // holds no tokens: those are kept apart as secrets
      progress: { ...progressOf(cfg) },
    };
  };
  app.get('/api/cloud', async (req) => ({ ...dto(), redirectUri: redirect(req) }));

  // The app's own client id (and optional secret) from the provider's developer console. Write-only.
  app.put('/api/cloud/client/:provider', async (req, rep) => {
    const { provider } = req.params as Row;
    if (!isProvider(provider)) return x.notFound(rep);
    const b = (req.body ?? {}) as Row;
    const c = loadCloud(db);
    if (typeof b.clientId === 'string') {
      const id = b.clientId.trim();
      if (id.length > 300) return rep.code(400).send({ error: 'That client ID is too long.' });
      c.clients[provider] = { clientId: id };
    }
    if (typeof b.clientSecret === 'string' && b.clientSecret.trim()) {
      if (b.clientSecret.length > 500) return rep.code(400).send({ error: 'That secret is too long.' });
      setClientSecret(db, provider, b.clientSecret.trim());
    }
    if (b.clearSecret === true) setClientSecret(db, provider, '');
    saveCloud(db, c);
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
    if (b.folderId !== undefined) {
      if (typeof b.folderId !== 'string' || !validFolderId(c.provider, b.folderId)) return rep.code(400).send({ error: 'Not a folder.' });
      c.folderId = b.folderId;
      c.folderName = typeof b.folderName === 'string' ? b.folderName.slice(0, 200) : '';
    }
    if (b.intervalMin !== undefined) {
      const n = Number(b.intervalMin);
      if (!Number.isInteger(n) || (n !== 0 && (n < 15 || n > 10080))) return rep.code(400).send({ error: 'Choose off, or every 15 minutes to every week.' });
      c.intervalMin = n;
    }
    if (b.enabled !== undefined) {
      if (b.enabled === true && (c.folderId === null || c.needsReconnect)) return rep.code(400).send({ error: c.needsReconnect ? 'Reconnect the account first.' : 'Choose a folder first.' });
      c.enabled = !!b.enabled;
    }
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
    for (const t of x.tenants.all()) {
      x.tenants.run(t, () => {
        if (progressOf(cfg).running) return;
        const now = Date.now();
        const due = loadCloud(db).connections.find((c) => c.enabled && !c.needsReconnect && c.folderId !== null && c.intervalMin > 0 && (!c.lastSync || now - Date.parse(c.lastSync) >= c.intervalMin * 60_000));
        if (due) run(due.id).catch(() => {});
      });
    }
  }, 60_000).unref();
}
