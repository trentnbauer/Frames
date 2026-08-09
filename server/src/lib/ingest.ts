import fs from 'node:fs';
import path from 'node:path';
import db, { ORIGINALS_DIR } from '../db.js';
import { hashBuffer } from './hash.js';
import { generateDerivatives } from './derivatives.js';
import { parseFilename } from './filenameParser.js';
import { getVisionProvider } from '../vision/index.js';
import { slugify, type PhotoRow } from '../types.js';

const insertPhoto = db.prepare(`
  INSERT INTO photos (content_hash, original_path, thumb_path, display_path, filename, width, height, camera, film_stock, season, tagging_status)
  VALUES (@content_hash, @original_path, @thumb_path, @display_path, @filename, @width, @height, @camera, @film_stock, @season, 'pending')
`);

const findByHash = db.prepare('SELECT * FROM photos WHERE content_hash = ?');

export interface IngestResult {
  photo: PhotoRow;
  wasDuplicate: boolean;
}

export async function ingestPhoto(buffer: Buffer, originalFilename: string): Promise<IngestResult> {
  const hash = hashBuffer(buffer);

  const existing = findByHash.get(hash) as PhotoRow | undefined;
  if (existing) {
    return { photo: existing, wasDuplicate: true };
  }

  const ext = path.extname(originalFilename) || '.jpg';
  const originalPath = path.join(ORIGINALS_DIR, `${hash}${ext}`);
  fs.writeFileSync(originalPath, buffer);

  const derivatives = await generateDerivatives(originalPath, hash);
  const parsed = parseFilename(originalFilename);

  const info = insertPhoto.run({
    content_hash: hash,
    original_path: originalPath,
    thumb_path: derivatives.thumbPath,
    display_path: derivatives.displayPath,
    filename: originalFilename,
    width: derivatives.width,
    height: derivatives.height,
    camera: parsed.camera,
    film_stock: parsed.filmStock,
    season: parsed.season,
  });

  const photo = db.prepare('SELECT * FROM photos WHERE id = ?').get(info.lastInsertRowid) as PhotoRow;

  // Fire and forget: auto-tagging shouldn't block the upload response.
  autoTagPhoto(photo).catch((err) => {
    console.error(`Auto-tag failed for photo ${photo.id}:`, err.message);
    db.prepare("UPDATE photos SET tagging_status = 'failed' WHERE id = ?").run(photo.id);
  });

  return { photo, wasDuplicate: false };
}

const insertTag = db.prepare('INSERT INTO tags (slug, name) VALUES (?, ?) ON CONFLICT(slug) DO NOTHING');
const findTagBySlug = db.prepare('SELECT id FROM tags WHERE slug = ?');
const linkTag = db.prepare(`
  INSERT INTO photo_tags (photo_id, tag_id, source) VALUES (?, ?, 'ai_suggested')
  ON CONFLICT(photo_id, tag_id) DO NOTHING
`);

async function autoTagPhoto(photo: PhotoRow) {
  const provider = getVisionProvider();
  if (!provider || !photo.display_path) {
    db.prepare("UPDATE photos SET tagging_status = 'skipped' WHERE id = ?").run(photo.id);
    return;
  }

  const buffer = fs.readFileSync(photo.display_path);
  const tagNames = await provider.tagImage(buffer, 'image/jpeg');

  const tx = db.transaction((names: string[]) => {
    for (const name of names) {
      const slug = slugify(name);
      if (!slug) continue;
      insertTag.run(slug, name);
      const tagRow = findTagBySlug.get(slug) as { id: number };
      linkTag.run(photo.id, tagRow.id);
    }
    db.prepare("UPDATE photos SET tagging_status = 'tagged' WHERE id = ?").run(photo.id);
  });
  tx(tagNames);
}
