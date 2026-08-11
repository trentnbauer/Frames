import { Router } from 'express';
import db from '../db.js';
import { hammingDistance } from '../lib/phash.js';
import { withTags } from '../lib/withTags.js';
import type { PhotoRow } from '../types.js';

export const discoveryRouter = Router();

// Photos taken on this month+day in a previous year — an "on this day"
// callback, only possible because EXIF capture date is now stored
// separately from upload date. strftime('%m-%d', ...) ignores the year on
// both sides of the comparison.
discoveryRouter.get('/on-this-day', (_req, res) => {
  const rows = db
    .prepare(
      `SELECT p.* FROM photos p
       WHERE p.deleted_at IS NULL AND p.taken_at IS NOT NULL
         AND strftime('%m-%d', p.taken_at) = strftime('%m-%d', 'now')
         AND strftime('%Y', p.taken_at) != strftime('%Y', 'now')
       ORDER BY p.taken_at DESC`
    )
    .all() as PhotoRow[];
  res.json({ photos: rows.map(withTags) });
});

// Lightweight pin list for the map view — just the fields a marker needs,
// not the full photo row (tags, palette, etc.), since a library-wide map
// can have hundreds of points and doesn't need any of that until a pin is
// actually clicked (Photo Detail fetches the full record then).
discoveryRouter.get('/map-points', (_req, res) => {
  const rows = db
    .prepare(
      `SELECT id, filename, latitude, longitude FROM photos
       WHERE deleted_at IS NULL AND latitude IS NOT NULL AND longitude IS NOT NULL`
    )
    .all();
  res.json({ points: rows });
});

// Same frame re-scanned, a re-export at a different size/quality, a
// near-identical burst-shot twin — anything closer than this on the 64-bit
// average hash (see lib/phash.ts) is grouped as a likely duplicate.
const NEAR_DUPLICATE_THRESHOLD = 6;

// Groups photos into near-duplicate clusters via union-find over pairwise
// Hamming distance. O(n^2) comparisons, computed on demand rather than
// maintained incrementally — fine at personal-library scale, same
// reasoning already applied to Library.tsx's client-side multi-tag filter.
discoveryRouter.get('/near-duplicates', (_req, res) => {
  const rows = db
    .prepare(`SELECT id, filename, phash, width, height FROM photos WHERE deleted_at IS NULL AND phash IS NOT NULL`)
    .all() as { id: number; filename: string; phash: string; width: number | null; height: number | null }[];

  const parent = new Map<number, number>();
  for (const r of rows) parent.set(r.id, r.id);

  function find(x: number): number {
    let root = x;
    while (parent.get(root) !== root) root = parent.get(root)!;
    while (parent.get(x) !== root) {
      const next = parent.get(x)!;
      parent.set(x, root);
      x = next;
    }
    return root;
  }
  function union(a: number, b: number) {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  }

  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      if (hammingDistance(rows[i].phash, rows[j].phash) <= NEAR_DUPLICATE_THRESHOLD) {
        union(rows[i].id, rows[j].id);
      }
    }
  }

  const groups = new Map<number, { id: number; filename: string; width: number | null; height: number | null }[]>();
  for (const r of rows) {
    const root = find(r.id);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root)!.push({ id: r.id, filename: r.filename, width: r.width, height: r.height });
  }

  const clusters = Array.from(groups.values())
    .filter((g) => g.length > 1)
    .sort((a, b) => b.length - a.length);

  res.json({ groups: clusters });
});

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
         AND pt.note IS NOT 'auto:dominant-color'
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
       WHERE p.deleted_at IS NULL AND p.location IS NOT NULL AND p.location != '' AND pt.note IS NOT 'auto:dominant-color'
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
       WHERE p.deleted_at IS NULL AND p.season IS NOT NULL AND p.season != '' AND pt.note IS NOT 'auto:dominant-color'
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
       WHERE p.deleted_at IS NULL AND p.film_stock IS NOT NULL AND p.film_stock != '' AND pt.note IS NOT 'auto:dominant-color'
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
       WHERE p.deleted_at IS NULL AND pta.note IS NOT 'auto:dominant-color' AND ptb.note IS NOT 'auto:dominant-color'
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
         AND NOT EXISTS (SELECT 1 FROM photo_tags pt WHERE pt.photo_id = p.id AND pt.note IS NOT 'auto:dominant-color')
         AND NOT EXISTS (SELECT 1 FROM idea_photos ip WHERE ip.photo_id = p.id)
       ORDER BY p.created_at DESC`
    )
    .all();
  res.json({ photos: rows });
});
