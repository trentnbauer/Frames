import { policyOf } from '../policy.js';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import multipart from '@fastify/multipart';
import type { FastifyInstance } from 'fastify';
import { aiConfig, aiCounts, ping, sharedUsage } from '../ai.js';
import { JOBS, loadJobs, saveJob } from '../aiJobs.js';
import { AI_TYPES, aiType, applySource, BadSetting, getSource, isReady, loadShared, loadSources, newSource, removeSourceKey, saveSources, setSourceKey, sourceKey, whyNotReady, type AiCfg, type AiSource } from '../aisources.js';
import { scrubCopy } from '../backup.js';
import { cloudOnlyOriginals } from '../cloud.js';
import { removeShoot } from '../remove.js';
import { tenantProxy } from '../tenants.js';
import { IMAGE_EXT, internalDir, rebuild } from '../ingest.js';
import { loadSettings, saveSettings } from '../settings.js';
import type { Ctx, Row } from '../ctx.js';
import { getSetting, setSetting } from '../db.js';
import { applyGear, applyShootGear, cleanGear } from '../gear.js';
import { buildXmp, isOurs } from '../xmp.js';

/**
 * Gives a finished upload its final name without ever replacing a file that is already there. A hard link does that in one
 * step; some filesystems (network shares, certain volume drivers) refuse links, so those fall back to an exclusive copy.
 * Either way a taken name throws EEXIST and the caller tries the next one.
 */
function claimName(from: string, to: string) {
  try { fs.linkSync(from, to); } catch (e) {
    if (!['EPERM', 'ENOTSUP', 'EOPNOTSUPP', 'EXDEV', 'EMLINK', 'ENOSYS', 'EINVAL'].includes((e as NodeJS.ErrnoException).code ?? '')) throw e;
    fs.copyFileSync(from, to, fs.constants.COPYFILE_EXCL);
  }
}
const UPLOAD_REASONS: Record<string, string> = {
  EACCES: 'The server cannot write to its data folder. Check the data volume’s permissions',
  EPERM: 'The server cannot write to its data folder. Check the data volume’s permissions',
  EROFS: 'The data folder is read-only. Frames needs the data volume to be writable',
  ENOSPC: 'The disk is full',
  EDQUOT: 'The disk quota is used up',
};

