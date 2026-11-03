import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import multipart from '@fastify/multipart';
import type { FastifyInstance } from 'fastify';
import { aiConfig, aiCounts, getSecret, ping, setSecret } from '../ai.js';
import { IMAGE_EXT, internalDir, rebuild } from '../ingest.js';
import { loadSettings } from '../settings.js';
import type { Ctx, Row } from '../ctx.js';
import { buildXmp, isOurs } from '../xmp.js';

export function registerLibrary(app: FastifyInstance, x: Ctx) {
  const { db, cfg, num, one, all, notFound } = x;

  // ---------- photoshoots ----------
  const validDate = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null);

  app.post('/api/shoots', async (req, rep) => {
    const b = (req.body ?? {}) as Row;
    const name = String(b.name ?? '').trim();
    if (!name) return rep.code(400).send({ error: 'name required' });
    const id = Number(db.prepare('INSERT INTO shoots(name, source, place, description, imported_at) VALUES(?, ?, ?, ?, ?)')
      .run(name.slice(0, 120), 'Manual', String(b.place ?? '').slice(0, 120), String(b.description ?? '').slice(0, 1000), new Date().toISOString()).lastInsertRowid);
    // Optionally start it with photographs (used when accepting a suggested grouping).
    for (const pid of Array.isArray(b.photoIds) ? b.photoIds : []) db.prepare('UPDATE photos SET shoot_id = ? WHERE id = ?').run(id, num(pid));
    return x.shootDto(one('SELECT * FROM shoots WHERE id = ?', id)!);
  });
  app.get('/api/shoots/:id', async (req, rep) => {
    const s = one('SELECT * FROM shoots WHERE id = ?', num((req.params as Row).id));
    return s ? x.shootDto(s) : notFound(rep);
  });
  app.patch('/api/shoots/:id', async (req, rep) => {
    const id = num((req.params as Row).id);
    if (!one('SELECT 1 x FROM shoots WHERE id = ?', id)) return notFound(rep);
    const b = (req.body ?? {}) as Row;
    if (typeof b.name === 'string' && b.name.trim()) db.prepare('UPDATE shoots SET name = ? WHERE id = ?').run(b.name.trim().slice(0, 120), id);
    if (typeof b.place === 'string') db.prepare('UPDATE shoots SET place = ? WHERE id = ?').run(b.place.slice(0, 120), id);
    if (typeof b.description === 'string') db.prepare('UPDATE shoots SET description = ? WHERE id = ?').run(b.description.slice(0, 1000), id);
    if ('dateFrom' in b) db.prepare('UPDATE shoots SET date_from = ? WHERE id = ?').run(validDate(b.dateFrom), id);
    if ('dateTo' in b) db.prepare('UPDATE shoots SET date_to = ? WHERE id = ?').run(validDate(b.dateTo), id);
    return x.shootDto(one('SELECT * FROM shoots WHERE id = ?', id)!);
  });
  app.post('/api/shoots/:id/move', async (req, rep) => {
    const id = num((req.params as Row).id);
    if (!one('SELECT 1 x FROM shoots WHERE id = ?', id)) return notFound(rep);
    for (const pid of ((((req.body ?? {}) as Row).photoIds as unknown[]) ?? []).slice(0, 5000)) db.prepare('UPDATE photos SET shoot_id = ? WHERE id = ?').run(id, num(pid));
    return x.shootDto(one('SELECT * FROM shoots WHERE id = ?', id)!);
  });

  /**
   * Suggests splitting a photoshoot where its photographs clearly came from different places or days:
   * a different folder, or a different capture date. Nothing changes until the user accepts a suggestion.
   */
  app.get('/api/shoots/suggestions', async () => {
    const out: { shootId: number; shootName: string; groups: { name: string; reason: string; photoIds: number[] }[] }[] = [];
    for (const s of all('SELECT id, name FROM shoots')) {
      const photos = all('SELECT id, path, captured_at, added_at, camera FROM photos WHERE shoot_id = ?', s.id);
      if (photos.length < 4) continue;
      const groups = new Map<string, { folder: string; day: string; ids: number[] }>();
      for (const p of photos) {
        const folder = path.basename(path.dirname(p.path));
        const day = p.captured_at ? String(p.captured_at).slice(0, 10) : '';
        const key = `${folder}|${day}`;
        const g = groups.get(key) ?? groups.set(key, { folder, day, ids: [] }).get(key)!;
        g.ids.push(p.id);
      }
      // Photos with no capture date can't say which day they belong to: they join the biggest dated group in their folder.
      for (const g of [...groups.values()].filter((g) => !g.day)) {
        const home = [...groups.values()].filter((o) => o.folder === g.folder && o.day).sort((a, b) => b.ids.length - a.ids.length)[0];
        if (home) { home.ids.push(...g.ids); groups.delete(`${g.folder}|`); }
      }
      const big = [...groups.values()].filter((g) => g.ids.length >= 2);
      if (big.length < 2) continue;
      const sameFolder = new Set(big.map((g) => g.folder)).size === 1;
      const sameDay = new Set(big.map((g) => g.day)).size === 1;
      out.push({
        shootId: s.id, shootName: s.name,
        groups: big.map((g) => ({
          name: sameFolder ? g.day : sameDay ? g.folder : `${g.folder} · ${g.day}`,
          reason: sameFolder ? 'Taken on a different day' : sameDay ? 'From a different folder' : 'Different folder and day',
          photoIds: g.ids,
        })),
      });
    }
    return out;
  });

  // ---------- metadata: XMP ----------
  const exportable = (p: Row) => {
    const kw = all("SELECT name FROM tags WHERE photo_id = ? AND accepted = 1 ORDER BY kind DESC, name", p.id).map((t) => t.name as string);
    const ratings = all('SELECT rating FROM reviews WHERE photo_id = ?', p.id).map((r) => r.rating as number);
    // Only what the user has approved: their title and description, accepted tags, and the average of their reviews.
    return { title: p.title_user ? p.title : '', description: p.desc_source === 'user' ? p.description : '', keywords: kw, rating: ratings.length ? Math.round(ratings.reduce((a, b) => a + b, 0) / ratings.length) : null };
  };
  app.get('/api/photos/:id/xmp', async (req, rep) => {
    const p = one('SELECT * FROM photos WHERE id = ?', num((req.params as Row).id));
    if (!p) return notFound(rep);
    return rep.header('Content-Type', 'application/rdf+xml').header('Content-Disposition', `attachment; filename="${String(p.file).replace(/[^\w.-]/g, '_')}.xmp"`).send(buildXmp(exportable(p)));
  });

  /**
   * Writes sidecars. They always go to the data folder. With "write back" on they are also written beside the originals,
   * but never over a sidecar another program made, and never into the image file itself.
   */
  app.post('/api/metadata/export', async (req) => {
    const ids = ((((req.body ?? {}) as Row).photoIds as unknown[]) ?? []).map((v) => num(v));
    const photos = ids.length ? ids.map((i) => one('SELECT * FROM photos WHERE id = ?', i)).filter((p): p is Row => !!p) : all('SELECT * FROM photos');
    const writeBack = loadSettings(db).xmpWriteBack;
    const dir = path.join(cfg.dataDir, 'xmp');
    fs.mkdirSync(dir, { recursive: true });
    const r = { written: 0, writtenBeside: 0, skipped: [] as { file: string; reason: string }[] };
    for (const p of photos) {
      const xml = buildXmp(exportable(p));
      fs.writeFileSync(path.join(dir, `${p.id}_${String(p.file).replace(/[^\w.-]/g, '_')}.xmp`), xml);
      r.written++;
      if (!writeBack) continue;
      const target = `${p.path}.xmp`;
      try {
        if (fs.existsSync(target) && !isOurs(fs.readFileSync(target, 'utf8'))) { r.skipped.push({ file: p.file, reason: 'A sidecar from another program already exists' }); continue; }
        fs.writeFileSync(target, xml);
        r.writtenBeside++;
      } catch { r.skipped.push({ file: p.file, reason: 'The library folder is read-only' }); }
    }
    return r;
  });
  app.get('/api/metadata/conflicts', async () => all(`SELECT c.photo_id photoId, c.field, c.mine, c.theirs, p.title, p.file FROM xmp_conflicts c JOIN photos p ON p.id = c.photo_id ORDER BY c.photo_id`));
  app.post('/api/metadata/resolve', async (req, rep) => {
    const b = (req.body ?? {}) as Row;
    const c = one('SELECT * FROM xmp_conflicts WHERE photo_id = ? AND field = ?', num(b.photoId), String(b.field));
    if (!c) return notFound(rep);
    if (b.use === 'theirs') {
      if (c.field === 'title') db.prepare('UPDATE photos SET title = ?, title_user = 1 WHERE id = ?').run(c.theirs, c.photo_id);
      else if (c.field === 'description') db.prepare("UPDATE photos SET description = ?, desc_source = 'user' WHERE id = ?").run(c.theirs, c.photo_id);
    }
    db.prepare('DELETE FROM xmp_conflicts WHERE photo_id = ? AND field = ?').run(c.photo_id, c.field);
    return { ok: true };
  });

  // ---------- internally managed storage: upload ----------
  // Files land in the data folder's "originals" library and are imported like any other library file.
  void app.register(multipart, { limits: { fileSize: (cfg.maxUploadMb ?? 2048) * 1024 * 1024, files: 500 } }).after(() => {
    app.post('/api/upload', async (req, rep) => {
      const dir = internalDir(cfg);
      fs.mkdirSync(dir, { recursive: true });
      const saved: string[] = [], rejected: { file: string; reason: string }[] = [];
      for await (const part of (req as any).files()) {
        // Only the base name is used, so a crafted name cannot write outside the folder.
        const base = path.basename(String(part.filename ?? '')).replace(/[^\w. -]/g, '_');
        if (!base || base.startsWith('.') || !IMAGE_EXT.has(path.extname(base).toLowerCase())) { rejected.push({ file: base || '(unnamed)', reason: 'Not a supported photo type' }); part.file.resume(); continue; }
        let name = base, n = 1;
        while (fs.existsSync(path.join(dir, name))) name = `${path.basename(base, path.extname(base))}-${n++}${path.extname(base)}`;
        const tmp = path.join(dir, `.upload-${process.pid}-${Date.now()}-${n}`);
        try {
          await pipeline(part.file, fs.createWriteStream(tmp));
          if (part.file.truncated) { fs.rmSync(tmp, { force: true }); rejected.push({ file: base, reason: 'Too large' }); continue; }
          fs.renameSync(tmp, path.join(dir, name));
          saved.push(name);
        } catch { fs.rmSync(tmp, { force: true }); rejected.push({ file: base, reason: 'Upload failed' }); }
      }
      if (!saved.length && !rejected.length) return rep.code(400).send({ error: 'No files received' });
      return { saved, rejected };
    });
  });

  // ---------- backup and recovery ----------
  app.get('/api/backup', async (_req, rep) => {
    const dir = path.join(cfg.dataDir, 'backups');
    fs.mkdirSync(dir, { recursive: true });
    const f = path.join(dir, `download-${Date.now()}.db`);
    await db.backup(f);
    // The copy must not carry the AI key.
    const Database = (await import('better-sqlite3')).default;
    const c = new Database(f);
    c.prepare("DELETE FROM settings WHERE key LIKE 'secret:%'").run();
    c.exec('VACUUM');
    c.close();
    const stamp = new Date().toISOString().slice(0, 10);
    rep.raw.on('close', () => fs.rmSync(f, { force: true }));
    return rep.header('Content-Type', 'application/octet-stream').header('Content-Disposition', `attachment; filename="frames-backup-${stamp}.db"`).header('Content-Length', String(fs.statSync(f).size)).send(fs.createReadStream(f));
  });
  app.get('/api/backup/list', async () => {
    const dir = path.join(cfg.dataDir, 'backups');
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir).filter((n) => n.startsWith('auto-')).sort().reverse().map((n) => ({ name: n, bytes: fs.statSync(path.join(dir, n)).size }));
  });

  // Regenerate previews and analysis for photos that lack them (or everything with ?all=1). Originals are only read.
  const rb = { running: false, done: 0, total: 0, result: null as null | { checked: number; rebuilt: number } };
  app.post('/api/library/rebuild', async (req, rep) => {
    if (rb.running) return rep.code(409).send({ error: 'Already rebuilding' });
    Object.assign(rb, { running: true, done: 0, total: 0, result: null });
    const p = rebuild(db, cfg, (req.query as Row).all === '1', (d, t) => { rb.done = d; rb.total = t; }).then((r) => { rb.result = r; }).finally(() => { rb.running = false; });
    if ((req.query as Row).wait === '1') { await p; return rb; }
    return rep.code(202).send({ started: true });
  });
  app.get('/api/library/rebuild/status', async () => rb);

  // ---------- AI ----------
  const aiStatus = () => ({ enabled: !!aiConfig(db), ...aiCounts(db), ...x.ai.state });
  app.get('/api/ai/status', async () => aiStatus());
  app.post('/api/ai/run', async (req, rep) => {
    if (!aiConfig(db)) return rep.code(400).send({ error: 'AI is off or not fully set up' });
    if ((req.query as Row).retry === '1') db.prepare("UPDATE photos SET ai_attempts = 0 WHERE ai_status = 'error'").run();
    const p = x.ai.run();
    if ((req.query as Row).wait === '1') { await p; return aiStatus(); }
    return rep.code(202).send({ started: true });
  });
  app.post('/api/ai/test', async (_req, rep) => {
    const c = aiConfig(db);
    if (!c) return rep.code(400).send({ ok: false, detail: 'AI is off or not fully set up' });
    return ping(c);
  });
  // The key is write-only: it is stored, used, and never sent back to the browser.
  app.put('/api/ai/key', async (req) => {
    setSecret(db, 'aiKey', String(((req.body ?? {}) as Row).key ?? '').slice(0, 500));
    return { hasKey: !!getSecret(db, 'aiKey') };
  });
  app.get('/api/ai/key', async () => ({ hasKey: !!getSecret(db, 'aiKey') }));
}
