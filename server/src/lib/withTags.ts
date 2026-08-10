import db from '../db.js';
import type { PhotoRow, PhotoTagRow, TagRow } from '../types.js';

// Attaches each photo's tags — every route that returns photos to the
// frontend needs this, since the Photo type always carries a `tags` array.
// Also the single choke point that parses the stored palette JSON string
// into an actual array, so every caller gets it ready to use.
export function withTags<T extends PhotoRow>(
  photo: T
): Omit<T, 'palette'> & { tags: (TagRow & Pick<PhotoTagRow, 'source' | 'note'>)[]; palette: string[] | null } {
  const tags = db
    .prepare(
      `SELECT t.id, t.slug, t.name, pt.source, pt.note
       FROM photo_tags pt JOIN tags t ON t.id = pt.tag_id
       WHERE pt.photo_id = ? ORDER BY t.name`
    )
    .all(photo.id) as (TagRow & Pick<PhotoTagRow, 'source' | 'note'>)[];

  let palette: string[] | null = null;
  if (photo.palette) {
    try {
      const parsed = JSON.parse(photo.palette);
      if (Array.isArray(parsed)) palette = parsed;
    } catch {
      // Corrupt palette JSON — treat as missing rather than erroring the whole response.
    }
  }

  return { ...photo, tags, palette };
}
