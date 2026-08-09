import { Router } from 'express';
import db from '../db.js';

export const discoveryRouter = Router();

// Gap finder: tags with frames not yet claimed by any idea.
discoveryRouter.get('/gap-finder', (_req, res) => {
  const rows = db
    .prepare(
      `SELECT t.id, t.slug, t.name, COUNT(*) as unclaimed_count
       FROM photo_tags pt
       JOIN tags t ON t.id = pt.tag_id
       WHERE NOT EXISTS (SELECT 1 FROM idea_photos ip WHERE ip.photo_id = pt.photo_id)
       GROUP BY t.id
       HAVING unclaimed_count > 0
       ORDER BY unclaimed_count DESC`
    )
    .all();
  res.json({ gaps: rows });
});

// Orphans: photos with neither a tag nor an idea membership.
discoveryRouter.get('/orphans', (_req, res) => {
  const rows = db
    .prepare(
      `SELECT p.* FROM photos p
       WHERE NOT EXISTS (SELECT 1 FROM photo_tags pt WHERE pt.photo_id = p.id)
         AND NOT EXISTS (SELECT 1 FROM idea_photos ip WHERE ip.photo_id = p.id)
       ORDER BY p.created_at DESC`
    )
    .all();
  res.json({ photos: rows });
});
