import { Router } from 'express';
import path from 'node:path';
import db, { ORIGINALS_DIR } from '../db.js';
import { streamZip } from '../lib/zipExport.js';
import { withTags } from '../lib/withTags.js';
import type { IdeaRow, PhotoRow } from '../types.js';

export const ideasRouter = Router();

function withPhotoCount(idea: IdeaRow) {
  const { count } = db.prepare('SELECT COUNT(*) as count FROM idea_photos WHERE idea_id = ?').get(idea.id) as {
    count: number;
  };
  return { ...idea, photo_count: count };
}

ideasRouter.get('/', (_req, res) => {
  const rows = db.prepare('SELECT * FROM ideas ORDER BY created_at DESC').all() as IdeaRow[];
  res.json({ ideas: rows.map(withPhotoCount) });
});

ideasRouter.post('/', (req, res) => {
  const { title, notes, light_pref } = req.body as { title?: string; notes?: string; light_pref?: string };
  if (!title) return res.status(400).json({ error: 'title is required' });

  const info = db
    .prepare('INSERT INTO ideas (title, notes, light_pref) VALUES (?, ?, ?)')
    .run(title, notes ?? null, light_pref ?? 'any');

  const idea = db.prepare('SELECT * FROM ideas WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ idea });
});

ideasRouter.get('/:id', (req, res) => {
  const idea = db.prepare('SELECT * FROM ideas WHERE id = ?').get(req.params.id) as IdeaRow | undefined;
  if (!idea) return res.status(404).json({ error: 'Idea not found' });

  const photos = db
    .prepare(
      `SELECT p.*, ip.why, ip.position FROM idea_photos ip
       JOIN photos p ON p.id = ip.photo_id
       WHERE ip.idea_id = ? ORDER BY ip.position ASC, ip.created_at ASC`
    )
    .all(idea.id) as PhotoRow[];

  res.json({ idea, photos: photos.map(withTags) });
});

ideasRouter.patch('/:id', (req, res) => {
  const { title, notes, light_pref, status } = req.body as {
    title?: string;
    notes?: string;
    light_pref?: string;
    status?: string;
  };

  const existing = db.prepare('SELECT * FROM ideas WHERE id = ?').get(req.params.id) as IdeaRow | undefined;
  if (!existing) return res.status(404).json({ error: 'Idea not found' });

  db.prepare('UPDATE ideas SET title = ?, notes = ?, light_pref = ?, status = ? WHERE id = ?').run(
    title ?? existing.title,
    notes !== undefined ? notes : existing.notes,
    light_pref ?? existing.light_pref,
    status ?? existing.status,
    req.params.id
  );

  const idea = db.prepare('SELECT * FROM ideas WHERE id = ?').get(req.params.id);
  res.json({ idea });
});

ideasRouter.delete('/:id', (req, res) => {
  const result = db.prepare('DELETE FROM ideas WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Idea not found' });
  res.status(204).end();
});

// --- Idea <-> photo membership ---

ideasRouter.post('/:id/photos', (req, res) => {
  const ideaId = Number(req.params.id);
  const { photoId, why } = req.body as { photoId?: number; why?: string };
  if (!photoId) return res.status(400).json({ error: 'photoId is required' });

  const { count } = db.prepare('SELECT COUNT(*) as count FROM idea_photos WHERE idea_id = ?').get(ideaId) as {
    count: number;
  };

  db.prepare(
    `INSERT INTO idea_photos (idea_id, photo_id, position, why) VALUES (?, ?, ?, ?)
     ON CONFLICT(idea_id, photo_id) DO UPDATE SET why = excluded.why`
  ).run(ideaId, photoId, count, why ?? null);

  res.status(201).json({ ok: true });
});

ideasRouter.patch('/:id/photos/:photoId', (req, res) => {
  const { why } = req.body as { why?: string };
  db.prepare('UPDATE idea_photos SET why = ? WHERE idea_id = ? AND photo_id = ?').run(
    why ?? null,
    req.params.id,
    req.params.photoId
  );
  res.status(200).json({ ok: true });
});

ideasRouter.delete('/:id/photos/:photoId', (req, res) => {
  db.prepare('DELETE FROM idea_photos WHERE idea_id = ? AND photo_id = ?').run(req.params.id, req.params.photoId);
  res.status(204).end();
});

// Idea filler: derive the idea's dominant tags from its current member
// photos, then surface other photos sharing those tags that aren't members
// yet — the "6 frames tagged X might belong here" nudge from plan.md's core
// loop, seen from the idea side rather than the tag side.
ideasRouter.get('/:id/suggested-photos', (req, res) => {
  const ideaId = req.params.id;

  const dominantTags = db
    .prepare(
      `SELECT DISTINCT pt.tag_id FROM idea_photos ip
       JOIN photo_tags pt ON pt.photo_id = ip.photo_id
       WHERE ip.idea_id = ?`
    )
    .all(ideaId) as { tag_id: number }[];

  if (dominantTags.length === 0) return res.json({ photos: [] });

  const tagIds = dominantTags.map((t) => t.tag_id);
  const placeholders = tagIds.map(() => '?').join(',');

  const rows = db
    .prepare(
      `SELECT p.*, COUNT(*) as shared_tag_count FROM photos p
       JOIN photo_tags pt ON pt.photo_id = p.id
       WHERE pt.tag_id IN (${placeholders})
         AND NOT EXISTS (SELECT 1 FROM idea_photos ip WHERE ip.idea_id = ? AND ip.photo_id = p.id)
       GROUP BY p.id
       ORDER BY shared_tag_count DESC, p.created_at DESC
       LIMIT 8`
    )
    .all(...tagIds, ideaId) as PhotoRow[];

  res.json({ photos: rows.map(withTags) });
});

ideasRouter.get('/:id/export', async (req, res) => {
  const idea = db.prepare('SELECT * FROM ideas WHERE id = ?').get(req.params.id) as IdeaRow | undefined;
  if (!idea) return res.status(404).json({ error: 'Idea not found' });

  const photos = db
    .prepare(
      `SELECT p.* FROM idea_photos ip JOIN photos p ON p.id = ip.photo_id
       WHERE ip.idea_id = ? ORDER BY ip.position ASC`
    )
    .all(idea.id) as PhotoRow[];

  if (photos.length === 0) return res.status(400).json({ error: 'Idea has no photos to export' });

  const zipName = `${idea.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.zip`;
  const files = photos.map((p) => ({
    originalPath: path.join(ORIGINALS_DIR, p.original_path),
    filename: `${path.basename(p.original_path, path.extname(p.original_path))}${path.extname(p.filename) || path.extname(p.original_path)}`,
  }));

  await streamZip(res, zipName, files);
});
