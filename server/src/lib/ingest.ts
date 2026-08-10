import fs from 'node:fs';
import path from 'node:path';
import db, { ORIGINALS_DIR, DISPLAY_DIR } from '../db.js';
import { hashBuffer } from './hash.js';
import { generateDerivatives } from './derivatives.js';
import { parseFilename } from './filenameParser.js';
import { getEnabledProviders } from '../vision/index.js';
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
    original_path: path.basename(originalPath),
    thumb_path: path.basename(derivatives.thumbPath),
    display_path: path.basename(derivatives.displayPath),
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
    console.error(`Auto-tag crashed for photo ${photo.id}:`, err.message);
    db.prepare("UPDATE photos SET tagging_status = 'failed' WHERE id = ?").run(photo.id);
  });

  return { photo, wasDuplicate: false };
}

const insertTag = db.prepare('INSERT INTO tags (slug, name) VALUES (?, ?) ON CONFLICT(slug) DO NOTHING');
const findTagBySlug = db.prepare('SELECT id FROM tags WHERE slug = ?');
const linkTag = db.prepare(`
  INSERT INTO photo_tags (photo_id, tag_id, source, note) VALUES (?, ?, 'ai_suggested', ?)
  ON CONFLICT(photo_id, tag_id) DO NOTHING
`);

// Every enabled provider runs against the frame; their suggestions merge
// (deduped by slug) into one set of ai_suggested tags, noting which
// provider(s) proposed each one.
async function autoTagPhoto(photo: PhotoRow) {
  const providers = getEnabledProviders();
  if (providers.length === 0 || !photo.display_path) {
    db.prepare("UPDATE photos SET tagging_status = 'skipped' WHERE id = ?").run(photo.id);
    return;
  }

  const buffer = fs.readFileSync(path.join(DISPLAY_DIR, photo.display_path));

  const results = await Promise.allSettled(providers.map((p) => p.instance.tagImage(buffer, 'image/jpeg')));

  const bySlug = new Map<string, { name: string; sources: string[] }>();
  let anySucceeded = false;

  results.forEach((result, i) => {
    const provider = providers[i];
    if (result.status === 'rejected') {
      console.error(`Vision provider "${provider.name}" failed for photo ${photo.id}:`, result.reason?.message ?? result.reason);
      return;
    }
    anySucceeded = true;
    for (const name of result.value) {
      const slug = slugify(name);
      if (!slug) continue;
      const existing = bySlug.get(slug);
      if (existing) {
        existing.sources.push(provider.name);
      } else {
        bySlug.set(slug, { name, sources: [provider.name] });
      }
    }
  });

  const tx = db.transaction(() => {
    for (const [slug, { name, sources }] of bySlug) {
      insertTag.run(slug, name);
      const tagRow = findTagBySlug.get(slug) as { id: number };
      linkTag.run(photo.id, tagRow.id, `via ${sources.join(', ')}`);
    }
    db.prepare('UPDATE photos SET tagging_status = ? WHERE id = ?').run(anySucceeded ? 'tagged' : 'failed', photo.id);
  });
  tx();
}
