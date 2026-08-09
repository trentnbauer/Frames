import { Router } from 'express';
import db from '../db.js';

export const tagsRouter = Router();

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
