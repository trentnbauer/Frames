import { Router } from 'express';
import multer from 'multer';
import db from '../db.js';
import { ingestPhoto } from '../lib/ingest.js';
import { withTags } from '../lib/withTags.js';
import { slugify, type PhotoRow } from '../types.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });

export const photosRouter = Router();

photosRouter.post('/upload', upload.array('photos', 100), async (req, res) => {
  const files = req.files as Express.Multer.File[] | undefined;
  if (!files || files.length === 0) {
    return res.status(400).json({ error: 'No files uploaded' });
  }

  const results = [];
  for (const file of files) {
    const { photo, wasDuplicate } = await ingestPhoto(file.buffer, file.originalname);
    results.push({ photo: withTags(photo), wasDuplicate });
  }

  res.status(201).json({ results });
});

photosRouter.get('/', (req, res) => {
  const { tag, camera, location, untagged, orphan } = req.query;

  // Pagination is opt-in via `limit` — omit it and every match comes back
  // unpaginated, which several callers rely on (combo-suggestion matching,
  // bulk-add, dashboard totals). Capped so a stray huge value can't page
  // through the whole table in one query.
  const limit = typeof req.query.limit === 'string' ? Math.min(parseInt(req.query.limit, 10) || 0, 200) : undefined;
  const offset = typeof req.query.offset === 'string' ? Math.max(parseInt(req.query.offset, 10) || 0, 0) : 0;
  const pageClause = limit ? 'LIMIT ? OFFSET ?' : '';
  const pageParams = limit ? [limit, offset] : [];

  let rows: PhotoRow[];
  let total: number;

  if (untagged === 'true') {
    const where = 'WHERE NOT EXISTS (SELECT 1 FROM photo_tags pt WHERE pt.photo_id = p.id)';
    total = (db.prepare(`SELECT COUNT(*) as c FROM photos p ${where}`).get() as { c: number }).c;
    rows = db
      .prepare(`SELECT p.* FROM photos p ${where} ORDER BY p.created_at DESC ${pageClause}`)
      .all(...pageParams) as PhotoRow[];
  } else if (orphan === 'true') {
    const where = `WHERE NOT EXISTS (SELECT 1 FROM photo_tags pt WHERE pt.photo_id = p.id)
                     AND NOT EXISTS (SELECT 1 FROM idea_photos ip WHERE ip.photo_id = p.id)`;
    total = (db.prepare(`SELECT COUNT(*) as c FROM photos p ${where}`).get() as { c: number }).c;
    rows = db
      .prepare(`SELECT p.* FROM photos p ${where} ORDER BY p.created_at DESC ${pageClause}`)
      .all(...pageParams) as PhotoRow[];
  } else {
    // Composable filters: tag (via join), camera, location — combinable for
    // combo-suggestion lookups like "photos shot on X in Y".
    const joins: string[] = [];
    const where: string[] = [];
    const params: string[] = [];

    if (typeof tag === 'string' && tag) {
      joins.push('JOIN photo_tags pt ON pt.photo_id = p.id JOIN tags t ON t.id = pt.tag_id');
      where.push('t.slug = ?');
      params.push(tag);
    }
    if (typeof camera === 'string' && camera) {
      where.push('p.camera = ?');
      params.push(camera);
    }
    if (typeof location === 'string' && location) {
      where.push('p.location = ?');
      params.push(location);
    }

    const joinClause = joins.join(' ');
    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    total = (db.prepare(`SELECT COUNT(*) as c FROM photos p ${joinClause} ${whereClause}`).get(...params) as { c: number }).c;
    rows = db
      .prepare(`SELECT p.* FROM photos p ${joinClause} ${whereClause} ORDER BY p.created_at DESC ${pageClause}`)
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

photosRouter.delete('/:id', (req, res) => {
  const result = db.prepare('DELETE FROM photos WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Photo not found' });
  res.status(204).end();
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
