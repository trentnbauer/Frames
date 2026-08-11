import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import db, { ORIGINALS_DIR, THUMBS_DIR, DISPLAY_DIR } from '../db.js';
import { ingestPhoto, autoTagPhoto } from '../lib/ingest.js';
import { withTags } from '../lib/withTags.js';
import { slugify, type PhotoRow } from '../types.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
  // Client-side accept="image/*" is only a UI hint, not a security
  // boundary — reject non-images server-side too, before they ever reach
  // sharp (which throws on an unsupported format; letting that reach
  // ingestPhoto unhandled is what used to crash the whole process).
  fileFilter: (_req, file, cb) => cb(null, file.mimetype.startsWith('image/')),
});

export const photosRouter = Router();

photosRouter.post('/upload', upload.array('photos', 100), async (req, res) => {
  const files = req.files as Express.Multer.File[] | undefined;
  if (!files || files.length === 0) {
    return res.status(400).json({ error: 'No image files uploaded' });
  }

  const results = [];
  for (const file of files) {
    try {
      const { photo, wasDuplicate } = await ingestPhoto(file.buffer, file.originalname);
      results.push({ ok: true as const, photo: withTags(photo), wasDuplicate });
    } catch (err) {
      // One corrupt/unreadable file (bad mimetype header, truncated upload,
      // a format sharp can't decode) shouldn't fail the whole batch when
      // the other files in it are fine.
      console.error(`Failed to ingest "${file.originalname}":`, err instanceof Error ? err.message : err);
      results.push({ ok: false as const, filename: file.originalname, error: err instanceof Error ? err.message : 'Ingest failed' });
    }
  }

  res.status(201).json({ results });
});

photosRouter.get('/', (req, res) => {
  const { tag, tag2, camera, location, season, film_stock, untagged, orphan, q, trashed, favorite, sort } = req.query;

  // Default order is upload order (created_at); sort=taken_at switches to
  // EXIF capture date, falling back to created_at for photos with no
  // capture date (and as a tiebreak for two equal dates) — NULL sorts
  // last in a DESC ORDER BY, so undated photos naturally fall to the
  // bottom rather than needing a separate "unknown date" bucket.
  const orderClause = sort === 'taken_at' ? 'ORDER BY p.taken_at DESC, p.created_at DESC' : 'ORDER BY p.created_at DESC';

  // Pagination is opt-in via `limit` — omit it and every match comes back
  // unpaginated, which several callers rely on (combo-suggestion matching,
  // bulk-add, dashboard totals). Capped so a stray huge value can't page
  // through the whole table in one query.
  // A non-positive or invalid limit is treated the same as omitting it
  // (unpaginated) rather than reaching SQLite, where `LIMIT -5` means
  // "no limit" — silently bypassing pagination instead of erroring.
  const rawLimit = typeof req.query.limit === 'string' ? parseInt(req.query.limit, 10) : NaN;
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 200) : undefined;
  const offset = typeof req.query.offset === 'string' ? Math.max(parseInt(req.query.offset, 10) || 0, 0) : 0;
  const pageClause = limit ? 'LIMIT ? OFFSET ?' : '';
  const pageParams = limit ? [limit, offset] : [];

  const trashClause = trashed === 'true' ? 'p.deleted_at IS NOT NULL' : 'p.deleted_at IS NULL';

  let rows: PhotoRow[];
  let total: number;

  if (untagged === 'true') {
    // The automatic dominant-color tag doesn't count as "tagged" — every
    // photo gets one, so counting it here would mean no photo could ever
    // be untagged again (same reasoning as /api/orphans in discovery.ts).
    const where = `WHERE ${trashClause} AND NOT EXISTS (SELECT 1 FROM photo_tags pt WHERE pt.photo_id = p.id AND pt.note IS NOT 'auto:dominant-color')`;
    total = (db.prepare(`SELECT COUNT(*) as c FROM photos p ${where}`).get() as { c: number }).c;
    rows = db
      .prepare(`SELECT p.* FROM photos p ${where} ${orderClause} ${pageClause}`)
      .all(...pageParams) as PhotoRow[];
  } else if (orphan === 'true') {
    const where = `WHERE ${trashClause}
                     AND NOT EXISTS (SELECT 1 FROM photo_tags pt WHERE pt.photo_id = p.id AND pt.note IS NOT 'auto:dominant-color')
                     AND NOT EXISTS (SELECT 1 FROM idea_photos ip WHERE ip.photo_id = p.id)`;
    total = (db.prepare(`SELECT COUNT(*) as c FROM photos p ${where}`).get() as { c: number }).c;
    rows = db
      .prepare(`SELECT p.* FROM photos p ${where} ${orderClause} ${pageClause}`)
      .all(...pageParams) as PhotoRow[];
  } else {
    // Composable filters: tag/tag2 (via join, AND'd — tag2 powers tag x tag
    // co-occurrence suggestions), camera, location, q (filename search).
    const joins: string[] = [];
    const where: string[] = [trashClause];
    const params: string[] = [];

    if (typeof tag === 'string' && tag) {
      joins.push('JOIN photo_tags pt ON pt.photo_id = p.id JOIN tags t ON t.id = pt.tag_id');
      where.push('t.slug = ?');
      params.push(tag);
    }
    if (typeof tag2 === 'string' && tag2) {
      where.push('EXISTS (SELECT 1 FROM photo_tags pt2 JOIN tags t2 ON t2.id = pt2.tag_id WHERE pt2.photo_id = p.id AND t2.slug = ?)');
      params.push(tag2);
    }
    if (typeof camera === 'string' && camera) {
      where.push('p.camera = ?');
      params.push(camera);
    }
    if (typeof location === 'string' && location) {
      where.push('p.location = ?');
      params.push(location);
    }
    if (typeof season === 'string' && season) {
      where.push('p.season = ?');
      params.push(season);
    }
    if (typeof film_stock === 'string' && film_stock) {
      where.push('p.film_stock = ?');
      params.push(film_stock);
    }
    if (typeof q === 'string' && q.trim()) {
      where.push('p.filename LIKE ?');
      params.push(`%${q.trim()}%`);
    }
    if (favorite === 'true') {
      where.push('p.is_favorite = 1');
    }

    const joinClause = joins.join(' ');
    const whereClause = `WHERE ${where.join(' AND ')}`;
    total = (db.prepare(`SELECT COUNT(*) as c FROM photos p ${joinClause} ${whereClause}`).get(...params) as { c: number }).c;
    rows = db
      .prepare(`SELECT p.* FROM photos p ${joinClause} ${whereClause} ${orderClause} ${pageClause}`)
      .all(...params, ...pageParams) as PhotoRow[];
  }

  res.json({ photos: rows.map(withTags), total });
});

