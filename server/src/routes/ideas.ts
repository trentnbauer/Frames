import { Router } from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import sharp from 'sharp';
import db, { ORIGINALS_DIR, REFERENCES_DIR } from '../db.js';
import { streamZip } from '../lib/zipExport.js';
import { withTags } from '../lib/withTags.js';
import { deriveNudge } from '../lib/ideaNudges.js';
import type { IdeaReferenceRow, IdeaRow, PhotoRow, ShotListItemRow } from '../types.js';

export const ideasRouter = Router();

const uploadReference = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, file.mimetype.startsWith('image/')),
});

// Bumped on any meaningful edit (title/notes/status/zine layout, photo
// membership/reorder) — drives sidebar/Dashboard ordering, see GET '/'.
const touchIdea = db.prepare("UPDATE ideas SET updated_at = datetime('now') WHERE id = ?");

ideasRouter.get('/', (_req, res) => {
  const rows = db
    .prepare(
      `SELECT i.*,
         COUNT(CASE WHEN p.id IS NOT NULL AND p.deleted_at IS NULL THEN 1 END) as photo_count,
         MAX(CASE WHEN p.id IS NOT NULL AND p.deleted_at IS NULL THEN ip.created_at END) as last_activity
       FROM ideas i
       LEFT JOIN idea_photos ip ON ip.idea_id = i.id
       LEFT JOIN photos p ON p.id = ip.photo_id
       GROUP BY i.id
       ORDER BY i.updated_at DESC`
    )
    .all() as (IdeaRow & { photo_count: number; last_activity: string | null })[];

  const ideas = rows.map(({ last_activity, ...idea }) => ({
    ...idea,
    nudge: deriveNudge({ status: idea.status, photoCount: idea.photo_count, createdAt: idea.created_at, lastActivity: last_activity }),
  }));

  res.json({ ideas });
});

ideasRouter.post('/', (req, res) => {
  const { title, notes, light_pref } = req.body as { title?: string; notes?: string; light_pref?: string };
  if (!title) return res.status(400).json({ error: 'title is required' });

  const info = db
    .prepare('INSERT INTO ideas (title, notes, light_pref) VALUES (?, ?, ?)')
    .run(title, notes ?? null, light_pref ?? 'any');

  const idea = db.prepare('SELECT * FROM ideas WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ idea });
});

ideasRouter.get('/:id', (req, res) => {
  const idea = db.prepare('SELECT * FROM ideas WHERE id = ?').get(req.params.id) as IdeaRow | undefined;
  if (!idea) return res.status(404).json({ error: 'Idea not found' });

  const photos = db
    .prepare(
      `SELECT p.*, ip.why, ip.position FROM idea_photos ip
       JOIN photos p ON p.id = ip.photo_id
       WHERE ip.idea_id = ? AND p.deleted_at IS NULL ORDER BY ip.position ASC, ip.created_at ASC`
    )
    .all(idea.id) as PhotoRow[];

  res.json({ idea, photos: photos.map(withTags) });
});

ideasRouter.patch('/:id', (req, res) => {
  const { title, notes, light_pref, status, zine_state } = req.body as {
    title?: string;
    notes?: string;
    light_pref?: string;
    status?: string;
    zine_state?: string | null;
  };

  const existing = db.prepare('SELECT * FROM ideas WHERE id = ?').get(req.params.id) as IdeaRow | undefined;
  if (!existing) return res.status(404).json({ error: 'Idea not found' });

  db.prepare("UPDATE ideas SET title = ?, notes = ?, light_pref = ?, status = ?, zine_state = ?, updated_at = datetime('now') WHERE id = ?").run(
    title ?? existing.title,
    notes !== undefined ? notes : existing.notes,
    light_pref ?? existing.light_pref,
    status ?? existing.status,
    zine_state !== undefined ? zine_state : existing.zine_state,
    req.params.id
  );

  const idea = db.prepare('SELECT * FROM ideas WHERE id = ?').get(req.params.id);
  res.json({ idea });
});

ideasRouter.delete('/:id', (req, res) => {
  const result = db.prepare('DELETE FROM ideas WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Idea not found' });
  res.status(204).end();
});

// --- Idea <-> photo membership ---

ideasRouter.post('/:id/photos', (req, res) => {
  const ideaId = Number(req.params.id);
  const { photoId, why } = req.body as { photoId?: number; why?: string };
  if (!photoId) return res.status(400).json({ error: 'photoId is required' });

  const { count } = db.prepare('SELECT COUNT(*) as count FROM idea_photos WHERE idea_id = ?').get(ideaId) as {
    count: number;
  };

  db.prepare(
    `INSERT INTO idea_photos (idea_id, photo_id, position, why) VALUES (?, ?, ?, ?)
     ON CONFLICT(idea_id, photo_id) DO UPDATE SET why = excluded.why`
  ).run(ideaId, photoId, count, why ?? null);
  touchIdea.run(ideaId);

  res.status(201).json({ ok: true });
});

