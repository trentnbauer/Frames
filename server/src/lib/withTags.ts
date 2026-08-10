import db from '../db.js';
import type { PhotoRow, PhotoTagRow, TagRow } from '../types.js';

// Attaches each photo's tags — every route that returns photos to the
// frontend needs this, since the Photo type always carries a `tags` array.
export function withTags<T extends PhotoRow>(photo: T): T & { tags: (TagRow & Pick<PhotoTagRow, 'source' | 'note'>)[] } {
  const tags = db
    .prepare(
      `SELECT t.id, t.slug, t.name, pt.source, pt.note
       FROM photo_tags pt JOIN tags t ON t.id = pt.tag_id
       WHERE pt.photo_id = ? ORDER BY t.name`
    )
    .all(photo.id) as (TagRow & Pick<PhotoTagRow, 'source' | 'note'>)[];
  return { ...photo, tags };
}