export function registerLibrary(app: FastifyInstance, x: Ctx) {
  const { db, cfg, num, one, all, notFound } = x;

  // ---------- photoshoots ----------
  const validDate = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null);

  // ---- what a photoshoot passes down to its photographs ----
  // Place: filled in where a photograph has none of its own (or still has the shoot's old one). Subjects and tags: added to every photograph
  // as the person's own, marked as coming from the shoot so taking them off the shoot takes back only those. A photograph's own choices stay.
  const sharedOfShoot = (s: Row): { subjects: string[]; tags: string[] } => {
    try { const j = JSON.parse(s.shared || '{}'); return { subjects: Array.isArray(j.subjects) ? j.subjects : [], tags: Array.isArray(j.tags) ? j.tags : [] }; } catch { return { subjects: [], tags: [] }; }
  };
  const cleanNames = (v: unknown): string[] => [...new Set((Array.isArray(v) ? v : []).map((n) => String(n).trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 60)).filter(Boolean))].slice(0, 30);
  const inList = (ids: number[]) => ids.length ? `IN (${ids.map(Number).join(',')})` : 'IN (NULL)';
  const applyShoot = (shootId: number, only?: number[]) => {
    const s = one('SELECT * FROM shoots WHERE id = ?', shootId);
    if (!s) return { photos: 0 };
    const ids = (only ?? all('SELECT id FROM photos WHERE shoot_id = ?', shootId).map((r) => r.id as number)).filter((i) => !!one('SELECT 1 x FROM photos WHERE id = ? AND shoot_id = ?', i, shootId));
    if (s.place) db.prepare(`UPDATE photos SET place = ? WHERE place = '' AND id ${inList(ids)}`).run(s.place);
    const ins = db.prepare("INSERT OR IGNORE INTO tags(photo_id, name, source, accepted, kind) VALUES(?, ?, 'shoot', 1, ?)");
    const accept = db.prepare("UPDATE tags SET accepted = 1, source = 'shoot', kind = ? WHERE photo_id = ? AND name = ? AND accepted = 0"); // an AI suggestion waiting for a yes
    const sh = sharedOfShoot(s);
    db.transaction(() => {
      for (const id of ids) for (const [names, kind] of [[sh.subjects, 'subject'], [sh.tags, 'tag']] as const) for (const n of names) { ins.run(id, n, kind); accept.run(kind, id, n); }
    })();
    return { photos: ids.length };
  };
  /** Takes back what a shoot gave to these photographs (its place where it is still the shoot's, its tags that came from it). */
  const unapplyShoot = (s: Row, ids: number[]) => {
    if (!ids.length) return;
    const sh = sharedOfShoot(s);
    const names = [...sh.subjects, ...sh.tags];
    if (names.length) db.prepare(`DELETE FROM tags WHERE source = 'shoot' AND name IN (${names.map(() => '?').join(',')}) AND photo_id ${inList(ids)}`).run(...names);
    if (s.place) db.prepare(`UPDATE photos SET place = '' WHERE place = ? AND id ${inList(ids)}`).run(s.place);
  };
  const moveInto = (shootId: number, photoIds: unknown[]) => {
    const ids = photoIds.slice(0, 5000).map((v) => num(v)).filter((i) => !!one('SELECT 1 x FROM photos WHERE id = ?', i));
    for (const from of new Set(ids.map((i) => (one('SELECT shoot_id FROM photos WHERE id = ?', i) as Row).shoot_id as number))) {
      if (from === shootId) continue;
      const old = one('SELECT * FROM shoots WHERE id = ?', from);
      if (old) unapplyShoot(old, ids.filter((i) => (one('SELECT shoot_id FROM photos WHERE id = ?', i) as Row).shoot_id === from));
    }
    for (const i of ids) db.prepare('UPDATE photos SET shoot_id = ? WHERE id = ?').run(shootId, i);
    applyShoot(shootId, ids);
    for (const i of ids) applyGear(db, i, false); // a photograph moved here takes this photoshoot's camera defaults
  };

  app.post('/api/shoots', async (req, rep) => {
    const b = (req.body ?? {}) as Row;
    const name = String(b.name ?? '').trim();
    if (!name) return rep.code(400).send({ error: 'name required' });
    const id = Number(db.prepare('INSERT INTO shoots(name, source, place, description, imported_at) VALUES(?, ?, ?, ?, ?)')
      .run(name.slice(0, 120), 'Manual', String(b.place ?? '').slice(0, 120), String(b.description ?? '').slice(0, 1000), new Date().toISOString()).lastInsertRowid);
    // Optionally start it with photographs (used when accepting a suggested grouping, and when moving some into a new shoot).
    if (Array.isArray(b.photoIds)) moveInto(id, b.photoIds);
    return x.shootDto(one('SELECT * FROM shoots WHERE id = ?', id)!);
  });
  app.get('/api/shoots/:id', async (req, rep) => {
    const s = one('SELECT * FROM shoots WHERE id = ?', num((req.params as Row).id));
    return s ? x.shootDto(s) : notFound(rep);
  });
  // Take a photoshoot, and every photograph in it, out of Frames. Files in library folders are never touched (see remove.ts).
  app.delete('/api/shoots/:id', async (req, rep) => {
    const id = num((req.params as Row).id);
    if (!one('SELECT 1 x FROM shoots WHERE id = ?', id)) return notFound(rep);
    return removeShoot(db, cfg, id);
  });
  app.patch('/api/shoots/:id', async (req, rep) => {
    const id = num((req.params as Row).id);
    if (!one('SELECT 1 x FROM shoots WHERE id = ?', id)) return notFound(rep);
    const b = (req.body ?? {}) as Row;
    if (typeof b.name === 'string' && b.name.trim()) db.prepare('UPDATE shoots SET name = ? WHERE id = ?').run(b.name.trim().slice(0, 120), id);
    const before = one('SELECT * FROM shoots WHERE id = ?', id)!;
    if (typeof b.place === 'string' && b.place.slice(0, 120) !== before.place) {
      const place = b.place.slice(0, 120);
      // Photographs that had the shoot's old place (or none) take the new one; a place a photograph has of its own is left.
      db.prepare("UPDATE photos SET place = ? WHERE shoot_id = ? AND (place = '' OR place = ?)").run(place, id, before.place);
      db.prepare('UPDATE shoots SET place = ? WHERE id = ?').run(place, id);
    }
    if ('subjects' in b || 'tags' in b) {
      const was = sharedOfShoot(before);
      const now = { subjects: 'subjects' in b ? cleanNames(b.subjects) : was.subjects, tags: 'tags' in b ? cleanNames(b.tags) : was.tags };
      const gone = [...was.subjects.filter((n) => !now.subjects.includes(n)), ...was.tags.filter((n) => !now.tags.includes(n))];
      if (gone.length) db.prepare(`DELETE FROM tags WHERE source = 'shoot' AND name IN (${gone.map(() => '?').join(',')}) AND photo_id IN (SELECT id FROM photos WHERE shoot_id = ?)`).run(...gone, id);
      db.prepare('UPDATE shoots SET shared = ? WHERE id = ?').run(JSON.stringify(now), id);
      applyShoot(id);
    }
    // The photoshoot's camera defaults: photographs in it with a blank take them, and follow a later change.
    if ('gear' in b) { db.prepare('UPDATE shoots SET gear = ? WHERE id = ?').run(JSON.stringify(cleanGear(b.gear)), id); applyShootGear(db, id); }
    if (typeof b.description === 'string') db.prepare('UPDATE shoots SET description = ? WHERE id = ?').run(b.description.slice(0, 1000), id);
    if ('dateFrom' in b) db.prepare('UPDATE shoots SET date_from = ? WHERE id = ?').run(validDate(b.dateFrom), id);
    if ('dateTo' in b) db.prepare('UPDATE shoots SET date_to = ? WHERE id = ?').run(validDate(b.dateTo), id);
    return x.shootDto(one('SELECT * FROM shoots WHERE id = ?', id)!);
  });
  app.post('/api/shoots/:id/move', async (req, rep) => {
    const id = num((req.params as Row).id);
    if (!one('SELECT 1 x FROM shoots WHERE id = ?', id)) return notFound(rep);
    moveInto(id, (((req.body ?? {}) as Row).photoIds as unknown[]) ?? []);
    return x.shootDto(one('SELECT * FROM shoots WHERE id = ?', id)!);
  });
  // Pass the shoot's place, subjects and tags down to every photograph again (after changes made one by one, or to catch up older shoots).
  app.post('/api/shoots/:id/sync', async (req, rep) => {
    const id = num((req.params as Row).id);
    if (!one('SELECT 1 x FROM shoots WHERE id = ?', id)) return notFound(rep);
    return applyShoot(id);
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
      // Frames' own upload folder is called "originals" on disk; people know it as uploads.
      const folderName = (f: string) => (f === 'originals' ? 'Uploads' : f);
      out.push({
        shootId: s.id, shootName: s.name,
        groups: big.map((g) => ({
          name: (sameFolder ? g.day : sameDay ? folderName(g.folder) : [folderName(g.folder), g.day].filter(Boolean).join(' · ')) || folderName(g.folder),
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
    // Where sidecars go is the server's choice (Settings, Photos & storage): 'next' lets each person's write-back switch put them beside the photo, 'folder' keeps them all in Frames' own folder.
    const writeBack = loadSettings(db).xmpWriteBack && getSetting<{ xmpLocation?: string }>(x.sys, 'instance', {}).xmpLocation !== 'folder';
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
  app.get('/api/admin/xmp-location', async () => ({ location: getSetting<{ xmpLocation?: string }>(x.sys, 'instance', {}).xmpLocation === 'folder' ? 'folder' : 'next' }));
  app.put('/api/admin/xmp-location', async (req, rep) => {
    const v = ((req.body ?? {}) as Row).location;
    if (v !== 'next' && v !== 'folder') return rep.code(400).send({ error: 'Choose next to the photo, or a Frames folder.' });
    setSetting(x.sys, 'instance', { ...getSetting<Row>(x.sys, 'instance', {}), xmpLocation: v });
    return { location: v };
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
    // Uploads are counted per visitor on top of the overall limit: a few hundred files a minute is plenty for a person.
    app.post('/api/upload', { config: { rateLimit: { max: 600, timeWindow: '1 minute' } } }, async (req, rep) => {
      if (cloudOnlyOriginals(db)) return rep.code(403).send({ error: 'Uploads are turned off: the administrator requires originals to be kept in cloud storage. Connect a cloud folder in Settings, Cloud sync instead.' });
      const dir = internalDir(cfg);
      fs.mkdirSync(dir, { recursive: true });
      const saved: string[] = [], rejected: { file: string; reason: string }[] = [];
      for await (const part of (req as any).files()) {
        // Only the base name is used, so a crafted name cannot write outside the folder.
        const base = path.basename(String(part.filename ?? '')).replace(/[^\w. -]/g, '_');
        if (!base || base.startsWith('.') || !IMAGE_EXT.has(path.extname(base).toLowerCase())) { rejected.push({ file: base || '(unnamed)', reason: 'Not a supported photo type' }); part.file.resume(); continue; }
        const tmp = path.join(dir, `.upload-${crypto.randomBytes(8).toString('hex')}`);
        try {
          await pipeline(part.file, fs.createWriteStream(tmp));
          if (part.file.truncated) { fs.rmSync(tmp, { force: true }); rejected.push({ file: base, reason: 'Too large' }); continue; }
          // A hard link fails if the name is taken, so two uploads of the same name (even at the same moment) never overwrite an original.
          const ext = path.extname(base), stem = path.basename(base, ext);
          let name = base, n = 1;
          for (;;) {
            try { claimName(tmp, path.join(dir, name)); break; } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'EEXIST' || n > 10_000) throw e; name = `${stem}-${n++}${ext}`; }
          }
          fs.rmSync(tmp, { force: true });
          saved.push(name);
        } catch (e) {
          fs.rmSync(tmp, { force: true });
          // Say what went wrong, here and to the person uploading, instead of a bare "failed".
          const code = (e as NodeJS.ErrnoException).code ?? '';
          console.error(`Upload of ${base} failed (${code || (e as Error).message}) writing to ${dir}`);
          rejected.push({ file: base, reason: UPLOAD_REASONS[code] ?? 'Upload failed. Check the server log' });
        }
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
    scrubCopy(f); // no keys, secrets or sign-in sessions in a copy that leaves the server
    const stamp = new Date().toISOString().slice(0, 10);
    rep.raw.on('close', () => fs.rmSync(f, { force: true }));
    return rep.header('Content-Type', 'application/octet-stream').header('Content-Disposition', `attachment; filename="frames-backup-${stamp}.db"`).header('Content-Length', String(fs.statSync(f).size)).send(fs.createReadStream(f));
  });
  app.get('/api/backup/list', async () => {
    const dir = path.join(cfg.dataDir, 'backups');
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir).filter((n) => /^auto-\d{4}-\d{2}-\d{2}\.db$/.test(n)).sort().reverse().map((n) => ({ name: n, bytes: fs.statSync(path.join(dir, n)).size }));
  });

  // Regenerate previews and analysis for photos that lack them (or everything with ?all=1). Originals are only read.
  const rb = tenantProxy(() => x.bag('rebuild', () => ({ running: false, done: 0, total: 0, result: null as null | { checked: number; rebuilt: number } })));
  app.post('/api/library/rebuild', async (req, rep) => {
    if (rb.running) return rep.code(409).send({ error: 'Already rebuilding' });
    Object.assign(rb, { running: true, done: 0, total: 0, result: null });
    const p = rebuild(db, cfg, (req.query as Row).all === '1', (d, t) => { rb.done = d; rb.total = t; }).then((r) => { rb.result = r; }).finally(() => { rb.running = false; });
    if ((req.query as Row).wait === '1') { await p; return rb; }
    return rep.code(202).send({ started: true });
  });
  app.get('/api/library/rebuild/status', async () => rb);

  // ---------- AI ----------
  const aiStatus = () => ({ enabled: !!aiConfig(db), ...aiCounts(db), ...x.ai.state, sharedUsage: sharedUsage(db) });
  app.get('/api/ai/status', async () => aiStatus());
  app.post('/api/ai/run', async (req, rep) => {
    if (!aiConfig(db)) return rep.code(400).send({ error: 'AI is off or not fully set up' });
    if ((req.query as Row).retry === '1') db.prepare("UPDATE photos SET ai_attempts = 0 WHERE ai_status = 'error'").run();
    // Everything again: every photograph goes back to waiting. Suggestions and descriptions are replaced as each is redone; tags already accepted or rejected are kept.
    if ((req.query as Row).all === '1') {
      if (x.ai.state.running) return rep.code(409).send({ error: 'Analysis is already running. Wait for it to finish, then start it again.' });
      db.prepare('UPDATE photos SET ai_status = NULL, ai_attempts = 0 WHERE has_derivs = 1 AND missing = 0').run();
    }
    const p = x.ai.run();
    if ((req.query as Row).wait === '1') { await p; return aiStatus(); }
    return rep.code(202).send({ started: true });
  });
  app.post('/api/ai/test', async (_req, rep) => {
    const c = aiConfig(db);
    if (!c) return rep.code(400).send({ ok: false, detail: 'AI is off or not fully set up' });
    return ping(c);
  });
  // ---------- AI sources: as many as you like, one active ----------
  // Which AI does what, and in what order.
  app.get('/api/ai/jobs', async () => ({ jobs: loadJobs(db), jobsList: JOBS }));
  app.put('/api/ai/jobs/:job', async (req, rep) => {
    const err = saveJob(db, String((req.params as Row).job), (req.body ?? {}) as Row);
    return err ? rep.code(400).send({ error: err }) : { jobs: loadJobs(db) };
  });
  const sourceDto = (src: AiSource) => ({ ...src, hasKey: !!sourceKey(db, src.id), ready: isReady(src), why: whyNotReady(src) });
  const sourcesDto = () => ({ types: AI_TYPES, active: loadSettings(db).aiActive, sources: [...loadSources(db).map(sourceDto), ...loadShared(db).map((s) => ({ ...sourceDto(s), shared: true }))] });
  const cfgOf = (src: AiSource): AiCfg => { const t = aiType(src.type)!; return { protocol: t.protocol, local: t.local, name: src.name, endpoint: src.endpoint, model: src.model, embedModel: t.canEmbed ? src.embedModel : '', key: sourceKey(db, src.id) }; };
  app.get('/api/ai/sources', async () => sourcesDto());
  app.post('/api/ai/sources', async (req, rep) => {
    if (!policyOf(x.sys).aiMembersOwn && ((req as any).authUser?.role ?? 'admin') !== 'admin') return rep.code(403).send({ error: 'The administrator has switched off adding your own AI. Use the shared one.' });
    const b = (req.body ?? {}) as Row;
    try {
      const src = newSource(String(b.type ?? ''), b);
      saveSources(db, [...loadSources(db), src]);
      if (typeof b.key === 'string' && b.key) setSourceKey(db, src.id, b.key.slice(0, 500)); // write-only: stored, used, never sent back
      return rep.code(201).send(sourcesDto());
    } catch (e) { if (e instanceof BadSetting) return rep.code(400).send({ error: e.message }); throw e; }
  });
  app.put('/api/ai/sources/:id', async (req, rep) => {
    const list = loadSources(db);
    const i = list.findIndex((s) => s.id === (req.params as Row).id);
    if (i < 0) return x.notFound(rep);
    const b = (req.body ?? {}) as Row;
    try { list[i] = applySource(list[i], b); } catch (e) { if (e instanceof BadSetting) return rep.code(400).send({ error: e.message }); throw e; }
    saveSources(db, list);
    if (typeof b.key === 'string' && b.key) setSourceKey(db, list[i].id, b.key.slice(0, 500));
    if (b.clearKey === true) setSourceKey(db, list[i].id, '');
    // Changing the active source so it is no longer ready (an emptied model, a withdrawn acknowledgement) switches AI off rather than sending photos somewhere unconfirmed.
    if (loadSettings(db).aiActive === list[i].id && !isReady(list[i])) saveSettings(db, { aiActive: '' });
    return sourcesDto();
  });
  app.delete('/api/ai/sources/:id', async (req, rep) => {
    const id = (req.params as Row).id;
    if (!loadSources(db).some((s) => s.id === id)) return x.notFound(rep); // the shared ones are the administrator's to remove
    if (loadSettings(db).aiActive === id) saveSettings(db, { aiActive: '' });
    saveSources(db, loadSources(db).filter((s) => s.id !== id));
    removeSourceKey(db, id);
    return sourcesDto();
  });
  // Sends one short text prompt (no photographs), so it needs no acknowledgement.
  app.post('/api/ai/sources/:id/test', async (req, rep) => {
    const src = getSource(db, (req.params as Row).id);
    if (!src) return x.notFound(rep);
    if (!src.endpoint || !src.model) return rep.code(400).send({ ok: false, detail: whyNotReady(src) });
    return ping(cfgOf(src));
  });
  app.put('/api/ai/active', async (req, rep) => {
    try { saveSettings(db, { aiActive: String(((req.body ?? {}) as Row).id ?? '') }); } catch (e) { if (e instanceof BadSetting) return rep.code(400).send({ error: e.message }); throw e; }
    return sourcesDto();
  });
}