ideasRouter.patch('/:id/photos/:photoId', (req, res) => {
  const { why } = req.body as { why?: string };
  db.prepare('UPDATE idea_photos SET why = ? WHERE idea_id = ? AND photo_id = ?').run(
    why ?? null,
    req.params.id,
    req.params.photoId
  );
  touchIdea.run(req.params.id);
  res.status(200).json({ ok: true });
});

ideasRouter.delete('/:id/photos/:photoId', (req, res) => {
  db.prepare('DELETE FROM idea_photos WHERE idea_id = ? AND photo_id = ?').run(req.params.id, req.params.photoId);
  touchIdea.run(req.params.id);
  res.status(204).end();
});

// Frame sequencing: client sends the idea's full membership as an ordered
// list of photo ids (drag-to-reorder in the UI), position is rewritten to
// match that order 1:1. Ids that aren't members of this idea are silently
// no-ops (the UPDATE just matches zero rows) rather than errors, since the
// client always derives the list from its own up-to-date membership state.
ideasRouter.patch('/:id/reorder', (req, res) => {
  const { photoIds } = req.body as { photoIds?: number[] };
  if (!Array.isArray(photoIds)) return res.status(400).json({ error: 'photoIds must be an array' });

  const update = db.prepare('UPDATE idea_photos SET position = ? WHERE idea_id = ? AND photo_id = ?');
  const ideaId = req.params.id;
  const reorder = db.transaction((ids: number[]) => {
    ids.forEach((photoId, index) => update.run(index, ideaId, photoId));
    touchIdea.run(ideaId);
  });
  reorder(photoIds);

  res.status(200).json({ ok: true });
});

// Idea filler: derive the idea's dominant tags from its current member
// photos, then surface other photos sharing those tags that aren't members
// yet — the "6 frames tagged X might belong here" nudge from plan.md's core
// loop, seen from the idea side rather than the tag side.
ideasRouter.get('/:id/suggested-photos', (req, res) => {
  const ideaId = req.params.id;

  // Excludes the automatic dominant-color tag (see addColorTags in
  // lib/ingest.ts) — nearly every photo has one, so it would suggest
  // photos on "both are mostly blue" rather than a real shared subject.
  const dominantTags = db
    .prepare(
      `SELECT DISTINCT pt.tag_id FROM idea_photos ip
       JOIN photo_tags pt ON pt.photo_id = ip.photo_id
       WHERE ip.idea_id = ? AND pt.note IS NOT 'auto:dominant-color'`
    )
    .all(ideaId) as { tag_id: number }[];

  if (dominantTags.length === 0) return res.json({ photos: [] });

  const tagIds = dominantTags.map((t) => t.tag_id);
  const placeholders = tagIds.map(() => '?').join(',');

  const rows = db
    .prepare(
      `SELECT p.*, COUNT(*) as shared_tag_count FROM photos p
       JOIN photo_tags pt ON pt.photo_id = p.id
       WHERE pt.tag_id IN (${placeholders})
         AND pt.note IS NOT 'auto:dominant-color'
         AND p.deleted_at IS NULL
         AND NOT EXISTS (SELECT 1 FROM idea_photos ip WHERE ip.idea_id = ? AND ip.photo_id = p.id)
       GROUP BY p.id
       ORDER BY shared_tag_count DESC, p.created_at DESC
       LIMIT 8`
    )
    .all(...tagIds, ideaId) as PhotoRow[];

  res.json({ photos: rows.map(withTags) });
});

// --- Shot list: "frames I still need for this project" ---

ideasRouter.get('/:id/shot-list', (req, res) => {
  const items = db
    .prepare('SELECT * FROM idea_shot_list_items WHERE idea_id = ? ORDER BY created_at ASC')
    .all(req.params.id) as ShotListItemRow[];
  res.json({ items });
});

