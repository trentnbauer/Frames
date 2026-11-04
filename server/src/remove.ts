import fs from 'node:fs';
import path from 'node:path';
import type { DB } from './db.js';
import { internalDir, type Cfg } from './ingest.js';

/**
 * Taking photographs out of Frames.
 *
 * What goes: the photograph's record in Frames (its reviews, tags, collection places, share ratings, previews and analysis).
 * What stays: **a file in a library folder is never touched**: Frames reads those and never changes or deletes them. The only
 * files removed are the copies Frames itself holds in its own data folder: an upload, or a copy made by cloud sync (the file
 * in the cloud stays, and sync does not fetch it again because it already knows it).
 * So a scan does not bring the photograph straight back, its fingerprint is remembered in `removed`; bringing them back clears that.
 */
export type RemoveResult = { removed: number; filesDeleted: number; kept: number };

const inside = (file: string, dir: string) => { const r = path.relative(path.resolve(dir), path.resolve(file)); return !!r && !r.startsWith('..') && !path.isAbsolute(r); };

export function removePhotos(db: DB, cfg: Cfg, ids: number[]): RemoveResult {
  const res: RemoveResult = { removed: 0, filesDeleted: 0, kept: 0 };
  const own = [internalDir(cfg), path.join(cfg.dataDir, 'cloud')];
  const pick = db.prepare('SELECT id, path, file, hash FROM photos WHERE id = ?');
  const forget = db.prepare('INSERT OR REPLACE INTO removed(hash, path, file, removed_at) VALUES(?, ?, ?, ?)');
  const now = new Date().toISOString();
  for (const id of [...new Set(ids)].filter((n) => Number.isInteger(n))) {
    const p = pick.get(id) as { id: number; path: string; file: string; hash: string } | undefined;
    if (!p) continue;
    db.transaction(() => {
      forget.run(p.hash, p.path, p.file, now);
      db.prepare('UPDATE photos SET parent_id = NULL WHERE parent_id = ?').run(id); // an edit or crop of it stays, no longer linked
      for (const t of ['dismissed', 'feedback', 'xmp_conflicts', 'duplicates']) {
        try { db.prepare(t === 'duplicates' ? 'DELETE FROM duplicates WHERE hash = ?' : `DELETE FROM ${t} WHERE photo_id = ?`).run(t === 'duplicates' ? p.hash : id); } catch { /* a table an older library does not have */ }
      }
      db.prepare('DELETE FROM photos WHERE id = ?').run(id); // reviews, tags, collection places and share ratings go with it
    })();
    fs.rmSync(path.join(cfg.dataDir, 'derivatives', String(id)), { recursive: true, force: true });
    if (own.some((d) => inside(p.path, d))) { try { fs.rmSync(p.path, { force: true }); res.filesDeleted++; } catch { res.kept++; } } else res.kept++;
    res.removed++;
  }
  return res;
}

/** A photoshoot and every photograph in it. */
export function removeShoot(db: DB, cfg: Cfg, id: number): RemoveResult {
  const ids = (db.prepare('SELECT id FROM photos WHERE shoot_id = ?').all(id) as { id: number }[]).map((r) => r.id);
  const res = removePhotos(db, cfg, ids);
  db.prepare("DELETE FROM shares WHERE kind = 'shoot' AND target_id = ?").run(id);
  db.prepare('DELETE FROM shoots WHERE id = ?').run(id);
  return res;
}

/** Photographs whose average rating, after all their sessions, is below the line the person chose. Lowest first. */
export function deleteSuggestions(db: DB, sessions: number, below: number, limit = 200) {
  if (!below) return [];
  return db.prepare(`
    SELECT p.id, p.title, p.file, p.shoot_id shootId, ROUND(AVG(r.rating), 2) avg, COUNT(r.id) reviews
    FROM photos p JOIN reviews r ON r.photo_id = p.id
    WHERE p.missing = 0
    GROUP BY p.id HAVING COUNT(r.id) >= ? AND AVG(r.rating) < ?
    ORDER BY AVG(r.rating), p.id LIMIT ?`).all(Math.max(1, sessions), below, limit) as { id: number; title: string; file: string; shootId: number; avg: number; reviews: number }[];
}
