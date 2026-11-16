import { captureRemoval, pruneRecovery } from './workflowCore.js';
import fs from 'node:fs';
import path from 'node:path';
import { getSetting, setSetting, type DB } from './db.js';
import { loadSettings } from './settings.js';
import { type Cfg } from './ingest.js';

/**
 * Taking photographs out of Frames.
 *
 * Active records and previews are removed. A private recovery snapshot keeps metadata,
 * ratings and tags for 30 days. Originals in library, upload and sync folders stay untouched.
 * A tombstone prevents the next scan from importing the same photograph again.
 */
export type RemoveResult = { removed: number; filesDeleted: number; kept: number; trashed?: number };
/** Legacy API modes are accepted for compatibility; all preserve originals. */
export type Originals = 'delete' | 'keep' | 'trash';

export function removePhotos(db: DB, cfg: Cfg, ids: number[], originals: Originals = 'delete'): RemoveResult {
  const res: RemoveResult = { removed: 0, filesDeleted: 0, kept: 0, trashed: 0 };
  pruneRecovery(db);
  originals = 'keep'; // Recoverable removal never deletes or moves an original.
  const pick = db.prepare('SELECT id, path, file, hash FROM photos WHERE id = ?');
  const forget = db.prepare('INSERT OR REPLACE INTO removed(hash, path, file, removed_at) VALUES(?, ?, ?, ?)');
  const now = new Date().toISOString();
  for (const id of [...new Set(ids)].filter((n) => Number.isInteger(n))) {
    const p = pick.get(id) as { id: number; path: string; file: string; hash: string } | undefined;
    if (!p) continue;
    db.transaction(() => {
      captureRemoval(db, id, cfg.dataDir);
      forget.run(p.hash, p.path, p.file, now);
      db.prepare('UPDATE photos SET parent_id = NULL WHERE parent_id = ?').run(id); // an edit or crop of it stays, no longer linked
      for (const t of ['dismissed', 'feedback', 'xmp_conflicts', 'duplicates']) {
        try { db.prepare(t === 'duplicates' ? 'DELETE FROM duplicates WHERE hash = ?' : `DELETE FROM ${t} WHERE photo_id = ?`).run(t === 'duplicates' ? p.hash : id); } catch { /* a table an older library does not have */ }
      }
      db.prepare('DELETE FROM photos WHERE id = ?').run(id); // reviews, tags, collection places and share ratings go with it
    })();
    fs.rmSync(path.join(cfg.dataDir, 'derivatives', String(id)), { recursive: true, force: true });
    res.kept++;
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
export function deleteSuggestions(db: DB, sessions: number, below: number, limit = 200, onlyId?: number) {
  if (!below) return [];
  return db.prepare(`
    SELECT p.id, p.title, p.file, p.shoot_id shootId, ROUND(AVG(r.rating), 2) avg, COUNT(r.id) reviews
    FROM photos p JOIN reviews r ON r.photo_id = p.id LEFT JOIN removal_kept k ON k.photo_id = p.id
    WHERE p.missing = 0
      AND NOT EXISTS (SELECT 1 FROM collection_photos cp WHERE cp.photo_id = p.id)
      AND NOT EXISTS (SELECT 1 FROM version_photos vp WHERE vp.photo_id = p.id)
      AND NOT EXISTS (SELECT 1 FROM shares sh WHERE sh.kind = 'shoot' AND sh.target_id = p.shoot_id AND sh.revoked = 0 AND (sh.expires_at IS NULL OR sh.expires_at > ?))${onlyId === undefined ? '' : ' AND p.id = ?'}
    GROUP BY p.id HAVING COUNT(r.id) >= ? AND AVG(r.rating) < ? AND (k.photo_id IS NULL OR k.review_count != COUNT(r.id) OR k.rating_sum != SUM(r.rating))
    ORDER BY AVG(r.rating), p.id LIMIT ?`).all(new Date().toISOString(), ...(onlyId === undefined ? [] : [onlyId]), Math.max(1, sessions), below, limit) as { id: number; title: string; file: string; shootId: number; avg: number; reviews: number }[];
}

/**
 * A photograph that has had enough bin votes (the setting, 3 by default; 0 is off) is removed from Frames. Only the person who owns the
 * library can vote (the vote goes through the signed-in review), and the original file is always kept. Returns whether it was removed.
 */
export function removeIfBinned(db: DB, cfg: Cfg, photoId: number): boolean {
  const need = loadSettings(db).binVotes;
  if (!need) return false;
  const votes = (db.prepare('SELECT COUNT(*) n FROM reviews WHERE photo_id = ? AND bin = 1').get(photoId) as { n: number }).n;
  if (votes < need) return false;
  return db.transaction(() => {
    removePhotos(db, cfg, [photoId], 'keep');
    const session = getSetting<{ queue: { id: number }[]; index: number } | null>(db, 'reviewSession', null);
    if (session) {
      const before = session.queue.slice(0, session.index).filter((photo) => photo.id === photoId).length;
      session.queue = session.queue.filter((photo) => photo.id !== photoId); session.index = Math.max(0, session.index - before);
      setSetting(db, 'reviewSession', session);
    }
    return true;
  })();
}

/** Explicitly enabled catalog cleanup. Original files are always kept. */
export function autoRemoveLowRated(db: DB, cfg: Cfg, onlyId?: number) {
  const settings = loadSettings(db);
  if (!settings.autoRemove) return { removed: 0, filesDeleted: 0, kept: 0 };
  return db.transaction(() => {
    const ids = deleteSuggestions(db, settings.autoRemoveAfter, settings.autoRemoveBelow, 2000, onlyId).map((photo) => photo.id);
    const result = removePhotos(db, cfg, ids, 'keep');
    const removed = new Set(ids);
    const session = getSetting<{ queue: { id: number }[]; index: number } | null>(db, 'reviewSession', null);
    if (session && removed.size) {
      const before = session.queue.slice(0, session.index).filter((photo) => removed.has(photo.id)).length;
      session.queue = session.queue.filter((photo) => !removed.has(photo.id)); session.index = Math.max(0, session.index - before);
      setSetting(db, 'reviewSession', session);
    }
    return result;
  })();
}