// Distinct previously-entered values, for datalist autocomplete on the
// Import review form.
photosRouter.get('/shoot-options', (_req, res) => {
  const distinct = (column: string) =>
    (db.prepare(`SELECT DISTINCT ${column} AS v FROM photos WHERE ${column} IS NOT NULL AND ${column} != ''`).all() as { v: string }[]).map(
      (r) => r.v
    );

  res.json({
    camera: distinct('camera'),
    lens: distinct('lens'),
    film_stock: distinct('film_stock'),
    location: distinct('location'),
    photoshoot: distinct('photoshoot'),
  });
});

photosRouter.get('/:id', (req, res) => {
  const photo = db.prepare('SELECT * FROM photos WHERE id = ?').get(req.params.id) as PhotoRow | undefined;
  if (!photo) return res.status(404).json({ error: 'Photo not found' });

  const ideas = db
    .prepare(
      `SELECT i.id, i.title, ip.why FROM idea_photos ip
       JOIN ideas i ON i.id = ip.idea_id WHERE ip.photo_id = ?`
    )
    .all(photo.id);

  res.json({ photo: withTags(photo), ideas });
});

// Trashing/restoring/permanently-removing a photo changes what's visibly
// in every idea it's a member of, the same as adding/removing it directly
// — so those ideas' updated_at needs to move too, or "sort by updated"
// silently goes stale for this path. Reads idea_photos rather than
// requiring callers to know which ideas are affected; must run BEFORE an
// actual DELETE FROM photos, since the ON DELETE CASCADE on idea_photos
// would otherwise remove the very rows this looks up.
const touchIdeasForPhoto = db.prepare(
  "UPDATE ideas SET updated_at = datetime('now') WHERE id IN (SELECT idea_id FROM idea_photos WHERE photo_id = ?)"
);

// Soft delete: hides the photo everywhere (Library, idea grids, discovery)
// without touching the original file, so it's recoverable. Permanent
// removal is a separate, explicit action (see /:id/permanent below).
photosRouter.delete('/:id', (req, res) => {
  const result = db.prepare("UPDATE photos SET deleted_at = datetime('now') WHERE id = ? AND deleted_at IS NULL").run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Photo not found' });
  touchIdeasForPhoto.run(req.params.id);
  res.status(204).end();
});

photosRouter.post('/:id/restore', (req, res) => {
  const result = db.prepare('UPDATE photos SET deleted_at = NULL WHERE id = ? AND deleted_at IS NOT NULL').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Photo not found in trash' });
  touchIdeasForPhoto.run(req.params.id);
  const photo = db.prepare('SELECT * FROM photos WHERE id = ?').get(req.params.id) as PhotoRow;
  res.json({ photo: withTags(photo) });
});

// Actually removes the row and every file on disk — only reachable from
// the Trash view, and only for photos already soft-deleted.
photosRouter.delete('/:id/permanent', (req, res) => {
  const photo = db.prepare('SELECT * FROM photos WHERE id = ? AND deleted_at IS NOT NULL').get(req.params.id) as PhotoRow | undefined;
  if (!photo) return res.status(404).json({ error: 'Photo not found in trash' });

  touchIdeasForPhoto.run(photo.id);
  db.prepare('DELETE FROM photos WHERE id = ?').run(photo.id);

  for (const [dir, file] of [
    [ORIGINALS_DIR, photo.original_path],
    [THUMBS_DIR, photo.thumb_path],
    [DISPLAY_DIR, photo.display_path],
  ] as const) {
    if (!file) continue;
    fs.rm(path.join(dir, file), { force: true }, () => {});
  }

  res.status(204).end();
});

