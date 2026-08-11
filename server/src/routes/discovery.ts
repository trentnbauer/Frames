import { Router } from 'express';
import db from '../db.js';

export const discoveryRouter = Router();

// Gap finder: tags with frames not yet claimed by any idea. Excludes the
// automatic dominant-color tags (see addColorTags in lib/ingest.ts) — they
// apply to nearly every photo and would drown out genuinely meaningful
// subject/scene gaps.
discoveryRouter.get('/gap-finder', (_req, res) => {
  const rows = db
    .prepare(
      `SELECT t.id, t.slug, t.name, COUNT(*) as unclaimed_count
       FROM photo_tags pt
       JOIN tags t ON t.id = pt.tag_id
       JOIN photos p ON p.id = pt.photo_id
       WHERE p.deleted_at IS NULL
         AND pt.note IS NOT 'dominant color'
         AND NOT EXISTS (SELECT 1 FROM idea_photos ip WHERE ip.photo_id = pt.photo_id)
       GROUP BY t.id
       HAVING unclaimed_count > 0
       ORDER BY unclaimed_count DESC`
    )
    .all();
  res.json({ gaps: rows });
});

// Combo suggestions: cross-join structured shoot fields against subject tags
// (and, for tag_tag, subject tags against each other) to surface project
// candidates neither half would suggest alone — "neon at Melbourne CBD",
// "Leica M6 at St Kilda Pier", "signage + night". Powers the Dashboard's
// rotating suggested-project banner. Computed at query time, no stored
// combo entity (see plan.md). tag_tag is the v2-roadmap "tag co-occurrence"
// idea, promoted into this same mechanism rather than a separate feature.
discoveryRouter.get('/combo-suggestions', (_req, res) => {
  const tagLocation = db
    .prepare(
      `SELECT t.name as tag, t.slug as slug, p.location as location, COUNT(*) as count
       FROM photos p
       JOIN photo_tags pt ON pt.photo_id = p.id
       JOIN tags t ON t.id = pt.tag_id
       WHERE p.deleted_at IS NULL AND p.location IS NOT NULL AND p.location != '' AND pt.note IS NOT 'dominant color'
       GROUP BY t.id, p.location
       HAVING count > 0
       ORDER BY count DESC
       LIMIT 20`
    )
    .all() as { tag: string; slug: string; location: string; count: number }[];

  const tagSeason = db
    .prepare(
      `SELECT t.name as tag, t.slug as slug, p.season as season, COUNT(*) as count
       FROM photos p
       JOIN photo_tags pt ON pt.photo_id = p.id
       JOIN tags t ON t.id = pt.tag_id
       WHERE p.deleted_at IS NULL AND p.season IS NOT NULL AND p.season != '' AND pt.note IS NOT 'dominant color'
       GROUP BY t.id, p.season
       HAVING count > 0
       ORDER BY count DESC
       LIMIT 20`
    )
    .all() as { tag: string; slug: string; season: string; count: number }[];

  const tagFilmStock = db
    .prepare(
      `SELECT t.name as tag, t.slug as slug, p.film_stock as film_stock, COUNT(*) as count
       FROM photos p
       JOIN photo_tags pt ON pt.photo_id = p.id
       JOIN tags t ON t.id = pt.tag_id
       WHERE p.deleted_at IS NULL AND p.film_stock IS NOT NULL AND p.film_stock != '' AND pt.note IS NOT 'dominant color'
       GROUP BY t.id, p.film_stock
       HAVING count > 0
       ORDER BY count DESC
       LIMIT 20`
    )
    .all() as { tag: string; slug: string; film_stock: string; count: number }[];

  const cameraLocation = db
    .prepare(
      `SELECT p.camera as camera, p.location as location, COUNT(*) as count
       FROM photos p
       WHERE p.deleted_at IS NULL AND p.camera IS NOT NULL AND p.camera != '' AND p.location IS NOT NULL AND p.location != ''
       GROUP BY p.camera, p.location
       HAVING count > 0
       ORDER BY count DESC
       LIMIT 20`
    )
    .all() as { camera: string; location: string; count: number }[];

  // Every pair of tags that co-occur on at least 2 photos, most common first.
  const tagTag = db
    .prepare(
      `SELECT ta.name as tagA, ta.slug as slugA, tb.name as tagB, tb.slug as slugB, COUNT(*) as count
       FROM photo_tags pta
       JOIN photo_tags ptb ON pta.photo_id = ptb.photo_id AND pta.tag_id < ptb.tag_id
       JOIN tags ta ON ta.id = pta.tag_id
       JOIN tags tb ON tb.id = ptb.tag_id
       JOIN photos p ON p.id = pta.photo_id
       WHERE p.deleted_at IS NULL AND pta.note IS NOT 'dominant color' AND ptb.note IS NOT 'dominant color'
       GROUP BY pta.tag_id, ptb.tag_id
       HAVING count >= 2
       ORDER BY count DESC
       LIMIT 20`
    )
    .all() as { tagA: string; slugA: string; tagB: string; slugB: string; count: number }[];

  const combos = [
    ...tagLocation.map((r) => ({ type: 'tag_location' as const, main: r.tag, slug: r.slug, connector: 'at', secondary: r.location, count: r.count })),
    ...cameraLocation.map((r) => ({ type: 'camera_location' as const, main: r.camera, connector: 'at', secondary: r.location, count: r.count })),
    ...tagTag.map((r) => ({ type: 'tag_tag' as const, main: r.tagA, slug: r.slugA, connector: '+', secondary: r.tagB, secondarySlug: r.slugB, count: r.count })),
    ...tagSeason.map((r) => ({ type: 'tag_season' as const, main: r.tag, slug: r.slug, connector: 'in', secondary: r.season, count: r.count })),
    ...tagFilmStock.map((r) => ({ type: 'tag_film_stock' as const, main: r.tag, slug: r.slug, connector: 'on', secondary: r.film_stock, count: r.count })),
  ];

  res.json({ combos });
});

// Orphans: photos with neither a tag nor an idea membership. The automatic
// dominant-color tag doesn't count — every photo gets one, so counting it
// here would mean no photo could ever be an orphan again.
discoveryRouter.get('/orphans', (_req, res) => {
  const rows = db
    .prepare(
      `SELECT p.* FROM photos p
       WHERE p.deleted_at IS NULL
         AND NOT EXISTS (SELECT 1 FROM photo_tags pt WHERE pt.photo_id = p.id AND pt.note IS NOT 'dominant color')
         AND NOT EXISTS (SELECT 1 FROM idea_photos ip WHERE ip.photo_id = p.id)
       ORDER BY p.created_at DESC`
    )
    .all();
  res.json({ photos: rows });
});
