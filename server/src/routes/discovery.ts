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

// Combo suggestions: cross-join structured shoot fields against subject tags
// to surface project candidates neither would suggest alone — "neon at
// Melbourne CBD", "Leica M6 at St Kilda Pier". Powers the Dashboard's
// rotating suggested-project banner. Computed at query time, no stored
// combo entity (see plan.md).
discoveryRouter.get('/combo-suggestions', (_req, res) => {
  const tagLocation = db
    .prepare(
      `SELECT t.name as tag, p.location as location, COUNT(*) as count
       FROM photos p
       JOIN photo_tags pt ON pt.photo_id = p.id
       JOIN tags t ON t.id = pt.tag_id
       WHERE p.location IS NOT NULL AND p.location != ''
       GROUP BY t.id, p.location
       HAVING count > 0
       ORDER BY count DESC
       LIMIT 20`
    )
    .all() as { tag: string; location: string; count: number }[];

  const cameraLocation = db
    .prepare(
      `SELECT p.camera as camera, p.location as location, COUNT(*) as count
       FROM photos p
       WHERE p.camera IS NOT NULL AND p.camera != '' AND p.location IS NOT NULL AND p.location != ''
       GROUP BY p.camera, p.location
       HAVING count > 0
       ORDER BY count DESC
       LIMIT 20`
    )
    .all() as { camera: string; location: string; count: number }[];

  const combos = [
    ...tagLocation.map((r) => ({ type: 'tag_location' as const, main: r.tag, connector: 'at', location: r.location, count: r.count })),
    ...cameraLocation.map((r) => ({ type: 'camera_location' as const, main: r.camera, connector: 'at', location: r.location, count: r.count })),
  ];

  res.json({ combos });
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