// Re-run vision tagging — e.g. after adding a provider that wasn't
// enabled when this photo was first uploaded, or after a provider
// failed. Fires async like ingest does; poll GET /:id for the result.
photosRouter.post('/:id/retag', (req, res) => {
  const photo = db.prepare('SELECT * FROM photos WHERE id = ?').get(req.params.id) as PhotoRow | undefined;
  if (!photo) return res.status(404).json({ error: 'Photo not found' });

  db.prepare("UPDATE photos SET tagging_status = 'pending', tagging_error = NULL WHERE id = ?").run(photo.id);
  autoTagPhoto({ ...photo, tagging_status: 'pending' }).catch((err) => {
    console.error(`Re-tag crashed for photo ${photo.id}:`, err.message);
    db.prepare("UPDATE photos SET tagging_status = 'failed', tagging_error = ? WHERE id = ?").run(err.message, photo.id);
  });

  res.status(202).json({ ok: true });
});

// Manual star/pick flag — independent of tags and project membership, for
// flagging the best frames in a roll before deciding what they're for.
photosRouter.post('/:id/favorite', (req, res) => {
  const existing = db.prepare('SELECT is_favorite FROM photos WHERE id = ?').get(req.params.id) as { is_favorite: number } | undefined;
  if (!existing) return res.status(404).json({ error: 'Photo not found' });

  db.prepare('UPDATE photos SET is_favorite = ? WHERE id = ?').run(existing.is_favorite ? 0 : 1, req.params.id);
  const photo = db.prepare('SELECT * FROM photos WHERE id = ?').get(req.params.id) as PhotoRow;
  res.json({ photo: withTags(photo) });
});

// Shoot-detail fields: filename-parsed as a best-effort guess (camera,
// film_stock, season), otherwise typed by hand — on the Import review screen
// or later from the photo detail view.
photosRouter.patch('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM photos WHERE id = ?').get(req.params.id) as PhotoRow | undefined;
  if (!existing) return res.status(404).json({ error: 'Photo not found' });

  const { camera, lens, film_stock, location, photoshoot } = req.body as {
    camera?: string;
    lens?: string;
    film_stock?: string;
    location?: string;
    photoshoot?: string;
  };

  db.prepare(
    'UPDATE photos SET camera = ?, lens = ?, film_stock = ?, location = ?, photoshoot = ? WHERE id = ?'
  ).run(
    camera !== undefined ? camera || null : existing.camera,
    lens !== undefined ? lens || null : existing.lens,
    film_stock !== undefined ? film_stock || null : existing.film_stock,
    location !== undefined ? location || null : existing.location,
    photoshoot !== undefined ? photoshoot || null : existing.photoshoot,
    req.params.id
  );

  const photo = db.prepare('SELECT * FROM photos WHERE id = ?').get(req.params.id) as PhotoRow;
  res.json({ photo: withTags(photo) });
});

// --- Tags on a photo (the correction path: accept / dismiss / add / note) ---

const insertTagStmt = db.prepare('INSERT INTO tags (slug, name) VALUES (?, ?) ON CONFLICT(slug) DO NOTHING');
const findTagBySlugStmt = db.prepare('SELECT id FROM tags WHERE slug = ?');

photosRouter.post('/:id/tags', (req, res) => {
  const photoId = Number(req.params.id);
  const { name, source } = req.body as { name?: string; source?: 'user_confirmed' | 'user_added' };
  if (!name) return res.status(400).json({ error: 'name is required' });

  const slug = slugify(name);
  if (!slug) return res.status(400).json({ error: 'invalid tag name' });

  insertTagStmt.run(slug, name);
  const tagRow = findTagBySlugStmt.get(slug) as { id: number };

  db.prepare(
    `INSERT INTO photo_tags (photo_id, tag_id, source) VALUES (?, ?, ?)
     ON CONFLICT(photo_id, tag_id) DO UPDATE SET source = excluded.source`
  ).run(photoId, tagRow.id, source ?? 'user_added');

  res.status(201).json({ tagId: tagRow.id, slug, name });
});

// Confirm an existing ai_suggested tag (flip source to user_confirmed).
photosRouter.patch('/:id/tags/:tagId', (req, res) => {
  const { id, tagId } = req.params;
  const { source, note } = req.body as { source?: 'user_confirmed'; note?: string };

  if (source) {
    db.prepare('UPDATE photo_tags SET source = ? WHERE photo_id = ? AND tag_id = ?').run(source, id, tagId);
  }
  if (note !== undefined) {
    db.prepare('UPDATE photo_tags SET note = ? WHERE photo_id = ? AND tag_id = ?').run(note, id, tagId);
  }

  res.status(200).json({ ok: true });
});

photosRouter.delete('/:id/tags/:tagId', (req, res) => {
  const { id, tagId } = req.params;
  db.prepare('DELETE FROM photo_tags WHERE photo_id = ? AND tag_id = ?').run(id, tagId);
  res.status(204).end();
});