ideasRouter.post('/:id/shot-list', (req, res) => {
  const ideaId = req.params.id;
  const idea = db.prepare('SELECT id FROM ideas WHERE id = ?').get(ideaId);
  if (!idea) return res.status(404).json({ error: 'Idea not found' });

  const { text } = req.body as { text?: string };
  if (!text || !text.trim()) return res.status(400).json({ error: 'text is required' });

  const info = db.prepare('INSERT INTO idea_shot_list_items (idea_id, text) VALUES (?, ?)').run(ideaId, text.trim());
  const item = db.prepare('SELECT * FROM idea_shot_list_items WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ item });
});

ideasRouter.patch('/:id/shot-list/:itemId', (req, res) => {
  const { text, done } = req.body as { text?: string; done?: boolean };
  const existing = db
    .prepare('SELECT * FROM idea_shot_list_items WHERE id = ? AND idea_id = ?')
    .get(req.params.itemId, req.params.id) as ShotListItemRow | undefined;
  if (!existing) return res.status(404).json({ error: 'Shot list item not found' });

  db.prepare('UPDATE idea_shot_list_items SET text = ?, done = ? WHERE id = ?').run(
    text !== undefined && text.trim() ? text.trim() : existing.text,
    done !== undefined ? (done ? 1 : 0) : existing.done,
    existing.id
  );

  const item = db.prepare('SELECT * FROM idea_shot_list_items WHERE id = ?').get(existing.id);
  res.json({ item });
});

ideasRouter.delete('/:id/shot-list/:itemId', (req, res) => {
  const result = db.prepare('DELETE FROM idea_shot_list_items WHERE id = ? AND idea_id = ?').run(req.params.itemId, req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Shot list item not found' });
  res.status(204).end();
});

// --- Mood board: reference images/notes pinned to an idea before there are
// real shots for it yet — distinct from idea_photos (frames already shot). ---

ideasRouter.get('/:id/references', (req, res) => {
  const references = db
    .prepare('SELECT * FROM idea_references WHERE idea_id = ? ORDER BY created_at ASC')
    .all(req.params.id) as IdeaReferenceRow[];
  res.json({ references });
});

// Image reference: reuses the upload + sharp-resize pattern from
// routes/photos.ts, but skips the original/thumb/display trio and the
// tagging pipeline — a mood-board image is inspiration, not a shot to file.
ideasRouter.post('/:id/references/image', uploadReference.single('image'), async (req, res) => {
  const ideaId = req.params.id;
  const idea = db.prepare('SELECT id FROM ideas WHERE id = ?').get(ideaId);
  if (!idea) return res.status(404).json({ error: 'Idea not found' });

  const file = req.file;
  if (!file) return res.status(400).json({ error: 'No image file uploaded' });

  const filename = `${crypto.randomUUID()}.jpg`;
  await sharp(file.buffer).rotate().resize({ width: 1200, withoutEnlargement: true }).jpeg({ quality: 85 }).toFile(path.join(REFERENCES_DIR, filename));

  const info = db
    .prepare("INSERT INTO idea_references (idea_id, kind, path) VALUES (?, 'image', ?)")
    .run(ideaId, filename);
  const reference = db.prepare('SELECT * FROM idea_references WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ reference });
});

ideasRouter.post('/:id/references/note', (req, res) => {
  const ideaId = req.params.id;
  const idea = db.prepare('SELECT id FROM ideas WHERE id = ?').get(ideaId);
  if (!idea) return res.status(404).json({ error: 'Idea not found' });

  const { text } = req.body as { text?: string };
  if (!text || !text.trim()) return res.status(400).json({ error: 'text is required' });

  const info = db.prepare("INSERT INTO idea_references (idea_id, kind, text) VALUES (?, 'note', ?)").run(ideaId, text.trim());
  const reference = db.prepare('SELECT * FROM idea_references WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ reference });
});

ideasRouter.delete('/:id/references/:refId', (req, res) => {
  const reference = db
    .prepare('SELECT * FROM idea_references WHERE id = ? AND idea_id = ?')
    .get(req.params.refId, req.params.id) as IdeaReferenceRow | undefined;
  if (!reference) return res.status(404).json({ error: 'Reference not found' });

  db.prepare('DELETE FROM idea_references WHERE id = ?').run(reference.id);
  if (reference.kind === 'image' && reference.path) {
    fs.rm(path.join(REFERENCES_DIR, reference.path), { force: true }, () => {});
  }

  res.status(204).end();
});

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

const LIGHT_PREF_LABELS: Record<string, string> = {
  any: 'Any light',
  overcast: 'Overcast',
  raking_sun: 'Raking sun',
  golden_hour: 'Golden hour',
  dark: 'Dark',
  night: 'Night',
};

// Self-contained, server-rendered (not React) so it opens cleanly in its own
// tab with none of the app shell — a phone-ready shoot card up top (title,
// rule/notes, light preference, frame count — the bits worth reading before
// you leave the house) followed by a printable contact-sheet grid of every
// frame currently in the idea, each captioned with its own "why".
ideasRouter.get('/:id/brief', (req, res) => {
  const idea = db.prepare('SELECT * FROM ideas WHERE id = ?').get(req.params.id) as IdeaRow | undefined;
  if (!idea) return res.status(404).send('Idea not found');

  const photos = db
    .prepare(
      `SELECT p.*, ip.why, ip.position FROM idea_photos ip
       JOIN photos p ON p.id = ip.photo_id
       WHERE ip.idea_id = ? AND p.deleted_at IS NULL ORDER BY ip.position ASC, ip.created_at ASC`
    )
    .all(idea.id) as (PhotoRow & { why: string | null })[];

  const title = escapeHtml(idea.title);
  const notes = idea.notes ? escapeHtml(idea.notes) : '';
  const lightLabel = LIGHT_PREF_LABELS[idea.light_pref] ?? idea.light_pref;

  const tiles = photos
    .map((p) => {
      const details = [p.camera, p.location].filter(Boolean).map((s) => escapeHtml(s as string));
      const why = p.why ? `<div class="brief-tile__why">${escapeHtml(p.why)}</div>` : '';
      return `
        <figure class="brief-tile">
          <img src="/files/thumb/${p.id}" alt="${escapeHtml(p.filename)}" />
          <figcaption>
            ${details.length ? `<div class="brief-tile__details">${details.join(' · ')}</div>` : ''}
            ${why}
          </figcaption>
        </figure>`;
    })
    .join('\n');

  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title} — Frames brief</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; padding: 24px; color: #1a1a1a; background: #fff; }
  .brief-card { border: 1px solid #ddd; border-radius: 10px; padding: 20px; margin-bottom: 28px; max-width: 640px; }
  .brief-card h1 { margin: 0 0 4px; font-size: 22px; }
  .brief-card__meta { font-size: 13px; color: #666; margin-bottom: 14px; }
  .brief-card__light { display: inline-block; background: #eef; border-radius: 20px; padding: 4px 12px; font-size: 13px; font-weight: 600; margin-bottom: 12px; }
  .brief-card__notes { font-size: 15px; line-height: 1.5; white-space: pre-wrap; }
  .print-btn { border: none; background: #2a2a2a; color: #fff; padding: 8px 16px; border-radius: 6px; font-size: 14px; cursor: pointer; margin-bottom: 20px; }
  .brief-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 14px; max-width: 1100px; }
  .brief-tile { margin: 0; border: 1px solid #e4e4e4; border-radius: 8px; overflow: hidden; break-inside: avoid; }
  .brief-tile img { width: 100%; height: 160px; object-fit: cover; display: block; background: #f2f2f2; }
  .brief-tile figcaption { padding: 8px; font-size: 12px; color: #444; }
  .brief-tile__details { font-weight: 600; margin-bottom: 2px; }
  .brief-tile__why { color: #777; font-style: italic; }
  .brief-empty { color: #777; font-size: 14px; }
  @media print {
    .print-btn { display: none; }
    body { padding: 0; }
    .brief-card { border: none; padding: 0; margin-bottom: 18px; }
    .brief-grid { gap: 8px; }
  }
</style>
</head>
<body>
  <button class="print-btn" onclick="window.print()">Print</button>
  <div class="brief-card">
    <h1>${title}</h1>
    <div class="brief-card__meta">${photos.length} frame${photos.length === 1 ? '' : 's'} · ${escapeHtml(idea.status)}</div>
    <div class="brief-card__light">${escapeHtml(lightLabel)}</div>
    ${notes ? `<div class="brief-card__notes">${notes}</div>` : ''}
  </div>
  ${photos.length > 0 ? `<div class="brief-grid">${tiles}</div>` : '<p class="brief-empty">No frames in this idea yet.</p>'}
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
});

ideasRouter.get('/:id/export', async (req, res) => {
  const idea = db.prepare('SELECT * FROM ideas WHERE id = ?').get(req.params.id) as IdeaRow | undefined;
  if (!idea) return res.status(404).json({ error: 'Idea not found' });

  const photos = db
    .prepare(
      `SELECT p.* FROM idea_photos ip JOIN photos p ON p.id = ip.photo_id
       WHERE ip.idea_id = ? AND p.deleted_at IS NULL ORDER BY ip.position ASC`
    )
    .all(idea.id) as PhotoRow[];

  if (photos.length === 0) return res.status(400).json({ error: 'Idea has no photos to export' });

  const zipName = `${idea.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.zip`;
  const files = photos.map((p) => ({
    originalPath: path.join(ORIGINALS_DIR, p.original_path),
    filename: `${path.basename(p.original_path, path.extname(p.original_path))}${path.extname(p.filename) || path.extname(p.original_path)}`,
  }));

  await streamZip(res, zipName, files);
});
