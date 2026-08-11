import { Router } from 'express';
import db from '../db.js';
import { slugify } from '../types.js';

export const tagsRouter = Router();

const tagWithCount = db.prepare(
  `SELECT t.id, t.slug, t.name, COUNT(pt.photo_id) as photo_count
   FROM tags t LEFT JOIN photo_tags pt ON pt.tag_id = t.id
   WHERE t.id = ? GROUP BY t.id`
);

tagsRouter.get('/', (_req, res) => {
  const rows = db
    .prepare(
      `SELECT t.id, t.slug, t.name, COUNT(pt.photo_id) as photo_count
       FROM tags t LEFT JOIN photo_tags pt ON pt.tag_id = t.id
       GROUP BY t.id ORDER BY photo_count DESC, t.name ASC`
    )
    .all();
  res.json({ tags: rows });
});

// Rename in place. Two different names can slugify to the same thing
// ("Portrait" / "portraits"), and slug is the tag identity everywhere
// (filters, discovery queries) — so a rename that collides isn't silently
// allowed to create a second row with a name mismatch; the user is pointed
// at merge instead, which is the operation that actually combines two tags.
tagsRouter.patch('/:id', (req, res) => {
  const { name } = req.body as { name?: string };
  if (!name || !name.trim()) return res.status(400).json({ error: 'name is required' });

  const slug = slugify(name.trim());
  if (!slug) return res.status(400).json({ error: 'invalid tag name' });

  const existing = db.prepare('SELECT id FROM tags WHERE id = ?').get(req.params.id) as { id: number } | undefined;
  if (!existing) return res.status(404).json({ error: 'Tag not found' });

  const collision = db.prepare('SELECT id FROM tags WHERE slug = ? AND id != ?').get(slug, req.params.id) as { id: number } | undefined;
  if (collision) {
    return res.status(409).json({ error: 'Another tag already has that name — merge them instead', conflictTagId: collision.id });
  }

  db.prepare('UPDATE tags SET name = ?, slug = ? WHERE id = ?').run(name.trim(), slug, req.params.id);
  res.json({ tag: tagWithCount.get(req.params.id) });
});

// Merges `fromId` into `intoId`: every photo carrying `fromId` ends up
// carrying `intoId` instead, then `fromId` is deleted. A photo that
// already had both tags keeps its `intoId` row's source/note untouched
// (UPDATE OR IGNORE skips the would-be duplicate rather than overwriting
// it) — the leftover `fromId` link on that one photo is removed for free
// when the tag row's ON DELETE CASCADE fires below.
tagsRouter.post('/merge', (req, res) => {
  const { fromId, intoId } = req.body as { fromId?: number; intoId?: number };
  if (!fromId || !intoId || fromId === intoId) {
    return res.status(400).json({ error: 'fromId and intoId are required and must be different tags' });
  }

  const from = db.prepare('SELECT id FROM tags WHERE id = ?').get(fromId);
  const into = db.prepare('SELECT id FROM tags WHERE id = ?').get(intoId);
  if (!from || !into) return res.status(404).json({ error: 'Tag not found' });

  const tx = db.transaction(() => {
    db.prepare('UPDATE OR IGNORE photo_tags SET tag_id = ? WHERE tag_id = ?').run(intoId, fromId);
    db.prepare('DELETE FROM tags WHERE id = ?').run(fromId);
  });
  tx();

  res.json({ tag: tagWithCount.get(intoId) });
});

// Removes the tag everywhere (cascades to every photo_tags row via the FK)
// — for cleaning up a mistaken or no-longer-useful tag entirely, distinct
// from removing it from a single photo (see routes/photos.ts).
tagsRouter.delete('/:id', (req, res) => {
  const result = db.prepare('DELETE FROM tags WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Tag not found' });
  res.status(204).end();
});
